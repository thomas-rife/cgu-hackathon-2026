"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  dailyTripTotals,
  removeTrip,
  sortedDayTrips,
  TRIP_COLORS,
  validPlanDate,
} from "@/lib/saved-trips";
import { useSavedTrips } from "@/lib/use-saved-trips";
import { formatDeparture } from "@/lib/simulation";
import PlanMap from "./plan-map";
import HowItWorks from "./how-it-works";
import DaySummaryCard from "./day-summary-card";
import WhosAffected from "./whos-affected";
import { decisionImpact } from "@/lib/decision-impact";

function planClock(minutes: number) {
  const offset = Math.floor(Math.round(minutes) / 1440);
  return `${formatDeparture(minutes)}${offset === -1 ? " (previous day)" : offset === 1 ? " (next day)" : offset ? ` (${offset > 0 ? "+" : ""}${offset} days)` : ""}`;
}
export default function TodaysPlan() {
  const params = useSearchParams();
  const router = useRouter();
  const { trips, ready, today, error, communityError } = useSavedTrips();
  const [actionError, setActionError] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  const queryDate = params.get("date");
  const date = validPlanDate(queryDate) ? queryDate : today;
  const dayTrips = useMemo(() => sortedDayTrips(trips, date), [trips, date]);
  const totals = dailyTripTotals(dayTrips);
  const metrics = [
    { label: "Total miles", value: `${totals.miles.toFixed(1)} mi`, note: "" },
    {
      label: "Fuel cost",
      value: `$${totals.fuel.toFixed(2)}`,
      note: "Estimate using each trip’s saved diesel price",
    },
    {
      label: "CO₂",
      value: `${totals.co2.toFixed(1)} kg`,
      note: "Estimated",
    },
    {
      label: "Truck miles in disadvantaged communities",
      value: totals.missingCommunity ? "—" : `${totals.dacMi.toFixed(1)} mi`,
      note: "Overall CES percentile ≥75",
    },
    {
      label: "Truck miles in high-diesel tracts",
      value: totals.missingCommunity
        ? "—"
        : `${totals.highDieselMi.toFixed(1)} mi`,
      note: "Diesel PM percentile ≥75",
    },
  ];
  function remove(id: string) {
    try {
      removeTrip(id);
      setActionError("");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not remove trip.",
      );
    }
  }
  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
        <Link className="text-lg font-semibold tracking-tight" href="/">
          FleetForward
        </Link>
        <button type="button" onClick={() => setHowOpen(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50">How this works</button>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-blue-700">
              {/* Daily dispatch */}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Today’s Plan
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {ready
                ? `${dayTrips.length} saved trip${dayTrips.length === 1 ? "" : "s"}`
                : "Loading saved trips…"}{" "}
              {/* · Pacific time */}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="plan-date"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Plan date
              </label>
              <input
                id="plan-date"
                type="date"
                className="route-input"
                value={date}
                disabled={!ready}
                onChange={(event) => {
                  if (validPlanDate(event.target.value))
                    router.replace(
                      `/?date=${encodeURIComponent(event.target.value)}`,
                      { scroll: false },
                    );
                }}
              />
            </div>
            <Link
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"
              href={`/planner${date ? `?date=${encodeURIComponent(date)}` : ""}`}
            >
              ＋ Add trip
            </Link>
          </div>
        </div>
        {(error || actionError || communityError) && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error || actionError || communityError}
          </p>
        )}
        {ready && !error && <DaySummaryCard trips={dayTrips} />}
        <section
          aria-label="Day impact totals"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="text-xs font-medium text-slate-500">
                {metric.label}
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                {ready && !error ? metric.value : "—"}
              </p>
              <p className="mt-2 text-[10px] text-slate-400">{metric.note}</p>
            </div>
          ))}
        </section>
        <WhosAffected title="Who’s affected today" totals impact={ready && !error ? { fuel: totals.fuel, co2Kg: totals.co2, minutes: totals.minutes, dacMi: totals.missingCommunity ? null : totals.dacMi } : null} />
        {!!dayTrips.length && (
          <section
            aria-label="Saved routes overview"
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">Routes at a glance</h2>
              <span className="text-[11px] text-slate-500">
                Colors match the trip list
              </span>
            </div>
            <PlanMap trips={dayTrips} />
          </section>
        )}
        <section
          aria-label="Saved trips"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold">Saved trips</h2>
            <span className="text-[11px] text-slate-400">
              Sorted by departure
            </span>
          </div>
          {!ready ? (
            <p role="status" className="p-8 text-sm text-slate-500">
              Loading your plan…
            </p>
          ) : !dayTrips.length ? (
            <div className="px-5 py-14 text-center">
              <h3 className="text-lg font-medium">
                {error
                  ? "Your plan is unavailable"
                  : "Your day starts with a route"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                {error
                  ? "Your existing saved data has been preserved."
                  : "Plan a trip, compare disruptions, then save your chosen route here."}
              </p>
              <Link
                className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white"
                href={`/planner?date=${encodeURIComponent(date)}`}
              >
                Plan your first trip
              </Link>
            </div>
          ) : (
            <ol className="divide-y divide-slate-100">
              {dayTrips.map((trip, index) => {
                const first = trip.route.stops[0],
                  last = trip.route.stops[trip.route.stops.length - 1];
                return (
                  <li
                    key={trip.id}
                    data-saved-trip={trip.id}
                    className="px-5 py-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                TRIP_COLORS[index % TRIP_COLORS.length],
                            }}
                            aria-hidden="true"
                          />
                          <h3 className="text-sm font-semibold">
                            {first.name}{" "}
                            <span className="mx-1 font-normal text-slate-400">
                              →
                            </span>{" "}
                            {last.name}
                          </h3>
                        </div>
                        <p className="mt-1.5 pl-4.5 text-xs text-slate-500">
                          {trip.route.stops.length > 2
                            ? `${trip.route.stops.length - 2} stop${trip.route.stops.length > 3 ? "s" : ""} · `
                            : ""}
                          {trip.route.minutes.toFixed(0)} min estimated driving
                        </p>
                      </div>
                      <div className="text-sm tabular-nums">
                        {trip.departureMinutes !== null && trip.arrivalMinutes !== null ? <><span className="font-medium">{planClock(trip.departureMinutes)}</span><span className="mx-2 text-slate-400">→</span><span>{planClock(trip.arrivalMinutes)}</span></> : <span className="text-xs text-slate-500">Departure not set</span>}
                        <p className="mt-1 text-right text-[10px] text-slate-400">
                          {trip.departureMinutes === null ? "Add a time in Edit" : "Estimated schedule"}
                        </p>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <Link
                          className="font-medium text-blue-700 hover:underline"
                          href={`/planner?trip=${encodeURIComponent(trip.id)}`}
                          aria-label={`Edit trip ${index + 1}`}
                        >
                          Edit
                        </Link>
                        <button
                          className="text-red-700 hover:text-red-700"
                          type="button"
                          onClick={() => remove(trip.id)}
                          aria-label={`Remove trip ${index + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {(trip.option === "alternate" || trip.draft.settings.disruptions.length > 0) && <WhosAffected compact referenceLabel={trip.tradeoffReference || "Original plan"} impact={trip.tradeoff ?? (trip.option === "baseline" ? decisionImpact(trip.route, trip.route, Number(trip.draft.dieselPrice)) : null)} />}
                    <div
                      aria-label="Trip indicators"
                      className="mt-3 flex flex-wrap gap-1.5"
                    >
                      {[
                        trip.option === "alternate"
                          ? (trip.candidate?.tags.includes("Lowest community burden") ? "Lowest DAC miles" : trip.candidate?.tags.includes("Lowest emissions") ? "Lowest emissions" : trip.candidate?.tags.includes("Fastest") ? "Fastest" : trip.candidate?.tags.includes("Balanced") ? "Balanced" : trip.candidate?.name || "Alternate route")
                          : "Original plan",
                      ].map((indicator, i) => (
                        <span
                          key={`${i}-${indicator}`}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600"
                        >
                          {indicator}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    {howOpen && <HowItWorks onClose={() => setHowOpen(false)} />}
    </main>
  );
}
