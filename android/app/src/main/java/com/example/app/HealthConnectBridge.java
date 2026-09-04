package com.example.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
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
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.ForkJoinPool;

/**
 * Native bridge for Android Health Connect.
 *
 * Design goals:
 * - never block a thread waiting for Health Connect callbacks;
 * - never keep a dedicated ExecutorService alive for the Activity lifetime;
 * - never request an ExerciseRoute while serializing every exercise session;
 * - keep route access behind the explicit Android consent flow;
 * - expose stable JSON to the web application and persist the latest snapshot locally.
 *
 * Framework Health Connect APIs are available from Android 14 (API 34).
 */
public final class HealthConnectBridge {
    private static final String PREFS = "health_connect_cache";
    private static final String SUMMARY_KEY = "summary";
    private static final String ROUTES_KEY = "routes";
    private static final String ERROR_KEY = "last_error";

    private static final int ROUTE_REQUEST = 7402;
    private static final long DEFAULT_LOOKBACK_DAYS = 30L;
    private static final int MAX_LOOKBACK_DAYS = 365;
    private static final int PAGE_SIZE = 5000;

    private final Activity activity;
    private volatile String pendingRouteSessionId;
    private volatile boolean destroyed;

    public HealthConnectBridge(Activity activity) {
        this.activity = activity;
    }

    /**
     * Opens the system Health Connect permission management UI.
     */
    @JavascriptInterface
    public void requestHealthPermissions() {
        if (!isSupported()) {
            saveError("unsupported", "Health Connect rich APIs require Android 14+.");
            return;
        }

        runOnMain(() -> {
            try {
                Intent intent = new Intent(HealthConnectManager.ACTION_MANAGE_HEALTH_PERMISSIONS)
                        .putExtra(Intent.EXTRA_PACKAGE_NAME, activity.getPackageName());
                activity.startActivity(intent);
            } catch (Throwable e) {
                saveError("permission_screen_failed", e.toString());
            }
        });
    }

    /**
     * Returns the last successfully imported Health Connect snapshot.
     */
    @JavascriptInterface
    public String readHealthSummary() {
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(SUMMARY_KEY, null);
    }

    /**
     * Returns capability information that can safely be consumed by the web app.
     */
    @JavascriptInterface
    public String getHealthCapabilities() {
        JSONObject result = new JSONObject();
        try {
            boolean supported = isSupported();
            HealthConnectManager manager = supported
                    ? activity.getSystemService(HealthConnectManager.class)
                    : null;

            result.put("supported", manager != null);
            result.put("apiLevel", Build.VERSION.SDK_INT);
            result.put("permissionManagement", manager != null ? "system_settings" : "unsupported");
            result.put("readSteps", manager != null);
            result.put("readWeight", manager != null);
            result.put("readExercise", manager != null);
            result.put("readSleep", manager != null);
            result.put("exerciseRoute", manager != null ? "consent_required" : "unsupported");
        } catch (Throwable e) {
            put(result, "supported", false);
            put(result, "error", e.toString());
        }
        return result.toString();
    }

    @JavascriptInterface
    public void syncHealthConnect() {
        syncHealthConnect(DEFAULT_LOOKBACK_DAYS);
    }

    @JavascriptInterface
    public void syncHealthConnectDays(int days) {
        syncHealthConnect(Math.max(1L, Math.min(MAX_LOOKBACK_DAYS, days)));
    }

