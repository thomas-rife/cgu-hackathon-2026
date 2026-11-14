import type { RouteGeometry } from "./route-types";

export type DirectionFeature = {
  attributes: { length: number; text: string };
  strings?: { string: string; stringType: string }[];
  compressedGeometry?: string;
};

export type FreewayLeg = { ids: string[]; miles: number; path: number[][] };

export function freewayIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\b(I|US|CA|SR)[ -]?(\d{1,3})\b/gi)]
    .map(match => `${match[1].toUpperCase() === "SR" ? "CA" : match[1].toUpperCase()}-${Number(match[2])}`))];
}

// ArcGIS directions encode 2D coordinates as base-32 signed deltas, preceded
// by a scale. Requests use 2D WGS84; unsupported encodings fail explicitly.
export function decodeDirectionPath(compressed: string): number[][] {
  const tokens = compressed.match(/[+-][^+\-|]+/g) || [];
  const scale = parseInt(tokens.shift() || "", 32);
  if (!Number.isFinite(scale) || scale <= 0 || compressed.includes("|")) throw new Error("Unsupported ArcGIS direction geometry.");
  let x = 0;
  let y = 0;
  const path: number[][] = [];
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    x += parseInt(tokens[index], 32);
    y += parseInt(tokens[index + 1], 32);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid ArcGIS direction geometry.");
    path.push([x / scale, y / scale]);
  }
  return path;
}

export function freewayLegs(features: DirectionFeature[]): FreewayLeg[] {
  return features.flatMap(feature => {
    const strings = feature.strings || [];
    const primaryNames = strings.filter(value => ["esriDSTStreetName", "esriDSTBranch"].includes(value.stringType)).map(value => value.string).join(" ");
    let ids = freewayIds(primaryNames);
    // Some ArcGIS merges omit the road's primary name. Only use the signpost
    // when the instruction explicitly enters an otherwise unnamed highway.
    if (!ids.length && /merge onto (the )?highway/i.test(feature.attributes.text)) {
      ids = freewayIds(strings.filter(value => value.stringType === "esriDSTToward").map(value => value.string).join(" "));
    }
    if (!ids.length || !feature.compressedGeometry || feature.attributes.length <= 0) return [];
    const path = decodeDirectionPath(feature.compressedGeometry);
    return path.length >= 2 ? [{ ids, path, miles: feature.attributes.length }] : [];
  });
}

export function summarizeFreeways(legs: FreewayLeg[]) {
  const totals = new Map<string, number>();
  for (const leg of legs) for (const id of leg.ids) totals.set(id, (totals.get(id) || 0) + leg.miles);
  return [...totals].map(([id, miles]) => ({ id, miles }));
}

export function sampleFreewayPath(path: number[][], spacingMiles: number): number[][] {
  const points: number[][] = [];
  let next = spacingMiles / 2;
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1];
    const b = path[index];
    const dx = (b[0] - a[0]) * 69.172 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180);
    const length = Math.hypot(dx, (b[1] - a[1]) * 69);
    for (let distance = next; distance < length; distance += spacingMiles) {
      points.push([a[0] + (b[0] - a[0]) * distance / length, a[1] + (b[1] - a[1]) * distance / length]);
    }
    next = ((next - length) % spacingMiles + spacingMiles) % spacingMiles;
  }
  if (!points.length && path.length >= 2) {
    const middle = Math.floor(path.length / 2);
    points.push([(path[middle - 1][0] + path[middle][0]) / 2, (path[middle - 1][1] + path[middle][1]) / 2]);
  }
  return points;
}

export function freewayGeometry(legs: FreewayLeg[], id: string): RouteGeometry {
  return { paths: legs.filter(leg => leg.ids.includes(id)).map(leg => leg.path), spatialReference: { wkid: 4326 } };
}
