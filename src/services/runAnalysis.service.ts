export type RoutePoint = {
  latitude: number;
  longitude: number;
  elevation?: number | null;
  timestamp: string;
};

export type RunSample = {
  timestamp: string;
  distanceMeters?: number | null;
  heartRateBpm?: number | null;
  cadenceSpm?: number | null;
  elevationMeters?: number | null;
};

export type RunAnalysis = {
  distanceKm: number;
  durationSeconds: number;
  averagePaceMinPerKm: number | null;
  averageCadenceSpm: number | null;
  elevationGainMeters: number;
  splits: Array<{ km: number; paceMinPerKm: number | null; heartRateBpm: number | null }>;
};

const minutesPerKm = (distanceKm: number, durationSeconds: number): number | null => {
  if (distanceKm <= 0 || durationSeconds <= 0) return null;
  return (durationSeconds / 60) / distanceKm;
};

export function analyzeRun(samples: RunSample[], route: RoutePoint[] = []): RunAnalysis {
  const ordered = [...samples].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const first = ordered[0]?.timestamp ? new Date(ordered[0].timestamp).getTime() : 0;
  const last = ordered.length ? new Date(ordered[ordered.length - 1].timestamp).getTime() : 0;
  const durationSeconds = first && last ? Math.max(0, (last - first) / 1000) : 0;
  const distanceMeters = Math.max(...ordered.map((s) => Number(s.distanceMeters || 0)), 0);
  const cadence = ordered.map((s) => Number(s.cadenceSpm || 0)).filter((value) => Number.isFinite(value) && value > 0);

  let elevationGainMeters = 0;
  const elevations = route
    .map((p) => p.elevation)
    .filter((elevation): elevation is number => elevation !== null && elevation !== undefined && Number.isFinite(elevation));
  for (let i = 1; i < elevations.length; i += 1) {
    const delta = elevations[i] - elevations[i - 1];
    if (delta > 0) elevationGainMeters += delta;
  }

  const splits: RunAnalysis['splits'] = [];
  for (let km = 1; km <= Math.floor(distanceMeters / 1000); km += 1) {
    const previous = (km - 1) * 1000;
    const target = km * 1000;
    const end = ordered.find((s) => Number(s.distanceMeters || 0) >= target);
    const start = ordered.find((s) => Number(s.distanceMeters || 0) >= previous);
    const startMs = start ? new Date(start.timestamp).getTime() : null;
    const endMs = end ? new Date(end.timestamp).getTime() : null;
    const seconds = startMs !== null && endMs !== null ? Math.max(0, (endMs - startMs) / 1000) : 0;
    const hr = ordered
      .filter((s) => Number(s.distanceMeters || 0) > previous && Number(s.distanceMeters || 0) <= target)
      .map((s) => Number(s.heartRateBpm || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    splits.push({
      km,
      paceMinPerKm: seconds > 0 ? seconds / 60 : null,
      heartRateBpm: hr.length ? hr.reduce((sum, value) => sum + value, 0) / hr.length : null,
    });
  }

  return {
    distanceKm: Number((distanceMeters / 1000).toFixed(3)),
    durationSeconds,
    averagePaceMinPerKm: minutesPerKm(distanceMeters / 1000, durationSeconds),
    averageCadenceSpm: cadence.length ? cadence.reduce((sum, value) => sum + value, 0) / cadence.length : null,
    elevationGainMeters: Number(elevationGainMeters.toFixed(1)),
    splits,
  };
}
