"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type MapView from "@arcgis/core/views/MapView.js";
import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";

export function useDieselLayer(viewRef: RefObject<MapView | null>, ready: boolean) {
  const [visible, setVisible] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const layerRef = useRef<GeoJSONLayer | null>(null);
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
    if (layerRef.current) layerRef.current.visible = visible;
  }, [visible]);
  useEffect(() => {
    const view = viewRef.current;
    if (!ready || !view?.map) return;
    let disposed = false;
    let layer: GeoJSONLayer | undefined;
    const map = view.map;
    async function addLayer() {
      const { createDieselBurdenLayer } = await import("./diesel-layer");
      if (disposed || view?.destroyed) return;
      layer = createDieselBurdenLayer();
      layer.visible = visibleRef.current;
      layerRef.current = layer;
      // Insert beneath the route layer and stop graphics.
      map.add(layer, 0);
      await layer.load();
      if (!disposed) setStatus("ready");
    }
    void addLayer().catch(() => { if (!disposed) setStatus("error"); });
    return () => { disposed = true; layerRef.current = null; if (layer) { map.remove(layer); layer.destroy(); } };
  }, [ready, viewRef]);
  return { visible, setVisible, status };
}
