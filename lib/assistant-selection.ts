import { z } from "zod";
import { estimateRouteImpact } from "./route-metrics";
import type { RouteCandidate, RouteResult } from "./route-types";

export const SELECT_ROUTE_ARGS = z.object({
  minimize: z.enum(["dac_miles", "co2", "time", "cost"]),
  maxExtraMin: z.number().finite().nonnegative().optional(),
  maxExtraCost: z.number().finite().nonnegative().optional(),
  mustArriveBy: z.string().regex(/^\d{2}:\d{2}$/).optional(),
}).strict();
export type SelectRouteArgs = z.infer<typeof SELECT_ROUTE_ARGS>;
export type SelectRouteResult = { selected: string | null; tags?: string[]; extraMin?: number; extraCost?: number | null; dacMi?: number | null; co2Kg?: number; closest?: { name: string; extraMin: number; dacMi: number | null; failed: string } };
const round = (value: number, digits = 1) => Number(value.toFixed(digits));
export function chooseAssistantRoute(args: SelectRouteArgs, original: RouteResult, candidates: RouteCandidate[], price: number | null, departure: number): { candidate: RouteCandidate | null; result: SelectRouteResult } {
  const deadline = args.mustArriveBy ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(args.mustArriveBy) : null;
  if (args.mustArriveBy && !deadline) throw new Error("Couldn't apply that, try rephrasing.");
  const by = deadline ? Number(deadline[1]) * 60 + Number(deadline[2]) : null;
  const originalFuel = estimateRouteImpact(original.miles, price).fuelCost;
  const options = candidates.map(candidate => {
    const route = candidate.route;
    const fuel = estimateRouteImpact(route.miles, price).fuelCost;
    const extraMin = route.minutes - original.minutes;
    const extraCost = fuel === null || originalFuel === null ? null : fuel - originalFuel;
    const dacMi = route.communityImpact?.avgDieselPct == null ? null : route.communityImpact.dacMi;
    const co2Kg = estimateRouteImpact(route.miles, price).co2Kg;
    const failures = [
      ...(args.maxExtraMin !== undefined && extraMin > args.maxExtraMin ? [`maxExtraMin by ${round(extraMin - args.maxExtraMin)} min`] : []),
      ...(args.maxExtraCost !== undefined && (extraCost === null || extraCost > args.maxExtraCost) ? [extraCost === null ? "maxExtraCost: fuel price unavailable" : `maxExtraCost by $${round(extraCost - args.maxExtraCost, 2).toFixed(2)}`] : []),
      ...(by !== null && departure + route.minutes > by ? [`mustArriveBy by ${round(departure + route.minutes - by)} min`] : []),
      ...(args.minimize === "dac_miles" && dacMi === null ? ["dac_miles: community data unavailable"] : []),
      ...(args.minimize === "cost" && fuel === null ? ["cost: fuel price unavailable"] : []),
    ];
    const score = args.minimize === "dac_miles" ? dacMi ?? Infinity : args.minimize === "co2" ? co2Kg : args.minimize === "cost" ? fuel ?? Infinity : route.minutes;
    return { candidate, extraMin, extraCost, dacMi, co2Kg, score, failures };
  });
  const ordered = options.sort((a, b) => a.score - b.score || a.candidate.route.minutes - b.candidate.route.minutes || (a.dacMi ?? Infinity) - (b.dacMi ?? Infinity) || a.candidate.name.localeCompare(b.candidate.name));
  const winner = ordered.find(option => !option.failures.length);
  if (winner) return { candidate: winner.candidate, result: { selected: winner.candidate.name, tags: winner.candidate.tags, extraMin: round(winner.extraMin), extraCost: winner.extraCost === null ? null : round(winner.extraCost, 2), dacMi: winner.dacMi === null ? null : round(winner.dacMi), co2Kg: round(winner.co2Kg) } };
  const closest = ordered[0];
  return { candidate: null, result: { selected: null, ...(closest ? { closest: { name: closest.candidate.name, extraMin: round(closest.extraMin), dacMi: closest.dacMi === null ? null : round(closest.dacMi), failed: closest.failures.join(" · ") } } : {}) } };
}
export function selectionSummary(args: SelectRouteArgs, name: string) {
  const goal = { dac_miles: "lowest DAC miles", co2: "lowest CO₂", time: "fastest", cost: "lowest fuel cost" }[args.minimize];
  const limits = [args.maxExtraMin !== undefined ? `+${args.maxExtraMin} min` : "", args.maxExtraCost !== undefined ? `+$${args.maxExtraCost} fuel` : "", args.mustArriveBy ? `arrival by ${args.mustArriveBy}` : ""].filter(Boolean);
  return `Selected: ${name} — ${goal}${limits.length ? ` within ${limits.join(" · ")}` : ""}`;
}
