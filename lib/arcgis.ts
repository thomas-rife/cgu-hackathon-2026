import "server-only";

export class ServiceError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export const ROUTE_SERVICE = "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World";
export const GEOCODE_SERVICE = "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer";

export async function arcgisRequest<T>(url: string, parameters: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const key = process.env.ARCGIS_KEY;
  if (!key) throw new ServiceError("Add ARCGIS_KEY to .env and restart the development server.", 503);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      body: new URLSearchParams({ f: "json", token: key, ...parameters }),
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    });
  } catch {
    throw new ServiceError("ArcGIS could not be reached. Please try again.", 504);
  }
  if (!response.ok) throw new ServiceError(`ArcGIS returned HTTP ${response.status}. Please try again.`);
  const data = await response.json();
  if (data.error) {
    const code = Number(data.error.code);
    if ([401, 403, 498, 499].includes(code)) {
      throw new ServiceError("ArcGIS access was denied. Check the key’s geocoding and routing privileges.", 503);
    }
    throw new ServiceError("ArcGIS could not complete this request. Try another location or route.", 422);
  }
  return data as T;
}

export function serviceErrorResponse(error: unknown): Response {
  return Response.json({ error: error instanceof ServiceError ? error.message : "The request could not be completed. Please try again." }, {
    status: error instanceof ServiceError ? error.status : 500,
  });
}

type TravelMode = Record<string, unknown> & { name: string };
let truckMode: Promise<TravelMode> | undefined;

export async function getBaselineTruckMode(): Promise<TravelMode> {
  if (!truckMode) {
    truckMode = arcgisRequest<{ supportedTravelModes: TravelMode[] }>(ROUTE_SERVICE, {})
      .then(data => {
        const mode = data.supportedTravelModes?.find(mode => mode.name === "Trucking Time");
        if (!mode) throw new ServiceError("ArcGIS trucking travel mode is unavailable.");
        return { ...mode, impedanceAttributeName: "TruckMinutes", timeAttributeName: "TruckMinutes" };
      }).catch(error => {
        truckMode = undefined;
        throw error;
      });
  }
  return truckMode;
}
