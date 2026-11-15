"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DESTINATION_AREAS, PLACE_KINDS, PORTS } from "@/lib/locations";
import type {
  MapFocus,
  PlaceKind,
  RouteLocation,
  RouteResponse,
  RouteCandidate,
} from "@/lib/route-types";
import { DEFAULT_DIESEL_PRICE } from "@/lib/route-metrics";
import MapView from "./mapview";
import PlacePicker from "./place-picker";
import RouteCardRow from "./route-card-row";
import RouteComparison from "./route-comparison";
import DisruptionWorkspace from "./disruption-workspace";
import { assistantRoutes } from "@/lib/assistant-tools";
import { chooseAssistantRoute } from "@/lib/assistant-selection";
import type { SelectRouteArgs, SelectRouteResult } from "@/lib/assistant-selection";
import type { AssistantRouteResult } from "@/lib/assistant-tools";
import {
  DEFAULT_SIMULATION,
  disruptionLabel,
  simulationRequest,
  uniqueDisruptions,
} from "@/lib/simulation";
import type { Disruption, SimulationRequest, SimulationSettings } from "@/lib/simulation";

import { saveTrip, validPlanDate } from "@/lib/saved-trips";
import type { SavedTrip, StopDraft } from "@/lib/saved-trips";
import { decisionImpact } from "@/lib/decision-impact";
import { comparisonReference } from "@/lib/comparison-reference";
import { useComparisonDisclosure } from "@/lib/use-comparison-disclosure";
const EMPTY_CANDIDATES: RouteCandidate[] = [];

const KIND_CHIP_LABELS: Record<string, string> = {
  warehouse: "Warehouse",
  yard: "Yard",
  fuel: "Fuel",
  address: "Address",
};
const STOP_KINDS = PLACE_KINDS;
const DESTINATION_KINDS = PLACE_KINDS.filter(
  (kind) => kind.value === "warehouse" || kind.value === "address",
);

