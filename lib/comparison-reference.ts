import type { RouteCandidate, RouteResult } from "./route-types";
import type { SimulationRequest } from "./simulation";

export type ReferenceLabel = "Original plan" | "Fastest";

export function comparisonReference(original: RouteResult | null, candidates: RouteCandidate[], conditions: SimulationRequest) {
  const disrupted = !!conditions.disruptions?.length || conditions.weather === "rain";
  const timed = conditions.departureMinutes !== undefined || conditions.arrivalMinutes !== undefined;
  const originalOnly = !disrupted && !timed;
  const fastest = candidates.reduce<RouteResult | null>((best, candidate) => !best || candidate.route.minutes < best.minutes ? candidate.route : best, null);
  return {
    label: (disrupted || originalOnly ? "Original plan" : "Fastest") as ReferenceLabel,
    route: disrupted || originalOnly ? original : fastest,
    originalOverlay: disrupted ? original : null,
    canKeepOriginal: (disrupted || originalOnly) && !!original && !conditions.disruptions?.some(item => item.kind === "closure"),
  };
}
