package com.example.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * Capacitor entry point.
 *
 * The WebApp remains the source of truth and stores its state in
 * localStorage. This activity exposes a very small native interface to the
 * WebView. The native snapshot is stored in SharedPreferences and the
 * dedicated WidgetSyncReceiver refreshes the widgets.
 */
public class MainActivity extends BridgeActivity {

    private static final String STATE_PREFS = "hybrid_training_widget";
    private static final String STATE_KEY = "state";
    private static final Handler HANDLER = new Handler();
    private final WidgetJavascriptBridge widgetBridge = new WidgetJavascriptBridge();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installWidgetBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        installWidgetBridge();
    }

    private void installWidgetBridge() {
        final WebView webView = getBridge().getWebView();
        if (webView == null) {
            HANDLER.postDelayed(this::installWidgetBridge, 500);
            return;
        }

        webView.getSettings().setJavaScriptEnabled(true);
        webView.addJavascriptInterface(widgetBridge, "AndroidWidgetBridge");

        // Do not rely on one fixed load time: Capacitor/WebView can finish
        // loading at different times on different devices.
        injectWidgetSyncScript(webView, 300);
        injectWidgetSyncScript(webView, 1000);
        injectWidgetSyncScript(webView, 2500);
        injectWidgetSyncScript(webView, 5000);
    }

    private void injectWidgetSyncScript(final WebView webView, long delayMs) {
        HANDLER.postDelayed(() -> {
            if (webView == null) return;

            String script = "javascript:(function(){" +
                    "if(window.__hybridWidgetBridgeInstalled){try{window.__hybridWidgetBridgeSync();}catch(e){}return;}" +
                    "var KEY='hybridTrainingSystem';" +
                    "var last='';" +
                    "window.__hybridWidgetBridgeSync=function(){" +
                    "try{" +
                    "var raw=localStorage.getItem(KEY);" +
                    "if(raw && raw!==last && window.AndroidWidgetBridge){" +
                    "window.AndroidWidgetBridge.sync(raw);last=raw;" +
                    "}" +
                    "}catch(e){console.warn('Widget bridge sync failed',e);}" +
                    "};" +
                    "window.__hybridWidgetBridgeInstalled=true;" +
                    "window.__hybridWidgetBridgeSync();" +
                    "setInterval(window.__hybridWidgetBridgeSync,1000);" +
                    "document.addEventListener('visibilitychange',window.__hybridWidgetBridgeSync);" +
                    "window.addEventListener('pageshow',window.__hybridWidgetBridgeSync);" +
                    "})();";

            webView.evaluateJavascript(script, null);
        }, delayMs);
    }

    public class WidgetJavascriptBridge {
        @JavascriptInterface
        public void sync(String rawState) {
            if (rawState == null || rawState.length() == 0 || rawState.length() > 1024 * 1024) return;

            try {
                new org.json.JSONObject(rawState);

                getSharedPreferences(STATE_PREFS, MODE_PRIVATE)
                        .edit()
                        .putString(STATE_KEY, rawState)
                        .putLong("updated_at", System.currentTimeMillis())
                        .apply();

                // Dedicated receiver: MainActivity no longer owns widget refresh.
                Intent syncIntent = new Intent(MainActivity.this, WidgetSyncReceiver.class);
                syncIntent.setAction(WidgetSyncReceiver.ACTION_SYNC);
                sendBroadcast(syncIntent);
            } catch (Exception ignored) {
                // Invalid localStorage content must never break the WebApp.
            }
        }
    }
}
