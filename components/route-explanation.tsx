"use client";

import { explanationRequest } from "@/lib/route-explanation";
import { useRouteExplanation } from "@/lib/use-route-explanation";
import type { RouteCandidate, RouteResult } from "@/lib/route-types";

export default function RouteExplanation({ reference, selected, disruptions, price }: { reference: RouteResult; selected: RouteCandidate; disruptions: string[]; price: number | null }) {
  const input = explanationRequest(reference, selected, price, disruptions);
  const { text, loading, streaming, fading } = useRouteExplanation(selected.id, input, selected.route.simulation?.departureMinutes);
  if (loading) return <div role="status" aria-label="Generating local route explanation" className="route-explanation-shimmer mt-2 h-3.5 w-full rounded" />;
  if (!text) return null;
  return <p aria-label="AI route explanation" aria-live={streaming ? "off" : "polite"} aria-busy={streaming} className={`mt-2 text-[11px] leading-relaxed text-slate-500 ${fading ? "route-explanation-fade" : ""}`}>
    <span tabIndex={0} title="Generated locally by Bolt. Uses only the numbers shown." aria-label="Generated locally by Bolt. Uses only the numbers shown." className="mr-1.5 inline-block rounded border border-slate-200 bg-slate-50 px-1 py-0.5 align-middle text-[8px] font-semibold text-slate-500">AI</span>
    {text}
    {streaming && <span aria-hidden="true" className="route-explanation-caret ml-0.5 inline-block h-[1em] w-px bg-current align-[-0.1em]" />}
  </p>;
}
