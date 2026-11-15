"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  Coordinate,
  PlaceKind,
  RouteGeometry,
  RouteLocation,
} from "@/lib/route-types";

type Props = {
  label: string;
  kind: PlaceKind;
  near: Coordinate;
  areaName: string;
  corridor?: RouteGeometry;
  value: RouteLocation | null;
  onChange: (value: RouteLocation | null) => void;
  disabled?: boolean;
  excludeIds?: string[];
  onFocusLocation?: (location: RouteLocation) => void;
};

type SearchState = { key: string; locations: RouteLocation[]; error: string };
type Box = { left: number; top: number; width: number; maxHeight: number };

const NOUNS: Record<PlaceKind, string> = {
  warehouse: "warehouses",
  yard: "yards and terminals",
  fuel: "truck stops",
  address: "addresses",
};

// The list is position: fixed so the scrolling card row cannot clip it.
function measure(input: HTMLInputElement | null): Box | null {
  if (!input) return null;
  const rect = input.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.bottom + 4,
    width: rect.width,
    maxHeight: Math.max(120, Math.min(280, window.innerHeight - rect.bottom - 12)),
  };
}

export default function PlacePicker({
  label,
  kind,
  near,
  areaName,
  corridor,
  value,
  onChange,
  disabled = false,
  excludeIds = [],
  onFocusLocation,
}: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({
    key: "",
    locations: [],
    error: "",
  });
  const needsText = kind === "address" && query.trim().length < 3;
  const searchBody = JSON.stringify({
    kind,
    query: kind === "warehouse" ? "" : query,
    near,
    ...(corridor ? { corridor } : {}),
  });
  const searchKey = `${attempt}:${searchBody}`;
  const loading = !disabled && !needsText && state.key !== searchKey;
  const current = state.key === searchKey;
  const locations = current
    ? state.locations.filter(
        (place) =>
          !excludeIds.includes(place.id) &&
          (kind !== "warehouse" ||
            `${place.name} ${place.address}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())),
      )
    : [];
  const error = current ? state.error : "";
  const activeIndex = Math.min(active, Math.max(0, locations.length - 1));

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
        if (!response.ok)
          throw new Error(data.error || "Location search failed.");
        if (!controller.signal.aborted)
          setState({ key: searchKey, locations: data.locations, error: "" });
      } catch (cause) {
        if (!controller.signal.aborted)
          setState({
            key: searchKey,
            locations: [],
            error:
              cause instanceof Error
                ? cause.message
                : "Location search failed.",
          });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, needsText, searchBody, searchKey]);

  // Follow the input while the card row or the page scrolls.
  useEffect(() => {
    if (!open) return;
    const update = () => setBox(measure(inputRef.current));
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, id]);

  function show() {
    setBox(measure(inputRef.current));
    setOpen(true);
  }
  // Closing without choosing keeps the current selection.
  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }
  function choose(place: RouteLocation) {
    onChange(place);
    onFocusLocation?.(place);
    close();
  }

  const placeholder = disabled
    ? "Choose a destination first"
    : kind === "address"
      ? `Street address or city in ${areaName}…`
      : `Search ${NOUNS[kind]} in ${areaName}…`;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={`${id}-search`}
        role="combobox"
        aria-label={`${label} location`}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && locations.length ? `${id}-option-${activeIndex}` : undefined
        }
        aria-describedby={`${id}-status`}
        autoComplete="off"
        className="route-input"
        placeholder={open && value ? value.name : placeholder}
        value={open ? query : value?.name || ""}
        disabled={disabled}
        onFocus={show}
        onClick={show}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          show();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) return show();
            if (!locations.length) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((activeIndex + step + locations.length) % locations.length);
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (locations[activeIndex]) choose(locations[activeIndex]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          }
        }}
      />
      {open &&
        box &&
        createPortal(
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label={`${label} matches`}
            className="fixed z-50 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-xl"
            style={box}
            // Keep focus in the input so a click is not swallowed by blur.
            onMouseDown={(event) => event.preventDefault()}
          >
            {locations.length ? (
              locations.map((place, index) => (
                <li
                  key={place.id}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={place.id === value?.id}
                  className={`cursor-pointer px-3 py-2 ${index === activeIndex ? "bg-blue-50" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(place)}
                >
                  <span className="block font-medium text-slate-800">
                    {place.name}
                    {place.id === value?.id && (
                      <span className="ml-1 text-blue-700" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </span>
                  {place.address !== place.name && (
                    <span className="block truncate text-slate-500">
                      {place.address}
                    </span>
                  )}
                </li>
              ))
            ) : (
              <li role="presentation" className="px-3 py-2 text-slate-500">
                {needsText
                  ? "Type at least 3 characters to find matches."
                  : loading
                    ? "Searching ArcGIS…"
                    : error
                      ? "Search failed."
                      : "No matches. Try another name or area."}
              </li>
            )}
          </ul>,
          document.body,
        )}
      <div
        id={`${id}-status`}
        className="text-xs leading-relaxed text-slate-500"
        aria-live="polite"
      >
        {error ? (
          <p className="text-red-700">
            {error}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setAttempt(attempt + 1)}
            >
              Retry search
            </button>
          </p>
        ) : value ? (
          <div>
            <p className="truncate" title={value.address}>
              {value.address}
            </p>
            {value.distanceFromRouteMiles !== undefined && (
              <p>
                {value.distanceFromRouteMiles.toFixed(1)} mi from the direct
                route (not detour mileage)
              </p>
            )}
            <button
              type="button"
              className="font-medium text-blue-700 underline underline-offset-2"
              onClick={() => onFocusLocation?.(value)}
              aria-label={`Show ${value.name} on map`}
            >
              Show on map <span aria-hidden="true">↗</span>
            </button>
          </div>
        ) : corridor && kind !== "address" ? (
          "Suggestions within 5 miles of the direct route."
        ) : null}
      </div>
      {kind === "fuel" && (
        <p className="text-xs text-slate-500">
          Fuel results may include ordinary gas stations. Confirm diesel and
          semi-truck access.
        </p>
      )}
      {kind === "yard" && (
        <p className="text-xs text-slate-500">
          Terminal search results; yard coverage and gate access are not
          verified.
        </p>
      )}
    </div>
  );
}
