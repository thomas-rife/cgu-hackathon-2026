import type { SavedTrip } from "./saved-trips";
import { dailyTripTotals } from "./saved-trips";
import { disruptionLabel } from "./simulation";
import { numericClaims } from "./explanation-validation";

export type DaySummaryInput = {
  tripCount: number;
  totals: { miles: number; fuel: number; co2Kg: number; dacMi: number; highDieselMi: number; driveMin: number };
  vsFastest: { extraFuel: number; extraMin: number; dacMiAvoided: number; co2Delta: number };
  trips: { from: string; to: string; chosen: string; tags: string[]; disruptions: string[]; extraMin: number; extraFuel: number; dacMiAvoided: number }[];
};
// Minutes are whole numbers so the summary matches the rest of the day view.
const round = (value: number, places = 1) => Number(value.toFixed(places));
export function daySummaryInput(trips: SavedTrip[]): DaySummaryInput | null {
  if (!trips.length || trips.some(trip => !trip.fastestTradeoff || trip.fastestTradeoff.fuel === null || trip.fastestTradeoff.dacMi === null || trip.route.communityImpact?.avgDieselPct == null || trip.route.stops.length < 2)) return null;
  const totals = dailyTripTotals(trips);
  if (totals.missingCommunity) return null;
  const tradeoffs = trips.map(trip => trip.fastestTradeoff!);
  return {
    tripCount: trips.length,
    totals: { miles: round(totals.miles), fuel: round(totals.fuel, 2), co2Kg: round(totals.co2), dacMi: round(totals.dacMi), highDieselMi: round(totals.highDieselMi), driveMin: round(totals.minutes, 0) },
    vsFastest: { extraFuel: round(tradeoffs.reduce((sum, item) => sum + item.fuel!, 0), 2), extraMin: round(tradeoffs.reduce((sum, item) => sum + item.minutes, 0), 0), dacMiAvoided: round(-tradeoffs.reduce((sum, item) => sum + item.dacMi!, 0)), co2Delta: round(tradeoffs.reduce((sum, item) => sum + item.co2Kg, 0)) },
    trips: trips.map((trip, index) => ({
      from: trip.route.stops[0].name, to: trip.route.stops.at(-1)!.name,
      chosen: trip.candidate?.name || "Original plan", tags: trip.candidate?.tags || [],
      disruptions: trip.draft.settings.disruptions.map(disruptionLabel).filter((label): label is string => !!label),
      extraMin: round(tradeoffs[index].minutes, 0), extraFuel: round(tradeoffs[index].fuel!, 2), dacMiAvoided: round(-tradeoffs[index].dacMi!),
    })),
  };
}
export function daySummaryKey(input: DaySummaryInput) {
  const json = JSON.stringify(input);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) hash = Math.imul(hash ^ json.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
export function sanitizeDaySummary(raw: unknown, input: DaySummaryInput): string | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 4000 || /<think>/i.test(raw)) return null;
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:\w+)?/g, "").replace(/[*_`#]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  const ends = [...text.matchAll(/[.!?](?=\s|$)/g)];
  if (ends.length < 2) return null;
  text = text.slice(0, ends[Math.min(2, ends.length - 1)].index! + 1).trim();
  if (!/[a-z]/i.test(text) || text.split(/\s+/).length > 100) return null;
  const allowed = new Set<number>();
  function collect(value: unknown) {
    // Savings are stored as negative deltas but written as "saves $10.37".
    if (typeof value === "number") { allowed.add(value); allowed.add(Math.abs(value)); }
    else if (typeof value === "string") numericClaims(value).forEach(number => allowed.add(number));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  collect(input);
  if (numericClaims(text).some(number => !allowed.has(number))) return null;
  // The model sometimes claims a clear day despite listed disruptions; hide that rather than show it.
  if (input.trips.some(trip => trip.disruptions.length) && /\b(?:no|without|zero) disruptions?\b/i.test(text)) return null;
  const roads = new Set(input.trips.flatMap(trip => trip.disruptions.flatMap(label => label.match(/\b(?:I|US|CA)-\d{1,3}\b/g) || [])));
  if ([...text.matchAll(/\b(?:I|US|CA|SR)[ -]\d{1,3}\b/gi)].some(match => !roads.has(match[0].toUpperCase().replace(/^SR/, "CA").replace(" ", "-")))) return null;
  return text;
}
