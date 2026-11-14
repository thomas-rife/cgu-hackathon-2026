import type { CorridorBurdenResult } from "./corridorBurden";

export type PlaceKind = "warehouse" | "yard" | "fuel" | "address";

export type Coordinate = { longitude: number; latitude: number };

export type RouteLocation = Coordinate & {
  id: string;
  name: string;
  address: string;
  kind: PlaceKind | "port";
  category?: string;
  distanceFromRouteMiles?: number;
};

export type RouteGeometry = {
  paths: number[][][];
  spatialReference: { wkid: number };
};

export type RouteResult = {
  geometry: RouteGeometry;
  miles: number;
  minutes: number;
  stops: RouteLocation[];
  freeways: { id: string; miles: number }[];
  communityImpact?: CorridorBurdenResult;
  closures?: { freeway: string; verified: true; geometry: RouteGeometry }[];
  simulation?: {
    slowdowns: { freeway: string; kind: "lane" | "crash" | "combined"; multiplier: number; miles: number; geometry: RouteGeometry }[];
    departureMinutes?: number;
    arrivalMinutes?: number;
    arrivalDeadlineMinutes?: number;
    weather?: "rain";
  };
};

export type MapFocus = { location: RouteLocation; requestId: number };

export type RouteCandidate = {
  id: string;
  name: string;
  route: RouteResult;
  source: "fastest" | "shortest" | "corridor";
  tags: ("Fastest" | "Lowest community burden" | "Lowest emissions" | "Balanced")[];
  dominated?: boolean;
  colorIndex?: number;
};
export type RouteResponse = RouteResult & { candidates?: RouteCandidate[]; allCandidates?: RouteCandidate[]; candidateNotice?: string };

