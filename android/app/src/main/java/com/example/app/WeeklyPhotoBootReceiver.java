package com.example.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores the weekly photo alarm after system lifecycle events. */
public final class WeeklyPhotoBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            WeeklyPhotoReceiver.schedule(context.getApplicationContext());
        }
    }
}
