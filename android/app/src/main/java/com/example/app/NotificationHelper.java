package com.example.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

public final class NotificationHelper {
    public static final String CHANNEL_ID = "workout_reminders";
    public static final String PHOTO_CHANNEL_ID = "workout_photo_reminders";
    private NotificationHelper() {}

    public static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Promemoria allenamento", NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(new NotificationChannel(PHOTO_CHANNEL_ID, "Promemoria foto progressi", NotificationManager.IMPORTANCE_DEFAULT));
    }

    public static void show(Context context, int id, String channel, String title, String body) {
        ensureChannels(context);
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, id, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        nm.notify(id, builder.build());
    }
}
