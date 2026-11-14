import type { Coordinate, RouteGeometry } from "./route-types";

export function isSoCalCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const point = value as Coordinate;
  return Number.isFinite(point.longitude) && Number.isFinite(point.latitude)
    && point.longitude >= -120.7 && point.longitude <= -114.1
    && point.latitude >= 32.5 && point.latitude <= 35.8;
}

export function isRouteGeometry(value: unknown): value is RouteGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as RouteGeometry;
  return geometry.spatialReference?.wkid === 4326 && Array.isArray(geometry.paths)
    && geometry.paths.length > 0 && geometry.paths.length <= 20
    && geometry.paths.reduce((total, path) => total + (Array.isArray(path) ? path.length : 10001), 0) <= 10000
    && geometry.paths.every(path => Array.isArray(path) && path.length >= 2
      && path.every(point => Array.isArray(point) && point.length >= 2
        && isSoCalCoordinate({ longitude: point[0], latitude: point[1] })));
}

// Local equirectangular projection; suitable for discovery distances within SoCal.
// These are distances from a route, not driving detours.
function projected(point: Coordinate, latitude: number): [number, number] {
  return [point.longitude * 69.172 * Math.cos(latitude * Math.PI / 180), point.latitude * 69.0];
}

export function distanceFromRoute(point: Coordinate, geometry: RouteGeometry): number {
  const [px, py] = projected(point, point.latitude);
  let closest = Infinity;
  for (const path of geometry.paths) {
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = projected({ longitude: path[i - 1][0], latitude: path[i - 1][1] }, point.latitude);
      const [bx, by] = projected({ longitude: path[i][0], latitude: path[i][1] }, point.latitude);
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
      closest = Math.min(closest, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
  }
  return closest;
}

export function sampleRoute(geometry: RouteGeometry, fractions = [0, 0.5, 1]): Coordinate[] {
  const segments: { a: number[]; b: number[]; length: number }[] = [];
  let total = 0;
  for (const path of geometry.paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const [ax, ay] = projected({ longitude: a[0], latitude: a[1] }, (a[1] + b[1]) / 2);
      const [bx, by] = projected({ longitude: b[0], latitude: b[1] }, (a[1] + b[1]) / 2);
      const length = Math.hypot(bx - ax, by - ay);
      segments.push({ a, b, length });
      total += length;
    }
  }
  return fractions.map(fraction => {
    let remaining = total * fraction;
    for (const segment of segments) {
      if (remaining <= segment.length) {
        const t = segment.length ? remaining / segment.length : 0;
        return { longitude: segment.a[0] + t * (segment.b[0] - segment.a[0]), latitude: segment.a[1] + t * (segment.b[1] - segment.a[1]) };
      }
      remaining -= segment.length;
    }
    const last = segments[segments.length - 1].b;
    return { longitude: last[0], latitude: last[1] };
  });
}
