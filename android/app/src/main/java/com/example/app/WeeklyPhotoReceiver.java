package com.example.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Calendar;

public class WeeklyPhotoReceiver extends BroadcastReceiver {
    public static final String ACTION_WEEKLY_PHOTO = "com.example.app.notification.WEEKLY_PHOTO";
    private static final int REQUEST_CODE = 7601;

    @Override public void onReceive(Context context, Intent intent) {
        if (!ACTION_WEEKLY_PHOTO.equals(intent.getAction())) return;
        NotificationHelper.show(context, 7602, NotificationHelper.PHOTO_CHANNEL_ID,
                "Foto progressi", "È il momento della tua foto settimanale dei progressi.");
    }

    public static void schedule(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(context, WeeklyPhotoReceiver.class).setAction(ACTION_WEEKLY_PHOTO);
        PendingIntent pi = PendingIntent.getBroadcast(context, REQUEST_CODE, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Calendar next = Calendar.getInstance();
        next.set(Calendar.DAY_OF_WEEK, Calendar.SUNDAY);
        next.set(Calendar.HOUR_OF_DAY, 10);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.WEEK_OF_YEAR, 1);
        am.cancel(pi);
        if (Build.VERSION.SDK_INT >= 19) {
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), AlarmManager.INTERVAL_DAY * 7L, pi);
        } else {
            am.setRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), AlarmManager.INTERVAL_DAY * 7L, pi);
        }
    }
}
