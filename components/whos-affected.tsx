import { impactColor, impactValue, isNoChange } from "@/lib/decision-impact";
import type { DecisionImpact } from "@/lib/decision-impact";
import type { ReferenceLabel } from "@/lib/comparison-reference";

export default function WhosAffected({
  impact,
  compact = false,
  totals = false,
  title,
  referenceLabel = "Original plan",
}: {
  impact: DecisionImpact | null;
  compact?: boolean;
  totals?: boolean;
  title?: string;
  referenceLabel?: ReferenceLabel;
}) {
  const value = (
    number: number | null | undefined,
    unit: "$" | "min" | "kg" | "mi",
  ) => impactValue(number ?? null, unit, !totals, compact);
  const color = (
    number: number | null | undefined,
    unit: "$" | "min" | "kg" | "mi",
  ) => (totals ? "text-slate-900" : impactColor(number ?? null, unit));
  const companyUnchanged = !totals && isNoChange(impact?.fuel, "$") && isNoChange(impact?.co2Kg, "kg");
  const companyColor = !isNoChange(impact?.fuel, "$") && impact?.fuel != null ? color(impact.fuel, "$") : color(impact?.co2Kg, "kg");
  if (compact)
    return (
      <p
        aria-label={`Decision trade-off from ${referenceLabel.toLowerCase()}`}
        className="mt-3 flex flex-wrap gap-x-1 text-xs tabular-nums"
      >
        {impact ? (
          <>
            <span className={color(impact.fuel, "$")}>
              {value(impact.fuel, "$")}
            </span>
            <span className="text-slate-300">·</span>
            <span className={color(impact.minutes, "min")}>
              {value(impact.minutes, "min")}
            </span>
            <span className="text-slate-300">·</span>
            <span className={color(impact.dacMi, "mi")}>
              {value(impact.dacMi, "mi")} in DACs
            </span>
            <span className="ml-1 text-[10px] text-slate-400">
              vs. {referenceLabel.toLowerCase()}
            </span>
          </>
        ) : (
          <span className="text-slate-400">
            Trade-off unavailable for this older trip · edit and save to compare
          </span>
        )}
      </p>
    );
  return (
    <section
      aria-label={title || "Who’s affected"}
      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
    >
      <h3 className="text-xs font-semibold text-slate-800">
        {title || "Who’s affected"}
      </h3>
      <dl
        className={`mt-2.5 ${totals ? "grid gap-3 sm:grid-cols-3" : "space-y-2.5"}`}
      >
        <div className={totals ? "" : "grid grid-cols-[70px_1fr] gap-2"}>
          <dt className="text-[11px] font-medium text-slate-500">Company</dt>
          <dd
            className={`text-[11px] font-medium tabular-nums ${companyColor}`}
          >
            {companyUnchanged ? "No change" : <><span className={!totals && isNoChange(impact?.fuel, "$") ? "text-slate-500" : undefined}>{value(impact?.fuel, "$")} fuel</span>{!totals && <> · <span className={isNoChange(impact?.co2Kg, "kg") ? "text-slate-500" : undefined}>{value(impact?.co2Kg, "kg")} CO₂</span></>}</>}
          </dd>
        </div>
        <div className={totals ? "" : "grid grid-cols-[70px_1fr] gap-2"}>
          <dt className="text-[11px] font-medium text-slate-500">Driver</dt>
          <dd
            className={`text-[11px] font-medium tabular-nums ${color(impact?.minutes, "min")}`}
          >
            {value(impact?.minutes, "min")}{" "}
            {totals ? "total driving time" : isNoChange(impact?.minutes, "min") ? "" : "on shift"}
          </dd>
        </div>
        <div className={totals ? "" : "grid grid-cols-[70px_1fr] gap-2"}>
          <dt className="text-[11px] font-medium text-slate-500">Residents</dt>
          <dd
            className={`text-[11px] font-medium tabular-nums ${color(impact?.dacMi, "mi")}`}
          >
            {value(impact?.dacMi, "mi")}{" "}
            {totals
              ? "by trucks in disadvantaged communities"
              : isNoChange(impact?.dacMi, "mi") ? "" : "through disadvantaged communities"}
          </dd>
        </div>
      </dl>
      {/* <p className="mt-2.5 text-[9px] leading-relaxed text-slate-400">
        {totals
          ? "Saved trips · estimated fuel and driving time; excludes loading and breaks."
          : "Change from reference · estimates. Green: lower burden; red: higher burden."}
      </p> */}
    </section>
  );
}
