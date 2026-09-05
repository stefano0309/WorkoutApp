package com.stefano.workout;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {
    @Test
    public void targetPackageIsConfigured() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("com.stefano.workout", appContext.getPackageName());
    }

    @Test
    public void launcherActivityResolvesToMainActivity() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent launchIntent = appContext.getPackageManager().getLaunchIntentForPackage(appContext.getPackageName());

        assertNotNull("The application must expose a launcher activity", launchIntent);
        assertNotNull("The launcher intent must resolve to an activity", launchIntent.resolveActivity(appContext.getPackageManager()));
        assertEquals("com.example.app.MainActivity", launchIntent.getComponent().getClassName());
    }
}
