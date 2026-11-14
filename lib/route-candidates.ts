import { along, length, lineString } from "@turf/turf";
import { distanceFromRoute } from "./route-geometry";
import type { Coordinate, RouteCandidate, RouteResult } from "./route-types";

export function candidateId(route: RouteResult) {
  const value = JSON.stringify(route.geometry.paths);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `route-${(hash >>> 0).toString(36)}`;
}
const samples = new WeakMap<RouteResult, Coordinate[]>();
function routeSamples(route: RouteResult) {
  let result = samples.get(route);
  if (!result) {
    result = route.geometry.paths.flatMap(path => {
      const line = lineString(path);
      const miles = length(line, { units: "miles" });
      const count = Math.max(3, Math.min(100, Math.ceil(miles)));
      return Array.from({ length: count + 1 }, (_, i) => {
        const [longitude, latitude] = along(line, miles * i / count, { units: "miles" }).geometry.coordinates;
        return { longitude, latitude };
      });
    });
    samples.set(route, result);
  }
  return result;
}
export function routesAreDistinct(a: RouteResult, b: RouteResult) {
  const fractionNear = (route: RouteResult, other: RouteResult) => {
    const points = routeSamples(route);
    return points.filter(point => distanceFromRoute(point, other.geometry) < 0.06).length / points.length;
  };
  return fractionNear(a, b) < 0.98 || fractionNear(b, a) < 0.98;
}
export function rankCandidates(input: { route: RouteResult; source: RouteCandidate["source"] }[]): RouteCandidate[] {
  const sorted = [...input].sort((a, b) => a.route.minutes - b.route.minutes || a.route.miles - b.route.miles);
  const unique: typeof sorted = [];
  for (const entry of sorted) if (unique.every(other => routesAreDistinct(entry.route, other.route))) unique.push(entry);
  const chosen = unique;
  const fastest = Math.min(...chosen.map(item => item.route.minutes));
  const shortest = Math.min(...chosen.map(item => item.route.miles));
  const community = chosen.filter(item => item.route.communityImpact?.avgDieselPct != null);
  const leastDac = Math.min(...community.map(item => item.route.communityImpact!.dacMi));
  const ranked: RouteCandidate[] = chosen.map(({ route, source }, index) => ({
    id: candidateId(route), name: `Route ${String.fromCharCode(65 + index)}`, route, source,
    tags: [
      ...(route.minutes <= fastest + 1e-6 ? ["Fastest" as const] : []),
      ...(route.communityImpact?.avgDieselPct != null && route.communityImpact.dacMi <= leastDac + 1e-6 ? ["Lowest community burden" as const] : []),
      ...(route.miles <= shortest + 1e-6 ? ["Lowest emissions" as const] : []),
    ],
  }));
  for (const candidate of ranked) {
    candidate.dominated = ranked.some(other => other !== candidate && dominates(other.route, candidate.route));

  }
  const frontier = mergeNearDuplicates(ranked.filter(candidate => !candidate.dominated));
  const balance = frontier.filter(candidate => !candidate.tags.length && candidate.route.communityImpact?.avgDieselPct != null)
    .sort((a, b) => balanceScore(a, frontier) - balanceScore(b, frontier) || a.route.minutes - b.route.minutes)[0];
  if (balance) balance.tags.push("Balanced");
  const preferred = recommendedCandidates(ranked);
  preferred.forEach((candidate, index) => { candidate.colorIndex = index; });
  ranked.forEach((candidate, index) => { candidate.colorIndex ??= index % 4; });
  return ranked;
}

// Emissions are proportional to miles under the shared 6 mpg estimate.
// Unknown DAC coverage is incomparable: missing data must never win as zero.
export function dominates(a: RouteResult, b: RouteResult) {
  if (a.communityImpact?.avgDieselPct == null || b.communityImpact?.avgDieselPct == null) return false;
  const left = [a.minutes, a.communityImpact.dacMi, a.miles];
  const right = [b.minutes, b.communityImpact.dacMi, b.miles];
  return left.every((value, i) => value <= right[i] + 1e-6) && left.some((value, i) => value < right[i] - 1e-6);
}

export function mergeNearDuplicates(candidates: RouteCandidate[]) {
  const chosen: RouteCandidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.route.minutes - b.route.minutes || a.route.miles - b.route.miles)) {
    const near = chosen.some(other => candidate.route.communityImpact?.avgDieselPct != null && other.route.communityImpact?.avgDieselPct != null
      && Math.abs(candidate.route.minutes - other.route.minutes) <= 2 + 1e-6
      && Math.abs(candidate.route.communityImpact.dacMi - other.route.communityImpact.dacMi) <= 1 + 1e-6);
    if (!near) chosen.push(candidate);
  }
  return chosen;
}

export function balanceScore(candidate: RouteCandidate, frontier: RouteCandidate[]) {
  const known = frontier.filter(item => item.route.communityImpact?.avgDieselPct != null);
  if (candidate.route.communityImpact?.avgDieselPct == null || !known.length) return Infinity;
  const times = frontier.map(item => item.route.minutes), dac = known.map(item => item.route.communityImpact!.dacMi);
  const minTime = Math.min(...times), maxTime = Math.max(...times), minDac = Math.min(...dac), maxDac = Math.max(...dac);
  return (maxTime > minTime ? (candidate.route.minutes - minTime) / (maxTime - minTime) : 0)
    + (maxDac > minDac ? (candidate.route.communityImpact.dacMi - minDac) / (maxDac - minDac) : 0);
}

export function recommendedCandidates(all: RouteCandidate[]): RouteCandidate[] {
  const frontier = mergeNearDuplicates(all.filter(candidate => !candidate.dominated));
  if (frontier.length <= 4) return frontier;
  const chosen: RouteCandidate[] = [];
  for (const tag of ["Fastest", "Lowest community burden", "Lowest emissions", "Balanced"] as const) {
    const candidate = frontier.find(item => item.tags.includes(tag));
    if (candidate && !chosen.includes(candidate)) chosen.push(candidate);
  }
  const middle = frontier.filter(item => !chosen.includes(item)).sort((a, b) => balanceScore(a, frontier) - balanceScore(b, frontier) || a.route.minutes - b.route.minutes);
  chosen.push(...middle.slice(0, 4 - chosen.length));
  return chosen.sort((a, b) => a.route.minutes - b.route.minutes || a.route.miles - b.route.miles);
}
