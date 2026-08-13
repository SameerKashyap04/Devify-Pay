package com.lesimoes.androidnotificationlistener;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

public class BootUpReceiver extends BroadcastReceiver {
    private static final String TAG = "DevifyPayBootUp";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "";
        Log.d(TAG, "BootUpReceiver triggered with action: " + action);

        try {
            Intent serviceIntent = new Intent(context, RNAndroidNotificationListener.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "BootUpReceiver error: " + e.getMessage());
        }

        RNAndroidNotificationListener.ensureListenerConnected(context);
    }
}