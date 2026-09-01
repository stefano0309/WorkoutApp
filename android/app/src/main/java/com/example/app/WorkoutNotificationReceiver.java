package com.example.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/** Local workout notifications: daily reminder and recovery completion. */
public class WorkoutNotificationReceiver extends BroadcastReceiver {
    public static final String ACTION_DAILY = "com.example.app.notification.DAILY";
    public static final String ACTION_REST = "com.example.app.notification.REST";
    public static final String CHANNEL_ID = "workout_reminders";
    public static final String REST_CHANNEL_ID = "workout_recovery";

    @Override public void onReceive(Context context, Intent intent) {
        if (!ACTION_DAILY.equals(intent.getAction()) && !ACTION_REST.equals(intent.getAction())) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        String channel = ACTION_REST.equals(intent.getAction()) ? REST_CHANNEL_ID : CHANNEL_ID;
        String channelName = ACTION_REST.equals(intent.getAction()) ? "Recupero" : "Promemoria allenamento";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(channel, channelName, NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, ACTION_REST.equals(intent.getAction()) ? 9002 : 9001, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        if (title == null) title = ACTION_REST.equals(intent.getAction()) ? "Recupero terminato" : "Allenamento";
        if (body == null) body = ACTION_REST.equals(intent.getAction()) ? "Pronto per la prossima serie." : "È ora del tuo allenamento.";
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title).setContentText(body).setAutoCancel(true)
                .setContentIntent(pi).setPriority(NotificationCompat.PRIORITY_DEFAULT);
        nm.notify(ACTION_REST.equals(intent.getAction()) ? 9002 : 9001, b.build());
    }
}
