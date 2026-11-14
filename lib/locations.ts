import type { Coordinate, PlaceKind, RouteLocation } from "./route-types";

// Representative port access points, not verified terminal/loading gates.
export const PORTS: RouteLocation[] = [
  {
    id: "long-beach",
    name: "Port of Long Beach",
    address: "Long Beach / Los Angeles port complex",
    kind: "port",
    longitude: -118.2167,
    latitude: 33.7542,
  },
  {
    id: "los-angeles",
    name: "Port of Los Angeles",
    address: "San Pedro, Los Angeles",
    kind: "port",
    longitude: -118.2716,
    latitude: 33.7405,
  },
  {
    id: "san-diego",
    name: "Port of San Diego",
    address: "Tenth Avenue Marine Terminal area",
    kind: "port",
    longitude: -117.1484,
    latitude: 32.6965,
  },
  {
    id: "hueneme",
    name: "Port of Hueneme",
    address: "Port Hueneme, Ventura County",
    kind: "port",
    longitude: -119.2047,
    latitude: 34.1478,
  },
];

export const DESTINATION_AREAS: (Coordinate & { id: string; name: string })[] =
  [
    {
      id: "ontario",
      name: "Ontario / Rancho Cucamonga",
      longitude: -117.5931,
      latitude: 34.0633,
    },
    { id: "fontana", name: "Fontana", longitude: -117.435, latitude: 34.08 },
    {
      id: "riverside",
      name: "Riverside / Corona",
      longitude: -117.394,
      latitude: 33.95,
    },
    {
      id: "moreno-valley",
      name: "Moreno Valley / Perris",
      longitude: -117.23,
      latitude: 33.9,
    },
    {
      id: "los-angeles",
      name: "Los Angeles",
      longitude: -118.15,
      latitude: 34.0,
    },
    {
      id: "long-beach",
      name: "Long Beach",
      longitude: -118.22,
      latitude: 33.82,
    },
    {
      id: "orange-county",
      name: "Orange County",
      longitude: -117.88,
      latitude: 33.8,
    },
    { id: "san-diego", name: "San Diego", longitude: -116.96, latitude: 32.56 },
    { id: "ventura", name: "Ventura", longitude: -119.18, latitude: 34.2 },
  ];

export const PLACE_KINDS: { value: PlaceKind; label: string }[] = [
  { value: "warehouse", label: "Warehouse" },
  { value: "yard", label: "Container yard / terminal" },
  { value: "fuel", label: "Truck stop / fuel" },
  { value: "address", label: "Custom address" },
];
