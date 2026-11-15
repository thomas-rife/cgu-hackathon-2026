import { impactColor, impactValue, isNoChange } from "@/lib/decision-impact";
import type { DecisionImpact } from "@/lib/decision-impact";

export default function WhosAffected({
  impact,
  compact = false,
  columns = false,
  title,
  referenceLabel = "Original plan",
}: {
  impact: DecisionImpact | null;
  compact?: boolean;
  // Lay the three groups out side by side and show what they are compared with.
  columns?: boolean;
  title?: string;
  referenceLabel?: string;
}) {
  const value = (
    number: number | null | undefined,
    unit: "$" | "min" | "kg" | "mi",
  ) => impactValue(number ?? null, unit, true, compact);
  const color = (
    number: number | null | undefined,
    unit: "$" | "min" | "kg" | "mi",
  ) => impactColor(number ?? null, unit);
  const reference = referenceLabel.toLowerCase();
  const companyUnchanged =
    isNoChange(impact?.fuel, "$") && isNoChange(impact?.co2Kg, "kg");
  const companyColor =
    !isNoChange(impact?.fuel, "$") && impact?.fuel != null
      ? color(impact.fuel, "$")
      : color(impact?.co2Kg, "kg");
  if (compact)
    return (
      <p
        aria-label={`Decision trade-off from ${reference}`}
        className="mt-3 flex flex-wrap gap-x-1 text-xs tabular-nums"
      >
        {impact ? (
          <>
            <span className={color(impact.fuel, "$")}>
              {value(impact.fuel, "$")}
              {isNoChange(impact.fuel, "$") ? " in fuel" : " fuel"}
            </span>
            <span className="text-slate-300">·</span>
            <span className={color(impact.minutes, "min")}>
              {value(impact.minutes, "min")}
              {isNoChange(impact.minutes, "min") ? " in time" : ""}
            </span>
            <span className="text-slate-300">·</span>
            <span className={color(impact.dacMi, "mi")}>
              {impactValue(impact.dacMi, "mi")} in disadvantaged communities
            </span>
            <span className="ml-1 text-xs text-slate-500">
              vs. {reference}
            </span>
          </>
        ) : (
          <span className="text-slate-500">
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-xs font-semibold text-slate-800">
          {title || "Who’s affected"}
        </h3>
        {columns && (
          <p className="text-xs text-slate-500">vs. {reference}</p>
        )}
      </div>
      <dl
        className={`mt-2.5 ${columns ? "grid gap-3 sm:grid-cols-3" : "space-y-2.5"}`}
      >
        <div className={columns ? "" : "grid grid-cols-[70px_1fr] gap-2"}>
          <dt className="text-xs font-medium text-slate-600">Company</dt>
          <dd
            className={`text-xs font-medium tabular-nums ${companyColor}`}
          >
            {companyUnchanged ? (
              "No change"
            ) : (
              <>
                <span
                  className={
                    isNoChange(impact?.fuel, "$") ? "text-slate-600" : undefined
                  }
                >
                  {value(impact?.fuel, "$")} fuel
                </span>{" "}
                and{" "}
                <span
                  className={
                    isNoChange(impact?.co2Kg, "kg")
                      ? "text-slate-600"
                      : undefined
                  }
                >
                  {value(impact?.co2Kg, "kg")} CO₂
                </span>
              </>
            )}
          </dd>
        </div>
        <div className={columns ? "" : "grid grid-cols-[70px_1fr] gap-2"}>
          <dt className="text-xs font-medium text-slate-600">Driver</dt>
          <dd
            className={`text-xs font-medium tabular-nums ${color(impact?.minutes, "min")}`}
          >
            {value(impact?.minutes, "min")}{" "}
            {isNoChange(impact?.minutes, "min") || !impact ? "" : "on shift"}
          </dd>
        </div>
        <div className={columns ? "" : "grid grid-cols-[70px_1fr] gap-2"}>
          <dt className="text-xs font-medium text-slate-600">Residents</dt>
          <dd
            className={`text-xs font-medium tabular-nums ${color(impact?.dacMi, "mi")}`}
          >
            {value(impact?.dacMi, "mi")}{" "}
            {isNoChange(impact?.dacMi, "mi") || impact?.dacMi == null
              ? ""
              : "through disadvantaged communities"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
