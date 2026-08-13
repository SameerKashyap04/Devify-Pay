package com.lesimoes.androidnotificationlistener;

import android.content.Intent;
import android.content.Context;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import com.google.gson.Gson;

import com.facebook.react.HeadlessJsTaskService;

/**
 * Persistent NotificationListenerService for Devify Pay.
 * 
 * Key survival mechanisms:
 * 1. START_STICKY: tells Android to restart the service if killed
 * 2. WakeLock: prevents CPU sleep during notification processing
 * 3. AlarmManager watchdog: periodic alarm that re-fires foreground notification
 * 4. onListenerDisconnected/onDestroy: request rebind via toggleNotificationListenerService
 * 5. foregroundServiceType="specialUse" for Android 14+ compatibility
 */
public class RNAndroidNotificationListener extends NotificationListenerService {
    private static final String TAG = "RNAndroidNotificationListener";
    private static final String CHANNEL_ID = "devify_pay_listener_channel";
    private static final int NOTIFICATION_ID = 88225;
    private static final int WATCHDOG_ALARM_ID = 88226;
    private static final long WATCHDOG_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate() — starting foreground + watchdog");
        startForegroundServiceNotification();
        acquirePartialWakeLock();
        scheduleWatchdogAlarm();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        Log.d(TAG, "onStartCommand() — ensuring foreground alive");
        startForegroundServiceNotification();
        // START_STICKY: Android will restart this service after kill
        return START_STICKY;
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "onListenerConnected() — service connected to notification system");
        startForegroundServiceNotification();
        scheduleWatchdogAlarm();
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.w(TAG, "onListenerDisconnected() — attempting rebind...");
        // Request Android to rebind the notification listener
        try {
            requestRebind(null);
            Log.d(TAG, "requestRebind() called successfully");
        } catch (Exception e) {
            Log.e(TAG, "requestRebind failed: " + e.getMessage());
        }
    }

    @Override
    public void onDestroy() {
        Log.w(TAG, "onDestroy() — scheduling restart...");
        // Schedule an alarm to restart the service
        scheduleRestartAlarm();
        releaseWakeLock();
        super.onDestroy();
    }

    /**
     * Acquire a partial wake lock to prevent CPU sleep.
     * This ensures notification processing completes even in deep sleep.
     */
    private void acquirePartialWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "DevifyPay:NotificationListenerWakeLock"
                    );
                    wakeLock.acquire(24 * 60 * 60 * 1000L); // 24 hours max
                    Log.d(TAG, "Partial wake lock acquired (24h timeout)");
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock: " + e.getMessage());
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
                Log.d(TAG, "Wake lock released");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to release wake lock: " + e.getMessage());
        }
    }

    /**
     * Create a persistent foreground notification to keep the service alive.
     */
    private void startForegroundServiceNotification() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Devify Pay Background Service",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Keeps Devify Pay UPI Listener running in background");
                channel.setShowBadge(false);
                NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    manager.createNotificationChannel(channel);
                }
            }

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("Devify Pay Listener")
                    .setContentText("Active — Monitoring UPI Payments")
                    .setSmallIcon(android.R.drawable.stat_notify_sync)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOngoing(true)
                    .setCategory(NotificationCompat.CATEGORY_SERVICE)
                    .setVisibility(NotificationCompat.VISIBILITY_SECRET) // don't show on lock screen
                    .build();

            if (Build.VERSION.SDK_INT >= 34) {
                // Android 14+ requires foregroundServiceType
                startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.d(TAG, "Foreground service notification started successfully.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start foreground service notification: " + e.getMessage());
        }
    }

    /**
     * Schedule a repeating alarm every 10 minutes that re-fires the foreground notification.
     * This acts as a watchdog — if the service somehow lost its foreground state, the alarm re-establishes it.
     */
    private void scheduleWatchdogAlarm() {
        try {
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(this, ServiceWatchdogReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                this, WATCHDOG_ALARM_ID, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            if (alarmManager != null) {
                alarmManager.setRepeating(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL_MS,
                    WATCHDOG_INTERVAL_MS,
                    pendingIntent
                );
                Log.d(TAG, "Watchdog alarm scheduled every 10 minutes");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule watchdog alarm: " + e.getMessage());
        }
    }

    /**
     * Schedule a one-shot alarm to restart the service after it's destroyed.
     */
    private void scheduleRestartAlarm() {
        try {
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(this, ServiceWatchdogReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                this, WATCHDOG_ALARM_ID + 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            if (alarmManager != null) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    SystemClock.elapsedRealtime() + 5000, // restart after 5 seconds
                    pendingIntent
                );
                Log.d(TAG, "Restart alarm scheduled in 5 seconds");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule restart alarm: " + e.getMessage());
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {       
        Notification statusBarNotification = sbn.getNotification();

        if (statusBarNotification == null || statusBarNotification.extras == null) {
            Log.d(TAG, "The notification received has no data");
            return;
        }

        // Ignore our own foreground notification
        if (sbn.getPackageName().equals(getPackageName())) {
            return;
        }

        Context context = getApplicationContext();

        // ========== NATIVE JAVA HTTPS SENDER (works even when JS bridge is dead) ==========
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