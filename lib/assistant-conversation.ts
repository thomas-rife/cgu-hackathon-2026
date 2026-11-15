import { AssistantToolError, assistantState, trimAssistantReply, validateAssistantTool } from "./assistant-tools";
import type { AssistantMessage, AssistantRoute, AssistantRouteResult, AssistantToolCall } from "./assistant-tools";
import type { Disruption } from "./simulation";
import { readExplanationStream } from "./explanation-stream";
import { SELECT_ROUTE_ARGS } from "./assistant-selection";
import type { SelectRouteArgs, SelectRouteResult } from "./assistant-selection";

export const ASSISTANT_OFFLINE = "Local model offline. Use the Disruptions tab.";
export const ASSISTANT_INVALID = "Couldn't apply that, try rephrasing.";
export class AssistantOfflineError extends Error { constructor() { super(ASSISTANT_OFFLINE); } }

type Turn = { messages: AssistantMessage[]; freeways: string[]; disruptions: Disruption[]; routes: AssistantRoute[] };
type Actions = {
  signal: AbortSignal;
  fetcher?: typeof fetch;
  onText: (text: string) => void;
  onHistory: (messages: AssistantMessage[]) => void;
  onApply: (next: Disruption[], previous: Disruption[]) => Promise<AssistantRouteResult>;
  onSelect?: (args: SelectRouteArgs) => Promise<SelectRouteResult>;
};
export async function runAssistantTurn(turn: Turn, actions: Actions): Promise<string> {
  let working = structuredClone(turn.disruptions);
  let routes = turn.routes;
  const messages = [...turn.messages];
  let forceReply = false;
  const finish = (raw: string) => {
    const text = trimAssistantReply(raw) || ASSISTANT_INVALID;
    messages.push({ role: "assistant", content: text });
    actions.onHistory(messages);
    actions.onText(text);
    return text;
  };
  for (let round = 0; round <= 2; round++) {
    actions.signal.throwIfAborted();
    let response: Response;
    try {
      response = await (actions.fetcher || fetch)("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: actions.signal,
        body: JSON.stringify({ messages, freeways: turn.freeways, active: assistantState(working), routes, round: forceReply ? 2 : round }),
      });
    } catch { actions.signal.throwIfAborted(); throw new AssistantOfflineError(); }
    actions.signal.throwIfAborted();
    if (response.status === 503) throw new AssistantOfflineError();
    if (!response.ok) return finish(ASSISTANT_INVALID);
    if (!(response.headers.get("Content-Type") || "").includes("application/json")) {
      try {
        const raw = await readExplanationStream(response, actions.signal, actions.onText);
        return finish(raw);
      } catch { actions.signal.throwIfAborted(); throw new AssistantOfflineError(); }
    }
    const data = await response.json();
    actions.signal.throwIfAborted();
    const calls = data.toolCalls as AssistantToolCall[];
    if (round >= 2 || forceReply || !Array.isArray(calls) || !calls.length || calls.length > 3) return finish(ASSISTANT_INVALID);
    // Validate the entire batch before applying anything. A bad freeway never
    // leaves a partly-applied scenario, and one replacement per batch is enough.
    let replacements: (Disruption[] | null)[] = [];
    let selections: (SelectRouteArgs | null)[] = [];
    let invalid: AssistantToolError | null = null;
    try {
      selections = calls.map(call => {
        if (call.function.name !== "select_route") return null;
        let value: unknown;
        try { value = JSON.parse(call.function.arguments); } catch { throw new AssistantToolError(ASSISTANT_INVALID); }
        const parsed = SELECT_ROUTE_ARGS.safeParse(value);
        if (!parsed.success) throw new AssistantToolError(ASSISTANT_INVALID);
        return parsed.data;
      });
      replacements = calls.map((call, index) => selections[index] ? null : validateAssistantTool(call, turn.freeways, working));
      if (replacements.filter(next => next !== null).length > 1) throw new AssistantToolError(ASSISTANT_INVALID);
      if (selections.filter(Boolean).length > 1 || (selections.some(Boolean) && replacements.some(next => next !== null))) throw new AssistantToolError(ASSISTANT_INVALID);
    } catch (error) { invalid = error instanceof AssistantToolError ? error : new AssistantToolError(ASSISTANT_INVALID); }
    const results: AssistantMessage[] = [];
    if (invalid) {
      for (const call of calls) results.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: invalid.message, freeways: turn.freeways, applied: false }) });
      messages.push({ role: "assistant", content: null, tool_calls: calls }, ...results);
      actions.onHistory([...messages]);
      if (invalid.code !== "freeway") return finish(ASSISTANT_INVALID);
      forceReply = true;
      continue;
    }
    for (const [index, call] of calls.entries()) {
      const next = replacements[index];
      let result: unknown = { freeways: turn.freeways };
      if (selections[index]) {
        if (!actions.onSelect) return finish(ASSISTANT_INVALID);
        result = await actions.onSelect(selections[index]);
        actions.signal.throwIfAborted();
      } else if (next !== null) {
        actions.signal.throwIfAborted();
        const previous = structuredClone(working);
        const solved = await actions.onApply(next, previous);
        actions.signal.throwIfAborted();
        working = next;
        routes = solved.routes;
        result = { applied: true, disruptions: assistantState(working), ...solved };
      }
      results.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "assistant", content: null, tool_calls: calls }, ...results);
    actions.onHistory([...messages]);
  }
  return finish(ASSISTANT_INVALID);
}

// Preserve complete user/tool turns when limiting the session's model context.
export function recentAssistantHistory(messages: AssistantMessage[]) {
  let start = Math.max(0, messages.length - 36);
  while (start < messages.length && messages[start].role !== "user") start++;
  return messages.slice(start);
}
