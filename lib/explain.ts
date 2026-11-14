import { normalizeExplanationRequest } from "./route-explanation";
import type { ExplanationRequest } from "./route-explanation";

export const EXPLANATION_SYSTEM_PROMPT = "You explain truck route choices to a dispatcher. Write ONE sentence, max 30 words.\nSay which freeways the selected route avoids or uses compared with the original plan, and the main trade-off.\nUse only the numbers provided; do not invent numbers. Do not recommend a route.\nDisadvantaged-community miles may be written as 'miles through disadvantaged communities'.";
const CONCISE_INSTRUCTION = "\nName the selected route. In the SAME sentence, include BOTH the changed freeways AND the main time/fuel versus community trade-off, joined with 'but' or 'trading'. Describe changes qualitatively; do not calculate differences or percentages. If you quote a number, copy an input value exactly. Keep the entire answer under twenty-five words.";

const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000 };
const numberWords = new RegExp(`\\b(?:${Object.keys(words).join("|")})(?:[ -]+(?:${Object.keys(words).join("|")}))*\\b`, "gi");
function numericClaims(text: string): number[] {
  // CO2 is a chemical formula, not a claim of two units.
  const plain = text.replace(/\bCO2\b/gi, "CO₂");
  const claims = [...plain.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)].map(match => Number(match[0].replaceAll(",", "")));
  for (const match of plain.matchAll(numberWords)) {
    let total = 0, part = 0;
    for (const word of match[0].toLowerCase().split(/[ -]+/)) {
      const number = words[word];
      if (number >= 1000) { total += (part || 1) * number; part = 0; }
      else if (number === 100) part = (part || 1) * number;
      else part += number;
    }
    claims.push(total + part);
  }
  if (/\bhalf\b/i.test(plain)) claims.push(.5);
  if (/\bquarter\b/i.test(plain)) claims.push(.25);
  return claims;
}

export function sanitizeExplanation(raw: unknown, input: ExplanationRequest): string | null {
  if (typeof raw !== "string" || raw.length > 4000) return null;
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  if (/<think>/i.test(text)) return null;
  text = text.replace(/```(?:[a-z]+)?\s*/gi, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[\s#>*-]+/gm, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  const end = text.search(/[.!?](?=\s|$)/);
  if (end >= 0) text = text.slice(0, end + 1);
  text = text.replace(/["'“”‘’]+$/g, "").trim();
  if (!text || text.split(/\s+/).length > 30 || !/[a-z]/i.test(text)) return null;
  if (!/\b(?:time|minutes?|fuel|CO2|emissions?|miles?|burden|communities|longer|shorter|slower|faster|unchanged)\b|CO₂/i.test(text)) return null;
  const allowed = new Set<number>();
  function collect(value: unknown) {
    if (typeof value === "number") allowed.add(value);
    else if (typeof value === "string") numericClaims(value).forEach(number => allowed.add(number));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  collect(input);
  if (numericClaims(text).some(number => !allowed.has(number))) return null;
  const freeways = new Set([...input.original.freeways, ...input.selected.freeways, ...input.disruptions.flatMap(item => item.match(/\b(?:I|US|CA)-\d{1,3}\b/g) || [])]);
  if ([...text.matchAll(/\b(?:I|US|CA|SR)[ -]\d{1,3}\b/gi)].some(match => !freeways.has(match[0].toUpperCase().replace(/^SR/, "CA").replace(" ", "-")))) return null;
  return text;
}

export async function generateExplanation(raw: unknown, options: { baseURL: string; model: string; signal?: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number }): Promise<string | null> {
  const input = normalizeExplanationRequest(raw);
  if (!input) return null;
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 15000), ...(options.signal ? [options.signal] : [])]);
  try {
    const system = EXPLANATION_SYSTEM_PROMPT + CONCISE_INSTRUCTION;
    const user = `Explain the selected route vs. the original plan:\n${JSON.stringify(input)}`;
    // Bolt's Muse/ATEM chat template starts in the reasoning channel. Prefill
    // its user-answer channel through LM Studio's OpenAI-compatible completion
    // endpoint so the requested 80 tokens are spent on the displayed sentence.
    const directAnswer = /bolt-instruct-v2/i.test(options.model);
    const response = await (options.fetcher || fetch)(`${options.baseURL.replace(/\/+$/, "")}/${directAnswer ? "completions" : "chat/completions"}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local" }, cache: "no-store", signal,
      body: JSON.stringify({ model: options.model, temperature: 0, max_tokens: 80, stream: false,
        ...(directAnswer ? {
          prompt: `<|start|>system<|message|>${system}<|eot|><|start|>user<|message|>${user}<|eot|><|start|>assistant to=user<|message|>`,
          stop: ["<|eot|>", "<|eom|>", "<|return|>", "<|end|>"],
        } : { messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.choices?.[0]?.finish_reason === "length") return null;
    return sanitizeExplanation(directAnswer ? data.choices?.[0]?.text : data.choices?.[0]?.message?.content, input);
  } catch { return null; }
}
