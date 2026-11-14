import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { corridorBurden, type CesTracts } from "./corridorBurden";
import type { RouteGeometry } from "./route-types";
let data: Promise<CesTracts> | undefined;
export async function routeCommunityImpact(geometry: RouteGeometry) {
  data ??= readFile(path.join(process.cwd(), "public/ces.geojson"), "utf8").then(raw => JSON.parse(raw) as CesTracts).catch(error => { data = undefined; throw error; });
  return corridorBurden({ type: "MultiLineString", coordinates: geometry.paths }, await data);
}
