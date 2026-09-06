package com.example.app;

import static org.junit.Assert.assertEquals;

import android.content.Intent;

import org.junit.Test;

public class WeeklyPhotoReceiverTest {
    @Test
    public void bootActionsAreSystemLifecycleActions() {
        assertEquals("android.intent.action.BOOT_COMPLETED", Intent.ACTION_BOOT_COMPLETED);
        assertEquals("android.intent.action.TIME_SET", Intent.ACTION_TIME_CHANGED);
        assertEquals("android.intent.action.TIMEZONE_CHANGED", Intent.ACTION_TIMEZONE_CHANGED);
    }
}
