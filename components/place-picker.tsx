"use client";

import { useEffect, useId, useState } from "react";
import type { Coordinate, PlaceKind, RouteGeometry, RouteLocation } from "@/lib/route-types";

type Props = {
  label: string;
  kind: PlaceKind;
  near: Coordinate;
  corridor?: RouteGeometry;
  value: RouteLocation | null;
  onChange: (value: RouteLocation | null) => void;
  disabled?: boolean;
  excludeIds?: string[];
  onFocusLocation?: (location: RouteLocation) => void;
};

type SearchState = { key: string; locations: RouteLocation[]; error: string };

export default function PlacePicker({ label, kind, near, corridor, value, onChange, disabled = false, excludeIds = [], onFocusLocation }: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ key: "", locations: [], error: "" });
  const needsText = kind === "address" && query.trim().length < 3;
  const searchBody = JSON.stringify({ kind, query: kind === "warehouse" ? "" : query, near, ...(corridor ? { corridor } : {}) });
  const searchKey = `${attempt}:${searchBody}`;
  const loading = !disabled && !needsText && state.key !== searchKey;
  const current = state.key === searchKey;
  const locations = current ? state.locations.filter(place => !excludeIds.includes(place.id)
    && (kind !== "warehouse" || `${place.name} ${place.address}`.toLowerCase().includes(query.trim().toLowerCase()))) : [];
  const error = current ? state.error : "";
  const options = value && !locations.some(place => place.id === value.id) ? [value, ...locations] : locations;

  useEffect(() => {
    if (disabled || needsText) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: searchBody,
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Location search failed.");
        if (!controller.signal.aborted) setState({ key: searchKey, locations: data.locations, error: "" });
      } catch (cause) {
        if (!controller.signal.aborted) setState({ key: searchKey, locations: [], error: cause instanceof Error ? cause.message : "Location search failed." });
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [disabled, needsText, searchBody, searchKey]);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-600" htmlFor={`${id}-search`}>
        {kind === "address" ? "Enter an address or city" : kind === "warehouse" ? "Filter demo name or address (optional)" : "Filter by name or city (optional)"}
      </label>
      <input
        id={`${id}-search`}
        aria-label={`Search ${label.toLowerCase()}`}
        className="route-input"
        placeholder={kind === "address" ? "Street address, city, CA" : kind === "warehouse" ? "Search demo warehouses…" : kind === "yard" ? "Terminal or container facility" : "Search locations…"}
        value={query}
        disabled={disabled}
        onChange={event => { setQuery(event.target.value); onChange(null); }}
      />
      <label className="sr-only" htmlFor={`${id}-location`}>{label} location</label>
      <select
        id={`${id}-location`}
        className="route-input"
        value={value?.id || ""}
        disabled={disabled || loading || needsText || !!error}
        onChange={event => {
          const place = options.find(place => place.id === event.target.value) || null;
          onChange(place);
          if (place) onFocusLocation?.(place);
        }}
        aria-describedby={`${id}-status`}
      >
        <option value="">
          {disabled ? "Choose a destination first" : needsText ? "Type an address to find matches" : loading ? "Finding locations…" : locations.length ? "Select a location" : "No matches found"}
        </option>
        {options.map(place => (
          <option value={place.id} key={place.id}>
            {place.name}{place.address !== place.name ? ` — ${place.address}` : ""}
          </option>
        ))}
      </select>
      <div id={`${id}-status`} className="text-xs leading-relaxed text-slate-500" aria-live="polite">
        {error ? (
          <p className="text-red-700">{error} <button type="button" className="underline" onClick={() => setAttempt(attempt + 1)}>Retry search</button></p>
        ) : loading ? "Searching ArcGIS…"
          : value ? <div><button type="button" className="mb-1 text-left font-medium text-blue-700 underline underline-offset-2" onClick={() => onFocusLocation?.(value)} aria-label={`Show ${value.name} on map`}>{value.name} <span aria-hidden="true">↗</span></button><p>{value.address}{value.distanceFromRouteMiles !== undefined && <span className="block">{value.distanceFromRouteMiles.toFixed(1)} mi from the direct route (not detour mileage)</span>}</p></div>
          : !needsText && !disabled && !locations.length ? "Try another name or area, or use a custom address."
          : corridor && kind !== "address" ? "Suggestions within 5 miles of the direct route, near its start, middle, and end."
          : kind === "warehouse" ? "Demo warehouse names · real locations near the selected area."
          : kind === "address" ? "Choose a matching result to confirm its location." : "Locations from ArcGIS."}
      </div>
      {kind === "fuel" && <p className="text-xs text-slate-500">Fuel results may include ordinary gas stations. Confirm diesel and semi-truck access.</p>}
      {kind === "yard" && <p className="text-xs text-slate-500">Terminal search results; yard coverage and gate access are not verified.</p>}
    </div>
  );
}
