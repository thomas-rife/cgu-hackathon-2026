import OpenAI from "openai";
import { normalizeExplanationRequest } from "./route-explanation";

export const EXPLANATION_SYSTEM_PROMPT = "You explain truck route choices to a dispatcher. Write ONE sentence, max 30 words.\nSay which freeways the selected route avoids or uses compared with the original plan, and the main trade-off.\nUse only the numbers provided; do not invent numbers. Do not recommend a route.\nDisadvantaged-community miles may be written as 'miles through disadvantaged communities'.";
const CONCISE_INSTRUCTION = "\nName the selected route. In the SAME sentence, include BOTH the changed freeways AND the main time/fuel versus community trade-off, joined with 'but' or 'trading'. Describe changes qualitatively; do not calculate differences or percentages. If you quote a number, copy an input value exactly. Keep the entire answer under twenty-five words.";

export function streamExplanation(raw: unknown, options: { baseURL: string; model: string; signal?: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number }): ReadableStream<Uint8Array> {
  const input = normalizeExplanationRequest(raw);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]);
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(output) {
      try {
        if (!input || signal.aborted) return;
        const client = new OpenAI({ baseURL: options.baseURL.replace(/\/+$/, ""), apiKey: "local", maxRetries: 0, timeout: timeoutMs, ...(options.fetcher ? { fetch: options.fetcher } : {}) });
        const system = EXPLANATION_SYSTEM_PROMPT + CONCISE_INSTRUCTION;
        const user = `Explain the selected route vs. the original plan:\n${JSON.stringify(input)}`;
        // Keep Bolt in its answer channel instead of spending the token budget on reasoning.
        if (/bolt-instruct-v2/i.test(options.model)) {
          const stream = await client.completions.create({
            model: options.model, temperature: 0, max_tokens: 80, stream: true,
            prompt: `<|start|>system<|message|>${system}<|eot|><|start|>user<|message|>${user}<|eot|><|start|>assistant to=user<|message|>`,
            stop: ["<|eot|>", "<|eom|>", "<|return|>", "<|end|>"],
          }, { signal });
          for await (const chunk of stream) {
            if (signal.aborted) break;
            const text = chunk.choices[0]?.text;
            if (text) output.enqueue(encoder.encode(text));
          }
        } else {
          const stream = await client.chat.completions.create({
            model: options.model, temperature: 0, max_tokens: 80, stream: true,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
          }, { signal });
          for await (const chunk of stream) {
            if (signal.aborted) break;
            const text = chunk.choices[0]?.delta?.content;
            if (text) output.enqueue(encoder.encode(text));
          }
        }
      } catch { /* Model errors close silently; routing is unaffected. */ }
      finally { if (!cancelled) output.close(); }
    },
    cancel() { cancelled = true; controller.abort(); },
  });
}
