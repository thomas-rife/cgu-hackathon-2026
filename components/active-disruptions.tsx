"use client";

import { disruptionLabel } from "@/lib/simulation";
import type { Disruption } from "@/lib/simulation";

export default function ActiveDisruptions({ items, onRemove }: { items: Disruption[]; onRemove: (id: string) => void }) {
  return <div aria-label="Active disruptions" className="mt-3 flex flex-wrap gap-1.5">
    {!items.length && <p className="text-xs text-slate-500">No active disruptions</p>}
    {items.map(item => <span key={item.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-200 bg-amber-50 py-1 pl-2.5 pr-1 text-xs text-amber-900">
      <span className="truncate">{disruptionLabel(item) || (item.type === "closure" ? "Select closure freeway" : "Select slowdown freeway")}</span>
      <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${disruptionLabel(item) || "incomplete disruption"}`} className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-amber-100">×</button>
    </span>)}
  </div>;
}
