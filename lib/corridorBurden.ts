import { along, bbox, booleanPointInPolygon, distance, lineString } from "@turf/turf";
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon, Position } from "geojson";

export type CorridorBurdenResult = {
  avgDieselPct: number | null;
  maxDieselPct: number | null;
  highDieselMi: number;
  dacMi: number;
  residentsAlongRoute: number;
  residentsInDac: number;
};
export type CesProperties = {
  DieselPM_P: number | null;
  CIscoreP: number | null;
  TotPop19: number | null;
  County: string;
  Tract: number | string;
};
export type CesTracts = FeatureCollection<Polygon | MultiPolygon, CesProperties>;
type Box = [number, number, number, number];
type IndexedTract = { feature: Feature<Polygon | MultiPolygon, CesProperties>; box: Box; id: string; diesel: number | null; ces: number | null; population: number };
const indexes = new WeakMap<FeatureCollection, IndexedTract[]>();
const caches = new WeakMap<FeatureCollection, Map<string, CorridorBurdenResult>>();
export const BURDEN_SAMPLE_MILES = 0.1;
export function validCesNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function percentile(value: unknown) {
  const result = validCesNumber(value);
  return result !== null && result <= 100 ? result : null;
}
function indexTracts(tracts: FeatureCollection) {
  let index = indexes.get(tracts);
  if (!index) {
    index = tracts.features.flatMap((feature, i) => {
      if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return [];
      const box = bbox(feature) as Box;
      const properties: Partial<CesProperties> = feature.properties || {};
      return [{ feature: feature as Feature<Polygon | MultiPolygon, CesProperties>, box, id: String(properties.Tract ?? `feature-${i}`), diesel: percentile(properties.DieselPM_P), ces: percentile(properties.CIscoreP), population: validCesNumber(properties.TotPop19) ?? 0 }];
    });
    indexes.set(tracts, index);
  }
  return index;
}
function overlaps(a: Box, b: Box) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
function insideBox(point: Position, box: Box) { return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3]; }

// Accept multipart ArcGIS routes too, without inventing connections across gaps.
// Cache per dataset AND geometry, so identical paths at another departure reuse work.
export function corridorBurden(routeLine: LineString | MultiLineString | Feature<LineString | MultiLineString>, tracts: FeatureCollection): CorridorBurdenResult {
  const geometry = routeLine.type === "Feature" ? routeLine.geometry : routeLine;
  const key = JSON.stringify(geometry);
  let cache = caches.get(tracts);
  if (!cache) { cache = new Map(); caches.set(tracts, cache); }
  const cached = cache.get(key);
  if (cached) return cached;
  const result: CorridorBurdenResult = { avgDieselPct: null, maxDieselPct: null, highDieselMi: 0, dacMi: 0, residentsAlongRoute: 0, residentsInDac: 0 };
  const box = bbox(geometry) as Box;
  // Expand the route envelope by 0.5 miles, using a conservative local longitude
  // conversion at its most poleward latitude. Only used for candidate filtering.
  const latDelta = 0.5 / 69;
  const lonDelta = latDelta / Math.max(0.01, Math.cos(Math.max(Math.abs(box[1]), Math.abs(box[3])) * Math.PI / 180));
  const envelope: Box = [box[0] - lonDelta, box[1] - latDelta, box[2] + lonDelta, box[3] + latDelta];
  const candidates = indexTracts(tracts).filter(tract => overlaps(tract.box, envelope));
  const segments: { line: Feature<LineString>; start: number; miles: number }[] = [];
  let total = 0;
  for (const path of geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates) {
    for (let i = 1; i < path.length; i++) {
      const miles = distance(path[i - 1], path[i], { units: "miles" });
      if (miles > 0 && Number.isFinite(miles)) {
        segments.push({ line: lineString([path[i - 1], path[i]]), start: total, miles });
        total += miles;
      }
    }
  }
  let segmentIndex = 0, weightedDiesel = 0, validMiles = 0;
  const residents = new Set<string>(), dacResidents = new Set<string>();
  let previous: IndexedTract | undefined;
  for (let offset = 0; offset < total && segments.length && candidates.length; offset += BURDEN_SAMPLE_MILES) {
    const span = Math.min(BURDEN_SAMPLE_MILES, total - offset);
    const sampleDistance = offset + span / 2;
    while (segmentIndex < segments.length - 1 && segments[segmentIndex].start + segments[segmentIndex].miles < sampleDistance) segmentIndex++;
    const segment = segments[segmentIndex];
    // along() on the current short segment is equivalent to along() on the
    // whole route, but avoids rescanning thousands of vertices for every sample.
    const point = along(segment.line, sampleDistance - segment.start, { units: "miles" });
    const contains = (tract: IndexedTract) => insideBox(point.geometry.coordinates, tract.box) && booleanPointInPolygon(point, tract.feature);
    const tract = previous && contains(previous) ? previous : candidates.find(contains);
    previous = tract;
    if (!tract || tract.diesel === null) continue;
    weightedDiesel += tract.diesel * span;
    validMiles += span;
    result.maxDieselPct = Math.max(result.maxDieselPct ?? 0, tract.diesel);
    if (tract.diesel >= 75) result.highDieselMi += span;
    if (tract.ces !== null && tract.ces >= 75) {
      result.dacMi += span;
      if (!dacResidents.has(tract.id)) { dacResidents.add(tract.id); result.residentsInDac += tract.population; }
    }
    if (!residents.has(tract.id)) { residents.add(tract.id); result.residentsAlongRoute += tract.population; }
  }
  if (validMiles > 0) result.avgDieselPct = weightedDiesel / validMiles;
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
