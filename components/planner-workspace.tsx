"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RoutePlanner from "./route-planner";
import { useSavedTrips } from "@/lib/use-saved-trips";
import { validPlanDate } from "@/lib/saved-trips";

export default function PlannerWorkspace() {
  const params = useSearchParams();
  const [session, setSession] = useState(0);
  const { trips, ready, today, error } = useSavedTrips();
  const id = params.get("trip");
  const trip = trips.find(trip => trip.id === id);
  if (!ready) return <p className="p-6 text-sm text-slate-600">Loading route planner…</p>;
  if (id && (!trip || error)) return <main className="p-8"><h1 className="text-xl font-semibold">Trip unavailable</h1><p className="mt-2 text-sm text-slate-600">{error || "This trip may have been removed from your plan."}</p><Link className="mt-4 inline-block text-sm text-blue-700 underline" href="/">Back to Today’s Plan</Link></main>;
  const date = params.get("date");
  // Navigation keeps this page mounted but hidden, so a saved trip's planner would otherwise come back
  // as it was left (dialog open, "Saving…"). Each save bumps the session to start the next visit fresh.
  return <RoutePlanner key={`${id || `new-${date || today}`}-${session}`} initialTrip={trip} initialDate={validPlanDate(date) ? date : today} onSaved={() => setSession(value => value + 1)} />;
}
