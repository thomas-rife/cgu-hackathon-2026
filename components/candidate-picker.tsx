"use client";

import type { RouteCandidate } from "@/lib/route-types";
export default function CandidatePicker({
  candidates,
  selectedId,
  onSelect,
  allCount,
  recommendedCount,
  showAll,
  onShowAllChange,
}: {
  candidates: RouteCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  allCount: number;
  recommendedCount: number;
  showAll: boolean;
  onShowAllChange: (all: boolean) => void;
}) {
  return (
    <div className="mt-3" aria-label="Route choices">
      <div
        className="mt-2 flex flex-wrap gap-1.5"
        aria-label="Best routes by priority"
      >
        {(
          [
            ["Fastest", "Fastest", "Shortest travel time"],
            [
              "Lowest community burden",
              "Lowest DAC miles",
              "Fewest miles in disadvantaged communities",
            ],
            [
              "Lowest emissions",
              "Lowest emissions",
              "Lowest estimated tailpipe CO₂ at 6 mpg",
            ],
            [
              "Balanced",
              "Balanced",
              "A middle-ground trade-off on the Pareto frontier",
            ],
          ] as const
        ).map(([tag, label, description]) => {
          const best = candidates.find((candidate) =>
            candidate.tags.includes(tag),
          );
          return (
            best && (
              <button
                key={tag}
                type="button"
                aria-pressed={best.id === selectedId}
                title={`${description} among the candidates found`}
                className={`rounded-md border px-2 py-1 text-[10px] ${best.id === selectedId ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                onClick={() => onSelect(best.id)}
              >
                {label}
              </button>
            )
          );
        })}
      </div>
      <label title={`Default view shows ${recommendedCount} tagged routes. Show all reveals every distinct verified candidate, including untagged options.`} className="mt-2.5 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
        <input
          type="checkbox"
          className="accent-blue-600"
          checked={showAll}
          onChange={(event) => onShowAllChange(event.target.checked)}
        />
        Show all candidates ({allCount})
      </label>
      {/* <p className="mt-1.5 text-[9px] leading-relaxed text-slate-400">{showAll ? `${allCount} distinct routes found. Outperformed routes are marked.` : `Showing ${recommendedCount} trade-off options. We hide routes that are worse on every measure, but you can always see them.`} Default view keeps up to four routes. Tags rank the routes found; DAC miles are the absolute distance through disadvantaged communities within CES coverage.</p> */}
    </div>
  );
}
