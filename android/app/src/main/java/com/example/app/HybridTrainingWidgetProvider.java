package com.example.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** Home-screen widget for today's training. */
public class HybridTrainingWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_OPEN_APP = "com.example.app.widget.OPEN_APP";
    private static final String STATE_PREFS = "hybrid_training_widget";
    private static final String STATE_KEY = "state";

    private static final String[] DAYS = {"Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"};
    private static final String[] TITLES = {"Upper Strength", "Lower Strength + Corsa Facile", "Interval Run", "Upper Strength + Corsa Facile", "Lower Strength + Corsa Progressiva", "Recupero Attivo (Run)", "Long Run"};
    private static final String[] FOCUS = {"Push-up / Pull-up", "Unilateralità", "Soglia / VO₂max", "Volume braccia/spalle", "Potenza + fatica", "Smaltimento", "Efficienza aerobica"};
    private static final String[] CARDIO = {"Nessun cardio", "Zona 1", "Zona 4", "Zona 1–2", "Progressiva", "Zona 1", "Zona 2"};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
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
        Context appContext = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
        ComponentName provider = new ComponentName(appContext, HybridTrainingWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        for (int id : ids) {
            updateWidget(appContext, manager, id);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        try {
            Calendar now = Calendar.getInstance();
            int dayIndex = (now.get(Calendar.DAY_OF_WEEK) + 5) % 7;
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_training_today);

            views.setTextViewText(R.id.widget_type, (dayIndex == 2 || dayIndex == 5 || dayIndex == 6) ? "CORSA" : "FORZA + CARDIO");
            views.setTextViewText(R.id.widget_day, DAYS[dayIndex]);
            views.setTextViewText(R.id.widget_title, TITLES[dayIndex]);
            views.setTextViewText(R.id.widget_focus, "Focus · " + FOCUS[dayIndex]);
            views.setTextViewText(R.id.widget_cardio, CARDIO[dayIndex]);
            views.setTextViewText(R.id.widget_date,
                    new SimpleDateFormat("EEEE d MMMM", Locale.ITALIAN).format(now.getTime()));

            SharedPreferences prefs = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE);
            boolean synced = prefs.contains(STATE_KEY) || prefs.getLong("updated_at", 0L) > 0L;
            views.setTextViewText(R.id.widget_sync, synced ? "Dati sincronizzati dall'app" : "Programma settimanale");

            Intent openIntent = new Intent(context, HybridTrainingWidgetProvider.class);
            openIntent.setAction(ACTION_OPEN_APP);
            openIntent.setPackage(context.getPackageName());
            PendingIntent pending = PendingIntent.getBroadcast(
                    context,
                    widgetId,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, pending);
            views.setOnClickPendingIntent(R.id.widget_open, pending);

            manager.updateAppWidget(widgetId, views);
        } catch (Exception ignored) {
            // Never let a widget update crash the launcher process.
        }
    }
}