function KindChips({
  label,
  kinds,
  value,
  onChange,
}: {
  label: string;
  kinds: typeof PLACE_KINDS;
  value: PlaceKind;
  onChange: (kind: PlaceKind) => void;
}) {
  return (
    <div role="group" aria-label={label} className="mb-3 flex flex-wrap gap-1">
      {kinds.map((kind) => (
        <button
          key={kind.value}
          type="button"
          title={kind.label}
          aria-pressed={value === kind.value}
          className={`rounded-full border px-2 py-0.5 text-[11px] ${value === kind.value ? "border-blue-300 bg-blue-50 font-medium text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          onClick={() => {
            if (value !== kind.value) onChange(kind.value);
          }}
        >
          {KIND_CHIP_LABELS[kind.value] || kind.label}
        </button>
      ))}
    </div>
  );
}

function useSolvedRoute(
  stops: RouteLocation[] | null,
  simulation: SimulationRequest = {},
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    route: RouteResponse | null;
    error: string;
  }>({ key: "", route: null, error: "" });
  const body = stops ? JSON.stringify({ stops, ...simulation }) : null;
  const key = body ? `${attempt}:${body}` : null;

  useEffect(() => {
    if (!body || !key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Routing failed.");
        if (!controller.signal.aborted)
          setState({ key, route: data, error: "" });
      } catch (cause) {
        if (!controller.signal.aborted)
          setState({
            key,
            route: null,
            error: cause instanceof Error ? cause.message : "Routing failed.",
          });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [body, key]);

  return {
    route: key && state.key === key ? state.route : null,
    error: key && state.key === key ? state.error : "",
    loading: !!key && state.key !== key,
    retry: () => setAttempt(attempt + 1),
  };
}

export default function RoutePlanner({
  initialTrip,
  initialDate,
}: {
  initialTrip?: SavedTrip;
  initialDate: string;
}) {
  const router = useRouter();
  const draft = initialTrip?.draft;
  const [portId, setPortId] = useState(draft?.portId || PORTS[0].id);
  const [areaId, setAreaId] = useState(
    draft?.areaId || DESTINATION_AREAS[0].id,
  );
  const [destinationKind, setDestinationKind] = useState<PlaceKind>(
    draft?.destinationKind || "warehouse",
  );
  const [destination, setDestination] = useState<RouteLocation | null>(
    draft?.destination || null,
  );
  const [stops, setStops] = useState<StopDraft[]>(draft?.stops || []);
  const [dieselPrice, setDieselPrice] = useState(
    draft?.dieselPrice || DEFAULT_DIESEL_PRICE.toFixed(2),
  );
  const planDate = initialTrip?.planDate || initialDate;
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [candidateSelection, setCandidateSelection] = useState(() => ({
    key: initialTrip ? `${JSON.stringify(initialTrip.route.stops.map(stop => [stop.id, stop.longitude, stop.latitude]))}|${JSON.stringify(simulationRequest(draft?.settings || DEFAULT_SIMULATION))}` : "",
    id: initialTrip?.candidate?.id || "",
  }));
  const [candidateDisclosure, setCandidateDisclosure] = useState<{ key: string; all: boolean } | null>(null);
  const [assistantVisibleId, setAssistantVisibleId] = useState<{ key: string; id: string } | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // A new trip stays in the editor until the user presses Done; a saved trip opens collapsed.
  const [routeEditing, setRouteEditing] = useState(!initialTrip);
  const [fitRequest, setFitRequest] = useState(0);
  const [comparisonExpanded, setComparisonExpanded] = useComparisonDisclosure();
  const [scenarioTab, setScenarioTab] = useState<"disruptions" | "assistant">("disruptions");
  const assistantPending = useRef<{ key: string; baselineKey: string; finish: (result: AssistantRouteResult) => void; cancel: () => void } | null>(null);
  const routeCardRef = useRef<HTMLElement | null>(null);
  const disruptionsDockRef = useRef<HTMLDivElement | null>(null);
  const comparisonDockRef = useRef<HTMLDivElement | null>(null);
  const overlayRefs = useMemo(
    () => ({
      route: routeCardRef,
      disruptions: disruptionsDockRef,
      comparison: comparisonDockRef,
    }),
    [],
  );
  const [scenario, setScenario] = useState(() => ({
    baselineKey: initialTrip
      ? JSON.stringify(
          initialTrip.route.stops.map((stop) => [
            stop.id,
            stop.longitude,
            stop.latitude,
          ]),
        )
      : "",
    settings: draft
      ? { disruptions: uniqueDisruptions(draft.settings.disruptions) }
      : DEFAULT_SIMULATION,
  }));
  const port = PORTS.find((port) => port.id === portId)!;
  const area = DESTINATION_AREAS.find((area) => area.id === areaId)!;

  const directStops = useMemo(
    () => (destination ? [port, destination] : null),
    [port, destination],
  );
  const direct = useSolvedRoute(directStops);
  const completeStops = useMemo(
    () =>
      destination && stops.length && stops.every((stop) => stop.location)
        ? [port, ...stops.map((stop) => stop.location!), destination]
        : null,
    [port, destination, stops],
  );
  const withStops = useSolvedRoute(completeStops);
  const active = stops.length ? withStops : direct;
  const baselineKey = active.route
    ? JSON.stringify(
        active.route.stops.map((stop) => [
          stop.id,
          stop.longitude,
          stop.latitude,
        ]),
      )
    : "";
  const settings =
    scenario.baselineKey === baselineKey
      ? scenario.settings
      : DEFAULT_SIMULATION;
  const simulation = simulationRequest(settings);
  const timeConstraint = settings.disruptions.find(item => item.type === "departure" || item.type === "arrival");
  const baselineDepartureMinutes = timeConstraint?.type === "arrival"
    ? timeConstraint.minutes - (active.route?.minutes ?? 0)
    : timeConstraint?.minutes ?? null;
  const hasSimulation = Object.keys(simulation).length > 0;
  const alternate = useSolvedRoute(
    hasSimulation && active.route ? active.route.stops : null,
    { ...simulation, candidates: true },
  );
  const candidateKey = `${baselineKey}|${JSON.stringify(simulation)}`;
  const recommended = alternate.route?.candidates || EMPTY_CANDIDATES;
  const allCandidates = alternate.route?.allCandidates || recommended;
  const restoredCandidate = initialTrip?.candidate && candidateSelection.key === candidateKey && candidateSelection.id === initialTrip.candidate.id
    ? allCandidates.find(candidate => candidate.id === initialTrip.candidate!.id) || allCandidates.find(candidate => candidate.source === initialTrip.candidate!.source
      && Math.abs(candidate.route.miles - initialTrip.route.miles) < 0.5
      && candidate.route.freeways.map(f => f.id).sort().join() === initialTrip.route.freeways.map(f => f.id).sort().join()) : undefined;
  const showAllCandidates = candidateDisclosure?.key === candidateKey ? candidateDisclosure.all : false;
  const candidates = useMemo(() => showAllCandidates ? allCandidates : recommended.concat(allCandidates.filter(candidate => candidate.id === assistantVisibleId?.id && assistantVisibleId.key === candidateKey && !recommended.some(visible => visible.id === candidate.id))), [showAllCandidates, allCandidates, recommended, assistantVisibleId, candidateKey]);
  const selectedCandidate = candidates.find(candidate => candidateSelection.key === candidateKey && candidate.id === candidateSelection.id) || candidates.find(candidate => candidate.id === restoredCandidate?.id) || candidates[0] || null;
  const selectedRoute = selectedCandidate?.route || null;
  const reference = comparisonReference(active.route, allCandidates, simulation);
  const referenceDepartureMinutes = reference.label === "Original plan" ? baselineDepartureMinutes : reference.route?.simulation?.departureMinutes ?? baselineDepartureMinutes;
  function selectCandidate(id: string) {
    if (!candidates.some(candidate => candidate.id === id)) return;
    setComparisonExpanded(true);
    setCandidateSelection({ key: candidateKey, id });
    setCandidateDisclosure({ key: candidateKey, all: showAllCandidates });
    setFocus(null);
  }
  function selectAssistantRoute(args: SelectRouteArgs): { result: SelectRouteResult; previous: { key: string; id: string } | null } {
    if (!active.route || alternate.loading) throw new Error("Routes are still calculating.");
    const time = settings.disruptions.find(item => item.type === "departure" || item.type === "arrival");
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const departure = time?.type === "departure" ? time.minutes : time?.type === "arrival" ? time.minutes - active.route.minutes : currentMinutes;
    const choice = chooseAssistantRoute(args, active.route, hasSimulation ? allCandidates : [{ id: "original", name: "Original plan", route: active.route, tags: ["Fastest"], source: "fastest" }], price, departure);
    const previous = candidateSelection.key === candidateKey && candidateSelection.id ? candidateSelection : null;
    if (choice.candidate && choice.candidate.id !== "original") {
      if (!candidates.some(candidate => candidate.id === choice.candidate!.id)) setAssistantVisibleId({ key: candidateKey, id: choice.candidate.id });
      setComparisonExpanded(true);
      setCandidateSelection({ key: candidateKey, id: choice.candidate.id });
      setFocus(null);
    }
    return { result: choice.result, previous };
  }
  function undoAssistantSelection(previous: { key: string; id: string } | null) {
    if (previous?.key === candidateKey) {
      if (!recommended.some(candidate => candidate.id === previous.id)) setAssistantVisibleId(previous);
      setCandidateSelection(previous);
      setComparisonExpanded(true);
    }
    else setCandidateSelection({ key: "", id: "" });
  }
  const routeCollapsed = !!active.route && !routeEditing;
  const scenarioLabels = [
    ...new Set(
      settings.disruptions
        .map(disruptionLabel)
        .filter((label): label is string => !!label),
    ),
  ];
  const mapStops = useMemo(
    () => [
      { ...port, sequence: 1 },
      ...stops.flatMap((stop, index) =>
        stop.location ? [{ ...stop.location, sequence: index + 2 }] : [],
      ),
      ...(destination ? [{ ...destination, sequence: stops.length + 2 }] : []),
    ],
    [port, stops, destination],
  );
  const mapFocus =
    focus && mapStops.some((stop) => stop.id === focus.location.id)
      ? focus
      : null;
  const incomplete = stops.some((stop) => !stop.location);
  const price = Number(dieselPrice) > 0 && Number.isFinite(Number(dieselPrice)) ? Number(dieselPrice) : null;

  useEffect(() => {
    const pending = assistantPending.current;
    if (!pending) return;
    if (pending.baselineKey !== baselineKey) { pending.cancel(); return; }
    if (pending.key !== candidateKey || !active.route || (hasSimulation && alternate.loading)) return;
    pending.finish({
      routes: alternate.error ? [] : assistantRoutes(active.route, hasSimulation ? allCandidates : [], price),
      ...(alternate.error ? { routingError: alternate.error } : {}),
    });
  }, [baselineKey, candidateKey, active.route, hasSimulation, alternate.loading, alternate.error, allCandidates, price]);

  function applyAssistantDisruptions(items: Disruption[], signal: AbortSignal): Promise<AssistantRouteResult> {
    signal.throwIfAborted();
    if (!active.route) return Promise.reject(new Error("Set a route first."));
    const disruptions = uniqueDisruptions(items);
    const next = simulationRequest({ disruptions });
    const key = `${baselineKey}|${JSON.stringify(next)}`;
    // Every assistant mutation enters through the same action as manual edits.
    updateSimulation({ disruptions });
    if (!Object.keys(next).length) return Promise.resolve({ routes: assistantRoutes(active.route, [], price) });
    if (key === candidateKey && alternate.route && !alternate.loading) return Promise.resolve({ routes: assistantRoutes(active.route, allCandidates, price) });
    assistantPending.current?.cancel();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        if (assistantPending.current?.key === key) assistantPending.current = null;
      };
      const cancel = () => { cleanup(); reject(new DOMException("Scenario changed", "AbortError")); };
      const finish = (result: AssistantRouteResult) => { cleanup(); resolve(result); };
      const timer = setTimeout(() => finish({ routes: [], routingError: "Scenario applied; routing is still calculating. No new route metrics available yet." }), 90000);
      assistantPending.current = { key, baselineKey, finish, cancel };
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  function focusLocation(location: RouteLocation) {
    setFocus((previous) => ({
      location,
      requestId: (previous?.requestId || 0) + 1,
    }));
  }

  function finishEditing() {
    setRouteEditing(false);
    setFocus(null);
    setFitRequest((previous) => previous + 1);
  }

  function clearRouteInteraction() {
    setScenario({ baselineKey: "", settings: DEFAULT_SIMULATION });
    setFocus(null);
  }

  function updateSimulation(update: Partial<SimulationSettings>) {
    setScenario({
      baselineKey,
      settings: {
        ...settings,
        ...update,
        disruptions: uniqueDisruptions(
          update.disruptions || settings.disruptions,
        ),
      },
    });
    setFocus(null);
  }

  function updateDestination(location: RouteLocation | null) {
    clearRouteInteraction();
    setDestination(location);
  }

  function saveOption(option: "baseline" | "alternate", saveDate: string) {
    const route = option === "baseline" ? active.route : selectedRoute;
    if (
      !route ||
      !destination ||
      saving ||
      (option === "baseline" && !reference.canKeepOriginal) ||
      !validPlanDate(saveDate) ||
      !Number.isFinite(Number(dieselPrice)) ||
      Number(dieselPrice) <= 0
    )
      return;
    setSaveError("");
    const departureMinutes =
      option === "alternate"
        ? (route.simulation?.departureMinutes ?? null)
        : baselineDepartureMinutes;
    const now = new Date().toISOString();
    try {
      saveTrip({
        id: initialTrip?.id || crypto.randomUUID(),
        planDate: saveDate,
        option,
        route,
        ...(reference.route ? { tradeoff: decisionImpact(reference.route, route, Number(dieselPrice)), tradeoffReference: reference.label } : {}),
        ...(!hasSimulation || allCandidates.length ? { fastestTradeoff: decisionImpact(allCandidates.find(candidate => candidate.tags.includes("Fastest"))?.route || active.route || route, route, Number(dieselPrice)) } : {}),
        ...(option === "alternate" && selectedCandidate ? { candidate: { id: selectedCandidate.id, name: selectedCandidate.name, source: selectedCandidate.source, tags: selectedCandidate.tags } } : {}),
        createdAt: initialTrip?.createdAt || now,
        updatedAt: now,
        departureMinutes,
        arrivalMinutes: departureMinutes === null ? null : departureMinutes + route.minutes,
        indicators:
          option === "baseline"
            ? ["Original plan"]
            : [...new Set([route.simulation?.departureMinutes !== undefined ? "Historical traffic" : "Free-flow speeds", ...(selectedCandidate ? selectedCandidate.tags : []), ...scenarioLabels])],
        draft: {
          portId,
          areaId,
          destinationKind,
          destination,
          stops,
          dieselPrice,
          settings,
        },
      });
      setSaving(true);
      router.push(`/?date=${encodeURIComponent(saveDate)}`);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save this trip.",
      );
    }
  }

  function updateStop(id: string, update: Partial<StopDraft>) {
    clearRouteInteraction();
    setStops((previous) =>
      previous.map((stop) => (stop.id === id ? { ...stop, ...update } : stop)),
    );
  }

  function addStop(index: number) {
    clearRouteInteraction();
    setStops((previous) => [
      ...previous.slice(0, index),
      { id: crypto.randomUUID(), kind: "warehouse", areaId, location: null },
      ...previous.slice(index),
    ]);
  }

  function addButton(index: number) {
    return (
      <div className="relative flex w-8 shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px bg-slate-300"
        />
        <button
          type="button"
          className="relative grid size-6 place-items-center rounded-full border border-slate-300 bg-white text-sm leading-none text-slate-600 hover:border-blue-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!direct.route || stops.length >= 8}
          aria-label={`Add stop ${index + 1}`}
          title="Add a stop here"
          onClick={() => addStop(index)}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight"><Link href={`/?date=${encodeURIComponent(planDate)}`}>FleetForward</Link></h1>
          {/* <span className="text-sm text-slate-500">Route planner</span> */}
        </div>
        <div className="flex items-center gap-4">
        <button type="button" aria-label="Open dispatch assistant" aria-pressed={scenarioTab === "assistant"} onClick={() => { setScenarioTab("assistant"); disruptionsDockRef.current?.scrollIntoView({ block: "nearest" }); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4h2a8.5 8.5 0 0 1 8.5 7.5Z" /><path d="M7 10h10M7 14h6" /></svg>
        </button>
        <Link
          href={`/?date=${encodeURIComponent(planDate)}`}
          className="shrink-0 text-sm font-medium text-blue-700 hover:underline"
        >
          Today’s Plan
        </Link>
        </div>
      </header>
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={
          {
            "--comparison-width": comparisonExpanded ? "460px" : "250px",
          } as CSSProperties
        }
      >
        <div className="absolute inset-0 flex">
          <MapView
            route={selectedRoute || (!hasSimulation ? active.route : null)}
            referenceRoute={reference.route}
            originalPlanRoute={reference.originalOverlay}
            candidates={candidates}
            selectedCandidateId={selectedCandidate?.id || null}
            onSelectCandidate={selectCandidate}
            stops={mapStops}
            overlayRefs={overlayRefs}
            focus={mapFocus}
            fitRequest={fitRequest}
            onFocusLocation={focusLocation}
            onClearFocus={() => setFocus(null)}
          />
        </div>
        <div
          className={`floating-route-stack pointer-events-none absolute ${comparisonExpanded ? "top-4" : "top-16 lg:top-4"} right-4 bottom-24 left-4 z-20 flex min-w-0 flex-col items-start gap-3 lg:right-[calc(var(--comparison-width)+2rem)] lg:bottom-4`}
          aria-label="Plan a freight route"
        >
          <section
            ref={routeCardRef}
            aria-label="Route"
            className={`pointer-events-auto ${routeCollapsed ? "w-full" : "w-fit max-w-full"} min-w-0 shrink-0 rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 ${routeCollapsed ? "p-3" : "max-h-[55dvh] overflow-y-auto p-4"}`}
          >
            {routeCollapsed && active.route ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm"
                  aria-label="Expand route plan"
                  aria-expanded="false"
                  onClick={() => setRouteEditing(true)}
                >
                  <span className="min-w-0 truncate font-medium text-slate-700">
                    {port.name}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    →
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                    {destination?.name}
                  </span>
                  {!!stops.length && (
                    <span className="shrink-0 text-xs text-slate-400">
                      {stops.length} stop{stops.length === 1 ? "" : "s"}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-slate-500">
                    {active.route.miles.toFixed(1)} mi
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                  onClick={() => setRouteEditing(true)}
                >
                  Edit
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Route
                  </h2>
                  {active.route && routeEditing && (
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                      onClick={finishEditing}
                    >
                      Done
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Choose your destination, then add optional stops along the
                  way.
                </p>

                <RouteCardRow itemCount={stops.length}>
                  <section
                    className="w-[280px] shrink-0 snap-start rounded-xl border border-slate-200 p-4"
                    aria-label="Origin"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                        1
                      </span>
                      <h3 className="text-sm font-semibold">Starting port</h3>
                    </div>
                    <label className="sr-only" htmlFor="starting-port">
                      Starting port
                    </label>
                    <select
                      id="starting-port"
                      className="route-input"
                      value={portId}
                      onChange={(event) => {
                        clearRouteInteraction();
                        setPortId(event.target.value);
                      }}
                    >
                      {PORTS.map((item, index) => (
                        <option key={item.id} value={item.id}>
                          {item.name.replace("Port of ", "")}
                          {index === 0 ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {port.address}
                    </p>
                  </section>

                  {addButton(0)}
                  {stops.map((stop, index) => {
                    const stopArea =
                      DESTINATION_AREAS.find(
                        (area) => area.id === stop.areaId,
                      ) || area;
                    return (
                      <Fragment key={stop.id}>
                        <section
                          className="w-[280px] shrink-0 snap-start rounded-xl border border-slate-200 p-4"
                          aria-label={`Optional stop ${index + 1}`}
                        >
                          <div className="mb-3 flex items-center gap-2">
                            <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">
                              {index + 2}
                            </span>
                            <h3 className="text-sm font-semibold">
                              Stop {index + 1}
                            </h3>
                            <button
                              type="button"
                              className="ml-auto text-xs text-slate-500 hover:text-red-700"
                              aria-label={`Remove stop ${index + 1}`}
                              onClick={() => {
                                clearRouteInteraction();
                                setStops((previous) =>
                                  previous.filter(
                                    (item) => item.id !== stop.id,
                                  ),
                                );
                              }}
                            >
                              Remove
                            </button>
                          </div>
                          <KindChips
                            label={`Stop ${index + 1} type`}
                            kinds={STOP_KINDS}
                            value={stop.kind}
                            onChange={(kind) =>
                              updateStop(stop.id, { kind, location: null })
                            }
                          />
                          <label
                            className="mb-1 block text-xs font-medium text-slate-600"
                            htmlFor={`area-${stop.id}`}
                          >
                            Area
                          </label>
                          <select
                            id={`area-${stop.id}`}
                            aria-label={`Stop ${index + 1} area`}
                            className="route-input mb-3"
                            value={stop.areaId}
                            onChange={(event) =>
                              updateStop(stop.id, {
                                areaId: event.target.value,
                                location: null,
                              })
                            }
                          >
                            {DESTINATION_AREAS.map((area) => (
                              <option key={area.id} value={area.id}>
                                {area.name}
                              </option>
                            ))}
                          </select>
                          <PlacePicker
                            key={`${stop.id}-${stop.kind}-${stop.areaId}`}
                            label={`Stop ${index + 1}`}
                            kind={stop.kind}
                            near={stopArea}
                            areaName={stopArea.name}
                            value={stop.location}
                            onChange={(location) =>
                              updateStop(stop.id, { location })
                            }
                            disabled={!direct.route}
                            onFocusLocation={focusLocation}
                            excludeIds={[
                              port.id,
                              ...(destination ? [destination.id] : []),
                              ...stops.flatMap((other) =>
                                other.id !== stop.id && other.location
                                  ? [other.location.id]
                                  : [],
                              ),
                            ]}
                          />
                        </section>
                        {addButton(index + 1)}
                      </Fragment>
                    );
                  })}

                  <section
                    className="w-[280px] shrink-0 snap-start rounded-xl border border-slate-200 p-4"
                    aria-label="Destination"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                        {stops.length + 2}
                      </span>
                      <h3 className="text-sm font-semibold">
                        Delivery destination
                      </h3>
                    </div>
                    <KindChips
                      label="Destination type"
                      kinds={DESTINATION_KINDS}
                      value={destinationKind}
                      onChange={(kind) => {
                        setDestinationKind(kind);
                        updateDestination(null);
                      }}
                    />
                    <label
                      className="mb-1 block text-xs font-medium text-slate-600"
                      htmlFor="destination-area"
                    >
                      Area
                    </label>
                    <select
                      id="destination-area"
                      className="route-input mb-3"
                      value={areaId}
                      onChange={(event) => {
                        setAreaId(event.target.value);
                        updateDestination(null);
                      }}
                    >
                      {DESTINATION_AREAS.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                    <PlacePicker
                      key={`${areaId}-${destinationKind}`}
                      label="Destination"
                      kind={destinationKind}
                      near={area}
                      areaName={area.name}
                      value={destination}
                      onChange={updateDestination}
                      onFocusLocation={focusLocation}
                    />
                  </section>
                </RouteCardRow>
              </>
            )}
          </section>

          <div
            ref={disruptionsDockRef}
            className="pointer-events-auto min-h-0 w-[350px] max-w-full overflow-y-auto rounded-2xl"
          >
            <DisruptionWorkspace
              tab={scenarioTab}
              onTabChange={setScenarioTab}
              routeKey={baselineKey}
              assistant={{
                freeways: active.route?.freeways.map(freeway => freeway.id) || [],
                routes: active.route ? assistantRoutes(active.route, hasSimulation ? allCandidates : [], price) : [],
                ready: !!active.route && !active.loading && !alternate.loading,
                onApply: applyAssistantDisruptions,
                onSelect: selectAssistantRoute,
                onUndoSelection: undoAssistantSelection,
              }}
              baseline={active.route}
              settings={settings}
              onChange={updateSimulation}
              onReset={() => updateSimulation({ disruptions: [] })}
            />
          </div>
        </div>
        <div
          ref={comparisonDockRef}
          className={`floating-comparison pointer-events-auto absolute right-4 z-30 max-w-[calc(100%-2rem)] ${comparisonExpanded ? "bottom-[9rem] max-h-[calc(100%-11rem)] overflow-y-auto rounded-2xl lg:top-4 lg:bottom-auto lg:max-h-[calc(100%-10rem)]" : "top-4 rounded-full"}`}
          style={{ width: "var(--comparison-width)" }}
        >
          <RouteComparison
            expanded={comparisonExpanded}
            onToggle={() => setComparisonExpanded(!comparisonExpanded)}
            reference={reference.route}
            referenceLabel={reference.label}
            canKeepOriginal={reference.canKeepOriginal}
            referenceDepartureMinutes={referenceDepartureMinutes}
            alternate={selectedRoute}
            candidates={candidates}
            allCandidateCount={allCandidates.length}
            recommendedCandidateCount={recommended.length}
            showAllCandidates={showAllCandidates}
            onShowAllCandidatesChange={all => {
              setCandidateDisclosure({ key: candidateKey, all });
              if (!all) {
                setAssistantVisibleId(null);
                const fastest = recommended.find(candidate => candidate.tags.includes("Fastest")) || recommended[0];
                if (fastest) setCandidateSelection({ key: candidateKey, id: fastest.id });
              }
            }}
            selectedCandidateId={selectedCandidate?.id || null}
            onSelectCandidate={selectCandidate}
            candidateNotice={alternate.route?.candidateNotice}
            baselineLoading={active.loading}
            alternateLoading={alternate.loading}
            price={dieselPrice}
            onPriceChange={setDieselPrice}
            baselineError={active.error || (stops.length ? direct.error : "")}
            alternateError={alternate.error}
            onRetryBaseline={active.error ? active.retry : direct.retry}
            onRetryAlternate={alternate.retry}
            hasSimulation={hasSimulation}
            scenarioLabels={scenarioLabels}
            onSave={saveOption}
            saving={saving}
            saveError={saveError}
            editingSavedTrip={!!initialTrip}
            prompt={
              !destination
                ? "Select a destination to calculate your route."
                : incomplete
                  ? "Choose a location for each optional stop, or remove it, to calculate your route."
                  : undefined
            }
          />
        </div>
      </div>
    </main>
  );
}
