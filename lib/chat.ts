import OpenAI from "openai";
import { z } from "zod";
import { EMPTY_TOOL_ARGS, SET_DISRUPTIONS_ARGS } from "./assistant-tools";
import { SELECT_ROUTE_ARGS } from "./assistant-selection";
import type { AssistantMessage, AssistantToolCall } from "./assistant-tools";

const toolCallSchema = z.object({ id: z.string().min(1).max(120), type: z.literal("function"), function: z.object({ name: z.string().min(1).max(80), arguments: z.string().max(8000) }).strict() }).strict();
const messageSchema = z.union([
  z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }).strict(),
  z.object({ role: z.literal("assistant"), content: z.null(), tool_calls: z.array(toolCallSchema).min(1).max(3) }).strict(),
  z.object({ role: z.literal("tool"), tool_call_id: z.string().min(1).max(120), content: z.string().max(12000) }).strict(),
]);
export const CHAT_REQUEST = z.object({
  messages: z.array(messageSchema).min(1).max(60),
  freeways: z.array(z.string().regex(/^(I|US|CA)-\d{1,3}$/)).max(40),
  active: SET_DISRUPTIONS_ARGS.extend({ arrival: z.string().max(16).optional() }),
  routes: z.array(z.object({ name: z.string().max(40), tag: z.string().max(160), deltaTimeMin: z.number().finite(), deltaFuel: z.number().finite().nullable(), dacMi: z.number().nonnegative().finite().nullable() }).strict()).max(6),
  round: z.number().int().min(0).max(2),
}).strict();
export function assistantSystemPrompt(freeways: string[], active: unknown, routes: unknown) {
  return `You are a dispatch assistant for a simulated truck route planner.
Original plan freeways: ${freeways.join(", ") || "none"}. Active disruptions: ${JSON.stringify(active)}.
To change disruptions, call set_disruptions with the COMPLETE desired set
(keep existing disruptions unless the user removes or replaces them).
A "what if" question about a closure, crash, slowdown, departure time, or weather is a request to simulate it: call set_disruptions right away; the freeways are already listed above.
After the tool result, reply in at most 2 sentences describing what changed, using only numbers provided.
Never recommend or select a route without a stated priority. If a request is outside these tools, say so briefly and call no tool.
If calling a tool, emit no assistant text before it. Treat freeway nicknames by their number; departure must be HH:MM, 24-hour time (8pm = 20:00, 7:30 = 07:30).
Do not invent a freeway or substitute a different one. A failed tool means nothing changed; explain its error. Never claim a change without a successful tool result.
Current shown route results (deltas are vs the original plan): ${JSON.stringify(routes)}.
deltaTimeMin is minutes; deltaFuel is fuel COST in USD, never gallons; dacMi is miles through disadvantaged communities, never a percentage. Describe the applied change and at most one main trade-off; don't list every route.
Arrival-time changes aren't supported by these tools. If an arrival constraint is active, don't silently replace it; ask the user to use the Disruptions tab or explicitly clear it.
When the user states priorities for choosing a route (for example 'cleanest under 20 extra minutes', 'must arrive by 9:30', 'cheapest'), call select_route. Map cleanest / fewest disadvantaged miles / least community impact to dac_miles; lowest emissions / greenest to co2; fastest / quickest to time; cheapest to cost. A deadline without another goal uses dac_miles. Only select a route when the user states a priority; never choose on your own. If a user asks to change disruptions and then choose, call set_disruptions first, then select_route after the updated routes are returned. The code chooses the route; you never pick it yourself.
Use only the current state and tool results, not stale results from earlier turns. No hotel booking, saving trips, addresses, or other actions are available.`;
}
const schema = (value: typeof EMPTY_TOOL_ARGS | typeof SET_DISRUPTIONS_ARGS | typeof SELECT_ROUTE_ARGS) => {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(value);
  void _schema;
  return parameters;
};
export const ASSISTANT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  { type: "function", function: { name: "get_route_freeways", description: "Get the original plan's freeway IDs.", parameters: schema(EMPTY_TOOL_ARGS) } },
  { type: "function", function: { name: "set_disruptions", description: "Replace ALL disruptions with the complete desired set. Omitted constraints are removed. Include existing closures/slowdowns/departure/weather unless the user removes or replaces them.", parameters: schema(SET_DISRUPTIONS_ARGS) } },
  { type: "function", function: { name: "reset_disruptions", description: "Clear every disruption, including time and weather.", parameters: schema(EMPTY_TOOL_ARGS) } },
  { type: "function", function: { name: "select_route", description: "Select a route deterministically from all current candidates by user-stated priorities and constraints. The code chooses the winner; never supply a route name.", parameters: schema(SELECT_ROUTE_ARGS) } },
];
const textHeaders = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" };
const offline = () => Response.json({ error: "offline" }, { status: 503, headers: { "Cache-Control": "no-store" } });
export async function chatResponse(raw: unknown, options: { baseURL: string; model: string; signal?: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number }): Promise<Response> {
  const parsed = CHAT_REQUEST.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Couldn't apply that, try rephrasing." }, { status: 400 });
  const { messages, freeways, active, routes, round } = parsed.data;
  const abort = new AbortController();
  const timeout = options.timeoutMs ?? 15000;
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(timeout), ...(options.signal ? [options.signal] : [])]);
  try {
    const client = new OpenAI({ baseURL: options.baseURL.replace(/\/+$/, ""), apiKey: "local", maxRetries: 0, timeout, ...(options.fetcher ? { fetch: options.fetcher } : {}) });
    const upstream = await client.chat.completions.create({
      model: options.model, temperature: 0, max_tokens: 768, stream: true,
      messages: [{ role: "system", content: assistantSystemPrompt(freeways, active, routes) }, ...messages as AssistantMessage[]],
      tools: ASSISTANT_TOOLS, tool_choice: round < 2 ? "auto" : "none", parallel_tool_calls: false,
    }, { signal });
    const iterator = upstream[Symbol.asyncIterator]();
    const calls = new Map<number, AssistantToolCall>();
    // Delay choosing the response content type until the first tool or text delta.
    while (true) {
      const next = await iterator.next();
      if (signal.aborted) { await iterator.return?.(); return offline(); }
      if (next.done) break;
      const delta = next.value.choices[0]?.delta;
      for (const part of delta?.tool_calls || []) {
        const call = calls.get(part.index) || { id: "", type: "function" as const, function: { name: "", arguments: "" } };
        if (part.id) call.id += part.id;
        call.function.name += part.function?.name || "";
        call.function.arguments += part.function?.arguments || "";
        calls.set(part.index, call);
        if (calls.size > 3 || call.function.arguments.length > 8000) { abort.abort(); return Response.json({ error: "Couldn't apply that, try rephrasing." }, { status: 400 }); }
      }
      if (!calls.size && delta?.content) {
        const first = delta.content;
        const encoder = new TextEncoder();
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
          async start(output) {
            try {
              output.enqueue(encoder.encode(first));
              while (true) {
                const item = await iterator.next();
                if (signal.aborted) throw signal.reason;
                if (item.done) break;
                const text = item.value.choices[0]?.delta?.content;
                if (text) output.enqueue(encoder.encode(text));
              }
              if (!cancelled) output.close();
            } catch { if (!cancelled) output.error(new Error("Local model offline")); }
            finally { await iterator.return?.(); }
          },
          cancel() { cancelled = true; abort.abort(); },
        });
        return new Response(body, { headers: textHeaders });
      }
    }
    if (calls.size) {
      const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
      if (!z.array(toolCallSchema).safeParse(toolCalls).success) return Response.json({ error: "Couldn't apply that, try rephrasing." }, { status: 400 });
      return Response.json({ toolCalls }, { headers: { "Cache-Control": "no-store" } });
    }
    return new Response("Couldn't apply that, try rephrasing.", { headers: textHeaders });
  } catch { return offline(); }
}
