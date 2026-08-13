package com.lesimoes.androidnotificationlistener;

import android.content.Intent;
import android.content.Context;
import android.content.ComponentName;
import android.content.pm.PackageManager;
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
 * Persistent NotificationListenerService for Devify Pay (Targeted & Optimized for Android 9+).
 * 
 * Android 9 (API 28) Doze & Idle Survival:
 * 1. toggleNotificationListenerService: Forces Android OS NotificationManager to re-bind listener.
 * 2. setAndAllowWhileIdle: Wakes up alarm during Android 9 Doze mode (which starts ~30 min idle).
 * 3. onTaskRemoved: Re-establishes foreground notification when app is swiped away from recents.
 * 4. START_STICKY: Ensures OS restarts service if process is reclaimed under memory pressure.
 * 5. Partial WakeLock: Keeps CPU awake during notification processing.
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
        Log.d(TAG, "onCreate() — starting foreground + watchdog + wake lock");
        startForegroundServiceNotification();
        acquirePartialWakeLock();
        scheduleWatchdogAlarm(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        Log.d(TAG, "onStartCommand() — ensuring foreground & listener binding");
        startForegroundServiceNotification();
        ensureListenerConnected(this);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.d(TAG, "onTaskRemoved() — app swiped from recents. Ensuring background service stays alive.");
        startForegroundServiceNotification();
        scheduleRestartAlarm(this);
        ensureListenerConnected(this);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "onListenerConnected() — service connected to Android notification manager");
        startForegroundServiceNotification();
        scheduleWatchdogAlarm(this);
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.w(TAG, "onListenerDisconnected() — attempting rebind & toggle...");
        rebindService(this);
    }

    @Override
    public void onDestroy() {
        Log.w(TAG, "onDestroy() — scheduling restart & rebind...");
        scheduleRestartAlarm(this);
        releaseWakeLock();
        super.onDestroy();
    }

    /**
     * Force Android NotificationManagerService to re-bind this NotificationListener.
     * Crucial for Android 9 when system unbinds idle listener after Doze mode.
     */
    public static void ensureListenerConnected(Context context) {
        try {
            ComponentName componentName = new ComponentName(context, RNAndroidNotificationListener.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                // Try requestRebind with explicit ComponentName
                NotificationListenerService.requestRebind(componentName);
            }
        } catch (Exception e) {
            Log.d(TAG, "requestRebind notice: " + e.getMessage());
            toggleNotificationListenerService(context);
        }
    }

    public static void rebindService(Context context) {
        try {
            ComponentName componentName = new ComponentName(context, RNAndroidNotificationListener.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                NotificationListenerService.requestRebind(componentName);
            } else {
                toggleNotificationListenerService(context);
            }
        } catch (Exception e) {
            Log.e(TAG, "rebindService error, using toggle fallback: " + e.getMessage());
            toggleNotificationListenerService(context);
        }
    }

    /**
     * Component toggle trick: disabling and re-enabling ComponentName forces Android OS to re-bind listener.
     */
    public static void toggleNotificationListenerService(Context context) {
        try {
            ComponentName componentName = new ComponentName(context, RNAndroidNotificationListener.class);
            PackageManager pm = context.getPackageManager();
            pm.setComponentEnabledSetting(
                componentName,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            );
            pm.setComponentEnabledSetting(
                componentName,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            );
            Log.d(TAG, "toggleNotificationListenerService completed successfully");
        } catch (Exception e) {
            Log.e(TAG, "toggleNotificationListenerService failed: " + e.getMessage());
        }
    }

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
                    Log.d(TAG, "Partial wake lock acquired");
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
     * Ongoing notification to prevent Android 9 from killing foreground process.
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
                    .setContentText("Active — Monitoring UPI Payments 24/7")
                    .setSmallIcon(android.R.drawable.stat_notify_sync)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOngoing(true)
                    .setCategory(NotificationCompat.CATEGORY_SERVICE)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .build();

            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.d(TAG, "Foreground service notification active.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start foreground service notification: " + e.getMessage());
        }
    }

    /**
     * Wakes up every 10 minutes even during Android 9 Doze mode (using setAndAllowWhileIdle).
     */
    public static void scheduleWatchdogAlarm(Context context) {
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(context, ServiceWatchdogReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, WATCHDOG_ALARM_ID, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            if (alarmManager != null) {
                long triggerAt = SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL_MS;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
                } else {
                    alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
                }
                Log.d(TAG, "Watchdog alarm scheduled (Doze-allowable) in 10 minutes");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule watchdog alarm: " + e.getMessage());
        }
    }

    public static void scheduleRestartAlarm(Context context) {
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(context, ServiceWatchdogReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, WATCHDOG_ALARM_ID + 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            if (alarmManager != null) {
                long triggerAt = SystemClock.elapsedRealtime() + 5000;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
                } else {
                    alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
                }
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
            return;
        }

        // Ignore our own notification
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