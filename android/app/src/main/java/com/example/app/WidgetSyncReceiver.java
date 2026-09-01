package com.example.app;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Riceve le richieste di sincronizzazione provenienti dalla WebView.
 * Separare questa responsabilità dal provider del widget rende il bridge
 * indipendente dal ciclo di vita della MainActivity.
 */
public class WidgetSyncReceiver extends BroadcastReceiver {
    public static final String ACTION_SYNC = "com.example.app.widget.SYNC";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_SYNC.equals(intent.getAction())) {
            HybridTrainingWidgetProvider.updateAllWidgets(context.getApplicationContext());
        }
    }
}
