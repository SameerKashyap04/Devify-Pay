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

    // 3. Ensure <service> array exists for our background listener worker
    if (!app.service) {
      app.service = [];
    }

    // CORRECTED: Point directly to our actual library's native java class path
    const hasService = app.service.some(
      (s) => s.$ && s.$['android:name'] === 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListener'
    );
    if (!hasService) {
      app.service.push({
        $: {
          'android:name': 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListener',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true'
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
      });
    }

    return config;
  });
};