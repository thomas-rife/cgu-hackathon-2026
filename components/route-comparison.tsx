"use client";

import { useState } from "react";
import type { RouteCandidate, RouteResult } from "@/lib/route-types";
import { formatDeparture } from "@/lib/simulation";
import { localPlanDate, validPlanDate } from "@/lib/saved-trips";
import { estimateRouteImpact } from "@/lib/route-metrics";
import HowItWorks from "./how-it-works";
import PopoutDialog from "./popout-dialog";
import CandidatePicker from "./candidate-picker";
import WhosAffected from "./whos-affected";
import {
  decisionImpact,
  impactValue,
  impactColor,
} from "@/lib/decision-impact";
import type { ImpactUnit } from "@/lib/decision-impact";
import { candidateColor } from "@/lib/candidate-display";
import type { ReferenceLabel } from "@/lib/comparison-reference";
import RouteExplanation from "./route-explanation";

type Props = {
  reference: RouteResult | null;
  referenceLabel: ReferenceLabel;
  canKeepOriginal: boolean;
  candidates: RouteCandidate[];
  allCandidateCount: number;
  recommendedCandidateCount: number;
  showAllCandidates: boolean;
  onShowAllCandidatesChange: (all: boolean) => void;
  selectedCandidateId: string | null;
  onSelectCandidate: (id: string) => void;
  candidateNotice?: string;
  referenceDepartureMinutes: number | null;
  alternate: RouteResult | null;
  baselineLoading: boolean;
  alternateLoading: boolean;
  baselineError: string;
  alternateError: string;
  prompt?: string;
  hasSimulation: boolean;
  scenarioLabels: string[];
  onRetryBaseline: () => void;
  onRetryAlternate: () => void;
  price: string;
  onPriceChange: (price: string) => void;
  expanded: boolean;
  onToggle: () => void;
  onSave: (option: "baseline" | "alternate", date: string) => void;
  saving: boolean;
  saveError: string;
  editingSavedTrip: boolean;
};
type Row = {
  label: string;
  unit: ImpactUnit;
  base: number | null;
  alt: number | null;
  estimate?: boolean;
  time?: boolean;
};
function EstimateBadge() {
  return (
    <span className="ml-1 inline-block rounded border border-amber-200 bg-amber-50 px-1 py-0.5 align-middle text-[8px] font-semibold uppercase tracking-wide text-amber-800">
      Est.
    </span>
  );
}
function delta(
  base: number | null | undefined,
  alt: number | null | undefined,
) {
  return base != null && alt != null ? alt - base : null;
}
function formatValue(value: number | null, unit: ImpactUnit, change = false) {
  if (change) return impactValue(value, unit);
  if (value === null) return "—";
  const decimals = unit === "$" ? 2 : 1;
  const rounded = Number(value.toFixed(decimals));
  const sign = change ? (rounded > 0 ? "+" : rounded < 0 ? "−" : "") : "";
  const amount = (change ? Math.abs(rounded) : rounded).toFixed(decimals);
  return unit === "$"
    ? `${sign}$${amount}`
    : unit === "pct"
      ? `${sign}${amount}${change ? " pts" : ""}`
      : `${sign}${amount} ${unit}`;
}
function formatArrival(minutes: number) {
  const day = Math.floor(Math.round(minutes) / 1440);
  return `${formatDeparture(minutes)}${day ? ` (${day > 0 ? "+" : ""}${day}d)` : ""}`;
}
export default function RouteComparison(props: Props) {
  const { reference: baseline, alternate, referenceLabel } = props;
  const selectedCandidate = props.candidates.find(
    (candidate) => candidate.id === props.selectedCandidateId,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [originalOperationsOpen, setOriginalOperationsOpen] = useState(true);
  const operationsExpanded = props.hasSimulation
    ? operationsOpen
    : originalOperationsOpen;
  const [communityOpen, setCommunityOpen] = useState(true);
  const [saveChoice, setSaveChoice] = useState<"baseline" | "alternate" | null>(
    null,
  );
  const [saveDate, setSaveDate] = useState("");
  const numericPrice = Number(props.price);
  const validPrice =
    props.price.trim() !== "" &&
    Number.isFinite(numericPrice) &&
    numericPrice > 0;
  const baselineImpact = baseline
    ? estimateRouteImpact(baseline.miles, validPrice ? numericPrice : null)
    : null;
  const alternateImpact = alternate
    ? estimateRouteImpact(alternate.miles, validPrice ? numericPrice : null)
    : null;
  const baselineArrival = baseline
    ? (baseline.simulation?.arrivalMinutes ??
      (props.referenceDepartureMinutes === null
        ? null
        : props.referenceDepartureMinutes + baseline.minutes))
    : null;
  const alternateArrival = alternate?.simulation?.arrivalMinutes ?? null;
  const operations: Row[] = [
    {
      label: "Time",
      unit: "min",
      base: baseline?.minutes ?? null,
      alt: alternate?.minutes ?? null,
      estimate: true,
      time: true,
    },
    {
      label: "Distance",
      unit: "mi",
      base: baseline?.miles ?? null,
      alt: alternate?.miles ?? null,
    },
    {
      label: "Fuel",
      unit: "$",
      base: baselineImpact?.fuelCost ?? null,
      alt: alternateImpact?.fuelCost ?? null,
      estimate: true,
    },
    {
      label: "CO₂",
      unit: "kg",
      base: baselineImpact?.co2Kg ?? null,
      alt: alternateImpact?.co2Kg ?? null,
      estimate: true,
    },
  ];
  const community: Row[] = [
    {
      label: "Diesel burden (avg %ile)",
      unit: "pct",
      base: baseline?.communityImpact?.avgDieselPct ?? null,
      alt: alternate?.communityImpact?.avgDieselPct ?? null,
    },
    {
      label: "High-diesel miles",
      unit: "mi",
      base: baseline?.communityImpact?.highDieselMi ?? null,
      alt: alternate?.communityImpact?.highDieselMi ?? null,
    },
    {
      label: "Disadvantaged-community miles",
      unit: "mi",
      base: baseline?.communityImpact?.dacMi ?? null,
      alt: alternate?.communityImpact?.dacMi ?? null,
    },
  ];
  const affected =
    baseline && alternate
      ? decisionImpact(baseline, alternate, validPrice ? numericPrice : null)
      : null;
  function openSave(option: "baseline" | "alternate") {
    setSaveDate(localPlanDate());
    setSaveChoice(option);
  }
  function rows(items: Row[]) {
    return items.map((row) => {
      const change = delta(row.base, row.alt);
      return (
        <tr key={row.label} className="border-b border-slate-100 last:border-0">
          <th
            scope="row"
            className="py-3 pr-2 text-left text-[11px] font-medium leading-relaxed text-slate-600"
          >
            {row.label}
            {row.estimate && <EstimateBadge />}
          </th>
          <td className="py-3 text-right text-slate-900">
            {formatValue(row.base, row.unit)}
            {row.time && baselineArrival !== null && (
              <span
                className="mt-1 block text-[9px] text-slate-500"
                title="Arrival in Pacific time"
              >
                arrives {formatArrival(baselineArrival)}
              </span>
            )}
          </td>
          {props.hasSimulation && (
            <>
              <td className="py-3 text-right text-slate-900">
                {formatValue(row.alt, row.unit)}
                {row.time && alternateArrival !== null && (
                  <span
                    className="mt-1 block text-[9px] text-slate-500"
                    title="Arrival in Pacific time"
                  >
                    arrives {formatArrival(alternateArrival)}
                  </span>
                )}
              </td>
              <td
                className={`py-3 text-right font-medium ${impactColor(change, row.unit)}`}
              >
                {formatValue(change, row.unit, true)}
              </td>
            </>
          )}
        </tr>
      );
    });
  }
  const baselineSavable =
    props.canKeepOriginal &&
    validPrice &&
    !!baseline &&
    !props.baselineLoading &&
    !props.saving;
  const alternateSavable =
    validPrice && !!alternate && !props.alternateLoading && !props.saving;
  if (!props.expanded)
    return (
      <button
        type="button"
        aria-label="Expand route comparison"
        aria-expanded="false"
        onClick={props.onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 shadow-lg shadow-slate-900/5 hover:bg-slate-50"
      >
        <span className="truncate">
          Route comparison · {selectedCandidate?.name || "Original plan"}
        </span>
        <span aria-hidden="true">▸</span>
      </button>
    );
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 ${props.expanded ? "p-4" : "p-3"}`}
      aria-label="Route comparison"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {props.hasSimulation ? "Route comparison" : "Original plan"}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="How FleetForward works"
            title="How FleetForward works"
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen(true)}
            className="grid size-7 place-items-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="m9.5 3-.6 2.2-2 .9-2.1-.6-2 3.4 1.6 1.6v2.3l-1.6 1.6 2 3.4 2.1-.6 2 .9.6 2.3h4.1l.6-2.3 2-.9 2.1.6 2-3.4-1.6-1.6v-2.3l1.6-1.6-2-3.4-2.1.6-2-.9-.6-2.2Z" />
              <circle cx="11.5" cy="11.7" r="3" />
            </svg>
          </button>
          {props.expanded && (
            <button
              type="button"
              aria-label="Collapse route comparison"
              aria-expanded="true"
              onClick={props.onToggle}
              className="rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-600"
            >
              Collapse
            </button>
          )}
        </div>
      </div>
      {props.expanded && props.hasSimulation && (
        <>
          <p
            className="mt-2 text-xs font-medium text-slate-600"
            aria-label="Comparison reference"
          >
            {referenceLabel} vs. {selectedCandidate?.name || "selected route"}
          </p>
          {baseline &&
            selectedCandidate &&
            !props.baselineLoading &&
            !props.alternateLoading && (
              <RouteExplanation
                reference={baseline}
                selected={selectedCandidate}
                disruptions={props.scenarioLabels}
                price={validPrice ? numericPrice : null}
              />
            )}
          <div className="mt-3" aria-live="polite">
            <WhosAffected impact={affected} referenceLabel={referenceLabel} />
          </div>
        </>
      )}
      <div
        className="mt-2 space-y-1 text-[11px] leading-relaxed"
        aria-live="polite"
      >
        {props.expanded && props.prompt && (
          <p className="text-slate-500">{props.prompt}</p>
        )}
        {props.baselineLoading && (
          <p role="status" className="text-blue-700">
            Calculating planned route…
          </p>
        )}
        {props.alternateLoading && (
          <p role="status" className="text-blue-700">
            Finding route options…
          </p>
        )}
        {props.baselineError && (
          <p role="alert" className="text-red-700">
            {props.baselineError}{" "}
            <button className="underline" onClick={props.onRetryBaseline}>
              Retry
            </button>
          </p>
        )}
        {props.alternateError && (
          <p role="alert" className="text-red-700">
            {props.alternateError}{" "}
            <button className="underline" onClick={props.onRetryAlternate}>
              Retry
            </button>
          </p>
        )}
      </div>
      {props.expanded && (
        <>
          {baseline && !!props.candidates.length && (
            <CandidatePicker
              candidates={props.candidates}
              selectedId={props.selectedCandidateId}
              onSelect={props.onSelectCandidate}
              allCount={props.allCandidateCount}
              recommendedCount={props.recommendedCandidateCount}
              showAll={props.showAllCandidates}
              onShowAllChange={props.onShowAllCandidatesChange}
            />
          )}
          {props.candidateNotice && (
            <p className="mt-2 text-[11px] text-slate-500">
              {props.candidateNotice}
            </p>
          )}
          {!!props.scenarioLabels.length && (
            <div className="my-3 flex flex-wrap gap-1.5">
              {props.scenarioLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-md bg-orange-50 px-2 py-1 text-[10px] text-orange-800"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <table
            className="mt-3 w-full table-fixed text-[11px] tabular-nums"
            aria-label={
              props.hasSimulation
                ? `${referenceLabel} and selected route metrics`
                : "Original plan metrics"
            }
          >
            {props.hasSimulation ? (
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
            ) : (
              <colgroup>
                <col className="w-[65%]" />
                <col className="w-[35%]" />
              </colgroup>
            )}
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-2 text-left">
                  <span className="sr-only">Metric</span>
                </th>
                <th className="pb-2 text-right font-medium text-slate-600">
                  {referenceLabel}
                </th>
                {props.hasSimulation && (
                  <>
                    <th
                      className="pb-2 text-right font-medium"
                      style={{ color: candidateColor(selectedCandidate) }}
                    >
                      {selectedCandidate?.name || "Selected"}
                    </th>
                    <th className="pb-2 text-right font-medium text-slate-500">
                      Change
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody aria-label="Operations">
              <tr>
                <th colSpan={props.hasSimulation ? 4 : 2} className="pt-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md bg-slate-50 px-2 py-2 text-left text-xs font-semibold text-slate-600"
                    aria-expanded={operationsExpanded}
                    onClick={() =>
                      props.hasSimulation
                        ? setOperationsOpen(!operationsOpen)
                        : setOriginalOperationsOpen(!originalOperationsOpen)
                    }
                  >
                    Operations
                    <span aria-hidden="true" className="text-slate-400">
                      {operationsExpanded ? "⌃" : "⌄"}
                    </span>
                  </button>
                </th>
              </tr>
              {operationsExpanded && rows(operations)}
            </tbody>
            <tbody aria-label="Community">
              <tr>
                <th colSpan={props.hasSimulation ? 4 : 2} className="pt-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md bg-slate-50 px-2 py-2 text-left text-xs font-semibold text-slate-700"
                    aria-expanded={communityOpen}
                    onClick={() => setCommunityOpen(!communityOpen)}
                  >
                    Community
                    <span aria-hidden="true" className="text-slate-400">
                      {communityOpen ? "⌃" : "⌄"}
                    </span>
                  </button>
                </th>
              </tr>
              {communityOpen && rows(community)}
            </tbody>
          </table>
          {alternate && (
            <p className="mt-2 text-[9px] text-slate-400">
              {referenceLabel === "Original plan"
                ? `Dashed gray: original plan${alternate.closures?.length ? " · red: blocked stretch" : ""} · bold color: selected route`
                : "Bold color: selected route · changes measured against the fastest route"}
            </p>
          )}
          {!props.hasSimulation && baseline && (
            <p className="mt-2 text-[10px] text-slate-500">
              Free-flow truck speeds · no departure time set
            </p>
          )}
        </>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
        {props.canKeepOriginal && (
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-40"
            disabled={!baselineSavable}
            onClick={() => openSave("baseline")}
          >
            Keep original plan
          </button>
        )}
        {props.hasSimulation && (
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
            disabled={!alternateSavable}
            onClick={() => openSave("alternate")}
          >
            Use{" "}
            {selectedCandidate?.name.replace("Route", "Route") ||
              "selected route"}
          </button>
        )}
      </div>
      {!validPrice && (
        <p className="mt-2 text-[10px] text-red-700">
          Enter a valid diesel price in settings to save.
        </p>
      )}
      {settingsOpen && (
        <HowItWorks
          price={props.price}
          onPriceChange={props.onPriceChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {saveChoice && (
        <PopoutDialog
          title={
            saveChoice === "baseline"
              ? "Keep original plan"
              : `Use ${selectedCandidate?.name || "this route"}`
          }
          onClose={() => {
            if (!props.saving) setSaveChoice(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (validPlanDate(saveDate)) props.onSave(saveChoice, saveDate);
            }}
          >
            <label
              htmlFor="trip-plan-date"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Plan date
            </label>
            <input
              data-autofocus
              id="trip-plan-date"
              type="date"
              className="route-input"
              value={saveDate}
              required
              onChange={(event) => setSaveDate(event.target.value)}
            />
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {props.editingSavedTrip
                ? "This replaces your saved trip with the chosen option."
                : "Add this route to Today’s Plan."}{" "}
              Stored in this browser.
            </p>
            {props.saveError && (
              <p role="alert" className="mt-3 text-xs text-red-700">
                {props.saveError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={props.saving}
                onClick={() => setSaveChoice(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !validPlanDate(saveDate) ||
                  props.saving ||
                  (saveChoice === "baseline"
                    ? !baselineSavable
                    : !alternateSavable)
                }
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                {props.saving ? "Saving…" : "Save to plan"}
              </button>
            </div>
          </form>
        </PopoutDialog>
      )}
    </section>
  );
}
