package com.example.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.Calendar;

public class MainActivity extends BridgeActivity {
    private static final String STATE_PREFS = "hybrid_training_widget";
    private static final String STATE_KEY = "state";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7001;
    private static final int DAILY_ALARM_REQUEST = 7002;
    private static final String HC_PROMPT_PREFS = "health_connect_prompt";
    private static final String HC_PROMPTED_KEY = "permission_prompted_v1";

    private final WidgetJavascriptBridge widgetBridge = new WidgetJavascriptBridge();
    private HealthConnectBridge healthBridge;
    private HeartRateHealthConnectBridge heartRateBridge;
    private WebView installedWebView;
    private boolean widgetBridgeInstalled;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        healthBridge = new HealthConnectBridge(this);
        heartRateBridge = new HeartRateHealthConnectBridge(this);
        installWidgetBridge();
        WeeklyPhotoReceiver.schedule(this);
        NotificationHelper.ensureChannels(this);
        scheduleInitialHealthConnectPermissionPrompt();
    }

    @Override public void onResume() {
        super.onResume();
        installWidgetBridge();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (healthBridge != null) healthBridge.handleActivityResult(requestCode, resultCode, data);
    }

    @Override public void onDestroy() {
        if (healthBridge != null) {
            healthBridge.destroy();
            healthBridge = null;
        }
        if (heartRateBridge != null) {
            heartRateBridge.destroy();
            heartRateBridge = null;
        }
        if (installedWebView != null) {
            installedWebView.removeJavascriptInterface("AndroidWidgetBridge");
            installedWebView.removeJavascriptInterface("AndroidHealthBridge");
            installedWebView.removeJavascriptInterface("AndroidHeartRateBridge");
            installedWebView = null;
        }
        widgetBridgeInstalled = false;
        super.onDestroy();
    }

    private void scheduleInitialHealthConnectPermissionPrompt() {
        getWindow().getDecorView().postDelayed(() -> {
            if (healthBridge == null || isFinishing() || (Build.VERSION.SDK_INT >= 17 && isDestroyed())) return;
            boolean alreadyPrompted = getSharedPreferences(HC_PROMPT_PREFS, MODE_PRIVATE)
                    .getBoolean(HC_PROMPTED_KEY, false);
            if (alreadyPrompted) return;

            try {
                int status = androidx.health.connect.client.HealthConnectClient.getSdkStatus(
                        this,
                        "com.google.android.apps.healthdata");
                if (status == androidx.health.connect.client.HealthConnectClient.SDK_AVAILABLE) {
                    getSharedPreferences(HC_PROMPT_PREFS, MODE_PRIVATE)
                            .edit().putBoolean(HC_PROMPTED_KEY, true).apply();
                    healthBridge.requestHealthPermissions();
                }
            } catch (Throwable ignored) {
                // The in-app Health Connect controls remain available if auto-prompt is unavailable.
            }
        }, 1200L);
    }

    private void installWidgetBridge() {
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;

        if (installedWebView != webView || !widgetBridgeInstalled) {
            webView.getSettings().setJavaScriptEnabled(true);
            webView.addJavascriptInterface(widgetBridge, "AndroidWidgetBridge");
            if (healthBridge != null) {
                webView.addJavascriptInterface(healthBridge, "AndroidHealthBridge");
            }
            if (heartRateBridge != null) {
                webView.addJavascriptInterface(heartRateBridge, "AndroidHeartRateBridge");
            }
            installedWebView = webView;
            widgetBridgeInstalled = true;
            bootstrapNativeScripts(webView);
        }
        syncWidgetState(webView);
    }

    private void bootstrapNativeScripts(final WebView webView) {
        String script = "javascript:(function(){" +
                "window.__htsNativeScriptErrors=window.__htsNativeScriptErrors||[];" +
                "var files=['native-auth.js','workout-ux.js','roadmap-features.js','health-connect.service.js','health-connect-ui.js','health-dashboard.js','ui-shell-refactor.js','ui-consistency.js','offline-sync.js'];" +
                "files.forEach(function(src){" +
                "if(document.querySelector('script[data-hts-src=\\\"'+src+'\\\"]'))return;" +
                "var s=document.createElement('script');s.src=src;s.async=false;s.setAttribute('data-hts-src',src);" +
                "s.onload=function(){s.setAttribute('data-hts-loaded','1');};" +
                "s.onerror=function(){if(window.__htsNativeScriptErrors.indexOf(src)<0)window.__htsNativeScriptErrors.push(src);};" +
                "document.head.appendChild(s);" +
                "});" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    private void syncWidgetState(final WebView webView) {
        String script = "javascript:(function(){" +
                "if(window.__hybridWidgetBridgeSync){window.__hybridWidgetBridgeSync();return;}" +
                "var KEY='hybridTrainingSystem';var last='';" +
                "window.__hybridWidgetBridgeSync=function(){try{" +
                "var raw=localStorage.getItem(KEY);" +
                "if(raw&&raw!==last&&window.AndroidWidgetBridge){window.AndroidWidgetBridge.sync(raw);last=raw;}" +
                "}catch(e){}};" +
                "window.__hybridWidgetBridgeSync();" +
                "window.__hybridWidgetBridgeTimer=window.__hybridWidgetBridgeTimer||setInterval(window.__hybridWidgetBridgeSync,1000);" +
                "document.addEventListener('visibilitychange',window.__hybridWidgetBridgeSync);" +
                "window.addEventListener('pageshow',window.__hybridWidgetBridgeSync);" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    public class WidgetJavascriptBridge {
        @JavascriptInterface public void sync(String rawState) {
            if (rawState == null || rawState.length() == 0 || rawState.length() > 1024 * 1024) return;
            try {
                new org.json.JSONObject(rawState);
                getSharedPreferences(STATE_PREFS, MODE_PRIVATE).edit()
                        .putString(STATE_KEY, rawState)
                        .putLong("updated_at", System.currentTimeMillis())
                        .apply();
                sendWidgetSync();
            } catch (Exception ignored) {}
        }

        @JavascriptInterface public void syncWorkoutLog(String rawLog) {
            if (rawLog == null || rawLog.length() > 20000) return;
            getSharedPreferences(STATE_PREFS, MODE_PRIVATE).edit()
                    .putString("latest_log", rawLog)
                    .putLong("updated_at", System.currentTimeMillis())
                    .apply();
            sendWidgetSync();
        }

        @JavascriptInterface public void requestNotificationPermission() {
            if (Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_PERMISSION_REQUEST));
            }
        }

        @JavascriptInterface public void scheduleDailyNotification(int hour, int minute, String title, String body) {
            requestNotificationPermission();
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(MainActivity.this, WorkoutNotificationReceiver.class).setAction(WorkoutNotificationReceiver.ACTION_DAILY);
            i.putExtra("title", title);
            i.putExtra("body", body);
            PendingIntent pi = PendingIntent.getBroadcast(
                    MainActivity.this,
                    DAILY_ALARM_REQUEST,
                    i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Calendar next = Calendar.getInstance();
            next.set(Calendar.HOUR_OF_DAY, Math.max(0, Math.min(23, hour)));
            next.set(Calendar.MINUTE, Math.max(0, Math.min(59, minute)));
            next.set(Calendar.SECOND, 0);
            next.set(Calendar.MILLISECOND, 0);
            if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
            am.cancel(pi);
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
        }

        @JavascriptInterface public void cancelDailyNotification() {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(MainActivity.this, WorkoutNotificationReceiver.class).setAction(WorkoutNotificationReceiver.ACTION_DAILY);
            PendingIntent pi = PendingIntent.getBroadcast(
                    MainActivity.this,
                    DAILY_ALARM_REQUEST,
                    i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.cancel(pi);
        }

        @JavascriptInterface public void notifyRestFinished() {
            requestNotificationPermission();
            Intent i = new Intent(MainActivity.this, WorkoutNotificationReceiver.class).setAction(WorkoutNotificationReceiver.ACTION_REST);
            i.putExtra("title", "Recupero terminato");
            i.putExtra("body", "Pronto per la prossima serie.");
            sendBroadcast(i);
        }
    }

    private void sendWidgetSync() {
        Intent syncIntent = new Intent(this, WidgetSyncReceiver.class).setAction(WidgetSyncReceiver.ACTION_SYNC);
        sendBroadcast(syncIntent);
    }
}
