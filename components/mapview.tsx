"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type ArcGISMap from "@arcgis/core/Map.js";
import type ArcGISMapView from "@arcgis/core/views/MapView.js";
import type ArcGISGraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import type { MapFocus, RouteCandidate, RouteLocation, RouteResult } from "@/lib/route-types";
import { layoutStopMarkers } from "@/lib/map-markers";
import { useDieselLayer } from "@/lib/use-diesel-layer";
import DieselBurdenControl from "./diesel-burden-control";
import { candidateColor, candidateSummary } from "@/lib/candidate-display";
import { distanceFromRoute, sampleRoute } from "@/lib/route-geometry";
import { layoutRouteLabels, ROUTE_LABEL_HEIGHT } from "@/lib/map-route-labels";

function fitGraphics(view: ArcGISMapView, layer: ArcGISGraphicsLayer | null) {
  return [...(layer?.graphics.toArray() || []), ...view.graphics.toArray()];
}

type MapStop = RouteLocation & { sequence: number };
type Props = {
  route: RouteResult | null;
  referenceRoute: RouteResult | null;
  originalPlanRoute: RouteResult | null;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (id: string) => void;
  stops: MapStop[];
  overlayRefs: {
    route: RefObject<HTMLElement | null>;
    disruptions: RefObject<HTMLElement | null>;
    comparison: RefObject<HTMLElement | null>;
  };
  focus: MapFocus | null;
  fitRequest: number;
  onFocusLocation: (location: RouteLocation) => void;
  onClearFocus: () => void;
};

