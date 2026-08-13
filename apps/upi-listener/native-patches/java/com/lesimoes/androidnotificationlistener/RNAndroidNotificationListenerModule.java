package com.lesimoes.androidnotificationlistener;

import androidx.core.app.NotificationManagerCompat;
import android.provider.Settings;
import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import java.util.Set;

public class RNAndroidNotificationListenerModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactContext;
    private static final String TAG = "RNAndroidNotificationListener";

    public RNAndroidNotificationListenerModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() {
        return TAG;
    }

    @ReactMethod
    public void getPermissionStatus(Promise promise) {
        if (this.reactContext == null) {
            promise.resolve("unknown");
        } else {
            String packageName = this.reactContext.getPackageName();
            Set<String> enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(this.reactContext);
            if (enabledPackages.contains(packageName)) {
                promise.resolve("authorized");
            } else {
                promise.resolve("denied");
            }
        }
    }
    
    @ReactMethod
    public void requestPermission() {
        if (this.reactContext != null) {
            final Intent i = new Intent();
            i.setAction(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            i.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
            i.addFlags(Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
            this.reactContext.startActivity(i);
        }
    }

    @ReactMethod
    public void restartService(Promise promise) {
        try {
            if (this.reactContext != null) {
                Log.d(TAG, "restartService invoked from React Native JS bridge");
                RNAndroidNotificationListener.toggleNotificationListenerService(this.reactContext);
                RNAndroidNotificationListener.ensureListenerConnected(this.reactContext);
                RNAndroidNotificationListener.scheduleWatchdogAlarm(this.reactContext);
                
                // Start foreground service if dead
                Intent serviceIntent = new Intent(this.reactContext, RNAndroidNotificationListener.class);
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    this.reactContext.startForegroundService(serviceIntent);
                } else {
                    this.reactContext.startService(serviceIntent);
                }

                promise.resolve(true);
            } else {
                promise.reject("ERR_NULL_CONTEXT", "React context is null");
            }
        } catch (Exception e) {
            Log.e(TAG, "restartService error: " + e.getMessage(), e);
            promise.reject("ERR_RESTART_FAILED", e.getMessage());
        }
    }
}
