import type { RouteCandidate, RouteResult } from "./route-types";
import { impactValue } from "./decision-impact";
export const CANDIDATE_COLORS = ["#2563eb", "#7c3aed", "#0d9488", "#334155"];
const MUTED_COLORS = ["#93c5fd", "#c4b5fd", "#5eead4", "#94a3b8"];
export function candidateColor(candidate: RouteCandidate | undefined, muted = false) {
  const index = Math.max(0, candidate?.colorIndex ?? (candidate?.name.at(-1)?.charCodeAt(0) ?? 65) - 65) % CANDIDATE_COLORS.length;
  return (muted ? MUTED_COLORS : CANDIDATE_COLORS)[index];
}
export function dacMiles(route: RouteResult): number | null {
  return route.communityImpact?.avgDieselPct != null ? route.communityImpact.dacMi : null;
}
export function candidateSummary(route: RouteResult, reference: RouteResult) {
  const time = impactValue(route.minutes - reference.minutes, "min");
  const miles = dacMiles(route);
  return `${time} · ${miles === null ? "DAC —" : `${miles.toFixed(1)} mi DAC`}`;
}
