"use client";

import type { RouteResult } from "@/lib/route-types";
import type {
  Disruption,
  DisruptionType,
  SimulationSettings,
  SlowdownKind,
} from "@/lib/simulation";
import {
  disruptionConstraintKey,
  formatDeparture,
  SLOWDOWN_PRESETS,
} from "@/lib/simulation";

type Props = {
  baseline: RouteResult | null;
  settings: SimulationSettings;
  onChange: (update: Partial<SimulationSettings>) => void;
  onReset: () => void;
};

export default function DisruptionsPanel({
  baseline,
  settings,
  onChange,
  onReset,
}: Props) {
  const items = settings.disruptions;
  const freeways = baseline?.freeways || [];
  function duplicate(next: Disruption) {
    const key = disruptionConstraintKey(next);
    return (
      !!key &&
      items.some(
        (item) => item.id !== next.id && disruptionConstraintKey(item) === key,
      )
    );
  }
  function update(id: string, next: Disruption) {
    if (duplicate(next)) return;
    onChange({
      disruptions: items.map((item) => (item.id === id ? next : item)),
    });
  }
  function add(type: DisruptionType) {
    if (
      items.length >= 8 ||
      items.some(
        (item) =>
          item.type === type &&
          (type === "weather" ||
            type === "departure" ||
            type === "arrival" ||
            ((item.type === "closure" || item.type === "slowdown") &&
              !item.freeway)),
      )
    )
      return;
    const id = crypto.randomUUID();
    const next: Disruption =
      type === "closure"
        ? { id, type, freeway: "" }
        : type === "slowdown"
          ? { id, type, freeway: "", kind: "lane" }
          : type === "weather"
            ? { id, type, weather: "rain" }
            : { id, type, minutes: type === "arrival" ? 1020 : 480 };
    // One journey has one time constraint; switching modes replaces that card.
    const others =
      type === "arrival" || type === "departure"
        ? items.filter(
            (item) => item.type !== "arrival" && item.type !== "departure",
          )
        : items;
    onChange({ disruptions: [...others, next] });
  }
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Route disruptions"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Disruptions</h2>
        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Simulated
        </span>
      </div>
      {/* <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Add disruptions to combine their effects in one alternate route. Fastest total truck travel time wins.</p> */}
      {!baseline && (
        <p className="mt-2 text-xs text-slate-500">
          Set a route to explore disruptions.
        </p>
      )}
      <div className="mt-3 space-y-3">
        {items.map((item, index) => (
          <fieldset
            key={item.id}
            disabled={!baseline}
            className="min-w-0 rounded-xl border border-slate-200 p-3"
            aria-label={`Disruption ${index + 1}`}
          >
            <legend className="sr-only">Disruption {index + 1}</legend>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">
                {index + 1}
              </span>
              <h3 className="text-xs font-semibold">
                {item.type === "closure"
                  ? "Full closure"
                  : item.type === "slowdown"
                    ? "Slowdown"
                    : item.type === "arrival"
                      ? "Arrival time"
                      : item.type === "departure"
                        ? "Departure time"
                        : "Weather"}
              </h3>
              <button
                type="button"
                aria-label={`Remove disruption ${index + 1}`}
                className="ml-auto text-[11px] text-slate-500 hover:text-red-700"
                onClick={() =>
                  onChange({
                    disruptions: items.filter((other) => other.id !== item.id),
                  })
                }
              >
                Remove
              </button>
            </div>
            {item.type === "slowdown" && (
              <>
                <label
                  htmlFor={`preset-${item.id}`}
                  className="mb-1 block text-[11px] font-medium text-slate-600"
                >
                  Preset
                </label>
                <select
                  id={`preset-${item.id}`}
                  className="route-input mb-3"
                  value={item.kind}
                  onChange={(event) =>
                    update(item.id, {
                      ...item,
                      kind: event.target.value as SlowdownKind,
                    })
                  }
                >
                  {Object.entries(SLOWDOWN_PRESETS).map(([kind, preset]) => (
                    <option
                      key={kind}
                      value={kind}
                      disabled={duplicate({
                        ...item,
                        kind: kind as SlowdownKind,
                      })}
                    >
                      {preset.label} · ×{preset.multiplier}
                    </option>
                  ))}
                </select>
              </>
            )}
            {(item.type === "closure" || item.type === "slowdown") && (
              <>
                <label
                  htmlFor={`freeway-${item.id}`}
                  className="mb-1 block text-[11px] font-medium text-slate-600"
                >
                  Affected freeway
                </label>
                <select
                  id={`freeway-${item.id}`}
                  className="route-input"
                  value={item.freeway}
                  disabled={!freeways.length}
                  onChange={(event) =>
                    update(item.id, { ...item, freeway: event.target.value })
                  }
                >
                  <option value="">Select a freeway</option>
                  {freeways.map((freeway) => (
                    <option
                      key={freeway.id}
                      value={freeway.id}
                      disabled={duplicate({ ...item, freeway: freeway.id })}
                    >
                      {freeway.id} · {freeway.miles.toFixed(1)} mi on original plan
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  {item.type === "closure" ? "" : ``}
                </p>
              </>
            )}
            {(item.type === "departure" || item.type === "arrival") && (
              <>
                <label
                  htmlFor={`time-${item.id}`}
                  className="flex justify-between gap-2 text-[11px] text-slate-500"
                >
                  <span>
                    {item.type === "arrival" ? "Arrive by" : "Leave at"} ·
                    Monday / Pacific
                  </span>
                  <span className="font-medium text-slate-700">
                    {formatDeparture(item.minutes)}
                  </span>
                </label>
                <input
                  id={`time-${item.id}`}
                  className="mt-2 w-full accent-blue-600"
                  type="range"
                  min="0"
                  max="1425"
                  step="15"
                  value={item.minutes}
                  onChange={(event) =>
                    update(item.id, {
                      ...item,
                      minutes: Number(event.target.value),
                    })
                  }
                />
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {item.type === "arrival"
                    ? "Estimates the latest time to leave, including all active disruptions. "
                    : "Recalculates the fastest route for this departure time. "}
                  {/* Calculates the fastest route for this departure time. Uses
                  historical traffic data. */}
                </p>
              </>
            )}
            {item.type === "weather" && (
              <>
                <label className="sr-only" htmlFor={`weather-${item.id}`}>
                  Weather
                </label>
                <select
                  id={`weather-${item.id}`}
                  className="route-input"
                  value={item.weather}
                  onChange={(event) =>
                    update(item.id, {
                      ...item,
                      weather: event.target.value as "clear" | "rain",
                    })
                  }
                >
                  <option value="clear">Clear</option>
                  <option value="rain">Rain</option>
                </select>
                {/* <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  Uniform 10% extra drive time is an assumption; fuel economy
                  stays at 6 mpg.
                </p> */}
              </>
            )}
          </fieldset>
        ))}
      </div>
      <label htmlFor="add-disruption" className="sr-only">
        Add disruption
      </label>
      <select
        id="add-disruption"
        className="route-input mt-3 border-dashed text-blue-700"
        value=""
        disabled={!baseline || items.length >= 8}
        onChange={(event) => {
          if (event.target.value) add(event.target.value as DisruptionType);
        }}
      >
        <option value="">＋ Add disruption</option>
        <option
          value="closure"
          disabled={
            items.some((item) => item.type === "closure" && !item.freeway) ||
            freeways.every((freeway) =>
              items.some(
                (item) =>
                  item.type === "closure" && item.freeway === freeway.id,
              ),
            )
          }
        >
          Full closure
        </option>
        <option
          value="slowdown"
          disabled={items.some(
            (item) => item.type === "slowdown" && !item.freeway,
          )}
        >
          Slowdown · lane closure / crash
        </option>
        <option
          value="departure"
          disabled={items.some((item) => item.type === "departure")}
        >
          Departure time
        </option>
        <option
          value="arrival"
          disabled={items.some((item) => item.type === "arrival")}
        >
          Arrival time
        </option>
        <option
          value="weather"
          disabled={items.some((item) => item.type === "weather")}
        >
          Weather
        </option>
      </select>
      {/* <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        Multipliers affect the covered stretch and contribute to total trip
        time. Overlapping crash + lane closures use ×3.5. No time card? Uses
        free-flow truck speeds without a start time.
      </p> */}
      {baseline && (
        <button
          type="button"
          className="mt-3 text-xs font-medium text-blue-700 underline"
          onClick={onReset}
        >
          Reset disruptions
        </button>
      )}
    </section>
  );
}
