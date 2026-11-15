import type { ExplanationRequest } from "./route-explanation";

const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000 };
const numberWords = new RegExp(`\\b(?:${Object.keys(words).join("|")})(?:[ -]+(?:${Object.keys(words).join("|")}))*\\b`, "gi");
export function numericClaims(text: string): number[] {
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

