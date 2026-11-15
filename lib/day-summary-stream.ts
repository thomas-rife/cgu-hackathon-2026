import OpenAI from "openai";
import type { DaySummaryInput } from "./day-summary";

export const DAY_SUMMARY_PROMPT = "Summarize today's dispatch plan in 2–3 sentences for a manager: how many trips, what disruptions affected them, and the overall trade-off between cost/time and community impact. Use only numbers provided. Do not recommend or judge decisions.";
export function streamDaySummary(input: DaySummaryInput, options: { baseURL: string; model: string; signal?: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number }): ReadableStream<Uint8Array> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]);
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(output) {
      try {
        if (signal.aborted) return;
        const client = new OpenAI({ baseURL: options.baseURL.replace(/\/+$/, ""), apiKey: "local", maxRetries: 0, timeout: timeoutMs, ...(options.fetcher ? { fetch: options.fetcher } : {}) });
        const system = `${DAY_SUMMARY_PROMPT}\nUse only the rounded input values and freeway names. Do not calculate new numbers. If there are no disruptions, say so. Report fuel amounts as dollars, not gallons. Include the number of trips and a cost/time versus disadvantaged-community-mile trade-off. Output only the 2–3 sentence summary.`;
        const user = `Summarize this saved day plan:\n${JSON.stringify(input)}`;
        if (/bolt-instruct-v2/i.test(options.model)) {
          const stream = await client.completions.create({ model: options.model, temperature: 0, max_tokens: 220, stream: true, prompt: `<|start|>system<|message|>${system}<|eot|><|start|>user<|message|>${user}<|eot|><|start|>assistant to=user<|message|>`, stop: ["<|eot|>", "<|eom|>", "<|return|>", "<|end|>"] }, { signal });
          for await (const chunk of stream) { if (signal.aborted) break; const text = chunk.choices[0]?.text; if (text) output.enqueue(encoder.encode(text)); }
        } else {
          const stream = await client.chat.completions.create({ model: options.model, temperature: 0, max_tokens: 220, stream: true, messages: [{ role: "system", content: system }, { role: "user", content: user }] }, { signal });
          for await (const chunk of stream) { if (signal.aborted) break; const text = chunk.choices[0]?.delta?.content; if (text) output.enqueue(encoder.encode(text)); }
        }
      } catch { /* Summary failures never affect the plan. */ }
      finally { if (!cancelled) output.close(); }
    },
    cancel() { cancelled = true; controller.abort(); },
  });
}
