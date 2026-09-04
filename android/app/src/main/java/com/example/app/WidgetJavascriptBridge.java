package com.example.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.util.Calendar;

/** JavaScript-facing widget and notification operations. */
public final class WidgetJavascriptBridge {
    private static final String STATE_PREFS = "hybrid_training_widget";
    private static final String STATE_KEY = "state";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7001;
    private static final int DAILY_ALARM_REQUEST = 7002;
    private final MainActivity activity;

    public WidgetJavascriptBridge(MainActivity activity) { this.activity = activity; }

    @JavascriptInterface public void sync(String rawState) {
        if (rawState == null || rawState.isEmpty() || rawState.length() > 1024 * 1024) return;
        try {
            new JSONObject(rawState);
            activity.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE).edit()
                    .putString(STATE_KEY, rawState)
                    .putLong("updated_at", System.currentTimeMillis())
                    .apply();
            sendWidgetSync();
        } catch (Exception ignored) { }
    }

    @JavascriptInterface public void syncWorkoutLog(String rawLog) {
        if (rawLog == null || rawLog.length() > 20000) return;
        activity.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE).edit()
                .putString("latest_log", rawLog)
                .putLong("updated_at", System.currentTimeMillis())
                .apply();
        sendWidgetSync();
    }

    @JavascriptInterface public void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            activity.runOnUiThread(() -> activity.requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST));
        }
    }

    @JavascriptInterface public void scheduleDailyNotification(int hour, int minute, String title, String body) {
        requestNotificationPermission();
        AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(activity, WorkoutNotificationReceiver.class)
                .setAction(WorkoutNotificationReceiver.ACTION_DAILY)
                .putExtra("title", title).putExtra("body", body);
        PendingIntent pi = PendingIntent.getBroadcast(activity, DAILY_ALARM_REQUEST, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, Math.max(0, Math.min(23, hour)));
        next.set(Calendar.MINUTE, Math.max(0, Math.min(59, minute)));
        next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
        am.cancel(pi);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
    }

    @JavascriptInterface public void cancelDailyNotification() {
        AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(activity, WorkoutNotificationReceiver.class)
                .setAction(WorkoutNotificationReceiver.ACTION_DAILY);
        PendingIntent pi = PendingIntent.getBroadcast(activity, DAILY_ALARM_REQUEST, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
    }

    @JavascriptInterface public void notifyRestFinished() {
        requestNotificationPermission();
        activity.sendBroadcast(new Intent(activity, WorkoutNotificationReceiver.class)
                .setAction(WorkoutNotificationReceiver.ACTION_REST)
                .putExtra("title", "Recupero terminato")
                .putExtra("body", "Pronto per la prossima serie."));
    }

    private void sendWidgetSync() {
        activity.sendBroadcast(new Intent(activity, WidgetSyncReceiver.class)
                .setAction(WidgetSyncReceiver.ACTION_SYNC));
    }
}
