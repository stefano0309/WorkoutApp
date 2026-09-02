package com.example.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.health.connect.HealthConnectManager;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.ExerciseRoute;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.ExerciseSessionType;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.WeightRecord;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Real Health Connect importer for Android 14+ platform Health Connect APIs.
 * Imports weight, steps, sleep sessions/stages, exercise sessions and embedded routes.
 * Exercise routes which require explicit user consent can be requested through requestExerciseRoute().
 */
public final class HealthConnectBridge {
    private static final String PREFS = "health_connect_cache";
    private static final String SUMMARY_KEY = "summary";
    private static final int PERMISSION_REQUEST = 7401;
    private static final int ROUTE_REQUEST = 7402;
    private static final long DEFAULT_LOOKBACK_DAYS = 30;

    private final Activity activity;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile String pendingRouteSessionId;

    public HealthConnectBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void requestHealthPermissions() {
        if (Build.VERSION.SDK_INT < 34) return;
        activity.requestPermissions(new String[]{
                "android.permission.health.READ_WEIGHT",
                "android.permission.health.READ_STEPS",
                "android.permission.health.READ_SLEEP",
                "android.permission.health.READ_EXERCISE",
                "android.permission.health.READ_EXERCISE_ROUTES",
                "android.permission.health.READ_HEART_RATE"
        }, PERMISSION_REQUEST);
    }

    @JavascriptInterface
    public String readHealthSummary() {
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(SUMMARY_KEY, null);
    }

    @JavascriptInterface
    public String getHealthCapabilities() {
        JSONObject result = new JSONObject();
        try {
            result.put("supported", Build.VERSION.SDK_INT >= 34);
            result.put("routePermission", Build.VERSION.SDK_INT >= 35 &&
                    activity.checkSelfPermission("android.permission.health.READ_EXERCISE_ROUTES") == android.content.pm.PackageManager.PERMISSION_GRANTED);
            result.put("readExercise", Build.VERSION.SDK_INT >= 34 &&
                    activity.checkSelfPermission("android.permission.health.READ_EXERCISE") == android.content.pm.PackageManager.PERMISSION_GRANTED);
            result.put("readSleep", Build.VERSION.SDK_INT >= 34 &&
                    activity.checkSelfPermission("android.permission.health.READ_SLEEP") == android.content.pm.PackageManager.PERMISSION_GRANTED);
        } catch (Throwable ignored) {
        }
        return result.toString();
    }

    @JavascriptInterface
    public void syncHealthConnect() {
        syncHealthConnect(DEFAULT_LOOKBACK_DAYS);
    }

    @JavascriptInterface
    public void syncHealthConnectDays(int days) {
        syncHealthConnect(Math.max(1, Math.min(365, days)));
    }

    private void syncHealthConnect(long lookbackDays) {
        if (Build.VERSION.SDK_INT < 34) return;
        executor.execute(() -> {
            try {
                HealthConnectManager manager = activity.getSystemService(HealthConnectManager.class);
                if (manager == null) return;

                Instant end = Instant.now();
                Instant start = end.minus(Duration.ofDays(lookbackDays));
                TimeInstantRangeFilter range = new TimeInstantRangeFilter.Builder()
                        .setStartTime(start)
                        .setEndTime(end)
                        .build();

                JSONObject result = readCachedSummary();
                result.put("importedAt", end.toString());
                result.put("source", "Health Connect");
                result.put("lookbackDays", lookbackDays);
                result.put("steps", readStepsAggregate(manager, range));
                Double weight = readLatestWeight(manager, range);
                if (weight != null) result.put("weightKg", weight);

                List<SleepSessionRecord> sleepRecords = readAllRecords(manager, SleepSessionRecord.class, range);
                JSONArray sleepSessions = new JSONArray();
                for (SleepSessionRecord record : sleepRecords) {
                    sleepSessions.put(serializeSleep(record));
                }
                result.put("sleepSessions", sleepSessions);
                result.put("sleepMinutes", totalSleepMinutes(sleepRecords));
                JSONObject latestSleep = latestSleep(sleepRecords);
                if (latestSleep != null) result.put("lastSleep", latestSleep);

                List<ExerciseSessionRecord> exerciseRecords = readAllRecords(manager, ExerciseSessionRecord.class, range);
                JSONArray sessions = new JSONArray();
                JSONArray runningSessions = new JSONArray();
                for (ExerciseSessionRecord record : exerciseRecords) {
                    JSONObject serialized = serializeExercise(record);
                    sessions.put(serialized);
                    if (isRunning(record)) runningSessions.put(serialized);
                }
                result.put("exerciseSessions", sessions);
                result.put("runningSessions", runningSessions);
                result.put("exerciseCount", exerciseRecords.size());

                persistAndDispatch(result);
            } catch (SecurityException securityException) {
                saveError("permission_denied", securityException.getMessage());
            } catch (Throwable error) {
                saveError("sync_failed", error.toString());
            }
        });
    }

