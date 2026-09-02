package com.example.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.Calendar;

public class MainActivity extends BridgeActivity {
    private static final String STATE_PREFS = "hybrid_training_widget";
    private static final String STATE_KEY = "state";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7001;
    private static final int DAILY_ALARM_REQUEST = 7002;
    private static final Handler HANDLER = new Handler();
    private final WidgetJavascriptBridge widgetBridge = new WidgetJavascriptBridge();
    private HealthConnectBridge healthBridge;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        healthBridge = new HealthConnectBridge(this);
        installWidgetBridge();
        WeeklyPhotoReceiver.schedule(this);
        NotificationHelper.ensureChannels(this);
    }

    @Override public void onResume() { super.onResume(); installWidgetBridge(); }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (healthBridge != null) healthBridge.handleActivityResult(requestCode, resultCode, data);
    }

    private void installWidgetBridge() {
        final WebView webView = getBridge().getWebView();
        if (webView == null) { HANDLER.postDelayed(this::installWidgetBridge, 500); return; }
        webView.getSettings().setJavaScriptEnabled(true);
        webView.addJavascriptInterface(widgetBridge, "AndroidWidgetBridge");
        if (healthBridge == null) healthBridge = new HealthConnectBridge(this);
        webView.addJavascriptInterface(healthBridge, "AndroidHealthBridge");
        injectWidgetSyncScript(webView, 300);
        injectWidgetSyncScript(webView, 1000);
        injectWidgetSyncScript(webView, 2500);
        injectWidgetSyncScript(webView, 5000);
    }

    private void injectWidgetSyncScript(final WebView webView, long delayMs) {
        HANDLER.postDelayed(() -> {
            String script = "javascript:(function(){" +
                    "if(!window.__htsNativeBoot){" +
                    "var s=document.createElement('script');s.src='workout-ux.js';s.async=false;document.head.appendChild(s);" +
                    "var r=document.createElement('script');r.src='roadmap-features.js';r.async=false;document.head.appendChild(r);" +
                    "var h=document.createElement('script');h.src='health-connect.service.js';h.async=false;document.head.appendChild(h);" +
                    "var hu=document.createElement('script');hu.src='health-connect-ui.js';hu.async=false;document.head.appendChild(hu);" +
                    "var a=document.createElement('script');a.src='native-auth.js';a.async=false;document.head.appendChild(a);" +
                    "window.__htsNativeBoot=true;}" +
                    "if(window.__hybridWidgetBridgeInstalled){try{window.__hybridWidgetBridgeSync();}catch(e){}return;}" +
                    "var KEY='hybridTrainingSystem';var last='';" +
                    "window.__hybridWidgetBridgeSync=function(){try{var raw=localStorage.getItem(KEY);if(raw&&raw!==last&&window.AndroidWidgetBridge){window.AndroidWidgetBridge.sync(raw);last=raw;}}catch(e){}};" +
                    "window.__hybridWidgetBridgeInstalled=true;window.__hybridWidgetBridgeSync();setInterval(window.__hybridWidgetBridgeSync,1000);" +
                    "document.addEventListener('visibilitychange',window.__hybridWidgetBridgeSync);window.addEventListener('pageshow',window.__hybridWidgetBridgeSync);" +
                    "})();";
            webView.evaluateJavascript(script, null);
        }, delayMs);
    }

    public class WidgetJavascriptBridge {
        @JavascriptInterface public void sync(String rawState) {
            if (rawState == null || rawState.length() == 0 || rawState.length() > 1024 * 1024) return;
            try { new org.json.JSONObject(rawState); getSharedPreferences(STATE_PREFS, MODE_PRIVATE).edit().putString(STATE_KEY, rawState).putLong("updated_at", System.currentTimeMillis()).apply(); sendWidgetSync(); } catch (Exception ignored) {}
        }
        @JavascriptInterface public void syncWorkoutLog(String rawLog) {
            if (rawLog == null || rawLog.length() > 20000) return;
            getSharedPreferences(STATE_PREFS, MODE_PRIVATE).edit().putString("latest_log", rawLog).putLong("updated_at", System.currentTimeMillis()).apply(); sendWidgetSync();
        }
        @JavascriptInterface public void requestNotificationPermission() {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
        @JavascriptInterface public void scheduleDailyNotification(int hour, int minute, String title, String body) {
            requestNotificationPermission();
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(MainActivity.this, WorkoutNotificationReceiver.class).setAction(WorkoutNotificationReceiver.ACTION_DAILY);
            i.putExtra("title", title); i.putExtra("body", body);
            PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, DAILY_ALARM_REQUEST, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Calendar next = Calendar.getInstance(); next.set(Calendar.HOUR_OF_DAY, Math.max(0, Math.min(23, hour))); next.set(Calendar.MINUTE, Math.max(0, Math.min(59, minute))); next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
            if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
            am.cancel(pi); am.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
        }
        @JavascriptInterface public void cancelDailyNotification() {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(MainActivity.this, WorkoutNotificationReceiver.class).setAction(WorkoutNotificationReceiver.ACTION_DAILY);
            PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, DAILY_ALARM_REQUEST, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE); am.cancel(pi);
        }
        @JavascriptInterface public void notifyRestFinished() {
            requestNotificationPermission();
            Intent i = new Intent(MainActivity.this, WorkoutNotificationReceiver.class).setAction(WorkoutNotificationReceiver.ACTION_REST);
            i.putExtra("title", "Recupero terminato"); i.putExtra("body", "Pronto per la prossima serie.");
            sendBroadcast(i);
        }
    }

    private void sendWidgetSync() { Intent syncIntent = new Intent(this, WidgetSyncReceiver.class).setAction(WidgetSyncReceiver.ACTION_SYNC); sendBroadcast(syncIntent); }
}
