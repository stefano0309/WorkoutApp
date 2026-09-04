package com.example.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
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
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

public final class HealthConnectBridge {
    private static final String PREFS = "health_connect_cache";
    private static final String SUMMARY_KEY = "summary";
    private static final int ROUTE_REQUEST = 7402;
    private static final long DEFAULT_LOOKBACK_DAYS = 30;

    private final Activity activity;
    private volatile String pendingRouteSessionId;

    public HealthConnectBridge(Activity activity) { this.activity = activity; }

    @JavascriptInterface
    public void requestHealthPermissions() {
        if (Build.VERSION.SDK_INT < 34) {
            saveError("unsupported", "Health Connect rich APIs require Android 14+.");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(HealthConnectManager.ACTION_MANAGE_HEALTH_PERMISSIONS);
                intent.putExtra(Intent.EXTRA_PACKAGE_NAME, activity.getPackageName());
                activity.startActivity(intent);
            } catch (Throwable e) {
                saveError("permission_screen_failed", e.toString());
            }
        });
    }

    @JavascriptInterface
    public String readHealthSummary() {
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SUMMARY_KEY, null);
    }

    @JavascriptInterface
    public String getHealthCapabilities() {
        JSONObject result = new JSONObject();
        try {
            HealthConnectManager manager = Build.VERSION.SDK_INT >= 34
                    ? activity.getSystemService(HealthConnectManager.class) : null;
            result.put("supported", manager != null);
            result.put("permissionManagement", manager != null ? "system_settings" : "unsupported");
            result.put("readExercise", manager != null);
            result.put("readSleep", manager != null);
            result.put("routePermission", Build.VERSION.SDK_INT >= 35 ? "consent_required" : "session_consent");
        } catch (Throwable e) {
            try { result.put("supported", false); } catch (Exception ignored) { }
        }
        return result.toString();
    }

    @JavascriptInterface public void syncHealthConnect() { syncHealthConnect(DEFAULT_LOOKBACK_DAYS); }

    @JavascriptInterface
    public void syncHealthConnectDays(int days) {
        syncHealthConnect(Math.max(1, Math.min(365, days)));
    }

    private void syncHealthConnect(long lookbackDays) {
        if (Build.VERSION.SDK_INT < 34) {
            saveError("unsupported", "Health Connect rich APIs require Android 14+.");
            return;
        }

        HealthConnectManager manager = activity.getSystemService(HealthConnectManager.class);
        if (manager == null) {
            saveError("unavailable", "Health Connect manager non disponibile.");
            return;
        }

        Executor callbackExecutor = activity.getMainExecutor();
        Executor worker = command -> {
            Thread thread = new Thread(command, "HTS-HealthConnect");
            thread.setDaemon(true);
            thread.start();
        };

        Instant end = Instant.now();
        TimeInstantRangeFilter range = new TimeInstantRangeFilter.Builder()
                .setStartTime(end.minus(Duration.ofDays(lookbackDays)))
                .setEndTime(end)
                .build();
        JSONObject result = readCachedSummary();
        put(result, "importedAt", end.toString());
        put(result, "source", "Health Connect");
        put(result, "lookbackDays", lookbackDays);

        readStepsAsync(manager, range, callbackExecutor)
                .thenApplyAsync(steps -> { put(result, "steps", steps); return result; }, worker)
                .thenComposeAsync(r -> readLatestWeightAsync(manager, range, callbackExecutor, worker)
                        .thenApply(weight -> { if (weight != null) put(result, "weightKg", weight); return result; }), worker)
                .thenComposeAsync(r -> readAllRecordsAsync(manager, SleepSessionRecord.class, range, callbackExecutor, worker)
                        .thenApply(sleeps -> { serializeSleeps(result, sleeps); return result; }), worker)
                .thenComposeAsync(r -> readAllRecordsAsync(manager, ExerciseSessionRecord.class, range, callbackExecutor, worker)
                        .thenApply(exercises -> { serializeExercises(result, exercises); return result; }), worker)
                .thenAcceptAsync(this::persistAndDispatch, worker)
                .exceptionally(error -> {
                    Throwable cause = error instanceof java.util.concurrent.CompletionException && error.getCause() != null ? error.getCause() : error;
                    saveError(cause instanceof SecurityException ? "permission_denied" : "sync_failed", cause.toString());
                    return null;
                });
    }

    private CompletableFuture<Long> readStepsAsync(HealthConnectManager manager, TimeInstantRangeFilter range, Executor callbackExecutor) {
        CompletableFuture<Long> future = new CompletableFuture<>();
        AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(range)
                .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL).build();
        try {
            manager.aggregate(request, callbackExecutor, new android.os.OutcomeReceiver<AggregateRecordsResponse<Long>, android.health.connect.HealthConnectException>() {
                @Override public void onResult(AggregateRecordsResponse<Long> response) {
                    Long value = response.get(StepsRecord.STEPS_COUNT_TOTAL);
                    future.complete(value == null ? 0L : value);
                }
                @Override public void onError(android.health.connect.HealthConnectException error) { future.completeExceptionally(error); }
            });
        } catch (Throwable e) { future.completeExceptionally(e); }
        return future;
    }

    private <T extends android.health.connect.datatypes.Record> CompletableFuture<List<T>> readAllRecordsAsync(
            HealthConnectManager manager, Class<T> type, TimeInstantRangeFilter range,
            Executor callbackExecutor, Executor worker) {
        return readPageAsync(manager, type, range, -1L, callbackExecutor)
                .thenComposeAsync(first -> collectRemaining(manager, type, range, first, new ArrayList<>(), callbackExecutor, worker), worker);
    }

    private <T extends android.health.connect.datatypes.Record> CompletableFuture<List<T>> collectRemaining(
            HealthConnectManager manager, Class<T> type, TimeInstantRangeFilter range,
            ReadRecordsResponse<T> response, List<T> result, Executor callbackExecutor, Executor worker) {
        result.addAll(response.getRecords());
        long next = response.getNextPageToken();
        if (next < 0L) return CompletableFuture.completedFuture(result);
        return readPageAsync(manager, type, range, next, callbackExecutor)
                .thenComposeAsync(page -> collectRemaining(manager, type, range, page, result, callbackExecutor, worker), worker);
    }

    private <T extends android.health.connect.datatypes.Record> CompletableFuture<ReadRecordsResponse<T>> readPageAsync(
            HealthConnectManager manager, Class<T> type, TimeInstantRangeFilter range,
            long token, Executor callbackExecutor) {
        CompletableFuture<ReadRecordsResponse<T>> future = new CompletableFuture<>();
        try {
            ReadRecordsRequestUsingFilters.Builder<T> builder = new ReadRecordsRequestUsingFilters.Builder<>(type)
                    .setTimeRangeFilter(range).setPageSize(5000);
            if (token >= 0L) builder.setPageToken(token); else builder.setAscending(true);
            manager.readRecords(builder.build(), callbackExecutor, new android.os.OutcomeReceiver<ReadRecordsResponse<T>, android.health.connect.HealthConnectException>() {
                @Override public void onResult(ReadRecordsResponse<T> response) { future.complete(response); }
                @Override public void onError(android.health.connect.HealthConnectException error) { future.completeExceptionally(error); }
            });
        } catch (Throwable e) { future.completeExceptionally(e); }
        return future;
    }

    private CompletableFuture<Double> readLatestWeightAsync(
            HealthConnectManager manager, TimeInstantRangeFilter range,
            Executor callbackExecutor, Executor worker) {
        return readAllRecordsAsync(manager, WeightRecord.class, range, callbackExecutor, worker)
                .thenApplyAsync(records -> records.isEmpty() ? null : records.get(records.size() - 1).getWeight().getInGrams() / 1000.0d, worker);
    }

    @JavascriptInterface
    public void requestExerciseRoute(String sessionId) {
        if (Build.VERSION.SDK_INT < 34 || sessionId == null || sessionId.trim().isEmpty()) {
            saveError("invalid_route_request", "Sessione exercise non valida.");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                pendingRouteSessionId = sessionId.trim();
                Intent intent = new Intent(HealthConnectManager.ACTION_REQUEST_EXERCISE_ROUTE)
                        .putExtra(HealthConnectManager.EXTRA_SESSION_ID, pendingRouteSessionId);
                activity.startActivityForResult(intent, ROUTE_REQUEST);
            } catch (Throwable e) {
                pendingRouteSessionId = null;
                saveError("route_request_failed", e.toString());
            }
        });
    }

    public void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != ROUTE_REQUEST) return;
        String sessionId = pendingRouteSessionId;
        pendingRouteSessionId = null;
        if (resultCode != Activity.RESULT_OK || data == null || Build.VERSION.SDK_INT < 34 || sessionId == null) return;
        try {
            ExerciseRoute route = data.getParcelableExtra(HealthConnectManager.EXTRA_EXERCISE_ROUTE, ExerciseRoute.class);
            if (route == null) { saveError("route_empty", "Nessun percorso restituito da Health Connect."); return; }
            JSONObject json = serializeRoute(route);
            json.put("sessionId", sessionId);
            upsertRouteIntoCache(sessionId, json);
            dispatchToWebView("health-connect-route", json);
        } catch (Throwable e) { saveError("route_import_failed", e.toString()); }
    }

    private void serializeSleeps(JSONObject result, List<SleepSessionRecord> sleeps) {
        JSONArray array = new JSONArray();
        long total = 0L;
        for (SleepSessionRecord record : sleeps) {
            try { array.put(serializeSleep(record)); total += Math.max(0L, Duration.between(record.getStartTime(), record.getEndTime()).toMinutes()); }
            catch (Exception e) { saveError("sleep_serialize_failed", e.toString()); }
        }
        put(result, "sleepSessions", array);
        put(result, "sleepMinutes", total);
        if (!sleeps.isEmpty()) try { put(result, "lastSleep", serializeSleep(sleeps.get(sleeps.size() - 1))); } catch (Exception ignored) { }
    }

    private void serializeExercises(JSONObject result, List<ExerciseSessionRecord> exercises) {
        JSONArray all = new JSONArray();
        JSONArray running = new JSONArray();
        for (ExerciseSessionRecord record : exercises) {
            try {
                JSONObject json = serializeExercise(record);
                all.put(json);
                if (isRunning(record)) running.put(json);
            } catch (Exception e) { saveError("exercise_serialize_failed", e.toString()); }
        }
        put(result, "exerciseSessions", all);
        put(result, "runningSessions", running);
        put(result, "exerciseCount", exercises.size());
    }

    private JSONObject serializeSleep(SleepSessionRecord record) throws Exception {
        JSONObject json = new JSONObject();
        json.put("id", record.getMetadata().getId());
        json.put("start", record.getStartTime().toString());
        json.put("end", record.getEndTime().toString());
        json.put("durationMinutes", Duration.between(record.getStartTime(), record.getEndTime()).toMinutes());
        if (record.getTitle() != null) json.put("title", record.getTitle());
        if (record.getNotes() != null) json.put("notes", record.getNotes());
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
        if (record.getTitle() != null) json.put("title", record.getTitle());
        if (record.getNotes() != null) json.put("notes", record.getNotes());
        if (record.hasRoute()) json.put("routeStatus", routePermissionStatus());
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
        result.put("distanceKm", Math.round(calculateDistanceKm(locations) * 100d) / 100d);
        result.put("elevationGainM", Math.round(calculateElevationGain(locations) * 10d) / 10d);
        return result;
    }

    private double calculateDistanceKm(List<ExerciseRoute.Location> points) {
        double meters = 0d;
        for (int i = 1; i < points.size(); i++) {
            ExerciseRoute.Location a = points.get(i - 1), b = points.get(i);
            meters += haversineMeters(a.getLatitude(), a.getLongitude(), b.getLatitude(), b.getLongitude());
        }
        return meters / 1000d;
    }

    private double calculateElevationGain(List<ExerciseRoute.Location> points) {
        double gain = 0d; Double previous = null;
        for (ExerciseRoute.Location point : points) {
            if (point.getAltitude() == null) continue;
            double current = point.getAltitude().getInMeters();
            if (previous != null && current > previous) gain += current - previous;
            previous = current;
        }
        return gain;
    }

    private double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        final double r = 6371000d;
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = Math.toRadians(lat2 - lat1), dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private boolean isRunning(ExerciseSessionRecord record) {
        int type = record.getExerciseType();
        return type == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING
                || type == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL;
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
        if (type == ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING) return "cycling";
        if (type == ExerciseSessionType.EXERCISE_SESSION_TYPE_STRENGTH_TRAINING) return "strength_training";
        return "exercise_type_" + type;
    }

    private String routePermissionStatus() { return Build.VERSION.SDK_INT >= 35 ? "consent_required" : "session_consent"; }

    private JSONObject readCachedSummary() {
        try {
            String raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SUMMARY_KEY, null);
            return raw == null ? new JSONObject() : new JSONObject(raw);
        } catch (Throwable e) { return new JSONObject(); }
    }

    private void persistAndDispatch(JSONObject result) {
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SUMMARY_KEY, result.toString()).apply();
        dispatchToWebView("health-connect-sync", result);
    }

    private void upsertRouteIntoCache(String sessionId, JSONObject routeJson) {
        try {
            JSONObject summary = readCachedSummary();
            JSONArray routes = summary.optJSONArray("routes");
            if (routes == null) routes = new JSONArray();
            JSONArray updated = new JSONArray(); boolean replaced = false;
            for (int i = 0; i < routes.length(); i++) {
                JSONObject existing = routes.optJSONObject(i);
                if (existing != null && sessionId.equals(existing.optString("sessionId"))) { updated.put(routeJson); replaced = true; }
                else if (existing != null) updated.put(existing);
            }
            if (!replaced) updated.put(routeJson);
            summary.put("routes", updated);
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SUMMARY_KEY, summary.toString()).apply();
        } catch (Throwable ignored) { }
    }

    private void put(JSONObject object, String key, Object value) { try { object.put(key, value); } catch (Exception ignored) { } }

    private void saveError(String code, String message) {
        try {
            JSONObject error = new JSONObject();
            error.put("code", code);
            error.put("message", message == null ? "" : message);
            dispatchToWebView("health-connect-error", error);
        } catch (Throwable ignored) { }
    }

    private void dispatchToWebView(String eventName, JSONObject payload) {
        activity.runOnUiThread(() -> {
            try {
                String json = JSONObject.quote(payload.toString());
                String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(eventName) + ", {detail: JSON.parse(" + json + ")}));";
                android.webkit.WebView webView = ((com.getcapacitor.BridgeActivity) activity).getBridge().getWebView();
                if (webView != null) webView.evaluateJavascript(script, null);
            } catch (Throwable ignored) { }
        });
    }
}
