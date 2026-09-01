package com.example.app;

import android.os.Bundle;
import android.os.Handler;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — punto di ingresso nativo Android per l'app Capacitor.
 *
 * Bridge WebApp -> Android Widget:
 * la webapp salva normalmente il proprio stato in localStorage. Un piccolo
 * script viene iniettato nel WebView e sincronizza il valore di
 * "hybridTrainingSystem" con SharedPreferences Android. Il widget legge poi
 * lo stesso snapshot anche quando la WebView non e' aperta.
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
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        webView.getSettings().setJavaScriptEnabled(true);
        webView.addJavascriptInterface(widgetBridge, "AndroidWidgetBridge");

        // Capacitor deve prima completare il caricamento della pagina.
        // Ripetiamo l'iniezione per coprire avvii lenti del WebView.
        injectWidgetSyncScript(webView, 800);
        injectWidgetSyncScript(webView, 2000);
        injectWidgetSyncScript(webView, 4000);
    }

    private void injectWidgetSyncScript(final WebView webView, long delayMs) {
        HANDLER.postDelayed(() -> {
            if (webView == null) return;
            String script = "(function(){" +
                    "if(window.__hybridWidgetBridgeInstalled)return;" +
                    "window.__hybridWidgetBridgeInstalled=true;" +
                    "var KEY='hybridTrainingSystem';" +
                    "var last=null;" +
                    "function sync(){try{" +
                    "var raw=localStorage.getItem(KEY);" +
                    "if(raw&&raw!==last&&window.AndroidWidgetBridge){" +
                    "window.AndroidWidgetBridge.sync(raw);last=raw;" +
                    "}}catch(e){console.warn('Widget bridge sync failed',e);}}" +
                    "sync();setInterval(sync,2000);" +
                    "document.addEventListener('visibilitychange',sync);" +
                    "window.addEventListener('pagehide',sync);" +
                    "})();";
            webView.evaluateJavascript(script, null);
        }, delayMs);
    }

    public class WidgetJavascriptBridge {
        @JavascriptInterface
        public void sync(String rawState) {
            if (rawState == null || rawState.length() > 1024 * 1024) return;

            try {
                // Validazione minima: evitiamo di salvare dati non JSON.
                new org.json.JSONObject(rawState);

                getSharedPreferences(STATE_PREFS, MODE_PRIVATE)
                        .edit()
                        .putString(STATE_KEY, rawState)
                        .putLong("updated_at", System.currentTimeMillis())
                        .apply();

                HybridTrainingWidgetProvider.updateAllWidgets(MainActivity.this);
            } catch (Exception ignored) {
                // Uno snapshot corrotto non deve bloccare la webapp.
            }
        }
    }
}
