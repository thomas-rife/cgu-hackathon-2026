import { z } from "zod";
import { disruptionConstraintKey, disruptionLabel, formatDeparture, uniqueDisruptions } from "./simulation";
import type { Disruption } from "./simulation";
import { estimateRouteImpact } from "./route-metrics";
import type { RouteCandidate, RouteResult } from "./route-types";

export const EMPTY_TOOL_ARGS = z.object({}).strict();
export const SET_DISRUPTIONS_ARGS = z.object({
  closures: z.array(z.object({ freeway: z.string().min(1).max(40) }).strict()).max(8).optional(),
  slowdowns: z.array(z.object({ freeway: z.string().min(1).max(40), type: z.enum(["lane_closure", "crash", "crash_lane_closure"]) }).strict()).max(8).optional(),
  departure: z.string().min(1).max(16).optional(),
  weather: z.enum(["clear", "rain"]).optional(),
}).strict();
export type AssistantState = z.infer<typeof SET_DISRUPTIONS_ARGS> & { arrival?: string };
export type AssistantToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type AssistantMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "assistant"; content: null; tool_calls: AssistantToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type AssistantRoute = { name: string; tag: string; deltaTimeMin: number; deltaFuel: number | null; dacMi: number | null };
export type AssistantRouteResult = { routes: AssistantRoute[]; routingError?: string };

export class AssistantToolError extends Error {
  constructor(message: string, public readonly code: "freeway" | "arguments" = "arguments") { super(message); }
}
export function parseAssistantTime(value: string): number | null {
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (minutes > 59 || (match[3] ? hours < 1 || hours > 12 : hours > 23)) return null;
  if (match[3]) hours = hours % 12 + (match[3] === "pm" ? 12 : 0);
  return hours * 60 + minutes;
}
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export function normalizeAssistantFreeway(value: string, freeways: string[]): string {
  const numbers = value.match(/\d+/g) || [];
  const number = numbers.length === 1 ? Number(numbers[0]) : null;
  const exact = value.trim().toUpperCase().replace(/^SR[ -]?/, "CA-").replace(/^(I|CA|US)\s+/, "$1-");
  const matches = freeways.filter(id => Number(id.split("-")[1]) === number);
  if (freeways.includes(exact)) return exact;
  if (matches.length === 1) return matches[0];
  throw new AssistantToolError(`That freeway isn't on the original plan. Route freeways: ${freeways.join(", ") || "none"}.`, "freeway");
}
export function assistantState(items: Disruption[]): AssistantState {
  const time = items.find(item => item.type === "departure" || item.type === "arrival");
  const weather = items.find(item => item.type === "weather");
  return {
    closures: items.flatMap(item => item.type === "closure" && item.freeway ? [{ freeway: item.freeway }] : []),
    slowdowns: items.flatMap(item => item.type === "slowdown" && item.freeway ? [{ freeway: item.freeway, type: ({ lane: "lane_closure", crash: "crash", combined: "crash_lane_closure" } as const)[item.kind] }] : []),
    ...(time ? { [time.type]: clock(time.minutes) } : {}),
    ...(weather?.type === "weather" ? { weather: weather.weather } : {}),
  };
}
export function validateAssistantTool(call: AssistantToolCall, freeways: string[], previous: Disruption[]): Disruption[] | null {
  let raw: unknown;
  try { raw = JSON.parse(call.function.arguments); } catch { throw new AssistantToolError("Couldn't apply that, try rephrasing."); }
  if (call.function.name === "get_route_freeways" || call.function.name === "reset_disruptions") {
    if (!EMPTY_TOOL_ARGS.safeParse(raw).success) throw new AssistantToolError("Couldn't apply that, try rephrasing.");
    return call.function.name === "reset_disruptions" ? [] : null;
  }
  if (call.function.name !== "set_disruptions") throw new AssistantToolError("Couldn't apply that, try rephrasing.");
  const parsed = SET_DISRUPTIONS_ARGS.safeParse(raw);
  if (!parsed.success) throw new AssistantToolError("Couldn't apply that, try rephrasing.");
  const desired = parsed.data;
  const next: Disruption[] = [];
  const id = () => crypto.randomUUID();
  for (const item of desired.closures || []) next.push({ id: id(), type: "closure", freeway: normalizeAssistantFreeway(item.freeway, freeways) });
  for (const item of desired.slowdowns || []) next.push({ id: id(), type: "slowdown", freeway: normalizeAssistantFreeway(item.freeway, freeways), kind: ({ lane_closure: "lane", crash: "crash", crash_lane_closure: "combined" } as const)[item.type] });
  if (desired.departure !== undefined) {
    const minutes = parseAssistantTime(desired.departure);
    if (minutes === null) throw new AssistantToolError("Couldn't apply that, try rephrasing.");
    next.push({ id: id(), type: "departure", minutes });
  }
  if (desired.weather === "rain") next.push({ id: id(), type: "weather", weather: "rain" });
  const unique = uniqueDisruptions(next);
  if (unique.length > 8) throw new AssistantToolError("Couldn't apply that, try rephrasing.");
  // Reuse IDs for unchanged controls; replacement still removes everything omitted.
  return unique.map(item => ({ ...item, id: previous.find(old => disruptionConstraintKey(old) === disruptionConstraintKey(item))?.id || item.id }));
}
export function appliedSummary(items: Disruption[]) {
  return items.map(item => item.type === "departure" ? `Depart ${formatDeparture(item.minutes)}` : disruptionLabel(item)).filter(Boolean).join(" · ") || "All disruptions cleared";
}
export function assistantRoutes(original: RouteResult, candidates: RouteCandidate[], price: number | null): AssistantRoute[] {
  const fuel = estimateRouteImpact(original.miles, price).fuelCost;
  const round = (n: number) => Number(n.toFixed(1));
  if (!candidates.length) return [{ name: "Original plan", tag: "", deltaTimeMin: 0, deltaFuel: fuel === null ? null : 0, dacMi: original.communityImpact?.avgDieselPct == null ? null : round(original.communityImpact.dacMi) }];
  return candidates.map(candidate => {
    const cost = estimateRouteImpact(candidate.route.miles, price).fuelCost;
    return { name: candidate.name, tag: candidate.tags.join(" · "), deltaTimeMin: round(candidate.route.minutes - original.minutes), deltaFuel: cost === null || fuel === null ? null : Number((cost - fuel).toFixed(2)), dacMi: candidate.route.communityImpact?.avgDieselPct == null ? null : round(candidate.route.communityImpact.dacMi) };
  });
}
export function trimAssistantReply(text: string) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/[*_`]/g, "").trim();
  if (/<think>/i.test(clean)) return "";
  const ends = [...clean.matchAll(/[.!?](?=\s|$)/g)];
  return ends.length >= 2 ? clean.slice(0, ends[1].index! + 1) : clean;
}
