"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { backfillTripBurden, localPlanDate, parseSavedTrips, PLAN_CHANGED_EVENT, PLAN_STORAGE_KEY } from "./saved-trips";
import type { CesTracts } from "./corridorBurden";
let legacyTracts: Promise<CesTracts> | undefined;
const STORAGE_ERROR = "storage-unavailable";
function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) { if (event.key === PLAN_STORAGE_KEY || event.key === null) onChange(); }
  window.addEventListener("storage", onStorage);
  window.addEventListener(PLAN_CHANGED_EVENT, onChange);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(PLAN_CHANGED_EVENT, onChange); };
}
function snapshot() {
  try { return window.localStorage.getItem(PLAN_STORAGE_KEY) || ""; }
  catch { return STORAGE_ERROR; }
}
function serverSnapshot() { return null; }
export function useSavedTrips() {
  const [communityError, setCommunityError] = useState("");
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const data = useMemo(() => {
    try {
      if (raw === STORAGE_ERROR) throw new Error("Browser storage is unavailable.");
      return { trips: parseSavedTrips(raw || ""), error: "" };
    } catch {
      return { trips: [], error: "Your saved plan could not be loaded. Existing browser data has been left intact." };
    }
  }, [raw]);
  useEffect(() => {
    if (!data.trips.some(trip => !trip.route.communityImpact)) return;
    let disposed = false;
    legacyTracts ??= fetch("/ces.geojson").then(response => {
      if (!response.ok) throw new Error("Census data unavailable.");
      return response.json() as Promise<CesTracts>;
    }).catch(error => { legacyTracts = undefined; throw error; });
    void Promise.all([legacyTracts, import("./corridorBurden")]).then(([tracts, { corridorBurden }]) => {
      if (disposed) return;
      backfillTripBurden(route => corridorBurden({ type: "MultiLineString", coordinates: route.geometry.paths }, tracts));
      setCommunityError("");
    }).catch(() => { if (!disposed) setCommunityError("Community metrics for older trips could not be loaded. Reload to retry."); });
    return () => { disposed = true; };
  }, [data.trips]);
  return { ...data, communityError, ready: raw !== null, today: raw !== null ? localPlanDate() : "" };
}
