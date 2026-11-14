import { estimateRouteImpact } from "./route-metrics";
import type { RouteResult } from "./route-types";

export type DecisionImpact = { fuel: number | null; co2Kg: number; minutes: number; dacMi: number | null };
export type ImpactUnit = "$" | "min" | "kg" | "mi" | "pct";
export const CHANGE_THRESHOLDS: Record<ImpactUnit, number> = { "$": .5, min: 1, kg: 1, mi: .5, pct: .5 };
export function isNoChange(value: number | null | undefined, unit: ImpactUnit) {
  return value != null && Number.isFinite(value) && Math.abs(value) < CHANGE_THRESHOLDS[unit];
}

export function decisionImpact(baseline: RouteResult, selected: RouteResult, price: number | null): DecisionImpact {
  const base = estimateRouteImpact(baseline.miles, price);
  const chosen = estimateRouteImpact(selected.miles, price);
  return {
    fuel: base.fuelCost == null || chosen.fuelCost == null ? null : chosen.fuelCost - base.fuelCost,
    co2Kg: chosen.co2Kg - base.co2Kg,
    minutes: selected.minutes - baseline.minutes,
    dacMi: baseline.communityImpact?.avgDieselPct == null || selected.communityImpact?.avgDieselPct == null
      ? null : selected.communityImpact.dacMi - baseline.communityImpact.dacMi,
  };
}

export function impactValue(value: number | null, unit: ImpactUnit, signed = true, compact = false) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (signed && isNoChange(value, unit)) return "No change";
  const decimals = unit === "$" ? 2 : unit === "min" || compact ? 0 : 1;
  const rounded = Number(value.toFixed(decimals));
  const sign = signed && rounded !== 0 ? rounded > 0 ? "+" : "−" : "";
  const amount = Math.abs(rounded).toFixed(decimals);
  return unit === "$" ? `${sign}$${amount}` : unit === "pct" ? `${sign}${amount}${signed ? " pts" : ""}` : `${sign}${amount} ${unit}`;
}

export function impactColor(value: number | null, unit: ImpactUnit) {
  return value == null || isNoChange(value, unit) ? "text-slate-500" : value < 0 ? "text-emerald-700" : "text-red-700";
}