    /**
     * Asynchronously imports steps, latest weight, sleep sessions and exercise sessions.
     * Each Health Connect operation completes through an OutcomeReceiver; no thread is
     * blocked waiting for a callback.
     */
    private void syncHealthConnect(long lookbackDays) {
        if (destroyed) return;

        if (!isSupported()) {
            saveError("unsupported", "Health Connect rich APIs require Android 14+.");
            return;
        }

        final HealthConnectManager manager;
        try {
            manager = activity.getSystemService(HealthConnectManager.class);
        } catch (Throwable e) {
            saveError("manager_failed", e.toString());
            return;
        }

        if (manager == null) {
            saveError("unavailable", "Health Connect manager non disponibile.");
            return;
        }

        final Executor callbackExecutor = activity.getMainExecutor();
        final Executor worker = ForkJoinPool.commonPool();
        final Instant end = Instant.now();
        final Instant start = end.minus(Duration.ofDays(lookbackDays));

        final TimeInstantRangeFilter range;
        try {
            range = new TimeInstantRangeFilter.Builder()
                    .setStartTime(start)
                    .setEndTime(end)
                    .build();
        } catch (Throwable e) {
            saveError("range_failed", e.toString());
            return;
        }

        final JSONObject result = readCachedSummary();
        put(result, "importedAt", end.toString());
        put(result, "source", "Health Connect");
        put(result, "lookbackDays", lookbackDays);
        put(result, "start", start.toString());
        put(result, "end", end.toString());

        readStepsAsync(manager, range, callbackExecutor)
                .thenApplyAsync(steps -> {
                    put(result, "steps", steps);
                    return result;
                }, worker)
                .thenComposeAsync(r -> readLatestWeightAsync(manager, range, callbackExecutor, worker)
                        .thenApply(weight -> {
                            if (weight != null) put(result, "weightKg", weight);
                            return result;
                        }), worker)
                .thenComposeAsync(r -> readAllRecordsAsync(
                                manager,
                                SleepSessionRecord.class,
                                range,
                                callbackExecutor,
                                worker)
                        .thenApply(sleeps -> {
                            serializeSleeps(result, sleeps);
                            return result;
                        }), worker)
                .thenComposeAsync(r -> readAllRecordsAsync(
                                manager,
                                ExerciseSessionRecord.class,
                                range,
                                callbackExecutor,
                                worker)
                        .thenApply(exercises -> {
                            serializeExercises(result, exercises);
                            return result;
                        }), worker)
                .thenAcceptAsync(this::persistAndDispatch, worker)
                .exceptionally(error -> {
                    Throwable cause = unwrap(error);
                    saveError(
                            cause instanceof SecurityException ? "permission_denied" : "sync_failed",
                            cause.toString());
                    return null;
                });
    }

    private CompletableFuture<Long> readStepsAsync(
            HealthConnectManager manager,
            TimeInstantRangeFilter range,
            Executor callbackExecutor) {

        CompletableFuture<Long> future = new CompletableFuture<>();

        try {
            AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(range)
                    .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL)
                    .build();

            manager.aggregate(
                    request,
                    callbackExecutor,
                    new android.os.OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException>() {
                        @Override
                        public void onResult(AggregateRecordsResponse<Long> response) {
                            try {
                                Long value = response.get(StepsRecord.STEPS_COUNT_TOTAL);
                                future.complete(value == null ? 0L : value);
                            } catch (Throwable e) {
                                future.completeExceptionally(e);
                            }
                        }

                        @Override
                        public void onError(HealthConnectException error) {
                            future.completeExceptionally(error);
                        }
                    });
        } catch (Throwable e) {
            future.completeExceptionally(e);
        }

