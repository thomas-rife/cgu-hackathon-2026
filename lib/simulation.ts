export type SlowdownKind = "lane" | "crash" | "combined";
export type RoadDisruption = { kind: "closure" | SlowdownKind; freeway: string };
export type DisruptionType = "closure" | "slowdown" | "departure" | "arrival" | "weather";
export type Disruption = { id: string } & (
  | { type: "closure"; freeway: string }
  | { type: "slowdown"; freeway: string; kind: SlowdownKind }
  | { type: "departure"; minutes: number }
  | { type: "arrival"; minutes: number }
  | { type: "weather"; weather: "clear" | "rain" }
);
export type SimulationSettings = { disruptions: Disruption[] };
export type SimulationRequest = {
  candidates?: boolean;
  disruptions?: RoadDisruption[];
  departureMinutes?: number;
  arrivalMinutes?: number;
  weather?: "clear" | "rain";
};

export const SLOWDOWN_PRESETS = {
  lane: { label: "Lane closure", multiplier: 1.5, miles: 4 },
  crash: { label: "Crash", multiplier: 3, miles: 1.5 },
  combined: { label: "Crash + lane closure", multiplier: 3.5, miles: 1.5 },
} as const;
export const DEFAULT_SIMULATION: SimulationSettings = {
  disruptions: [],
};

// Time and weather are journey-wide constraints. Road events are unique by
// freeway and preset; lane + crash may coexist to form the ×3.5 overlap preset.
export function disruptionConstraintKey(item: Disruption) {
  if (item.type === "departure" || item.type === "arrival") return "time";
  if (item.type === "weather") return "weather";
  return item.freeway ? `${item.type === "closure" ? "closure" : item.kind}:${item.freeway}` : null;
}

export function uniqueDisruptions(items: Disruption[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = disruptionConstraintKey(item);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function simulationRequest(settings: SimulationSettings): SimulationRequest {
  const time = settings.disruptions.find(item => item.type === "departure" || item.type === "arrival");
  const road = settings.disruptions.flatMap(item =>
    (item.type === "closure" || item.type === "slowdown") && item.freeway
      ? [{ kind: item.type === "closure" ? "closure" as const : item.kind, freeway: item.freeway }] : []);
  return {
    ...(road.length ? { disruptions: road } : {}),
    ...(time?.type === "arrival" ? { arrivalMinutes: time.minutes } : time?.type === "departure" ? { departureMinutes: time.minutes } : {}),
    ...(settings.disruptions.some(item => item.type === "weather" && item.weather === "rain") ? { weather: "rain" as const } : {}),
  };
}

export function disruptionLabel(item: Disruption) {
  if (item.type === "departure") return `Depart Monday · ${formatDeparture(item.minutes)}`;
  if (item.type === "arrival") return `Arrive Monday by ${formatDeparture(item.minutes)}`;
  if (item.type === "weather") return item.weather === "rain" ? "Rain" : "Clear weather";
  if (!item.freeway) return null;
  return item.type === "closure" ? `${item.freeway} closed` : `${SLOWDOWN_PRESETS[item.kind].label} · ${item.freeway}`;
}

export function formatDeparture(minutes: number) {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  return `${hours % 12 || 12}:${String(normalized % 60).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatSchedule(minutes: number) {
  const day = Math.floor(Math.round(minutes) / 1440);
  return `${day === -1 ? "Sunday" : day === 0 ? "Monday" : day === 1 ? "Tuesday" : `${Math.abs(day)} days ${day < 0 ? "earlier" : "later"}`} · ${formatDeparture(minutes)}`;
}
