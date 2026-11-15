"use client";

import { useMemo } from "react";
import { daySummaryInput } from "@/lib/day-summary";
import { useDaySummary } from "@/lib/use-day-summary";
import type { SavedTrip } from "@/lib/saved-trips";

export default function DaySummaryCard({ trips }: { trips: SavedTrip[] }) {
  const input = useMemo(() => daySummaryInput(trips), [trips]);
  const { text, streaming, loading } = useDaySummary(input);
  if (!input || (!text && !loading)) return null;
  return <section aria-label="AI day summary" className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
    <div className="flex items-start gap-3">
      <span tabIndex={0} title="Generated locally by Bolt from the numbers on this page." aria-label="Generated locally by Bolt from the numbers on this page." className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">AI</span>
      {loading ? <div role="status" aria-label="Generating local day summary" className="route-explanation-shimmer mt-1 h-4 w-full rounded" /> : <p aria-live={streaming ? "off" : "polite"} aria-busy={streaming} className="text-sm leading-relaxed text-slate-700">{text}{streaming && <span aria-hidden="true" className="route-explanation-caret ml-0.5 inline-block h-[1em] w-px bg-current align-[-0.1em]" />}</p>}
    </div>
  </section>;
}
