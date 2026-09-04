package com.example.app;

import static org.junit.Assert.assertEquals;

import android.content.Intent;

import org.junit.Test;

public class LifecycleActionTest {
    @Test public void bootActionMatchesAndroidConstant() {
        assertEquals(Intent.ACTION_BOOT_COMPLETED, "android.intent.action.BOOT_COMPLETED");
    }
}
