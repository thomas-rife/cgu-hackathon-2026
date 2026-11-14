import { estimateRouteImpact } from "./route-metrics";
import type { RouteCandidate, RouteResult } from "./route-types";

export type ExplanationMetrics = {
  freeways: string[];
  timeMin: number;
  miles: number;
  fuel: number | null;
  co2Kg: number;
  dacMi: number | null;
  dieselPct: number | null;
};
export type ExplanationRequest = {
  original: ExplanationMetrics;
  selected: ExplanationMetrics & { name: string; tag: string };
  disruptions: string[];
};

export const roundExplanationValue = (value: number | null | undefined, decimals = 1) =>
  value == null || !Number.isFinite(value) ? null : Number(value.toFixed(decimals));

export function explanationMetrics(route: RouteResult, price: number | null): ExplanationMetrics {
  const impact = estimateRouteImpact(route.miles, price);
  return {
    // summarizeFreeways preserves first appearance in ArcGIS directions.
    freeways: route.freeways.map(freeway => freeway.id),
    timeMin: roundExplanationValue(route.minutes)!, miles: roundExplanationValue(route.miles)!,
    fuel: roundExplanationValue(impact.fuelCost, 2), co2Kg: roundExplanationValue(impact.co2Kg)!,
    dacMi: route.communityImpact?.avgDieselPct == null ? null : roundExplanationValue(route.communityImpact.dacMi),
    dieselPct: roundExplanationValue(route.communityImpact?.avgDieselPct),
  };
}

export function explanationRequest(original: RouteResult, selected: RouteCandidate, price: number | null, disruptions: string[]): ExplanationRequest {
  return {
    original: explanationMetrics(original, price),
    selected: { name: selected.name, tag: selected.tags.includes("Balanced") ? "Balanced" : selected.tags[0] || "", ...explanationMetrics(selected.route, price) },
    disruptions: [...disruptions],
  };
}

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(36);
}
export function explanationKey(selectedId: string, input: ExplanationRequest, departureMinutes: number | undefined) {
  // The payload fingerprint also invalidates price/reference/metric changes.
  const normalized = { ...input, disruptions: [...input.disruptions].sort() };
  return `explain-v1:${selectedId}:${hash(JSON.stringify(normalized.disruptions))}:${departureMinutes ?? "untimed"}:${hash(JSON.stringify(normalized))}`;
}

export function normalizeExplanationRequest(value: unknown): ExplanationRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  function metrics(raw: unknown): ExplanationMetrics | null {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (!Array.isArray(item.freeways) || item.freeways.length > 40 || !item.freeways.every(id => typeof id === "string" && /^(I|US|CA)-\d{1,3}$/.test(id))) return null;
    const limits = { timeMin: 20000, miles: 10000, fuel: 100000, co2Kg: 100000, dacMi: 10000, dieselPct: 100 };
    for (const [key, max] of Object.entries(limits)) {
      const number = item[key];
      if (number === null && ["fuel", "dacMi", "dieselPct"].includes(key)) continue;
      if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > max) return null;
    }
    return {
      freeways: [...item.freeways], timeMin: roundExplanationValue(item.timeMin as number)!, miles: roundExplanationValue(item.miles as number)!,
      fuel: roundExplanationValue(item.fuel as number | null, 2), co2Kg: roundExplanationValue(item.co2Kg as number)!,
      dacMi: roundExplanationValue(item.dacMi as number | null), dieselPct: roundExplanationValue(item.dieselPct as number | null),
    };
  }
  const original = metrics(body.original), selected = metrics(body.selected);
  if (!original || !selected || !body.selected || typeof body.selected !== "object") return null;
  const choice = body.selected as Record<string, unknown>;
  if (typeof choice.name !== "string" || !/^Route [A-Z]$/.test(choice.name) || typeof choice.tag !== "string" || !["", "Balanced", "Fastest", "Lowest community burden", "Lowest emissions", "Lowest DAC miles", "Lowest CO₂"].includes(choice.tag)) return null;
  if (!Array.isArray(body.disruptions) || body.disruptions.length > 12 || !body.disruptions.every(item => typeof item === "string" && item.length <= 180)) return null;
  return { original, selected: { name: choice.name, tag: choice.tag, ...selected }, disruptions: [...body.disruptions] };
}