        return future;
    }

    private <T extends android.health.connect.datatypes.Record> CompletableFuture<List<T>> readAllRecordsAsync(
            HealthConnectManager manager,
            Class<T> type,
            TimeInstantRangeFilter range,
            Executor callbackExecutor,
            Executor worker) {

        return readPageAsync(manager, type, range, -1L, callbackExecutor)
                .thenComposeAsync(
                        first -> collectRemaining(
                                manager,
                                type,
                                range,
                                first,
                                new ArrayList<>(),
                                callbackExecutor,
                                worker),
                        worker);
    }

    private <T extends android.health.connect.datatypes.Record> CompletableFuture<List<T>> collectRemaining(
            HealthConnectManager manager,
            Class<T> type,
            TimeInstantRangeFilter range,
            ReadRecordsResponse<T> response,
            List<T> result,
            Executor callbackExecutor,
            Executor worker) {

        if (response == null) {
            return CompletableFuture.failedFuture(
                    new IllegalStateException("Health Connect returned a null page"));
        }

        result.addAll(response.getRecords());

        long nextPageToken = response.getNextPageToken();
        if (nextPageToken < 0L) {
            return CompletableFuture.completedFuture(result);
        }

        return readPageAsync(manager, type, range, nextPageToken, callbackExecutor)
                .thenComposeAsync(
                        page -> collectRemaining(
                                manager,
                                type,
                                range,
                                page,
                                result,
                                callbackExecutor,
                                worker),
                        worker);
    }

    private <T extends android.health.connect.datatypes.Record> CompletableFuture<ReadRecordsResponse<T>> readPageAsync(
            HealthConnectManager manager,
            Class<T> type,
            TimeInstantRangeFilter range,
            long pageToken,
            Executor callbackExecutor) {

        CompletableFuture<ReadRecordsResponse<T>> future = new CompletableFuture<>();

        try {
            ReadRecordsRequestUsingFilters.Builder<T> builder =
                    new ReadRecordsRequestUsingFilters.Builder<>(type)
                            .setTimeRangeFilter(range)
                            .setPageSize(PAGE_SIZE);

            if (pageToken >= 0L) {
                builder.setPageToken(pageToken);
            } else {
                builder.setAscending(true);
            }

            manager.readRecords(
                    builder.build(),
                    callbackExecutor,
                    new android.os.OutcomeReceiver<ReadRecordsResponse<T>, HealthConnectException>() {
                        @Override
                        public void onResult(ReadRecordsResponse<T> response) {
                            future.complete(response);
                        }

                        @Override
                        public void onError(HealthConnectException error) {
                            future.completeExceptionally(error);
                        }
                    });
        } catch (Throwable e) {
            future.completeExceptionally(e);
        }

        return future;
    }

    private CompletableFuture<Double> readLatestWeightAsync(
            HealthConnectManager manager,
            TimeInstantRangeFilter range,
            Executor callbackExecutor,
            Executor worker) {

        return readAllRecordsAsync(manager, WeightRecord.class, range, callbackExecutor, worker)
                .thenApplyAsync(records -> {
                    if (records.isEmpty()) return null;

                    records.sort(Comparator.comparing(WeightRecord::getTime));
                    WeightRecord latest = records.get(records.size() - 1);
                    return latest.getWeight().getInGrams() / 1000.0d;
                }, worker);
    }

    /**
     * Requests a route for exactly one session. The route is deliberately not read while
     * serializing the session list because route access has its own user-consent flow.
     */
    @JavascriptInterface
    public void requestExerciseRoute(String sessionId) {
        if (!isSupported()) {
            saveError("unsupported", "Exercise route requires Android 14+.");
            return;
        }

        if (sessionId == null || sessionId.trim().isEmpty()) {
            saveError("invalid_route_request", "Sessione exercise non valida.");
            return;
        }

        final String normalizedSessionId = sessionId.trim();

        runOnMain(() -> {
            try {
                pendingRouteSessionId = normalizedSessionId;

                Intent intent = new Intent(HealthConnectManager.ACTION_REQUEST_EXERCISE_ROUTE)
                        .putExtra(HealthConnectManager.EXTRA_SESSION_ID, normalizedSessionId);

                activity.startActivityForResult(intent, ROUTE_REQUEST);
            } catch (Throwable e) {
                pendingRouteSessionId = null;
                saveError("route_request_failed", e.toString());
            }
        });
    }

    /**
     * Receives the result of ACTION_REQUEST_EXERCISE_ROUTE from MainActivity.
     */
    public void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != ROUTE_REQUEST) return;

        final String sessionId = pendingRouteSessionId;
        pendingRouteSessionId = null;

        if (resultCode != Activity.RESULT_OK) {
            if (data == null) {
                saveError("route_cancelled", "L'utente non ha condiviso il percorso.");
            }
            return;
        }

        if (Build.VERSION.SDK_INT < 34 || data == null || sessionId == null) {
            saveError("route_empty", "Nessun percorso restituito da Health Connect.");
            return;
        }

        try {
            ExerciseRoute route = data.getParcelableExtra(
                    HealthConnectManager.EXTRA_EXERCISE_ROUTE,
                    ExerciseRoute.class);

            if (route == null) {
                saveError("route_empty", "Nessun percorso restituito da Health Connect.");
                return;
            }

            JSONObject json = serializeRoute(route);
            json.put("sessionId", sessionId);
            json.put("receivedAt", Instant.now().toString());

            upsertRouteIntoCache(sessionId, json);
            dispatchToWebView("health-connect-route", json);
        } catch (Throwable e) {
            saveError("route_import_failed", e.toString());
        }
    }

    private void serializeSleeps(JSONObject result, List<SleepSessionRecord> sleeps) {
        JSONArray array = new JSONArray();
        long totalMinutes = 0L;

        sleeps.sort(Comparator.comparing(SleepSessionRecord::getStartTime));

        for (SleepSessionRecord record : sleeps) {
            try {
                JSONObject json = serializeSleep(record);
                array.put(json);
                totalMinutes += Math.max(
                        0L,
                        Duration.between(record.getStartTime(), record.getEndTime()).toMinutes());
            } catch (Throwable e) {
                saveError("sleep_serialize_failed", e.toString());
            }
        }

        put(result, "sleepSessions", array);
        put(result, "sleepMinutes", totalMinutes);
        put(result, "sleepCount", sleeps.size());

        if (!sleeps.isEmpty()) {
            try {
                put(result, "lastSleep", serializeSleep(sleeps.get(sleeps.size() - 1)));
            } catch (Throwable e) {
                saveError("last_sleep_serialize_failed", e.toString());
            }
        }
    }

    private void serializeExercises(JSONObject result, List<ExerciseSessionRecord> exercises) {
        JSONArray all = new JSONArray();
        JSONArray running = new JSONArray();

        exercises.sort(Comparator.comparing(ExerciseSessionRecord::getStartTime));

        for (ExerciseSessionRecord record : exercises) {
            try {
                JSONObject json = serializeExercise(record);
                all.put(json);
                if (isRunning(record)) running.put(json);
            } catch (Throwable e) {
                saveError("exercise_serialize_failed", e.toString());
            }
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
        json.put(
                "durationMinutes",
                Math.max(0L, Duration.between(record.getStartTime(), record.getEndTime()).toMinutes()));

        if (record.getTitle() != null) {
            json.put("title", record.getTitle());
        }
        if (record.getNotes() != null) {
            json.put("notes", record.getNotes());
        }

        JSONArray stages = new JSONArray();
        for (SleepSessionRecord.Stage stage : record.getStages()) {
            JSONObject s = new JSONObject();
            s.put("start", stage.getStartTime().toString());
            s.put("end", stage.getEndTime().toString());
            s.put(
                    "durationMinutes",
                    Math.max(0L, Duration.between(stage.getStartTime(), stage.getEndTime()).toMinutes()));
            s.put("type", stageTypeName(stage.getType()));
            s.put("typeCode", stage.getType());
            stages.put(s);
        }

        json.put("stages", stages);
        return json;
    }

    /**
     * Serializes exercise metadata only. Route content is intentionally excluded here and
     * fetched lazily through requestExerciseRoute(sessionId).
     */
    private JSONObject serializeExercise(ExerciseSessionRecord record) throws Exception {
        JSONObject json = new JSONObject();
        json.put("id", record.getMetadata().getId());
        json.put("start", record.getStartTime().toString());
        json.put("end", record.getEndTime().toString());
        json.put(
                "durationMinutes",
                Math.max(0L, Duration.between(record.getStartTime(), record.getEndTime()).toMinutes()));
        json.put("exerciseType", record.getExerciseType());
        json.put("exerciseTypeName", exerciseTypeName(record.getExerciseType()));
        json.put("hasRoute", record.hasRoute());
        json.put("routeStatus", record.hasRoute() ? "consent_required" : "none");

        if (record.getTitle() != null) {
            json.put("title", record.getTitle());
        }
        if (record.getNotes() != null) {
            json.put("notes", record.getNotes());
        }

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

            if (point.getAltitude() != null) {
                p.put("altitudeM", point.getAltitude().getInMeters());
            }
            if (point.getHorizontalAccuracy() != null) {
                p.put("horizontalAccuracyM", point.getHorizontalAccuracy().getInMeters());
            }
            if (point.getVerticalAccuracy() != null) {
                p.put("verticalAccuracyM", point.getVerticalAccuracy().getInMeters());
            }

            points.put(p);
        }

        JSONObject result = new JSONObject();
        result.put("points", points);
        result.put("pointCount", locations.size());
        result.put(
                "distanceKm",
                Math.round(calculateDistanceKm(locations) * 100d) / 100d);
        result.put(
                "elevationGainM",
                Math.round(calculateElevationGain(locations) * 10d) / 10d);
        return result;
    }

    private double calculateDistanceKm(List<ExerciseRoute.Location> points) {
        double meters = 0d;
        for (int i = 1; i < points.size(); i++) {
            ExerciseRoute.Location a = points.get(i - 1);
            ExerciseRoute.Location b = points.get(i);
            meters += haversineMeters(
                    a.getLatitude(),
                    a.getLongitude(),
                    b.getLatitude(),
                    b.getLongitude());
        }
        return meters / 1000d;
    }

    private double calculateElevationGain(List<ExerciseRoute.Location> points) {
        double gain = 0d;
        Double previous = null;

        for (ExerciseRoute.Location point : points) {
            if (point.getAltitude() == null) continue;

            double current = point.getAltitude().getInMeters();
            if (previous != null && current > previous) {
                gain += current - previous;
            }
            previous = current;
        }

        return gain;
    }

    private double haversineMeters(
            double lat1,
            double lon1,
            double lat2,
            double lon2) {

        final double earthRadius = 6371000d;
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double deltaPhi = Math.toRadians(lat2 - lat1);
        double deltaLambda = Math.toRadians(lon2 - lon1);

        double a = Math.sin(deltaPhi / 2d) * Math.sin(deltaPhi / 2d)
                + Math.cos(phi1)
                * Math.cos(phi2)
                * Math.sin(deltaLambda / 2d)
                * Math.sin(deltaLambda / 2d);

        return 2d * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1d - a));
    }

    private boolean isRunning(ExerciseSessionRecord record) {
        int type = record.getExerciseType();
        return type == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING
                || type == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL;
    }

    private String stageTypeName(int type) {
        switch (type) {
            case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE:
                return "awake";
            case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE_IN_BED:
                return "awake_in_bed";
            case SleepSessionRecord.StageType.STAGE_TYPE_AWAKE_OUT_OF_BED:
                return "awake_out_of_bed";
            case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING:
                return "sleeping";
            case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_LIGHT:
                return "sleeping_light";
            case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_DEEP:
                return "sleeping_deep";
            case SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_REM:
                return "sleeping_rem";
            default:
                return "unknown";
        }
    }

    private String exerciseTypeName(int type) {
        switch (type) {
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING:
                return "running";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL:
                return "running_treadmill";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_WALKING:
                return "walking";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING:
                return "biking";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_BIKING_STATIONARY:
                return "biking_stationary";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_HIKING:
                return "hiking";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_SWIMMING_OPEN_WATER:
                return "swimming_open_water";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_SWIMMING_POOL:
                return "swimming_pool";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_STRENGTH_TRAINING:
                return "strength_training";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_WEIGHTLIFTING:
                return "weightlifting";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_MARTIAL_ARTS:
                return "martial_arts";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_BOXING:
                return "boxing";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_CALISTHENICS:
                return "calisthenics";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_YOGA:
                return "yoga";
            case ExerciseSessionType.EXERCISE_SESSION_TYPE_OTHER_WORKOUT:
                return "other_workout";
            default:
                return "type_" + type;
        }
    }

    private JSONObject readCachedSummary() {
        String raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(SUMMARY_KEY, null);

        if (raw == null || raw.trim().isEmpty()) {
            return new JSONObject();
        }

        try {
            return new JSONObject(raw);
        } catch (Throwable ignored) {
            return new JSONObject();
        }
    }

    private void persistAndDispatch(JSONObject result) {
        if (destroyed) return;

        final String json = result.toString();
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(SUMMARY_KEY, json)
                .remove(ERROR_KEY)
                .apply();

        dispatchToWebView("health-connect-sync", result);
    }

    private void upsertRouteIntoCache(String sessionId, JSONObject route) {
        try {
            String raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(ROUTES_KEY, null);
            JSONObject routes = raw == null ? new JSONObject() : new JSONObject(raw);
            routes.put(sessionId, route);

            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(ROUTES_KEY, routes.toString())
                    .apply();
        } catch (Throwable e) {
            saveError("route_cache_failed", e.toString());
        }
    }

    @JavascriptInterface
    public String readExerciseRoute(String sessionId) {
        if (sessionId == null || sessionId.trim().isEmpty()) return null;

        try {
            String raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString(ROUTES_KEY, null);
            if (raw == null) return null;

            JSONObject routes = new JSONObject(raw);
            JSONObject route = routes.optJSONObject(sessionId.trim());
            return route == null ? null : route.toString();
        } catch (Throwable e) {
            saveError("route_cache_read_failed", e.toString());
            return null;
        }
    }

    @JavascriptInterface
    public String readLastError() {
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(ERROR_KEY, null);
    }

    private void saveError(String code, String message) {
        try {
            JSONObject error = new JSONObject();
            error.put("code", code);
            error.put("message", message == null ? "" : message);
            error.put("timestamp", Instant.now().toString());

            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(ERROR_KEY, error.toString())
                    .apply();

            dispatchToWebView("health-connect-error", error);
        } catch (Throwable ignored) {
            // Error reporting must never crash the native bridge.
        }
    }

    private void dispatchToWebView(String eventName, JSONObject payload) {
        if (destroyed) return;

        runOnMain(() -> {
            try {
                if (destroyed) return;

                WebView webView = null;
                if (activity instanceof MainActivity) {
                    webView = ((MainActivity) activity).getBridge().getWebView();
                }

                if (webView == null) return;

                String safeEvent = JSONObject.quote(eventName);
                String safePayload = payload == null ? "null" : payload.toString();
                String script = "(function(){"
                        + "var d=" + safePayload + ";"
                        + "window.dispatchEvent(new CustomEvent(" + safeEvent + ", {detail:d}));"
                        + "if(window.onNativeHealthConnectEvent){window.onNativeHealthConnectEvent(" + safeEvent + ", d);}"
                        + "})();";

                webView.evaluateJavascript(script, null);
            } catch (Throwable ignored) {
                // A closed/detached WebView must not crash the Activity.
            }
        });
    }

    private boolean isSupported() {
        return Build.VERSION.SDK_INT >= 34;
    }

    private void runOnMain(Runnable runnable) {
        try {
            if (activity.isFinishing() || (Build.VERSION.SDK_INT >= 17 && activity.isDestroyed())) return;
            activity.runOnUiThread(runnable);
        } catch (Throwable ignored) {
            // Activity lifecycle can race the callback.
        }
    }

    private Throwable unwrap(Throwable error) {
        Throwable current = error;
        while ((current instanceof java.util.concurrent.CompletionException
                || current instanceof java.util.concurrent.ExecutionException)
                && current.getCause() != null) {
            current = current.getCause();
        }
        return current;
    }

    private void put(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (Throwable ignored) {
            // Keep one malformed value from aborting the complete snapshot.
        }
    }

    public void destroy() {
        destroyed = true;
        pendingRouteSessionId = null;
    }
}
