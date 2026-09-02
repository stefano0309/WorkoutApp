package com.example.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Minimal Health Connect bridge. Reads today's weight and step aggregates on Android 14+. */
public final class HealthConnectBridge {
    private static final String PREFS = "health_connect_cache";
    private static final String SUMMARY_KEY = "summary";
    private static final int PERMISSION_REQUEST = 7401;
    private final Activity activity;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public HealthConnectBridge(Activity activity) { this.activity = activity; }

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
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SUMMARY_KEY, null);
    }

    @JavascriptInterface
    public void syncHealthConnect() {
        if (Build.VERSION.SDK_INT < 34) return;
        executor.execute(() -> {
            try {
                Object manager = activity.getSystemService("android.health.connect.HealthConnectManager");
                if (manager == null) return;
                java.lang.reflect.Method aggregate = manager.getClass().getMethod(
                        "aggregate",
                        Class.forName("android.health.connect.AggregateRecordsRequest"),
                        java.util.concurrent.Executor.class,
                        android.os.OutcomeReceiver.class
                );
                Instant now = Instant.now();
                ZonedDateTime startOfDay = ZonedDateTime.now().withHour(0).withMinute(0).withSecond(0).withNano(0);
                Object rangeBuilder = Class.forName("android.health.connect.TimeInstantRangeFilter$Builder").getConstructor().newInstance();
                rangeBuilder.getClass().getMethod("setStartTime", Instant.class).invoke(rangeBuilder, startOfDay.toInstant());
                rangeBuilder.getClass().getMethod("setEndTime", Instant.class).invoke(rangeBuilder, now);
                Object range = rangeBuilder.getClass().getMethod("build").invoke(rangeBuilder);

                JSONObject result = new JSONObject();
                result.put("importedAt", now.toString());
                result.put("weightKg", JSONObject.NULL);
                result.put("steps", JSONObject.NULL);
                result.put("sleepMinutes", JSONObject.NULL);
                result.put("lastRun", JSONObject.NULL);

                requestAggregate(manager, aggregate, range,
                        "android.health.connect.datatypes.StepsRecord",
                        "STEPS_COUNT_TOTAL", result, "steps");
                requestAggregate(manager, aggregate, range,
                        "android.health.connect.datatypes.WeightRecord",
                        "WEIGHT_AVG", result, "weightKg");
            } catch (Throwable ignored) {
                // Health Connect is optional; the app continues to work fully offline.
            }
        });
    }

    private void requestAggregate(Object manager, java.lang.reflect.Method aggregate, Object range,
                                  String recordClassName, String aggregationField, JSONObject result, String outputKey) throws Exception {
        Class<?> recordClass = Class.forName(recordClassName);
        Object aggregationType = recordClass.getField(aggregationField).get(null);
        Class<?> requestClass = Class.forName("android.health.connect.AggregateRecordsRequest$Builder");
        Object builder = requestClass.getConstructor(Class.forName("android.health.connect.TimeRangeFilter")).newInstance(range);
        requestClass.getMethod("addAggregationType", Class.forName("android.health.connect.datatypes.AggregationType"))
                .invoke(builder, aggregationType);
        Object request = requestClass.getMethod("build").invoke(builder);
        android.os.OutcomeReceiver<Object, Object> receiver = new android.os.OutcomeReceiver<Object, Object>() {
            @Override public void onResult(Object response) {
                try {
                    Object value = response.getClass().getMethod("get", Class.forName("android.health.connect.datatypes.AggregationType"))
                            .invoke(response, aggregationType);
                    if (value != null) {
                        double normalized = value instanceof Number ? ((Number) value).doubleValue() :
                                ((Number) value.getClass().getMethod("getInGrams").invoke(value)).doubleValue() / 1000d;
                        if (outputKey.equals("steps")) result.put(outputKey, Math.round(normalized)); else result.put(outputKey, Math.round(normalized * 10d) / 10d);
                        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SUMMARY_KEY, result.toString()).apply();
                    }
                } catch (Throwable ignored) { }
            }
            @Override public void onError(Object error) { }
        };
        aggregate.invoke(manager, request, executor, receiver);
    }
}