    @JavascriptInterface
    public void requestExerciseRoute(String sessionId) {
        if (Build.VERSION.SDK_INT < 34 || sessionId == null || sessionId.trim().isEmpty()) return;
        activity.runOnUiThread(() -> {
            try {
                pendingRouteSessionId = sessionId;
                Intent intent = new Intent(HealthConnectManager.ACTION_REQUEST_EXERCISE_ROUTE);
                intent.putExtra(HealthConnectManager.EXTRA_SESSION_ID, sessionId);
                activity.startActivityForResult(intent, ROUTE_REQUEST);
            } catch (Throwable error) {
                saveError("route_request_failed", error.toString());
            }
        });
    }

    /** Called by MainActivity for the route consent result. */
    public void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != ROUTE_REQUEST || resultCode != Activity.RESULT_OK || data == null) return;
        if (Build.VERSION.SDK_INT < 34) return;
        try {
            ExerciseRoute route = data.getParcelableExtra(
                    HealthConnectManager.EXTRA_EXERCISE_ROUTE, ExerciseRoute.class);
            if (route == null) return;
            JSONObject routeJson = serializeRoute(route);
            routeJson.put("sessionId", pendingRouteSessionId);
            upsertRouteIntoCache(pendingRouteSessionId, routeJson);
            dispatchToWebView("health-connect-route", routeJson);
        } catch (Throwable error) {
            saveError("route_import_failed", error.toString());
        } finally {
            pendingRouteSessionId = null;
        }
    }

    private List<SleepSessionRecord> readAllSleep(HealthConnectManager manager, TimeInstantRangeFilter range) throws Exception {
        return readAllRecords(manager, SleepSessionRecord.class, range);
    }

    private <T extends android.health.connect.datatypes.Record> List<T> readAllRecords(
            HealthConnectManager manager, Class<T> recordType, TimeInstantRangeFilter range) throws Exception {
        List<T> all = new ArrayList<>();
        long token = -1;
        do {
            CountDownLatch latch = new CountDownLatch(1);
            List<T> page = new ArrayList<>();
            long[] next = new long[]{-1};
            Throwable[] error = new Throwable[]{null};

            ReadRecordsRequestUsingFilters.Builder<T> builder =
                    new ReadRecordsRequestUsingFilters.Builder<>(recordType)
                            .setTimeRangeFilter(range)
                            .setPageSize(5000);
            if (token >= 0) builder.setPageToken(token);
            if (token < 0) builder.setAscending(true);

            manager.readRecords(builder.build(), activity.getMainExecutor(),
                    new android.os.OutcomeReceiver<ReadRecordsResponse<T>, android.health.connect.HealthConnectException>() {
                        @Override public void onResult(ReadRecordsResponse<T> response) {
                            page.addAll(response.getRecords());
                            next[0] = response.getNextPageToken();
                            latch.countDown();
                        }

                        @Override public void onError(android.health.connect.HealthConnectException e) {
                            error[0] = e;
                            latch.countDown();
                        }
                    });

            if (!latch.await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Health Connect read timeout for " + recordType.getSimpleName());
            }
            if (error[0] != null) throw new Exception(error[0]);
            all.addAll(page);
            token = next[0];
        } while (token >= 0);
        return all;
    }

    private long readStepsAggregate(HealthConnectManager manager, TimeInstantRangeFilter range) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        long[] total = new long[]{0};
        Throwable[] error = new Throwable[]{null};
        android.health.connect.AggregateRecordsRequest<android.health.connect.datatypes.Record> request =
                new android.health.connect.AggregateRecordsRequest.Builder<android.health.connect.datatypes.Record>(range)
                        .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL)
                        .build();
        manager.aggregate(request, activity.getMainExecutor(),
                new android.os.OutcomeReceiver<android.health.connect.AggregateRecordsResponse<android.health.connect.datatypes.Record>, android.health.connect.HealthConnectException>() {
                    @Override public void onResult(android.health.connect.AggregateRecordsResponse<android.health.connect.datatypes.Record> response) {
                        Long value = response.get(StepsRecord.STEPS_COUNT_TOTAL);
                        total[0] = value == null ? 0 : value;
                        latch.countDown();
                    }
                    @Override public void onError(android.health.connect.HealthConnectException e) {
                        error[0] = e;
                        latch.countDown();
                    }
                });
        if (!latch.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("Steps aggregate timeout");
        if (error[0] != null) throw new Exception(error[0]);
        return total[0];
    }

    private Double readLatestWeight(HealthConnectManager manager, TimeInstantRangeFilter range) throws Exception {
        List<WeightRecord> records = readAllRecords(manager, WeightRecord.class, range);
        if (records.isEmpty()) return null;
        WeightRecord latest = records.get(records.size() - 1);
        return latest.getWeight().getInKilograms();
    }

    private JSONObject serializeSleep(SleepSessionRecord record) throws Exception {
        JSONObject json = new JSONObject();
        json.put("id", record.getMetadata().getId());
        json.put("start", record.getStartTime().toString());
        json.put("end", record.getEndTime().toString());
        json.put("durationMinutes", Duration.between(record.getStartTime(), record.getEndTime()).toMinutes());
        if (record.getTitle() != null) json.put("title", record.getTitle().toString());
        if (record.getNotes() != null) json.put("notes", record.getNotes().toString());
        JSONArray stages = new JSONArray();
        for (SleepSessionRecord.Stage stage : record.getStages()) {
            JSONObject s = new JSONObject();
            s.put("start", stage.getStartTime().toString());
            s.put("end", stage.getEndTime().toString());
            s.put("durationMinutes", Duration.between(stage.getStartTime(), stage.getEndTime()).toMinutes());
            s.put("type", stageTypeName(stage.getType()));
            s.put("typeCode", stage.getType());
            stages.put(s);
        }
        json.put("stages", stages);
        return json;
    }

    private JSONObject serializeExercise(ExerciseSessionRecord record) throws Exception {
        JSONObject json = new JSONObject();
        json.put("id", record.getMetadata().getId());
        json.put("start", record.getStartTime().toString());
        json.put("end", record.getEndTime().toString());
        json.put("durationMinutes", Duration.between(record.getStartTime(), record.getEndTime()).toMinutes());
        json.put("exerciseType", record.getExerciseType());
        json.put("exerciseTypeName", exerciseTypeName(record.getExerciseType()));
        json.put("hasRoute", record.hasRoute());
        if (record.getTitle() != null) json.put("title", record.getTitle().toString());
        if (record.getNotes() != null) json.put("notes", record.getNotes().toString());
        if (record.hasRateOfPerceivedExertion()) json.put("rpe", record.getRateOfPerceivedExertion());
        if (record.getRoute() != null) json.put("route", serializeRoute(record.getRoute()));
        else if (record.hasRoute()) json.put("routeStatus", routePermissionStatus());
        return json;
    }

    private JSONObject serializeRoute(ExerciseRoute route) throws Exception {
        JSONArray points = new JSONArray();
        List<ExerciseRoute.Location> locations = route.getRouteLocations();
        for (ExerciseRoute.Location point : locations) {
            JSONObject p = new JSONObject();
            p.put("time", point.getTime().toString());
            p.put("lat", point.getLatitude());
            p.put("lon", point.getLongitude());
            if (point.getAltitude() != null) p.put("altitudeM", point.getAltitude().getInMeters());
            if (point.getHorizontalAccuracy() != null) p.put("horizontalAccuracyM", point.getHorizontalAccuracy().getInMeters());
            if (point.getVerticalAccuracy() != null) p.put("verticalAccuracyM", point.getVerticalAccuracy().getInMeters());
            points.put(p);
        }

        JSONObject result = new JSONObject();
        result.put("points", points);
        result.put("pointCount", locations.size());
        result.put("distanceKm", calculateDistanceKm(locations));
        result.put("elevationGainM", calculateElevationGain(locations));
        return result;
    }

    private double calculateDistanceKm(List<ExerciseRoute.Location> points) {
        double meters = 0;
        for (int i = 1; i < points.size(); i++) {
            ExerciseRoute.Location a = points.get(i - 1);
            ExerciseRoute.Location b = points.get(i);
            meters += haversineMeters(a.getLatitude(), a.getLongitude(), b.getLatitude(), b.getLongitude());
        }
        return Math.round((meters / 1000d) * 1000d) / 1000d;
    }

    private double calculateElevationGain(List<ExerciseRoute.Location> points) {
        double gain = 0;
        Double previous = null;
        for (ExerciseRoute.Location point : points) {
            if (point.getAltitude() == null) continue;
            double altitude = point.getAltitude().getInMeters();
            if (previous != null && altitude > previous) gain += altitude - previous;
            previous = altitude;
        }
        return Math.round(gain * 10d) / 10d;
    }

    private double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        final double r = 6371000d;
        double p1 = Math.toRadians(lat1);
        double p2 = Math.toRadians(lat2);
        double dp = Math.toRadians(lat2 - lat1);
        double dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private boolean isRunning(ExerciseSessionRecord record) {
        return record.getExerciseType() == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING ||
                record.getExerciseType() == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL;
    }

    private long totalSleepMinutes(List<SleepSessionRecord> records) {
        long total = 0;
        for (SleepSessionRecord record : records) {
            total += Math.max(0, Duration.between(record.getStartTime(), record.getEndTime()).toMinutes());
        }
        return total;
    }

    private JSONObject latestSleep(List<SleepSessionRecord> records) throws Exception {
        if (records.isEmpty()) return null;
        SleepSessionRecord latest = records.get(records.size() - 1);
        return serializeSleep(latest);
    }

    private String stageTypeName(int type) {
        switch (type) {
            case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE: return "awake";
            case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING: return "sleeping";
            case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE_OUT_OF_BED: return "awake_out_of_bed";
            case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_LIGHT: return "light";
            case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_DEEP: return "deep";
            case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_REM: return "rem";
            case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE_IN_BED: return "awake_in_bed";
            default: return "unknown";
        }
    }

    private String exerciseTypeName(int type) {
        if (type == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING) return "running";
        if (type == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL) return "running_treadmill";
        if (type == ExerciseSessionType.EXERCISE_SESSION_TYPE_WALKING) return "walking";
        if (type == ExerciseSessionType.EXERCISE_SESSION_TYPE_CYCLING) return "cycling";
        if (type == ExerciseSessionType.EXERCISE_SESSION_TYPE_STRENGTH_TRAINING) return "strength_training";
        return "exercise_type_" + type;
    }

    private String routePermissionStatus() {
        if (Build.VERSION.SDK_INT < 35) return "request_session_route";
        int granted = activity.checkSelfPermission("android.permission.health.READ_EXERCISE_ROUTES");
        return granted == android.content.pm.PackageManager.PERMISSION_GRANTED ? "available" : "consent_required";
    }

    private JSONObject readCachedSummary() {
        try {
            String raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SUMMARY_KEY, null);
            return raw == null ? new JSONObject() : new JSONObject(raw);
        } catch (Throwable ignored) {
            return new JSONObject();
        }
    }

    private void persistAndDispatch(JSONObject result) {
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(SUMMARY_KEY, result.toString()).apply();
        dispatchToWebView("health-connect-sync", result);
    }

    private void saveError(String code, String message) {
        try {
            JSONObject result = readCachedSummary();
            result.put("error", code);
            result.put("errorMessage", message == null ? "" : message);
            result.put("errorAt", Instant.now().toString());
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(SUMMARY_KEY, result.toString()).apply();
            dispatchToWebView("health-connect-error", result);
        } catch (Throwable ignored) {
        }
    }

    private void dispatchToWebView(String eventName, JSONObject payload) {
        activity.runOnUiThread(() -> {
            try {
                String escaped = JSONObject.quote(payload.toString());
                String script = "window.dispatchEvent(new CustomEvent('" + eventName + "',{detail:JSON.parse(" + escaped + ")}));";
                if (activity instanceof MainActivity) {
                    ((MainActivity) activity).getBridge().getWebView().evaluateJavascript(script, null);
                }
            } catch (Throwable ignored) {
            }
        });
    }

    private void upsertRouteIntoCache(String sessionId, JSONObject route) {
        try {
            JSONObject summary = readCachedSummary();
            JSONArray sessions = summary.optJSONArray("exerciseSessions");
            if (sessions == null) return;
            for (int i = 0; i < sessions.length(); i++) {
                JSONObject session = sessions.optJSONObject(i);
                if (session != null && sessionId != null && sessionId.equals(session.optString("id"))) {
                    session.put("route", route);
                    session.put("routeStatus", "available");
                    break;
                }
            }
            JSONArray running = summary.optJSONArray("runningSessions");
            if (running != null) {
                for (int i = 0; i < running.length(); i++) {
                    JSONObject session = running.optJSONObject(i);
                    if (session != null && sessionId != null && sessionId.equals(session.optString("id"))) {
                        session.put("route", route);
                        session.put("routeStatus", "available");
                        break;
                    }
                }
            }
            persistAndDispatch(summary);
        } catch (Throwable ignored) {
        }
    }
}
