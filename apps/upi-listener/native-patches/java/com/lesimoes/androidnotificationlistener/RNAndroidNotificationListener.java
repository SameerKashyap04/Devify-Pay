package com.lesimoes.androidnotificationlistener;

import android.content.Intent;
import android.content.Context;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.gson.Gson;

import com.facebook.react.HeadlessJsTaskService;

public class RNAndroidNotificationListener extends NotificationListenerService {
    private static final String TAG = "RNAndroidNotificationListener";
    private static final String CHANNEL_ID = "devify_pay_listener_channel";
    private static final int NOTIFICATION_ID = 88225;

    @Override
    public void onCreate() {
        super.onCreate();
        startForegroundServiceNotification();
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        startForegroundServiceNotification();
    }

    private void startForegroundServiceNotification() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Devify Pay Background Service",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Keeps Devify Pay UPI Listener running in background");
                NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    manager.createNotificationChannel(channel);
                }
            }

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("Devify Pay Listener")
                    .setContentText("Active in background — Monitoring UPI Payments")
                    .setSmallIcon(android.R.drawable.stat_notify_sync)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOngoing(true)
                    .build();

            startForeground(NOTIFICATION_ID, notification);
            Log.d(TAG, "Foreground service notification started successfully.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start foreground service notification: " + e.getMessage());
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {       
        Notification statusBarNotification = sbn.getNotification();

        if (statusBarNotification == null || statusBarNotification.extras == null) {
            Log.d(TAG, "The notification received has no data");
            return;
        }

        Context context = getApplicationContext();

        // ========== NATIVE JAVA HTTPS SENDER (works even when JS bridge is dead) ==========
        // This fires BEFORE HeadlessJS, so the payment reaches the server 100% of the time.
        try {
            RNNotification notifData = new RNNotification(context, sbn);
            String appPackage = sbn.getPackageName();
            String title = notifData.title;
            String body = notifData.text != null ? notifData.text : notifData.bigText;
            Log.d(TAG, "NATIVE SENDER: Notification from " + appPackage + " | title=" + title + " | body=" + body);
            NativeUpiNotifySender.processAndSend(context, appPackage, title, body);
        } catch (Exception e) {
            Log.e(TAG, "NATIVE SENDER failed (non-fatal): " + e.getMessage());
        }
        // ==================================================================================

        Intent serviceIntent = new Intent(context, RNAndroidNotificationListenerHeadlessJsTaskService.class);

        RNNotification notification = new RNNotification(context, sbn);

        Gson gson = new Gson();
        String serializedNotification = gson.toJson(notification);

        serviceIntent.putExtra("notification", serializedNotification);

        HeadlessJsTaskService.acquireWakeLockNow(context);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {}
}