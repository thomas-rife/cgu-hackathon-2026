export type ScreenStop = { id: string; sequence: number; x: number; y: number };

// Fan out close/coincident labels while retaining their true geographic anchors.
export function layoutStopMarkers(points: ScreenStop[], width: number, height: number, left = 0, top = 0) {
  const placed: { x: number; y: number }[] = [];
  return points.map(point => {
    const candidates: { x: number; y: number }[] = [{ x: point.x, y: point.y }];
    for (let radius = 36; radius <= 180; radius += 36) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) candidates.push({ x: point.x + dx * radius, y: point.y + dy * radius });
    }
    const label = candidates.find(candidate => candidate.x >= left + 18 && candidate.x <= width - 18 && candidate.y >= top + 18 && candidate.y <= height - 28
      && placed.every(other => Math.hypot(other.x - candidate.x, other.y - candidate.y) >= 34))
      || { x: Math.max(left + 18, Math.min(width - 18, point.x)), y: Math.max(top + 18, Math.min(height - 28, point.y)) };
    placed.push(label);
    return { ...point, labelX: label.x, labelY: label.y };
  });
}
