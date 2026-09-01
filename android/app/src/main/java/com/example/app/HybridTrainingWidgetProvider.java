package com.example.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

public class HybridTrainingWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_OPEN_APP = "com.example.app.widget.OPEN_APP";

    private static final String[] DAYS = {"Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"};
    private static final String[] TITLES = {"Upper Strength", "Lower Strength + Corsa Facile", "Interval Run", "Upper Strength + Corsa Facile", "Lower Strength + Corsa Progressiva", "Recupero Attivo (Run)", "Long Run"};
    private static final String[] FOCUS = {"Push-up / Pull-up", "Unilateralità", "Soglia / VO₂max", "Volume braccia/spalle", "Potenza + fatica", "Smaltimento", "Efficienza aerobica"};
    private static final String[] CARDIO = {"Nessun cardio", "Zona 1", "Zona 4", "Zona 1–2", "Progressiva", "Zona 1", "Zona 2"};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) updateWidget(context, manager, id);
    }

    @Override
    public void onEnabled(Context context) {
        super.onEnabled(context);
        updateAllWidgets(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_OPEN_APP.equals(intent.getAction())) {
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(launch);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, HybridTrainingWidgetProvider.class);
        for (int id : manager.getAppWidgetIds(provider)) updateWidget(context, manager, id);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        Calendar now = Calendar.getInstance();
        int dayIndex = (now.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_training_today);

        views.setTextViewText(R.id.widget_day, DAYS[dayIndex]);
        views.setTextViewText(R.id.widget_title, TITLES[dayIndex]);
        views.setTextViewText(R.id.widget_focus, "Focus · " + FOCUS[dayIndex]);
        views.setTextViewText(R.id.widget_cardio, CARDIO[dayIndex]);
        views.setTextViewText(R.id.widget_date, new SimpleDateFormat("EEEE d MMMM", Locale.ITALIAN).format(now.getTime()));
        views.setTextViewText(R.id.widget_type, (dayIndex == 2 || dayIndex == 5 || dayIndex == 6) ? "CORSA" : "FORZA + CARDIO");

        Intent openIntent = new Intent(context, HybridTrainingWidgetProvider.class);
        openIntent.setAction(ACTION_OPEN_APP);
        PendingIntent pending = PendingIntent.getBroadcast(context, widgetId, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_open, pending);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        manager.updateAppWidget(widgetId, views);
    }
}
