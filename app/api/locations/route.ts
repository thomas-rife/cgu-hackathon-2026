import { arcgisRequest, GEOCODE_SERVICE, ServiceError, serviceErrorResponse } from "@/lib/arcgis";
import { distanceFromRoute, isRouteGeometry, isSoCalCoordinate, sampleRoute } from "@/lib/route-geometry";
import type { Coordinate, PlaceKind, RouteLocation } from "@/lib/route-types";
import { warehouseDemoName } from "@/lib/warehouse-names";

type Candidate = { address: string; score: number; location: { x: number; y: number }; attributes: { PlaceName?: string; Place_addr?: string; Type?: string; RegionAbbr?: string } };
type SearchResponse = { candidates: Candidate[] };
const kinds: PlaceKind[] = ["warehouse", "yard", "fuel", "address"];

export async function POST(request: Request) {
  try {
    let body;
    try { body = await request.json(); } catch { throw new ServiceError("Send a valid location search.", 400); }
    if (!body || !kinds.includes(body.kind) || !isSoCalCoordinate(body.near)
      || (body.query !== undefined && (typeof body.query !== "string" || body.query.length > 150))
      || (body.corridor !== undefined && !isRouteGeometry(body.corridor))) {
      throw new ServiceError("Choose a valid Southern California search area and stop type.", 400);
    }
    const kind: PlaceKind = body.kind;
    const query = (body.query || "").trim();
    if (kind === "address" && query.length < 3) return Response.json({ locations: [] });
    const corridor = body.corridor;
    const centers: Coordinate[] = corridor && kind !== "address" ? sampleRoute(corridor) : [body.near];

    const category = kind === "warehouse" ? "Warehouse"
      : kind === "fuel" ? "Truck Stop,Gas Station"
      : kind === "address" ? "Address,Populated Place" : "";

    const categories = kind === "fuel" ? ["Truck Stop", "Gas Station"] : [category];
    const responses = await Promise.all(centers.flatMap(center => categories.map(category => arcgisRequest<SearchResponse>(`${GEOCODE_SERVICE}/findAddressCandidates`, {
      singleLine: kind === "warehouse" ? "" : query || (kind === "yard" ? "container terminal" : ""),
      category,
      location: `${center.longitude},${center.latitude}`,
      searchExtent: corridor && kind !== "address"
        ? `${Math.max(-120.7, center.longitude - 0.22)},${Math.max(32.5, center.latitude - 0.18)},${Math.min(-114.1, center.longitude + 0.22)},${Math.min(35.8, center.latitude + 0.18)}`
        : "-120.7,32.5,-114.1,35.8",
      sourceCountry: "USA",
      maxLocations: corridor ? "15" : "25",
      outFields: "PlaceName,Place_addr,Type,RegionAbbr",
      forStorage: "false",
      outSR: "4326",
    }, request.signal))));

    const unique = new Map<string, RouteLocation>();
    for (const candidate of responses.flatMap(response => response.candidates || [])) {
      const point = { longitude: candidate.location.x, latitude: candidate.location.y };
      if (!isSoCalCoordinate(point) || candidate.attributes.RegionAbbr !== "CA" || candidate.score < (kind === "yard" ? 60 : 80)) continue;
      // The geocoder has no dedicated container-yard category. Exclude fuzzy
      // restaurant/store matches instead of presenting them as logistics sites.
      if (kind === "yard" && (!/container|terminal|depot|yard|trapac/i.test(candidate.attributes.PlaceName || candidate.address)
        || !/port|transport|warehouse|storage|delivery|industrial/i.test(candidate.attributes.Type || ""))) continue;
      const distance = corridor ? distanceFromRoute(point, corridor) : undefined;
      if (kind !== "address" && distance !== undefined && distance > 5) continue;
      const id = `arcgis:${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`;
      unique.set(id, {
        id, ...point, kind,
        name: kind === "warehouse" ? warehouseDemoName(point) : candidate.attributes.PlaceName || candidate.address,
        address: candidate.attributes.Place_addr || (kind === "warehouse" ? "Southern California warehouse location" : candidate.address),
        category: candidate.attributes.Type,
        ...(distance !== undefined ? { distanceFromRouteMiles: distance } : {}),
      });
    }
    const locations = [...unique.values()];
    locations.sort((a, b) => {
      if (kind === "fuel") {
        const truckPriority = Number(b.category === "Truck Stop") - Number(a.category === "Truck Stop");
        if (truckPriority) return truckPriority;
      }
      return corridor ? (a.distanceFromRouteMiles ?? 0) - (b.distanceFromRouteMiles ?? 0) : 0;
    });
    const filtered = kind === "warehouse" && query
      ? locations.filter(location => `${location.name} ${location.address}`.toLowerCase().includes(query.toLowerCase()))
      : locations;
    return Response.json({ locations: filtered.slice(0, 40) });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
