"use client";

import { useEffect, useRef, useState } from "react";
import type ArcGISMapView from "@arcgis/core/views/MapView.js";
import type ArcGISMap from "@arcgis/core/Map.js";
import type { SavedTrip } from "@/lib/saved-trips";
import { TRIP_COLORS } from "@/lib/saved-trips";
import { useDieselLayer } from "@/lib/use-diesel-layer";
import DieselBurdenControl from "./diesel-burden-control";

export default function PlanMap({ trips }: { trips: SavedTrip[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ArcGISMapView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const dieselLayer = useDieselLayer(viewRef, status === "ready");
  useEffect(() => {
    let disposed = false;
    let map: ArcGISMap | undefined;
    let view: ArcGISMapView | undefined;
    async function initialize() {
      const apiKey = process.env.NEXT_PUBLIC_ARCGIS_API_KEY;
      if (!apiKey) throw new Error("Map key missing.");
      const [{ default: Map }, { default: Basemap }, { default: View }] = await Promise.all([import("@arcgis/core/Map.js"), import("@arcgis/core/Basemap.js"), import("@arcgis/core/views/MapView.js")]);
      if (disposed || !containerRef.current) return;
      // Navigation keeps this page mounted but hidden, so status can still be "ready" from the
      // destroyed view. Reset it so the route and diesel-layer effects run again for the new view.
      setStatus("loading");
      const basemap = new Basemap({ style: { id: "arcgis/navigation", apiKey } });
      map = new Map({ basemap });
      view = new View({ container: containerRef.current, map, center: [-118.15, 33.84], zoom: 8, popupEnabled: false, padding: { top: 30, left: 30, right: 30, bottom: 30 }, constraints: { rotationEnabled: false }, ui: { components: [] } });
      // Overview only: no zoom buttons, and swallow every pan/zoom gesture and key.
      for (const event of ["drag", "mouse-wheel", "double-click", "key-down"] as const) view.on(event, (input: { stopPropagation: () => void }) => input.stopPropagation());
      viewRef.current = view;
      await Promise.all([view.when(), basemap.loadAll()]);
      if (!disposed) setStatus("ready");
    }
    void initialize().catch(() => { if (!disposed) setStatus("error"); });
    return () => { disposed = true; viewRef.current = null; view?.destroy(); map?.destroy(); };
  }, []);
  useEffect(() => {
    const view = viewRef.current;
    if (status !== "ready" || !view) return;
    let disposed = false;
    async function draw() {
      const [{ default: Graphic }, { default: Polyline }, { default: Point }] = await Promise.all([import("@arcgis/core/Graphic.js"), import("@arcgis/core/geometry/Polyline.js"), import("@arcgis/core/geometry/Point.js")]);
      if (disposed || !view || view.destroyed) return;
      view.graphics.removeAll();
      trips.forEach((trip, index) => {
        const color = TRIP_COLORS[index % TRIP_COLORS.length];
        const geometry = new Polyline(trip.route.geometry);
        view.graphics.addMany([
          new Graphic({ geometry, symbol: { type: "simple-line", color: "#ffffff", width: 6 } }),
          new Graphic({ geometry, symbol: { type: "simple-line", color, width: 3 } }),
          ...[trip.route.stops[0], trip.route.stops[trip.route.stops.length - 1]].map(stop => new Graphic({ geometry: new Point({ longitude: stop.longitude, latitude: stop.latitude }), symbol: { type: "simple-marker", color, size: 7, outline: { color: "white", width: 1.5 } } })),
        ]);
      });
      if (view.graphics.length) await view.goTo({ target: view.graphics.toArray() }, { animate: false });
    }
    void draw().catch(() => { if (!disposed) setStatus("error"); });
    return () => { disposed = true; };
  }, [status, trips]);
  return <div className="relative h-64 overflow-hidden rounded-xl bg-slate-100" aria-label={`Map of ${trips.length} saved routes`} aria-busy={status === "loading"}>
    <div ref={containerRef} className="h-full w-full" />
    {status === "ready" && <div className="absolute right-3 bottom-6"><DieselBurdenControl control={dieselLayer} /></div>}
    {status !== "ready" && <p role="status" className="absolute inset-0 grid place-items-center bg-slate-100/90 p-5 text-center text-xs text-slate-600">{status === "error" ? "Map unavailable. Your saved trips are still listed below." : "Loading saved routes…"}</p>}
  </div>;
}
