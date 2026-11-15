import { arcgisRequest, getBaselineTruckMode, ROUTE_SERVICE, ServiceError, serviceErrorResponse } from "@/lib/arcgis";
import { isSoCalCoordinate } from "@/lib/route-geometry";
import type { RouteCandidate, RouteGeometry, RouteLocation, RouteResponse, RouteResult } from "@/lib/route-types";
import { withWarehouseDemoName } from "@/lib/warehouse-names";
import { freewayGeometry, freewayLegs, sampleFreewayPath, summarizeFreeways } from "@/lib/freeways";
import type { DirectionFeature, FreewayLeg } from "@/lib/freeways";
import type { RoadDisruption } from "@/lib/simulation";
import { slowdownGeometry } from "@/lib/disruption-geometry";
import { estimateArrivalDeparture } from "@/lib/arrival";
import { routeCommunityImpact } from "@/lib/ces";
import { rankCandidates, recommendedCandidates, routesAreDistinct } from "@/lib/route-candidates";

type SolveResponse = {
  routes?: { features: { geometry: RouteGeometry; attributes: { Total_TruckMinutes: number; Total_TruckTravelTime?: number; Total_Miles: number } }[] };
  stops?: { features: { attributes: { Status: number } }[] };
  directions?: { features: DirectionFeature[] }[];
};
type SolvedRoute = RouteResult & { legs: FreewayLeg[] };
type RouteRequest = { stops: RouteLocation[]; disruptions?: RoadDisruption[]; candidates?: boolean; departureMinutes?: number; arrivalMinutes?: number; weather?: "clear" | "rain"; blockedFreeway?: unknown; slowdown?: unknown };
function isLocation(value: unknown): value is RouteLocation {
  if (!isSoCalCoordinate(value)) return false;
  const place = value as RouteLocation;
  return typeof place.id === "string" && place.id.length <= 200
    && typeof place.name === "string" && place.name.length > 0 && place.name.length <= 300
    && typeof place.address === "string" && place.address.length <= 500
    && ["port", "warehouse", "yard", "fuel", "address"].includes(place.kind);
}
function isRoadDisruption(value: unknown): value is RoadDisruption {
  if (!value || typeof value !== "object") return false;
  const item = value as RoadDisruption;
  return ["closure", "lane", "crash", "combined"].includes(item.kind)
    && typeof item.freeway === "string" && /^(I|US|CA)-\d{1,3}$/.test(item.freeway)
    && Object.keys(item).every(key => ["kind", "freeway"].includes(key));
}
function routeLegs(result: SolveResponse) {
  if (!result.directions?.length) throw new ServiceError("ArcGIS did not return the road data needed to check this route.");
  return freewayLegs(result.directions[0].features);
}
export async function POST(request: Request) {
  try {
    let body: RouteRequest;
    try { body = await request.json(); } catch { throw new ServiceError("Send valid route stops.", 400); }
    if (!body || !Array.isArray(body.stops) || body.stops.length < 2 || body.stops.length > 10 || !body.stops.every(isLocation)) throw new ServiceError("Choose an origin, a destination, and up to eight optional stops in Southern California.", 400);
    const stops: RouteLocation[] = body.stops.map(withWarehouseDemoName);
    if (stops.some((stop, index) => index > 0 && stop.longitude === stops[index - 1].longitude && stop.latitude === stops[index - 1].latitude)) throw new ServiceError("Two consecutive stops are the same location. Remove the duplicate stop.", 400);
    if (body.disruptions !== undefined && (!Array.isArray(body.disruptions) || body.disruptions.length > 8 || !body.disruptions.every(isRoadDisruption))) throw new ServiceError("Add up to eight valid freeway disruptions using the fixed presets.", 400);
    if (body.candidates !== undefined && typeof body.candidates !== "boolean") throw new ServiceError("Choose a valid route search.", 400);
    for (const field of ["departureMinutes", "arrivalMinutes"] as const) if (body[field] !== undefined && (!Number.isInteger(body[field]) || body[field] < 0 || body[field] > 1439)) throw new ServiceError("Choose a valid time from 00:00 through 23:59.", 400);
    if (body.departureMinutes !== undefined && body.arrivalMinutes !== undefined) throw new ServiceError("Choose a departure time or an arrival deadline, rather than both.", 400);
    if (body.weather !== undefined && !["clear", "rain"].includes(body.weather)) throw new ServiceError("Choose clear weather or rain.", 400);
    if (body.blockedFreeway !== undefined || body.slowdown !== undefined) throw new ServiceError("Use the disruption list to configure closures and slowdowns.", 400);
    const disruptions: RoadDisruption[] = body.disruptions || [];
    if (new Set(disruptions.map(item => `${item.kind}:${item.freeway}`)).size !== disruptions.length) throw new ServiceError("Each disruption can only be added once per freeway and preset.", 400);
    const mode = await getBaselineTruckMode();
    const parameters = {
      stops: JSON.stringify({ spatialReference: { wkid: 4326 }, features: stops.map((stop, index) => ({ geometry: { x: stop.longitude, y: stop.latitude }, attributes: { Name: stop.name, Sequence: index + 1 } })) }),
      travelMode: JSON.stringify(mode), accumulateAttributeNames: "Miles,TruckMinutes",
      findBestSequence: "false", ignoreInvalidLocations: "false", returnRoutes: "true", returnStops: "true",
      returnDirections: "true", directionsLengthUnits: "esriNAUMiles", returnZ: "false", outSR: "4326", outputLines: "esriNAOutputLineTrueShape",
    };
    const baseline = await arcgisRequest<SolveResponse>(`${ROUTE_SERVICE}/solve`, parameters, request.signal);
    const baselineLegs = routeLegs(baseline);
    for (const item of disruptions) if (!baselineLegs.some(leg => leg.ids.includes(item.freeway))) throw new ServiceError("Choose affected freeways from this baseline route.", 400);
    const blocked = new Set(disruptions.filter(item => item.kind === "closure").map(item => item.freeway));
    const closures = [...blocked].map(freeway => ({ freeway, verified: true as const, geometry: freewayGeometry(baselineLegs, freeway) }));
    const { slowdowns, zones } = slowdownGeometry(baselineLegs, disruptions);
    const timed = body.departureMinutes !== undefined || body.arrivalMinutes !== undefined;
    const timeAttribute = timed ? "TruckTravelTime" : "TruckMinutes";
    const weatherFactor = body.weather === "rain" ? 1.1 : 1;
    function makeSolver(objective: "time" | "distance", avoid: string[], seedLegs = baselineLegs) {
      // Each search has independent restriction points; no race between candidates.
      const banned = new Set([...blocked, ...avoid]);
      const points: number[][] = [];
      function addPoints(legs: FreewayLeg[]) {
        const remaining = legs.filter(leg => leg.ids.some(id => banned.has(id)));
        if (!remaining.length) return;
        const budget = 245 - points.length;
        if (budget < remaining.length + 2) throw new ServiceError("These closures exceed the routing service limits. Remove a closure or try another route.", 422);
        const miles = remaining.reduce((sum, leg) => sum + leg.miles, 0);
        const spacing = Math.max(0.15, miles / Math.min(budget - remaining.length, 150));
        const before = points.length;
        for (const leg of remaining) for (const point of sampleFreewayPath(leg.path, spacing)) if (!points.some(existing => Math.hypot(existing[0] - point[0], existing[1] - point[1]) < 0.00001)) points.push(point);
        if (points.length === before || points.length > 250) throw new ServiceError("A route avoiding every blocked freeway could not be confirmed.", 422);
      }
      addPoints([...baselineLegs.filter(leg => leg.ids.some(id => blocked.has(id))), ...seedLegs.filter(leg => leg.ids.some(id => avoid.includes(id)))]);
      return async function solveAt(departure?: number): Promise<SolvedRoute> {
        let result = baseline, legs = baselineLegs;
        if (timed || disruptions.length || objective === "distance" || avoid.length) {
          for (let pass = 0; pass < 8; pass++) {
            result = await arcgisRequest<SolveResponse>(`${ROUTE_SERVICE}/solve`, {
              ...parameters,
              travelMode: JSON.stringify({ ...mode, impedanceAttributeName: objective === "distance" ? "Miles" : timeAttribute, timeAttributeName: timeAttribute, distanceAttributeName: "Miles" }),
              accumulateAttributeNames: `Miles,${timeAttribute}`,
              ...(departure !== undefined ? { startTime: String(Date.UTC(1990, 0, 1) + ((departure % 10080 + 10080) % 10080) * 60000), startTimeIsUTC: "false" } : {}),
              ...(points.length ? { barriers: JSON.stringify({ spatialReference: { wkid: 4326 }, features: points.map(([x, y]) => ({ geometry: { x, y }, attributes: { BarrierType: 0, FullEdge: 1 } })) }) } : {}),
              ...(zones.length ? { polygonBarriers: JSON.stringify({ spatialReference: { wkid: 4326 }, features: zones.map(zone => ({ geometry: zone.polygon!.toJSON(), attributes: { BarrierType: 1, [`Attr_${timeAttribute}`]: zone.multiplier } })) }) } : {}),
            }, request.signal);
            legs = routeLegs(result);
            if (!legs.some(leg => leg.ids.some(id => banned.has(id)))) break;
            if (pass === 7) throw new ServiceError("No verified route avoiding the blocked freeways was found.", 422);
            addPoints(legs);
          }
        }
        const route = result.routes?.features[0];
        if (!route || result.stops?.features.some(stop => stop.attributes.Status !== 0)) throw new ServiceError("A stop could not be reached on the truck road network. Try another address or entrance.", 422);
        const minutes = (timed ? route.attributes.Total_TruckTravelTime : route.attributes.Total_TruckMinutes)! * weatherFactor;
        const miles = route.attributes.Total_Miles;
        if (!Number.isFinite(miles) || !Number.isFinite(minutes) || !route.geometry?.paths?.length) throw new ServiceError("ArcGIS returned an incomplete route. Please try again.");
        return { geometry: { paths: route.geometry.paths, spatialReference: { wkid: 4326 } }, miles, minutes, stops, freeways: summarizeFreeways(legs), legs };
      };
    }
    async function solveProfile(objective: "time" | "distance", avoid: string[] = [], seedLegs = baselineLegs) {
      const solve = makeSolver(objective, avoid, seedLegs);
      let departure: number | undefined = body.departureMinutes;
      let solved: SolvedRoute;
      if (body.arrivalMinutes !== undefined) {
        try {
          const estimate = await estimateArrivalDeparture(body.arrivalMinutes, (baseline.routes?.features[0]?.attributes.Total_TruckMinutes || 120) * weatherFactor, solve);
          departure = estimate.departure; solved = estimate.result;
        } catch (error) { if (error instanceof ServiceError) throw error; throw new ServiceError(error instanceof Error ? error.message : "The arrival estimate could not be completed.", 422); }
      } else solved = await solve(departure);
      const route: RouteResult = {
        geometry: solved.geometry, miles: solved.miles, minutes: solved.minutes, stops, freeways: solved.freeways,
        communityImpact: await routeCommunityImpact(solved.geometry),
        ...(closures.length ? { closures } : {}),
        ...(timed || disruptions.length || body.weather === "rain" ? { simulation: { slowdowns,
          ...(departure !== undefined ? { departureMinutes: departure, arrivalMinutes: departure + solved.minutes } : {}),
          ...(body.arrivalMinutes !== undefined ? { arrivalDeadlineMinutes: body.arrivalMinutes } : {}),
          ...(body.weather === "rain" ? { weather: "rain" as const } : {}),
        } } : {}),
      };
      return { route, legs: solved.legs };
    }
    const fastest = await solveProfile("time");
    if (!body.candidates) return Response.json(fastest.route);
    const pool: { route: RouteResult; source: RouteCandidate["source"] }[] = [{ route: fastest.route, source: "fastest" }];
    // Prioritize alternative freeway corridors with the most measured DAC miles.
    const corridors = await Promise.all(fastest.route.freeways.filter(f => !blocked.has(f.id) && f.miles >= 0.5).map(async freeway => ({ id: freeway.id, miles: freeway.miles, dac: (await routeCommunityImpact(freewayGeometry(fastest.legs, freeway.id))).dacMi })));
    corridors.sort((a, b) => b.dac - a.dac || b.miles - a.miles);
    let failures = 0;
    async function attempt(objective: "time" | "distance", avoid: string[], source: RouteCandidate["source"]) {
      try {
        const { route } = await solveProfile(objective, avoid, fastest.legs);
        if (pool.every(other => routesAreDistinct(route, other.route))) pool.push({ route, source });
      } catch (error) { if (request.signal.aborted) throw error; failures++; }
    }
    await Promise.all([
      attempt("distance", [], "shortest"),
      ...corridors.slice(0, 2).map(freeway => attempt("time", [freeway.id], "corridor")),
    ]);
    await Promise.all(corridors.slice(2, 4).map(freeway => attempt("time", [freeway.id], "corridor")));
    const allCandidates = rankCandidates(pool);
    const candidates = recommendedCandidates(allCandidates);
    const response: RouteResponse = { ...fastest.route, candidates, allCandidates,
      ...(allCandidates.length < 2 ? { candidateNotice: failures ? "Only one distinct route could be verified for these constraints. Try another time or adjust the route." : "Only one distinct truck route was found for these stops and conditions." } : {}),
    };
    return Response.json(response);
  } catch (error) { return serviceErrorResponse(error); }
}
