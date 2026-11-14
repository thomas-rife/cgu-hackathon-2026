import Polyline from "@arcgis/core/geometry/Polyline.js";
import type Polygon from "@arcgis/core/geometry/Polygon.js";
import { bufferExecute } from "@arcgis/core/geometry/operators/bufferOperator.js";
import { unionExecuteMany } from "@arcgis/core/geometry/operators/unionOperator.js";
import { differenceExecute } from "@arcgis/core/geometry/operators/differenceOperator.js";
import { intersectionExecute } from "@arcgis/core/geometry/operators/intersectionOperator.js";
import type { RouteGeometry } from "./route-types";
import type { RoadDisruption, SlowdownKind } from "./simulation";
import { SLOWDOWN_PRESETS } from "./simulation";
import { freewayGeometry, type FreewayLeg } from "./freeways";

function length(a: number[], b: number[]) {
  return Math.hypot((b[0] - a[0]) * 69.172 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), (b[1] - a[1]) * 69);
}

// Clip by distance along the freeway, preserving separate paths across gaps.
export function midpointStretch(geometry: RouteGeometry, miles: number) {
  const total = geometry.paths.reduce((sum, path) => sum + path.slice(1).reduce((subtotal, point, i) => subtotal + length(path[i], point), 0), 0);
  const start = Math.max(0, (total - miles) / 2);
  const end = Math.min(total, (total + miles) / 2);
  let offset = 0;
  const paths: number[][][] = [];
  for (const path of geometry.paths) {
    const clipped: number[][] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], distance = length(a, b);
      const from = Math.max(start, offset), to = Math.min(end, offset + distance);
      if (distance > 0 && to > from) {
        for (const position of [from, to]) {
          const fraction = (position - offset) / distance;
          const point = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
          if (!clipped.length || length(clipped[clipped.length - 1], point) > 0.000001) clipped.push(point);
        }
      }
      offset += distance;
    }
    if (clipped.length >= 2) paths.push(clipped);
  }
  return { geometry: { paths, spatialReference: { wkid: 4326 } }, miles: end - start };
}

function merge(polygons: Polygon[]): Polygon | null {
  return polygons.length ? unionExecuteMany(polygons) as Polygon | null : null;
}
function subtract(a: Polygon | null, b: Polygon | null) {
  return a && b ? differenceExecute(a, b) as Polygon | null : a;
}

export function slowdownGeometry(legs: FreewayLeg[], disruptions: RoadDisruption[]) {
  const closed = new Set(disruptions.filter(item => item.kind === "closure").map(item => item.freeway));
  const unique = [...new Map(disruptions.filter(item => item.kind !== "closure" && !closed.has(item.freeway)).map(item => [`${item.kind}:${item.freeway}`, item])).values()];
  const groups: Record<SlowdownKind, Polygon[]> = { lane: [], crash: [], combined: [] };
  const slowdowns = unique.map(item => {
    const kind = item.kind as SlowdownKind;
    const preset = SLOWDOWN_PRESETS[kind];
    const stretch = midpointStretch(freewayGeometry(legs, item.freeway), preset.miles);
    // A narrow corridor around the selected road; nearby parallel roads within
    // roughly 30 metres can also be affected. Geometry is an explicit demo estimate.
    const polygon = bufferExecute(new Polyline(stretch.geometry), 0.0003);
    if (!polygon) throw new Error("The slowdown stretch could not be created.");
    groups[kind].push(polygon);
    return { freeway: item.freeway, kind, multiplier: preset.multiplier, ...stretch };
  });
  const lane = merge(groups.lane), crash = merge(groups.crash);
  const overlap = lane && crash ? intersectionExecute(lane, crash) as Polygon | null : null;
  const combined = merge([...groups.combined, ...(overlap ? [overlap] : [])]);
  const exclusiveLane = subtract(subtract(lane, crash), combined);
  const exclusiveCrash = subtract(subtract(crash, lane), combined);
  // Disjoint polygons avoid accidentally multiplying overlapping presets to ×4.5.
  const zones = [
    { polygon: exclusiveLane, multiplier: 1.5 },
    { polygon: exclusiveCrash, multiplier: 3 },
    { polygon: combined, multiplier: 3.5 },
  ].filter(zone => zone.polygon && zone.polygon.rings.length);
  return { slowdowns, zones };
}
