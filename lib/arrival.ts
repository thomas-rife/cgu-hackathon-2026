// Search forward solves instead of reversing the stops (which would change
// one-way roads and traffic). Return a verified on-time, whole-minute departure.
export async function estimateArrivalDeparture<T extends { minutes: number }>(
  deadline: number,
  initialDuration: number,
  solve: (departure: number) => Promise<T>,
) {
  let early = deadline - 1440;
  let late = deadline;
  let candidate = Math.max(early, Math.min(late - 1, Math.floor(deadline - initialDuration)));
  let best: { departure: number; result: T } | undefined;
  for (let iteration = 0; iteration < 18; iteration++) {
    const result = await solve(candidate);
    if (candidate + result.minutes <= deadline) {
      best = { departure: candidate, result };
      early = candidate;
    } else late = candidate;
    if (best && late - early <= 1) return best;
    if (late - early <= 1) break;
    const prediction = Math.floor(deadline - result.minutes);
    candidate = iteration < 4 && prediction > early && prediction < late
      ? prediction
      : iteration < 4 && best && candidate === early && deadline - candidate - result.minutes < 1
        ? early + 1 // Verify the next minute before searching a much wider interval.
        : Math.floor((early + late) / 2);
  }
  throw new Error("An on-time departure within the previous 24 hours could not be confirmed. Try another arrival time.");
}
