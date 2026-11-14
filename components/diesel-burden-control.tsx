"use client";

import { DIESEL_COLORS } from "@/lib/ces-config";
import type { useDieselLayer } from "@/lib/use-diesel-layer";
export default function DieselBurdenControl({ control }: { control: ReturnType<typeof useDieselLayer> }) {
  return <div className="w-48 rounded-lg border border-slate-200 bg-white/95 p-2.5 text-[10px] text-slate-600 shadow-sm" aria-label="Diesel burden layer controls">
    <label className="flex items-center gap-2 text-xs font-medium text-slate-800"><input type="checkbox" className="accent-blue-600" checked={control.visible} onChange={event => control.setVisible(event.target.checked)} />Diesel burden</label>
    {control.visible && <><p className="mt-1.5 text-[9px] text-slate-500">Existing burden · statewide percentile</p><div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1" aria-label="Diesel burden legend">
      {[{ label: "<50 / no data", color: "transparent" }, { label: "50–<75", color: DIESEL_COLORS.low }, { label: "75–<90", color: DIESEL_COLORS.medium }, { label: "90–100", color: DIESEL_COLORS.high }].map(bin => <span key={bin.label} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm border border-slate-200" style={{ backgroundColor: bin.color }} />{bin.label}</span>)}
    </div></>}
    {control.status !== "ready" && <p role="status" className="mt-1.5 text-[9px] text-slate-500">{control.status === "error" ? "Tract layer unavailable. Route metrics are separate." : "Loading tracts…"}</p>}
  </div>;
}
