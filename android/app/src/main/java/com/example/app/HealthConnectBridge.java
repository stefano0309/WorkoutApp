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
import android.os.Parcelable;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class HealthConnectBridge {
    private static final String PREFS = "health_connect_cache";
    private static final String SUMMARY_KEY = "summary";
    private static final int ROUTE_REQUEST = 7402;
    public static final int HEALTH_PERMISSION_REQUEST = 7403;
    private static final long DEFAULT_LOOKBACK_DAYS = 30;

    /** Must match the android.permission.health.* entries declared in AndroidManifest.xml. */
    private static final String[] HEALTH_PERMISSIONS = {
        "android.permission.health.READ_WEIGHT",
        "android.permission.health.READ_STEPS",
        "android.permission.health.READ_SLEEP",
        "android.permission.health.READ_EXERCISE",
        "android.permission.health.READ_EXERCISE_ROUTES",
        "android.permission.health.READ_HEART_RATE",
    };

    private final Activity activity;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile String pendingRouteSessionId;

    public HealthConnectBridge(Activity activity) { this.activity = activity; }

    /**
     * Triggers the real OS permission dialog for the android.permission.health.* set.
     * On Android 14+ these are ordinary dangerous runtime permissions handled by
     * ActivityCompat.requestPermissions, exactly like camera/location/notifications.
     * The previous implementation only deep-linked into the Health Connect app's
     * "manage permissions" screen (MANAGE_HEALTH_PERMISSIONS), which has nothing to
     * show unless the OS already has a pending grant request for this app - so no
     * dialog ever appeared. This method is the actual "ask" step; the result comes
     * back in MainActivity#onRequestPermissionsResult -> handlePermissionsResult().
     */
    @JavascriptInterface
    public void requestHealthPermissions() {
        if (Build.VERSION.SDK_INT < 34) {
            saveError("unsupported", "Health Connect rich APIs require Android 14+.");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                List<String> missing = new ArrayList<>();
                for (String permission : HEALTH_PERMISSIONS) {
                    if (activity.checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        missing.add(permission);
                    }
                }
                if (missing.isEmpty()) {
                    // Already granted: nothing to prompt, just refresh the data.
                    syncHealthConnect(DEFAULT_LOOKBACK_DAYS);
                    return;
                }
                ActivityCompat.requestPermissions(activity, missing.toArray(new String[0]), HEALTH_PERMISSION_REQUEST);
            } catch (Throwable e) {
                saveError("permission_request_failed", e.toString());
            }
        });
    }

    /**
     * Call from MainActivity#onRequestPermissionsResult when requestCode == HEALTH_PERMISSION_REQUEST.
     * Notifies the WebView of the outcome and, if at least one permission was granted,
     * kicks off a sync so the UI/widget populate immediately instead of waiting for the
     * next scheduled sync.
     */
    public void handlePermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != HEALTH_PERMISSION_REQUEST) return;
        boolean anyGranted = false;
        JSONObject result = new JSONObject();
        JSONObject granted = new JSONObject();
        try {
            for (int i = 0; i < permissions.length && i < grantResults.length; i++) {
                boolean ok = grantResults[i] == android.content.pm.PackageManager.PERMISSION_GRANTED;
                granted.put(permissions[i], ok);
                if (ok) anyGranted = true;
            }
            result.put("granted", granted);
            result.put("anyGranted", anyGranted);
        } catch (Throwable ignored) { }
        dispatchToWebView("health-connect-permissions-result", result);
        if (anyGranted) syncHealthConnect(DEFAULT_LOOKBACK_DAYS);
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
            result.put("readExercise", Build.VERSION.SDK_INT >= 34);
            result.put("readSleep", Build.VERSION.SDK_INT >= 34);
            result.put("routePermission", Build.VERSION.SDK_INT >= 35 ? "session_consent" : "unsupported");
        } catch (Throwable ignored) {
            try { result.put("supported", false); } catch (Exception ignored2) { }
        }
        return result.toString();
    }

    @JavascriptInterface public void syncHealthConnect() { syncHealthConnect(DEFAULT_LOOKBACK_DAYS); }
    @JavascriptInterface public void syncHealthConnectDays(int days) { syncHealthConnect(Math.max(1, Math.min(365, days))); }

    private void syncHealthConnect(long lookbackDays) {
        if (Build.VERSION.SDK_INT < 34) {
            saveError("unsupported", "Health Connect rich APIs require Android 14+.");
            return;
        }
        executor.execute(() -> {
            try {
                HealthConnectManager manager = activity.getSystemService(HealthConnectManager.class);
                if (manager == null) {
                    saveError("unavailable", "Health Connect manager non disponibile.");
                    return;
                }
                Instant end = Instant.now();
                Instant start = end.minus(Duration.ofDays(lookbackDays));
                TimeInstantRangeFilter range = new TimeInstantRangeFilter.Builder()
                        .setStartTime(start).setEndTime(end).build();

                JSONObject result = readCachedSummary();
                result.put("importedAt", end.toString());
                result.put("source", "Health Connect");
                result.put("lookbackDays", lookbackDays);
                result.put("steps", readStepsAggregate(manager, range));

                Double weight = readLatestWeight(manager, range);
                if (weight != null) result.put("weightKg", weight);

                List<SleepSessionRecord> sleeps = readAllRecords(manager, SleepSessionRecord.class, range);
                JSONArray sleepSessions = new JSONArray();
                for (SleepSessionRecord record : sleeps) sleepSessions.put(serializeSleep(record));
                result.put("sleepSessions", sleepSessions);
                result.put("sleepMinutes", totalSleepMinutes(sleeps));
                if (!sleeps.isEmpty()) result.put("lastSleep", serializeSleep(sleeps.get(sleeps.size() - 1)));

                List<ExerciseSessionRecord> exercises = readAllRecords(manager, ExerciseSessionRecord.class, range);
                JSONArray allExercises = new JSONArray();
                JSONArray running = new JSONArray();
                for (ExerciseSessionRecord record : exercises) {
                    JSONObject serialized = serializeExercise(record);
                    allExercises.put(serialized);
                    if (isRunning(record)) running.put(serialized);
                }
                result.put("exerciseSessions", allExercises);
                result.put("runningSessions", running);
                result.put("exerciseCount", exercises.size());
                persistAndDispatch(result);
            } catch (SecurityException e) {
                saveError("permission_denied", e.getMessage());
            } catch (Throwable e) {
                saveError("sync_failed", e.toString());
            }
        });
    }

    @JavascriptInterface
    public void requestExerciseRoute(String sessionId) {
        if (Build.VERSION.SDK_INT < 34 || sessionId == null || sessionId.trim().isEmpty()) return;
        activity.runOnUiThread(() -> {
            try {
                pendingRouteSessionId = sessionId.trim();
                Intent intent = new Intent(HealthConnectManager.ACTION_REQUEST_EXERCISE_ROUTE);
                intent.putExtra(HealthConnectManager.EXTRA_SESSION_ID, pendingRouteSessionId);
                activity.startActivityForResult(intent, ROUTE_REQUEST);
            } catch (Throwable e) { saveError("route_request_failed", e.toString()); }
        });
    }

    public void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != ROUTE_REQUEST || resultCode != Activity.RESULT_OK || data == null || Build.VERSION.SDK_INT < 34) return;
        try {
            ExerciseRoute route;
            if (Build.VERSION.SDK_INT >= 33) {
                route = data.getParcelableExtra(HealthConnectManager.EXTRA_EXERCISE_ROUTE, ExerciseRoute.class);
            } else {
                Parcelable raw = data.getParcelableExtra(HealthConnectManager.EXTRA_EXERCISE_ROUTE);
                route = raw instanceof ExerciseRoute ? (ExerciseRoute) raw : null;
            }
            if (route == null) return;
            JSONObject routeJson = serializeRoute(route);
            routeJson.put("sessionId", pendingRouteSessionId);
            upsertRouteIntoCache(pendingRouteSessionId, routeJson);
            dispatchToWebView("health-connect-route", routeJson);
        } catch (Throwable e) {
            saveError("route_import_failed", e.toString());
        } finally {
            pendingRouteSessionId = null;
        }
    }

    private <T extends android.health.connect.datatypes.Record> List<T> readAllRecords(
            HealthConnectManager manager, Class<T> recordType, TimeInstantRangeFilter range) throws Exception {
        List<T> all = new ArrayList<>();
        long token = -1L;
        do {
            CountDownLatch latch = new CountDownLatch(1);
            List<T> page = new ArrayList<>();
            long[] next = {-1L};
            Throwable[] error = {null};
            ReadRecordsRequestUsingFilters.Builder<T> builder = new ReadRecordsRequestUsingFilters.Builder<>(recordType)
                    .setTimeRangeFilter(range).setPageSize(5000);
            if (token >= 0L) builder.setPageToken(token); else builder.setAscending(true);
            manager.readRecords(builder.build(), activity.getMainExecutor(),
                    new android.os.OutcomeReceiver<ReadRecordsResponse<T>, android.health.connect.HealthConnectException>() {
                        @Override public void onResult(ReadRecordsResponse<T> response) {
                            page.addAll(response.getRecords());
                            next[0] = response.getNextPageToken();
                            latch.countDown();
                        }
                        @Override public void onError(android.health.connect.HealthConnectException e) {
                            error[0] = e; latch.countDown();
                        }
                    });
            if (!latch.await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Health Connect read timeout: " + recordType.getSimpleName());
            }
            if (error[0] != null) throw new Exception(error[0]);
            all.addAll(page);
            token = next[0];
        } while (token >= 0L);
        return all;
    }

    private long readStepsAggregate(HealthConnectManager manager, TimeInstantRangeFilter range) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        long[] total = {0L};
        Throwable[] error = {null};
        AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(range)
                .addAggregationType(StepsRecord.STEPS_COUNT_TOTAL).build();
        manager.aggregate(request, activity.getMainExecutor(),
                new android.os.OutcomeReceiver<AggregateRecordsResponse<Long>, android.health.connect.HealthConnectException>() {
                    @Override public void onResult(AggregateRecordsResponse<Long> response) {
                        Long value = response.get(StepsRecord.STEPS_COUNT_TOTAL);
                        total[0] = value == null ? 0L : value;
                        latch.countDown();
                    }
                    @Override public void onError(android.health.connect.HealthConnectException e) {
                        error[0] = e; latch.countDown();
                    }
                });
        if (!latch.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("Steps aggregate timeout");
        if (error[0] != null) throw new Exception(error[0]);
        return total[0];
    }

    private Double readLatestWeight(HealthConnectManager manager, TimeInstantRangeFilter range) throws Exception {
        List<WeightRecord> records = readAllRecords(manager, WeightRecord.class, range);
        if (records.isEmpty()) return null;
        return records.get(records.size() - 1).getWeight().getInGrams() / 1000.0d;
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
        try {
            ExerciseRoute route = record.getRoute();
            if (route != null) json.put("route", serializeRoute(route));
            else if (record.hasRoute()) json.put("routeStatus", routePermissionStatus());
        } catch (SecurityException e) {
            if (record.hasRoute()) json.put("routeStatus", "consent_required");
        } catch (Throwable e) {
            if (record.hasRoute()) json.put("routeStatus", routePermissionStatus());
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
        double meters = 0d;
        for (int i = 1; i < points.size(); i++) {
            ExerciseRoute.Location a = points.get(i - 1), b = points.get(i);
            meters += haversineMeters(a.getLatitude(), a.getLongitude(), b.getLatitude(), b.getLongitude());
        }
        return Math.round(meters / 10d) / 100d;
    }

    private double calculateElevationGain(List<ExerciseRoute.Location> points) {
        double gain = 0d;
        Double previous = null;
        for (ExerciseRoute.Location point : points) {
            if (point.getAltitude() == null) continue;
            double current = point.getAltitude().getInMeters();
            if (previous != null && current > previous) gain += current - previous;
            previous = current;
        }
        return Math.round(gain * 10d) / 10d;
    }

    private double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        final double r = 6371000d;
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = Math.toRadians(lat2 - lat1), dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2)
                + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private boolean isRunning(ExerciseSessionRecord record) {
        int type = record.getExerciseType();
        return type == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING
                || type == ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL;
    }

    private long totalSleepMinutes(List<SleepSessionRecord> records) {
        long total = 0L;
        for (SleepSessionRecord record : records) total += Math.max(0L,
                Duration.between(record.getStartTime(), record.getEndTime()).toMinutes());
        return total;
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

    private String routePermissionStatus() {
        return Build.VERSION.SDK_INT >= 35 ? "consent_required" : "request_session_route";
    }

    private JSONObject readCachedSummary() {
        try {
            String raw = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SUMMARY_KEY, null);
            return raw == null ? new JSONObject() : new JSONObject(raw);
        } catch (Throwable e) { return new JSONObject(); }
    }

    private void persistAndDispatch(JSONObject result) {
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(SUMMARY_KEY, result.toString()).apply();
        dispatchToWebView("health-connect-sync", result);
        // The widget only auto-refreshes every 30 min (updatePeriodMillis in
        // widget_training_today_info.xml); without this call the home-screen
        // widget keeps showing "Salute · —" long after a successful sync.
        refreshWidgetSafely();
    }

    private void refreshWidgetSafely() {
        try {
            HybridTrainingWidgetProvider.updateAllWidgets(activity);
        } catch (Throwable ignored) { }
    }

    private void upsertRouteIntoCache(String sessionId, JSONObject routeJson) {
        try {
            JSONObject summary = readCachedSummary();
            JSONArray routes = summary.optJSONArray("routes");
            if (routes == null) routes = new JSONArray();
            JSONArray updated = new JSONArray();
            boolean replaced = false;
            for (int i = 0; i < routes.length(); i++) {
                JSONObject existing = routes.optJSONObject(i);
                if (existing != null && String.valueOf(sessionId).equals(existing.optString("sessionId"))) {
                    updated.put(routeJson); replaced = true;
                } else if (existing != null) updated.put(existing);
            }
            if (!replaced) updated.put(routeJson);
            summary.put("routes", updated);
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(SUMMARY_KEY, summary.toString()).apply();
        } catch (Throwable ignored) { }
    }

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
                String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(eventName)
                        + ", {detail: JSON.parse(" + json + ")}));";
                android.webkit.WebView webView = ((com.getcapacitor.BridgeActivity) activity)
                        .getBridge().getWebView();
                if (webView != null) webView.evaluateJavascript(script, null);
            } catch (Throwable ignored) { }
        });
    }
}