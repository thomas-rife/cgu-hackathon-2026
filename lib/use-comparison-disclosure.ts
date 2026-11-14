"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "fleetforward.comparison.expanded";
const listeners = new Set<() => void>();
let remembered = true;

function snapshot() {
  try { return window.sessionStorage.getItem(STORAGE_KEY) !== "false"; }
  catch { return remembered; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
function setExpanded(expanded: boolean) {
  remembered = expanded;
  try { window.sessionStorage.setItem(STORAGE_KEY, String(expanded)); } catch { /* Keep the in-memory session preference. */ }
  listeners.forEach(listener => listener());
}
export function useComparisonDisclosure() {
  const expanded = useSyncExternalStore(subscribe, snapshot, () => true);
  return [expanded, setExpanded] as const;
}
