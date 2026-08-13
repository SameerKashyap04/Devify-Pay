package com.lesimoes.androidnotificationlistener;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Watchdog BroadcastReceiver for Android 9+ Doze Mode.
 * Fired periodically by AlarmManager (using setAndAllowWhileIdle).
 * 
 * 1. Reschedules the next 10-min Doze alarm.
 * 2. Starts foreground service if killed.
 * 3. Ensures NotificationListener is active via ComponentName toggle.
 */
public class ServiceWatchdogReceiver extends BroadcastReceiver {
    private static final String TAG = "DevifyPayWatchdog";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Watchdog alarm fired on Android — checking service state");

        // 1. Reschedule next watchdog alarm
        RNAndroidNotificationListener.scheduleWatchdogAlarm(context);

        // 2. Start foreground service if dead
        try {
            Intent serviceIntent = new Intent(context, RNAndroidNotificationListener.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Watchdog startForegroundService error: " + e.getMessage());
        }

        // 3. Force re-bind NotificationListenerService to prevent Android 9 Doze unbinding
        RNAndroidNotificationListener.ensureListenerConnected(context);
    }
}
