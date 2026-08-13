package com.lesimoes.androidnotificationlistener;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Watchdog BroadcastReceiver: triggered every 10 minutes by AlarmManager.
 * Re-starts the NotificationListenerService foreground notification if the
 * service was killed or lost its foreground state.
 * 
 * Also triggered after device boot (via BootUpReceiver → this receiver).
 */
public class ServiceWatchdogReceiver extends BroadcastReceiver {
    private static final String TAG = "DevifyPayWatchdog";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Watchdog alarm fired — ensuring notification listener service is alive");
        try {
            Intent serviceIntent = new Intent(context, RNAndroidNotificationListener.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to restart service: " + e.getMessage());
        }
    }
}
