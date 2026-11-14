import type { PlaceKind, RouteCandidate, RouteLocation, RouteResult } from "./route-types";
import type { SimulationSettings } from "./simulation";
import { estimateRouteImpact } from "./route-metrics";
import type { CorridorBurdenResult } from "./corridorBurden";
import type { DecisionImpact } from "./decision-impact";
import type { ReferenceLabel } from "./comparison-reference";
import { CANDIDATE_COLORS } from "./candidate-display";

export type StopDraft = { id: string; kind: PlaceKind; areaId: string; location: RouteLocation | null };
export type PlannerDraft = {
  portId: string;
  areaId: string;
  destinationKind: PlaceKind;
  destination: RouteLocation;
  stops: StopDraft[];
  settings: SimulationSettings;
  dieselPrice: string;
};
export type SavedTrip = {
  id: string;
  planDate: string;
  createdAt: string;
  updatedAt: string;
  option: "baseline" | "alternate";
  candidate?: Pick<RouteCandidate, "id" | "name" | "source" | "tags">;
  tradeoff?: DecisionImpact;
  tradeoffReference?: ReferenceLabel;
  route: RouteResult;
  draft: PlannerDraft;
  departureMinutes: number | null;
  arrivalMinutes: number | null;
  indicators: string[];
};
export const PLAN_STORAGE_KEY = "fleetforward.plan.v1";
export const PLAN_CHANGED_EVENT = "fleetforward-plan-changed";
export const TRIP_COLORS = CANDIDATE_COLORS;

export function localPlanDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validPlanDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseSavedTrips(raw: string): SavedTrip[] {
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.trips) || !data.trips.every((trip: SavedTrip) =>
    trip && typeof trip.id === "string" && validPlanDate(trip.planDate)
    && ["baseline", "alternate"].includes(trip.option)
    && ((trip.departureMinutes === null && trip.arrivalMinutes === null) || (Number.isFinite(trip.departureMinutes) && Number.isFinite(trip.arrivalMinutes)))
    && Number.isFinite(trip.route?.miles) && Number.isFinite(trip.route?.minutes)
    && Array.isArray(trip.route?.stops) && trip.route.stops.length >= 2
    && Array.isArray(trip.route?.geometry?.paths) && trip.route.geometry.paths.length > 0
    && trip.draft?.destination && Array.isArray(trip.draft.stops)
    && Array.isArray(trip.draft.settings?.disruptions) && Array.isArray(trip.indicators)
    && Number(trip.draft.dieselPrice) > 0)) throw new Error("Saved plan data could not be read.");
  return data.trips;
}
function readTrips() {
  return parseSavedTrips(window.localStorage.getItem(PLAN_STORAGE_KEY) || "");
}
function writeTrips(trips: SavedTrip[]) {
  window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({ version: 1, trips }));
  window.dispatchEvent(new Event(PLAN_CHANGED_EVENT));
}
export function saveTrip(trip: SavedTrip) {
  try {
    const trips = readTrips();
    const index = trips.findIndex(item => item.id === trip.id);
    if (index === -1) trips.push(trip); else trips[index] = trip;
    writeTrips(trips);
  } catch {
    throw new Error("Could not save this trip in your browser. Your existing plan has not been changed. Check available browser storage and try again.");
  }
}
export function removeTrip(id: string) {
  try { writeTrips(readTrips().filter(trip => trip.id !== id)); }
  catch { throw new Error("Could not remove this trip. Please try again."); }
}
export function backfillTripBurden(compute: (route: RouteResult) => CorridorBurdenResult) {
  const trips = readTrips();
  let changed = false;
  const updated = trips.map(trip => {
    if (trip.route.communityImpact) return trip;
    changed = true;
    return { ...trip, route: { ...trip.route, communityImpact: compute(trip.route) } };
  });
  if (changed) writeTrips(updated);
}
export function dailyTripTotals(trips: SavedTrip[]) {
  return trips.reduce((totals, trip) => {
    const impact = estimateRouteImpact(trip.route.miles, Number(trip.draft.dieselPrice));
    return { miles: totals.miles + trip.route.miles, fuel: totals.fuel + impact.fuelCost!, co2: totals.co2 + impact.co2Kg,
      minutes: totals.minutes + trip.route.minutes,
      highDieselMi: totals.highDieselMi + (trip.route.communityImpact?.highDieselMi ?? 0),
      dacMi: totals.dacMi + (trip.route.communityImpact?.dacMi ?? 0),
      missingCommunity: totals.missingCommunity + (trip.route.communityImpact?.avgDieselPct != null ? 0 : 1),
    };
  }, { miles: 0, fuel: 0, co2: 0, minutes: 0, highDieselMi: 0, dacMi: 0, missingCommunity: 0 });
}
export function sortedDayTrips(trips: SavedTrip[], date: string) {
  return trips.filter(trip => trip.planDate === date).sort((a, b) => (a.departureMinutes ?? Infinity) - (b.departureMinutes ?? Infinity) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
