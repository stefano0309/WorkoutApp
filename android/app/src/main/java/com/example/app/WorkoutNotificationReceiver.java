package com.example.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/** Delivers the local daily workout reminder. */
public class WorkoutNotificationReceiver extends BroadcastReceiver {
    public static final String ACTION_DAILY = "com.example.app.notification.DAILY";
    public static final String CHANNEL_ID = "workout_reminders";

    @Override public void onReceive(Context context, Intent intent) {
        if (!ACTION_DAILY.equals(intent.getAction())) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Promemoria allenamento", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, 9001, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(intent.getStringExtra("title") == null ? "Allenamento" : intent.getStringExtra("title"))
                .setContentText(intent.getStringExtra("body") == null ? "È ora del tuo allenamento." : intent.getStringExtra("body"))
                .setAutoCancel(true).setContentIntent(pi).setPriority(NotificationCompat.PRIORITY_DEFAULT);
        nm.notify(9001, b.build());
    }
}