export default function MapView({ route, referenceRoute, originalPlanRoute, candidates, selectedCandidateId, onSelectCandidate, stops, overlayRefs, focus, fitRequest, onFocusLocation, onClearFocus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ArcGISMapView | null>(null);
  const routesLayerRef = useRef<ArcGISGraphicsLayer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const focusRef = useRef(focus);
  const clearFocusRef = useRef(onClearFocus);
  const selectCandidateRef = useRef(onSelectCandidate);
  const routeSetRef = useRef<{ candidates: RouteCandidate[]; baseline: RouteResult | null; stops: MapStop[] } | null>(null);
  const [candidateLabels, setCandidateLabels] = useState<{ id: string; x: number; y: number; anchorX: number; anchorY: number }[]>([]);
  const [markers, setMarkers] = useState<ReturnType<typeof layoutStopMarkers>>([]);
  const [mapPadding, setMapPadding] = useState({ top: 16, right: 16, bottom: 16, left: 16 });
  const dieselLayer = useDieselLayer(viewRef, status === "ready");

  useEffect(() => { focusRef.current = focus; }, [focus]);
  useEffect(() => { clearFocusRef.current = onClearFocus; }, [onClearFocus]);
  useEffect(() => { selectCandidateRef.current = onSelectCandidate; }, [onSelectCandidate]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || status !== "ready") return;
    const routesLayer = routesLayerRef.current;
    if (!routesLayer) return;
    const handle = view.on("click", event => {
      void view.hitTest(event, { include: [routesLayer] }).then(hit => {
        if (view.destroyed) return;
        const match = hit.results.find(result => result.type === "graphic" && result.graphic.attributes?.candidateId);
        if (match?.type === "graphic") selectCandidateRef.current(String(match.graphic.attributes.candidateId));
      }).catch(() => {});
    });
    return () => handle.remove();
  }, [status]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let map: ArcGISMap | undefined;
    let view: ArcGISMapView | undefined;
    let resizeObserver: ResizeObserver | undefined;

    async function initializeMap() {
      try {
        const apiKey = process.env.NEXT_PUBLIC_ARCGIS_API_KEY;
        if (!apiKey) {
          throw new Error(
            "Add NEXT_PUBLIC_ARCGIS_API_KEY to .env and restart npm run dev.",
          );
        }

        // ArcGIS needs the browser DOM. Load it only after React mounts.
        const [{ default: Map }, { default: Basemap }, { default: View }, { default: GraphicsLayer }] =
          await Promise.all([
            import("@arcgis/core/Map.js"),
            import("@arcgis/core/Basemap.js"),
            import("@arcgis/core/views/MapView.js"),
            import("@arcgis/core/layers/GraphicsLayer.js"),
          ]);

        if (disposed) return;
        setStatus("loading");

        const basemap = new Basemap({
          style: { id: "arcgis/navigation", apiKey },
        });
        const routesLayer = new GraphicsLayer({ id: "routes", title: "Route choices", listMode: "hide" });
        routesLayerRef.current = routesLayer;
        map = new Map({ basemap, layers: [routesLayer] });

        view = new View({
          container,
          map,
          center: [-118.15, 33.84],
          zoom: 10,
          popupEnabled: false,
          constraints: { rotationEnabled: false },
        });
        viewRef.current = view;

        // Measure floating cards instead of reserving a permanent sidebar.
        const updatePadding = () => {
          if (!view || disposed || !container) return;
          const mapRect = container.getBoundingClientRect();
          const routeRect = overlayRefs.route.current?.getBoundingClientRect();
          const disruptionsRect = overlayRefs.disruptions.current?.getBoundingClientRect();
          const comparisonRect = overlayRefs.comparison.current?.getBoundingClientRect();
          const wide = view.width >= 1024;
          const padding = {
            top: routeRect ? Math.min(routeRect.bottom - mapRect.top + 16, Math.max(16, view.height - 180)) : 16,
            left: wide && disruptionsRect ? disruptionsRect.right - mapRect.left + 16 : 16,
            right: wide && comparisonRect && comparisonRect.height > 120 ? mapRect.right - comparisonRect.left + 16 : 16,
            bottom: !wide && comparisonRect ? Math.min(mapRect.bottom - comparisonRect.top + 16, view.height * 0.45) : 24,
          };
          if (Object.entries(padding).every(([key, value]) => view!.padding[key as keyof typeof padding] === value)) return;
          view.padding = padding;
          setMapPadding(padding);
          const targets = fitGraphics(view, routesLayer);
          if (view.ready && targets.length) {
            const selected = focusRef.current;
            void view.goTo(selected ? { center: [selected.location.longitude, selected.location.latitude], zoom: 15 } : { target: targets }, { animate: false }).catch(() => {});
          }
        };
        updatePadding();
        resizeObserver = new ResizeObserver(updatePadding);
        if (container) resizeObserver.observe(container);
        for (const ref of Object.values(overlayRefs)) if (ref.current) resizeObserver.observe(ref.current);

        // A ready view alone does not guarantee its basemap loaded.
        await Promise.all([view.when(), basemap.loadAll()]);
        if (!disposed) setStatus("ready");
      } catch (cause) {
        if (disposed) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Check your connection and ArcGIS basemap permissions.",
        );
        setStatus("error");
      }
    }

    void initializeMap();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      viewRef.current = null;
      routesLayerRef.current = null;
      // Release WebGL resources on navigation, hot reload, and Strict Mode remounts.
      view?.destroy();
      map?.destroy();
    };
  }, [overlayRefs]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || status !== "ready") return;
    const routesLayer = routesLayerRef.current;
    if (!routesLayer) return;
    let disposed = false;

    async function drawRoute() {
      const [{ default: Graphic }, { default: Point }, { default: Polyline }] = await Promise.all([
        import("@arcgis/core/Graphic.js"),
        import("@arcgis/core/geometry/Point.js"),
        import("@arcgis/core/geometry/Polyline.js"),
      ]);
      if (disposed || !view || view.destroyed || !routesLayer) return;
      view.graphics.removeAll();
      routesLayer.removeAll();
      if (originalPlanRoute) {
        routesLayer.add(new Graphic({ geometry: new Polyline(originalPlanRoute.geometry), symbol: { type: "simple-line", color: "#94a3b8", width: 1.5, style: "dash" } }));
      }
      candidates.forEach(candidate => {
        if (candidate.id === selectedCandidateId) return;
        routesLayer.add(new Graphic({ geometry: new Polyline(candidate.route.geometry), attributes: { candidateId: candidate.id }, symbol: { type: "simple-line", color: candidate.tags.length ? candidateColor(candidate, true) : "#94a3b8", width: candidate.tags.length ? 3.5 : 2 } }));
      });
      for (const slowdown of route?.simulation?.slowdowns || []) routesLayer.add(new Graphic({ geometry: new Polyline(slowdown.geometry), symbol: { type: "simple-line", color: "#dc2626", width: 6, style: "short-dot" } }));
      for (const closure of route?.closures || []) routesLayer.add(new Graphic({ geometry: new Polyline(closure.geometry), symbol: { type: "simple-line", color: "#dc2626", width: 4, style: "solid" } }));
      if (route) {
        const geometry = new Polyline(route.geometry);
        const selected = candidates.find(candidate => candidate.id === selectedCandidateId);
        routesLayer.addMany([
          new Graphic({ geometry, attributes: { candidateId: selectedCandidateId }, symbol: { type: "simple-line", color: "white", width: 10 } }),
          new Graphic({ geometry, attributes: { candidateId: selectedCandidateId }, symbol: { type: "simple-line", color: candidateColor(selected), width: 6 } }),
        ]);
      }
      stops.forEach((stop, index) => {
        const point = new Point({ longitude: stop.longitude, latitude: stop.latitude });
        const color = stop.kind === "port" ? "#047857" : index === stops.length - 1 ? "#1d4ed8" : "#b45309";
        view.graphics.add(new Graphic({ geometry: point, symbol: { type: "simple-marker", color, size: 7, outline: { color: "white", width: 1.5 } } }));
      });
      try {
        const previous = routeSetRef.current;
        const newRoute = !!route && (previous?.candidates !== candidates || previous?.baseline !== referenceRoute || previous?.stops !== stops);
        const shouldFit = !previous || previous.candidates !== candidates || previous.baseline !== referenceRoute || previous.stops !== stops;
        routeSetRef.current = { candidates, baseline: referenceRoute, stops };
        if (!shouldFit) return;
        const selected = newRoute ? null : focusRef.current;
        if (newRoute && focusRef.current) clearFocusRef.current();
        await view.goTo(selected ? { center: [selected.location.longitude, selected.location.latitude], zoom: 15 } : stops.length === 1
          ? { center: [stops[0].longitude, stops[0].latitude], zoom: 11 }
          : { target: fitGraphics(view, routesLayer) }, { animate: false });
      } catch {
        // Navigation can be interrupted by a newer route or component cleanup.
      }
    }

    void drawRoute().catch(() => {
      if (!disposed) {
        setError("The route overlay couldn’t load. Please reload the page.");
        setStatus("error");
      }
    });
    return () => { disposed = true; };
  }, [route, referenceRoute, originalPlanRoute, candidates, selectedCandidateId, stops, status]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || status !== "ready") return;
    let disposed = false;
    let handle: { remove: () => void } | undefined;
    async function trackLabels() {
      const [{ default: Point }, { watch }] = await Promise.all([import("@arcgis/core/geometry/Point.js"), import("@arcgis/core/core/reactiveUtils.js")]);
      if (disposed || view!.destroyed) return;
      const anchors = candidates.map(candidate => ({ candidate, points: sampleRoute(candidate.route.geometry, [0.2, 0.35, 0.5, 0.65, 0.8]).map(point => ({
        point, distinctness: candidates.length > 1 ? Math.min(...candidates.filter(other => other.id !== candidate.id).map(other => distanceFromRoute(point, other.route.geometry))) : 1,
      })) }));
      const update = () => {
        if (disposed || !view!.ready) return;
        const screenCandidates = anchors.map(({ candidate, points }) => ({ id: candidate.id, anchors: points.flatMap(({ point, distinctness }) => {
          const screen = view!.toScreen(new Point(point));
          return screen && screen.x >= 0 && screen.y >= 0 && screen.x <= view!.width && screen.y <= view!.height ? [{ x: screen.x, y: screen.y, distinctness }] : [];
        }) }));
        const screenPaths = [...candidates.map(candidate => candidate.route), ...(originalPlanRoute ? [originalPlanRoute] : [])].flatMap(item => item.geometry.paths.map(path => path.flatMap(([longitude, latitude]) => {
          const point = view!.toScreen(new Point({ longitude, latitude }));
          return point ? [{ x: point.x, y: point.y }] : [];
        })));
        setCandidateLabels(layoutRouteLabels(screenCandidates, screenPaths, {
          left: view!.padding.left, right: view!.width - view!.padding.right,
          top: view!.padding.top + 52, bottom: view!.height - view!.padding.bottom,
        }));
      };
      handle = watch(() => [view!.extent, view!.width, view!.height, view!.padding], update, { initial: true });
    }
    void trackLabels();
    return () => { disposed = true; handle?.remove(); };
  }, [candidates, originalPlanRoute, status]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || status !== "ready") return;
    let disposed = false;
    let handle: { remove: () => void } | undefined;
    async function trackMarkers() {
      const [{ default: Point }, { watch }] = await Promise.all([
        import("@arcgis/core/geometry/Point.js"),
        import("@arcgis/core/core/reactiveUtils.js"),
      ]);
      if (disposed || !view || view.destroyed) return;
      const update = () => {
        if (disposed || !view.ready) return;
        const points = stops.flatMap(stop => {
          const position = view.toScreen(new Point({ longitude: stop.longitude, latitude: stop.latitude }));
          return position && position.x >= 0 && position.x <= view.width && position.y >= 0 && position.y <= view.height
            ? [{ id: stop.id, sequence: stop.sequence, x: position.x, y: position.y }] : [];
        });
        setMarkers(layoutStopMarkers(points, view.width - view.padding.right + 8, view.height - view.padding.bottom + 8, view.padding.left, view.padding.top));
      };
      handle = watch(() => [view.extent, view.width, view.height, view.padding], update, { initial: true });
    }
    void trackMarkers();
    return () => { disposed = true; handle?.remove(); };
  }, [stops, status]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || status !== "ready" || !focus) return;
    void view.goTo({ center: [focus.location.longitude, focus.location.latitude], zoom: 15 }, { animate: false }).catch(() => {});
  }, [focus, status]);

  useEffect(() => {
    const view = viewRef.current;
    if (!fitRequest || status !== "ready" || !view) return;
    // Let the collapsed card's layout and map padding settle before fitting.
    const frame = requestAnimationFrame(() => {
      const targets = fitGraphics(view, routesLayerRef.current);
      if (view.ready && targets.length) void view.goTo({ target: targets }, { animate: false }).catch(() => {});
    });
    return () => cancelAnimationFrame(frame);
  }, [fitRequest, status]);

  function fitRoute() {
    onClearFocus();
    const view = viewRef.current;
    if (view?.ready) {
      const targets = fitGraphics(view, routesLayerRef.current);
      if (targets.length) void view.goTo({ target: targets }, { animate: false }).catch(() => {});
    }
  }

  return (
    <section
      className="relative min-h-[35dvh] min-w-0 flex-1 bg-slate-100 md:min-h-0"
      aria-label="Southern California freight map"
      aria-busy={status === "loading"}
    >
      <div ref={containerRef} className="h-full w-full" />
      {status === "ready" && (
        <>
          {referenceRoute && <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <svg className="absolute inset-0 h-full w-full" aria-hidden="true">{candidateLabels.map(label => <line key={label.id} x1={label.anchorX} y1={label.anchorY} x2={label.x} y2={label.y} stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />)}</svg>
            {candidateLabels.map(label => {
              const index = candidates.findIndex(candidate => candidate.id === label.id);
              const candidate = candidates[index];
              if (!candidate) return null;
              const selected = candidate.id === selectedCandidateId;
              const summary = candidateSummary(candidate.route, referenceRoute);
              return <button key={label.id} type="button" data-route-candidate={candidate.id} aria-label={`Select ${candidate.name}: ${summary}${candidate.tags.length ? `. ${candidate.tags.join(", ")}` : ""}`} aria-pressed={selected}
                title={`DAC miles are miles driven through disadvantaged communities; lower is better. Tags rank the routes found.${candidate.dominated ? " Outperformed: another route is no worse on time, DAC miles, and emissions and better on at least one." : ""}`}
                className={`pointer-events-auto absolute z-10 w-[190px] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white/95 px-2.5 py-2 text-left shadow-md ${selected ? "border-2" : "border-slate-200 text-slate-600"}`}
                style={{ left: label.x, top: label.y, height: ROUTE_LABEL_HEIGHT, ...(selected ? { borderColor: candidateColor(candidate), backgroundColor: `color-mix(in srgb, ${candidateColor(candidate)} 10%, white)` } : {}) }} onClick={() => onSelectCandidate(candidate.id)}>
                <span className="flex items-center gap-2 text-xs"><span className="shrink-0 whitespace-nowrap font-semibold" style={{ color: candidateColor(candidate) }}>{candidate.name}</span><span className="whitespace-nowrap text-xs tabular-nums">{summary}</span></span>
                {candidate.dominated && candidate.tags.length > 0 && <span className="mt-1 block text-[10px] text-slate-500">Outperformed · shown for transparency</span>}
                {!!candidate.tags.length && <span className="mt-1 flex flex-wrap gap-1">{candidate.tags.map(tag => <span key={tag} className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600">{tag === "Lowest community burden" ? "Lowest DAC miles" : tag === "Lowest emissions" ? "Lowest CO₂" : tag}</span>)}</span>}
              </button>;
            })}
          </div>}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
              {markers.map(marker => <line key={marker.id} x1={marker.x} y1={marker.y} x2={marker.labelX} y2={marker.labelY} stroke="#475569" strokeWidth="1.5" />)}
            </svg>
            {markers.map(marker => {
              const stop = stops.find(stop => stop.id === marker.id);
              if (!stop) return null;
              const color = stop.kind === "port" ? "#047857" : stop.id === stops[stops.length - 1]?.id ? "#1d4ed8" : "#b45309";
              return <button key={marker.id} type="button" data-stop-marker={marker.sequence}
                className="pointer-events-auto absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
                style={{ left: marker.labelX, top: marker.labelY, backgroundColor: color }}
                title={`${marker.sequence}. ${stop.name}`} aria-label={`Stop ${marker.sequence}: ${stop.name}`} onClick={() => onFocusLocation(stop)}>{marker.sequence}</button>;
            })}
          </div>
          <button type="button" className="absolute rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm" style={{ top: mapPadding.top + 16, left: mapPadding.left + 64 }} onClick={fitRoute}>Fit route</button>
          <div className="absolute right-4 bottom-6"><DieselBurdenControl control={dieselLayer} /></div>
          {focus && <div className="absolute bottom-10 max-w-[min(300px,calc(100%-2rem))] rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm" style={{ left: mapPadding.left + 16 }}><p className="font-semibold">{focus.location.name}</p><p className="mt-1 text-slate-600">{focus.location.address}</p><button type="button" className="mt-2 text-blue-700 underline" onClick={fitRoute}>Show entire route</button></div>}
        </>
      )}
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p role="status" className="rounded-lg bg-white px-5 py-3 text-sm shadow">
            Loading the ArcGIS map…
          </p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100/90 p-6">
          <div role="alert" className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold">The map couldn’t load</h2>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <button
              type="button"
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
