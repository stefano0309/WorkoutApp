(() => {
  'use strict';
  if (window.HTSHealthModels) return;

  const finiteNumber = (value, fallback = null) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const normalizeRoutePoint = (point = {}) => ({
    time: point.time ?? null,
    lat: finiteNumber(point.lat),
    lon: finiteNumber(point.lon),
    altitudeM: finiteNumber(point.altitudeM),
    horizontalAccuracyM: finiteNumber(point.horizontalAccuracyM),
    verticalAccuracyM: finiteNumber(point.verticalAccuracyM),
  });

  const normalizeExerciseRoute = (route = null) => {
    if (!route || typeof route !== 'object') return null;
    const points = Array.isArray(route.points) ? route.points.map(normalizeRoutePoint) : [];
    return {
      sessionId: route.sessionId ?? null,
      points,
      pointCount: finiteNumber(route.pointCount, points.length),
      distanceKm: finiteNumber(route.distanceKm, 0),
      // Missing elevation is semantically different from zero elevation.
      elevationGainM: finiteNumber(route.elevationGainM),
      receivedAt: route.receivedAt ?? null,
      importedAt: route.importedAt ?? null,
    };
  };

  const normalizeSleepStage = (stage = {}) => ({
    start: stage.start ?? null,
    end: stage.end ?? null,
    durationMinutes: finiteNumber(stage.durationMinutes, 0),
    type: finiteNumber(stage.type),
  });

  const normalizeSleepSession = (session = {}) => ({
    id: session.id ?? null,
    start: session.start ?? null,
    end: session.end ?? null,
    durationMinutes: finiteNumber(session.durationMinutes, 0),
    stages: Array.isArray(session.stages) ? session.stages.map(normalizeSleepStage) : [],
  });

  const normalizeExerciseSession = (session = {}) => ({
    id: session.id ?? null,
    start: session.start ?? null,
    end: session.end ?? null,
    durationMinutes: finiteNumber(session.durationMinutes, 0),
    exerciseType: finiteNumber(session.exerciseType),
    exerciseTypeName: session.exerciseTypeName ?? null,
    title: session.title ?? null,
    notes: session.notes ?? null,
    hasRoute: Boolean(session.hasRoute),
    routeStatus: session.routeStatus ?? 'none',
    route: normalizeExerciseRoute(session.route),
  });

  const normalizeHeartRateSample = (sample = {}) => ({
    time: sample.time ?? null,
    bpm: finiteNumber(sample.bpm),
  });

  const normalizeHealthSummary = (summary = {}) => {
    if (!summary || typeof summary !== 'object') return null;
    const exerciseSessions = Array.isArray(summary.exerciseSessions) ? summary.exerciseSessions.map(normalizeExerciseSession) : [];
    const runningSessions = Array.isArray(summary.runningSessions) ? summary.runningSessions.map(normalizeExerciseSession) : [];
    const sleepSessions = Array.isArray(summary.sleepSessions) ? summary.sleepSessions.map(normalizeSleepSession) : [];
    const heartRateSamples = Array.isArray(summary.heartRateSamples) ? summary.heartRateSamples.map(normalizeHeartRateSample) : [];
    return {
      importedAt: summary.importedAt ?? null,
      source: summary.source ?? null,
      lookbackDays: finiteNumber(summary.lookbackDays),
      start: summary.start ?? null,
      end: summary.end ?? null,
      steps: finiteNumber(summary.steps, 0),
      weightKg: finiteNumber(summary.weightKg),
      sleepMinutes: finiteNumber(summary.sleepMinutes, 0),
      sleepCount: finiteNumber(summary.sleepCount, sleepSessions.length),
      lastSleep: summary.lastSleep ? normalizeSleepSession(summary.lastSleep) : null,
      exerciseSessions,
      runningSessions,
      exerciseCount: finiteNumber(summary.exerciseCount, exerciseSessions.length),
      heartRateSamples,
      heartRateSampleCount: finiteNumber(summary.heartRateSampleCount, heartRateSamples.length),
    };
  };

  window.HTSHealthModels = Object.freeze({
    normalizeExerciseRoute,
    normalizeExerciseSession,
    normalizeHeartRateSample,
    normalizeHealthSummary,
    normalizeSleepSession,
    normalizeSleepStage,
  });
})();
