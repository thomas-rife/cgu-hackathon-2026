"use client";

import { useState } from "react";
import DisruptionsPanel from "./disruptions-panel";
import ActiveDisruptions from "./active-disruptions";
import RouteAssistant from "./route-assistant";
import type { AssistantProps } from "./route-assistant";
import type { RouteResult } from "@/lib/route-types";
import type { SimulationSettings } from "@/lib/simulation";

export default function DisruptionWorkspace({ tab, onTabChange, baseline, settings, onChange, onReset, routeKey, assistant }: {
  tab: "disruptions" | "assistant";
  onTabChange: (tab: "disruptions" | "assistant") => void;
  baseline: RouteResult | null;
  settings: SimulationSettings;
  onChange: (update: Partial<SimulationSettings>) => void;
  onReset: () => void;
  routeKey: string;
  assistant: Omit<AssistantProps, "cancelVersion" | "disruptions">;
}) {
  const [cancelVersion, setCancelVersion] = useState(0);
  function manualChange(update: Partial<SimulationSettings>) { setCancelVersion(value => value + 1); onChange(update); }
  return <section aria-label="Route scenarios" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-2">
      <div role="tablist" aria-label="Scenario controls" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(["disruptions", "assistant"] as const).map(value => <button key={value} type="button" role="tab" id={`${value}-tab`} tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} aria-controls={`${value}-panel`} onClick={() => onTabChange(value)} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "disruptions" : event.key === "End" ? "assistant" : value === "assistant" ? "disruptions" : "assistant";
          onTabChange(next);
          document.getElementById(`${next}-tab`)?.focus();
        }} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${tab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{value === "assistant" ? "Assistant" : "Disruptions"}</button>)}
      </div>
      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">Simulated</span>
    </div>
    <ActiveDisruptions items={settings.disruptions} onRemove={id => manualChange({ disruptions: settings.disruptions.filter(item => item.id !== id) })} />
    <div hidden={tab !== "disruptions"} role="tabpanel" id="disruptions-panel" aria-labelledby="disruptions-tab">
      <DisruptionsPanel embedded baseline={baseline} settings={settings} onChange={manualChange} onReset={() => { setCancelVersion(value => value + 1); onReset(); }} />
    </div>
    <div hidden={tab !== "assistant"} role="tabpanel" id="assistant-panel" aria-labelledby="assistant-tab">
      <RouteAssistant key={routeKey} {...assistant} disruptions={settings.disruptions} cancelVersion={cancelVersion} />
    </div>
  </section>;
}
