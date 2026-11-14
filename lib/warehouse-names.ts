import type { Coordinate, RouteLocation } from "./route-types";

const DEMO_NAMES = ["Cedar", "Juniper", "Aspen", "Willow", "Maple", "Alder", "Birch", "Cypress"];

// Coordinate-based aliases stay consistent across search areas and stop pickers.
export function warehouseDemoName(location: Coordinate): string {
  const coordinates = `${location.longitude.toFixed(6)},${location.latitude.toFixed(6)}`;
  let hash = 2166136261;
  for (const character of coordinates) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return `${DEMO_NAMES[hash % DEMO_NAMES.length]} Warehouse ${hash.toString(36).toUpperCase()}`;
}

export function withWarehouseDemoName(location: RouteLocation): RouteLocation {
  return location.kind === "warehouse" ? { ...location, name: warehouseDemoName(location) } : location;
}
