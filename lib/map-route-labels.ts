export type ScreenPoint = { x: number; y: number };
export type RouteLabel = ScreenPoint & { id: string; anchorX: number; anchorY: number };
type Bounds = { left: number; right: number; top: number; bottom: number };
export const ROUTE_LABEL_WIDTH = 190;
export const ROUTE_LABEL_HEIGHT = 56;
const halfWidth = ROUTE_LABEL_WIDTH / 2;
const halfHeight = ROUTE_LABEL_HEIGHT / 2;

// Clip a line segment to an expanded label rectangle, including route stroke clearance.
export function segmentHitsLabel(a: ScreenPoint, b: ScreenPoint, label: ScreenPoint, clearance = 8) {
  const left = label.x - halfWidth - clearance, right = label.x + halfWidth + clearance;
  const top = label.y - halfHeight - clearance, bottom = label.y + halfHeight + clearance;
  if (Math.max(a.x, b.x) < left || Math.min(a.x, b.x) > right || Math.max(a.y, b.y) < top || Math.min(a.y, b.y) > bottom) return false;
  let lo = 0, hi = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy], q = [a.x - left, right - a.x, a.y - top, bottom - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
      if (lo > hi) return false;
    }
  }
  return true;
}
export function labelsOverlap(a: ScreenPoint, b: ScreenPoint) {
  return Math.abs(a.x - b.x) < ROUTE_LABEL_WIDTH + 12 && Math.abs(a.y - b.y) < ROUTE_LABEL_HEIGHT + 12;
}

export function layoutRouteLabels(candidates: { id: string; anchors: (ScreenPoint & { distinctness: number })[] }[], paths: ScreenPoint[][], bounds: Bounds): RouteLabel[] {
  const segments = paths.flatMap(path => path.slice(1).map((point, i) => [path[i], point] as const));
  const left = bounds.left + halfWidth + 8, right = Math.max(left, bounds.right - halfWidth - 8);
  const top = bounds.top + halfHeight + 8, bottom = Math.max(top, bounds.bottom - halfHeight - 8);
  const grid: ScreenPoint[] = [];
  for (let x = left; x <= right + 1; x += 32) for (let y = top; y <= bottom + 1; y += 24) grid.push({ x, y });
  // Include the far edge even when the grid spacing does not divide the viewport.
  for (let y = top; y <= bottom + 1; y += 24) grid.push({ x: right, y });
  const routeCosts = new Map<string, number>();
  const routeCost = (point: ScreenPoint) => {
    const key = `${point.x}:${point.y}`;
    if (!routeCosts.has(key)) routeCosts.set(key, segments.reduce((count, [a, b]) => count + Number(segmentHitsLabel(a, b, point)), 0));
    return routeCosts.get(key)!;
  };
  const options = candidates.map(candidate => {
    const positions = [...grid, ...candidate.anchors.flatMap(anchor => [-170, -115, 0, 115, 170].flatMap(dx => [-115, -75, 75, 115].map(dy => ({
      x: Math.max(left, Math.min(right, anchor.x + dx)), y: Math.max(top, Math.min(bottom, anchor.y + dy)),
    }))))];
    return positions.map(point => {
      const anchor = candidate.anchors.reduce<(ScreenPoint & { distinctness: number }) | null>((best, next) => !best || Math.hypot(point.x - next.x, point.y - next.y) - Math.min(next.distinctness, 3) * 8 < Math.hypot(point.x - best.x, point.y - best.y) - Math.min(best.distinctness, 3) * 8 ? next : best, null);
      if (!anchor) return null;
      const routeHits = routeCost(point);
      return { id: candidate.id, ...point, anchorX: anchor.x, anchorY: anchor.y, score: (routeHits ? 100000 + routeHits * 10 : 0) + Math.hypot(point.x - anchor.x, point.y - anchor.y) };
    }).filter(option => option !== null).sort((a, b) => a.score - b.score);
  });
  const result: RouteLabel[] = [];
  for (const choices of options) {
    const best = choices.reduce<typeof choices[number] | null>((best, option) => {
      const score = option.score + result.filter(other => labelsOverlap(option, other)).length * 1000000;
      const bestScore = best ? best.score + result.filter(other => labelsOverlap(best, other)).length * 1000000 : Infinity;
      return score < bestScore ? option : best;
    }, null);
    if (best) result.push(best);
  }
  // Relax the greedy placements so a later label cannot trap an earlier one.
  for (let pass = 0; pass < 2; pass++) for (const choices of options) {
    const index = result.findIndex(label => label.id === choices[0]?.id);
    if (index < 0) continue;
    const others = result.filter((_, i) => i !== index);
    const best = choices.reduce((best, option) => option.score + others.filter(other => labelsOverlap(option, other)).length * 1000000 < best.score + others.filter(other => labelsOverlap(best, other)).length * 1000000 ? option : best);
    result[index] = best;
  }
  // A regular packing provides an escape from local minima, especially when
  // Show all adds six labels to a narrow map. Every slot is disjoint by design.
  const quality = (labels: RouteLabel[]) => labels.reduce((total, label, i) => total +
    labels.slice(i + 1).filter(other => labelsOverlap(label, other)).length * 1000000 +
    (routeCost(label) ? 100000 + routeCost(label) * 10 : 0) + Math.hypot(label.x - label.anchorX, label.y - label.anchorY), 0);
  let bestLayout = result;
  const columns = Math.floor((right - left) / (ROUTE_LABEL_WIDTH + 12)) + 1;
  const rows = Math.floor((bottom - top) / (ROUTE_LABEL_HEIGHT + 12)) + 1;
  if (columns * rows >= result.length) for (const fx of [0, .5, 1]) for (const fy of [0, .5, 1]) {
    const slots = Array.from({ length: columns * rows }, (_, i) => ({
      x: left + (i % columns) * (ROUTE_LABEL_WIDTH + 12) + fx * (right - left - (columns - 1) * (ROUTE_LABEL_WIDTH + 12)),
      y: top + Math.floor(i / columns) * (ROUTE_LABEL_HEIGHT + 12) + fy * (bottom - top - (rows - 1) * (ROUTE_LABEL_HEIGHT + 12)),
    }));
    const packed: RouteLabel[] = [];
    for (const candidate of candidates.filter(item => item.anchors.length)) {
      const placements = slots.map((slot, index) => {
        const anchor = candidate.anchors.reduce((best, next) => Math.hypot(slot.x - next.x, slot.y - next.y) < Math.hypot(slot.x - best.x, slot.y - best.y) ? next : best);
        return { index, label: { id: candidate.id, ...slot, anchorX: anchor.x, anchorY: anchor.y } };
      }).sort((a, b) => quality([a.label]) - quality([b.label]));
      const chosen = placements[0];
      if (chosen) { packed.push(chosen.label); slots.splice(chosen.index, 1); }
    }
    if (packed.length === result.length && quality(packed) < quality(bestLayout)) bestLayout = packed;
  }
  return bestLayout.map(({ id, x, y, anchorX, anchorY }) => ({ id, x, y, anchorX, anchorY }));
}
