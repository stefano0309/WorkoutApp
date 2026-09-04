package com.example.app;

import android.webkit.WebView;

/** Owns installation of the WebView-facing native bridges. */
public final class NativeBridgeManager {
    private final MainActivity activity;
    private final WidgetJavascriptBridge widgetBridge;
    private final HealthConnectBridge healthBridge;
    private final HeartRateHealthConnectBridge heartRateBridge;
    private WebView installedWebView;
    private boolean installed;

    public NativeBridgeManager(MainActivity activity, WidgetJavascriptBridge widgetBridge,
                               HealthConnectBridge healthBridge, HeartRateHealthConnectBridge heartRateBridge) {
        this.activity = activity;
        this.widgetBridge = widgetBridge;
        this.healthBridge = healthBridge;
        this.heartRateBridge = heartRateBridge;
    }

    public void install() {
        WebView webView = activity.getBridge().getWebView();
        if (webView == null) return;
        if (installedWebView != webView || !installed) {
            webView.getSettings().setJavaScriptEnabled(true);
            webView.addJavascriptInterface(widgetBridge, "AndroidWidgetBridge");
            webView.addJavascriptInterface(healthBridge, "AndroidHealthBridge");
            webView.addJavascriptInterface(heartRateBridge, "AndroidHeartRateBridge");
            installedWebView = webView;
            installed = true;
        }
        bootstrapNativeScripts(webView);
        syncWidgetState(webView);
    }

    private void bootstrapNativeScripts(WebView webView) {
        String script = "javascript:(function(){" +
                "window.__htsNativeScriptErrors=window.__htsNativeScriptErrors||[];" +
                "function ensure(){" +
                "var files=['native-auth.js','workout-ux.js','roadmap-features.js','health-connect.service.js','health-connect-ui.js','health-dashboard.js','ui-shell-refactor.js','ui-consistency.js','offline-sync.js'];" +
                "files.forEach(function(src){" +
                "if(document.querySelector('script[data-hts-src=\\\"'+src+'\\\"]'))return;" +
                "var s=document.createElement('script');s.src=src;s.async=false;s.setAttribute('data-hts-src',src);" +
                "s.onload=function(){s.setAttribute('data-hts-loaded','1');};" +
                "s.onerror=function(){if(window.__htsNativeScriptErrors.indexOf(src)<0)window.__htsNativeScriptErrors.push(src);};" +
                "document.head.appendChild(s);" +
                "});}" +
                "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    private void syncWidgetState(WebView webView) {
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

    public void destroy() {
        if (installedWebView != null) {
            installedWebView.removeJavascriptInterface("AndroidWidgetBridge");
            installedWebView.removeJavascriptInterface("AndroidHealthBridge");
            installedWebView.removeJavascriptInterface("AndroidHeartRateBridge");
            installedWebView = null;
        }
        installed = false;
    }
}
