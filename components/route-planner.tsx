"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import RouteComparison from "./route-comparison";
import DisruptionsPanel from "./disruptions-panel";
import {
  DEFAULT_SIMULATION,
  disruptionLabel,
  simulationRequest,
  uniqueDisruptions,
} from "@/lib/simulation";
import type { SimulationRequest, SimulationSettings } from "@/lib/simulation";

import { saveTrip, validPlanDate } from "@/lib/saved-trips";
import type { SavedTrip, StopDraft } from "@/lib/saved-trips";
import { decisionImpact } from "@/lib/decision-impact";
import { comparisonReference } from "@/lib/comparison-reference";
import { useComparisonDisclosure } from "@/lib/use-comparison-disclosure";
const EMPTY_CANDIDATES: RouteCandidate[] = [];

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
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [routeEditing, setRouteEditing] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const [comparisonExpanded, setComparisonExpanded] = useComparisonDisclosure();
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
  const showAllCandidates = candidateDisclosure?.key === candidateKey ? candidateDisclosure.all : !!restoredCandidate && !recommended.some(candidate => candidate.id === restoredCandidate.id);
  const candidates = useMemo(() => showAllCandidates ? allCandidates : recommended, [showAllCandidates, allCandidates, recommended]);
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
      <div className="flex w-16 shrink-0 items-center justify-center">
        <button
          type="button"
          className="rounded-full border border-dashed border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!direct.route || stops.length >= 8}
          aria-label={`Add stop ${index + 1}`}
          onClick={() => addStop(index)}
        >
          <span aria-hidden="true">＋</span>
          <span className="block">Add stop</span>
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
        <Link
          href={`/?date=${encodeURIComponent(planDate)}`}
          className="shrink-0 text-sm font-medium text-blue-700 hover:underline"
        >
          Today’s Plan
        </Link>
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
            className={`pointer-events-auto w-full min-w-0 shrink-0 rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 ${routeCollapsed ? "p-3" : "max-h-[55dvh] overflow-y-auto p-4"}`}
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

                <div
                  className="mt-3 flex items-stretch gap-3 overflow-x-auto pb-2"
                  aria-label="Route locations"
                >
                  <section
                    className="w-[230px] shrink-0 rounded-xl border border-slate-200 p-4"
                    aria-label="Origin"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                        1
                      </span>
                      <h3 className="text-sm font-semibold">Starting port</h3>
                    </div>
                    <fieldset className="space-y-1.5">
                      <legend className="sr-only">Starting port</legend>
                      {PORTS.map(item => <label key={item.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2.5 text-xs ${portId === item.id ? "border-blue-300 bg-blue-50 font-medium text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        <input type="radio" name="starting-port" value={item.id} checked={portId === item.id} className="accent-blue-600" onChange={() => { clearRouteInteraction(); setPortId(item.id); }} />
                        {item.name.replace("Port of ", "")}
                      </label>)}
                    </fieldset>
                    {/* <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      Representative port access point. Specific terminal gates
                      come later.
                    </p> */}
                  </section>

                  {addButton(0)}
                  {stops.map((stop, index) => (
                    <div
                      key={stop.id}
                      className="flex shrink-0 items-stretch gap-3"
                    >
                      <section
                        className="w-[280px] shrink-0 rounded-xl border border-slate-200 p-4"
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
                                previous.filter((item) => item.id !== stop.id),
                              );
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <label className="sr-only" htmlFor={`kind-${stop.id}`}>
                          Stop {index + 1} type
                        </label>
                        <select
                          id={`kind-${stop.id}`}
                          className="route-input mb-3"
                          value={stop.kind}
                          onChange={(event) =>
                            updateStop(stop.id, {
                              kind: event.target.value as PlaceKind,
                              location: null,
                            })
                          }
                        >
                          {PLACE_KINDS.map((kind) => (
                            <option key={kind.value} value={kind.value}>
                              {kind.label}
                            </option>
                          ))}
                        </select>
                        <label
                          className="mb-1 block text-xs font-medium text-slate-600"
                          htmlFor={`area-${stop.id}`}
                        >
                          Search area
                        </label>
                        <select
                          id={`area-${stop.id}`}
                          aria-label={`Stop ${index + 1} search area`}
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
                          near={
                            DESTINATION_AREAS.find(
                              (area) => area.id === stop.areaId,
                            ) || area
                          }
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
                    </div>
                  ))}

                  <section
                    className="w-[320px] shrink-0 rounded-xl border border-slate-200 p-4"
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
                    <label
                      className="mb-1 block text-xs font-medium text-slate-600"
                      htmlFor="destination-area"
                    >
                      Search area
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
                    <label className="sr-only" htmlFor="destination-kind">
                      Destination type
                    </label>
                    <select
                      id="destination-kind"
                      className="route-input mb-3"
                      value={destinationKind}
                      onChange={(event) => {
                        setDestinationKind(event.target.value as PlaceKind);
                        updateDestination(null);
                      }}
                    >
                      <option value="warehouse">Warehouse</option>
                      <option value="address">Custom address</option>
                    </select>
                    <PlacePicker
                      key={`${areaId}-${destinationKind}`}
                      label="Destination"
                      kind={destinationKind}
                      near={area}
                      value={destination}
                      onChange={updateDestination}
                      onFocusLocation={focusLocation}
                    />
                  </section>
                </div>
                {/* <p className="mt-2 text-[10px] text-slate-400">
                  Warehouse names are fictional demo aliases; addresses and
                  routes are real.
                </p> */}
              </>
            )}
          </section>

          <div
            ref={disruptionsDockRef}
            className="pointer-events-auto min-h-0 w-[350px] max-w-full overflow-y-auto rounded-2xl"
          >
            <DisruptionsPanel
              baseline={active.route}
              settings={settings}
              onChange={updateSimulation}
              onReset={() => {
                setScenario({ baselineKey, settings: DEFAULT_SIMULATION });
                setFocus(null);
              }}
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
            onShowAllCandidatesChange={all => setCandidateDisclosure({ key: candidateKey, all })}
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
