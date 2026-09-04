package com.example.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/** Lifecycle coordinator for the Capacitor host activity. */
public class MainActivity extends BridgeActivity {
    private static final String HC_PROMPT_PREFS = "health_connect_prompt";
    private static final String HC_PROMPTED_KEY = "permission_prompted_v1";

    private HealthConnectBridge healthBridge;
    private HeartRateHealthConnectBridge heartRateBridge;
    private NativeBridgeManager nativeBridgeManager;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        healthBridge = new HealthConnectBridge(this);
        heartRateBridge = new HeartRateHealthConnectBridge(this);
        nativeBridgeManager = new NativeBridgeManager(
                this,
                new WidgetJavascriptBridge(this),
                healthBridge,
                heartRateBridge);
        nativeBridgeManager.install();
        WeeklyPhotoReceiver.schedule(this);
        NotificationHelper.ensureChannels(this);
        scheduleInitialHealthConnectPermissionPrompt();
    }

    @Override public void onResume() {
        super.onResume();
        if (nativeBridgeManager != null) nativeBridgeManager.install();
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
        if (nativeBridgeManager != null) {
            nativeBridgeManager.destroy();
            nativeBridgeManager = null;
        }
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
                // In-app Health Connect controls remain available if auto-prompt is unavailable.
            }
        }, 1200L);
    }
}
