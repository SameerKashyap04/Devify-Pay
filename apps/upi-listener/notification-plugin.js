const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCustomManifest(config) {
  return withAndroidManifest(config, async (config) => {
    let androidManifest = config.modResults;
    
    // 1. Ensure <manifest> root attributes exist for namespace declarations
    if (!androidManifest.manifest.$) {
      androidManifest.manifest.$ = {};
    }
    
    // Inject the tools namespace so Android knows what "tools:replace" means
    androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // 2. Ensure <application> tags exist
    if (!androidManifest.manifest.application) {
      androidManifest.manifest.application = [{}];
    }
    
    const app = androidManifest.manifest.application[0];
    
    // Inject the override rule forcing Android to stick to Expo's default backup value
    if (!app.$) {
      app.$ = {};
    }
    app.$['tools:replace'] = 'android:allowBackup';
    app.$['android:usesCleartextTraffic'] = 'true';

    // 3. Ensure <uses-permission> tags exist for background boot & battery optimization bypass
    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }
    const permissions = androidManifest.manifest['uses-permission'];
    const requiredPerms = [
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.POST_NOTIFICATIONS',
    ];
    requiredPerms.forEach((perm) => {
      if (!permissions.some((p) => p.$ && p.$['android:name'] === perm)) {
        permissions.push({ $: { 'android:name': perm } });
      }
    });

    // 4. Ensure <service> array exists for background listener worker
    if (!app.service) {
      app.service = [];
    }

    const serviceIndex = app.service.findIndex(
      (s) => s.$ && s.$['android:name'] === 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListener'
    );
    const serviceObj = {
      $: {
        'android:name': 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListener',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:exported': 'true',
        'android:stopWithTask': 'false', // Keeps service running when app is swiped away/killed
      },
      'intent-filter': [
        {
          action: [
            {
              $: { 'android:name': 'android.service.notification.NotificationListenerService' }
            }
          ]
        }
      ]
    };
    if (serviceIndex >= 0) {
      app.service[serviceIndex] = serviceObj;
    } else {
      app.service.push(serviceObj);
    }

    // 5. Ensure HeadlessJsTaskService is registered
    const headlessIndex = app.service.findIndex(
      (s) => s.$ && s.$['android:name'] === 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListenerHeadlessJsTaskService'
    );
    if (headlessIndex < 0) {
      app.service.push({
        $: {
          'android:name': 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListenerHeadlessJsTaskService'
        }
      });
    }

    return config;
  });
};