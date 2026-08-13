#!/bin/bash
# Postinstall script: Copies patched native Java files into
# react-native-android-notification-listener's source tree.
# This ensures all custom Java files are always present after npm install.

PATCH_SRC="$(dirname "$0")/native-patches/java/com/lesimoes/androidnotificationlistener"
TARGET_DIR="$(dirname "$0")/node_modules/react-native-android-notification-listener/android/src/main/java/com/lesimoes/androidnotificationlistener"

if [ -d "$TARGET_DIR" ] && [ -d "$PATCH_SRC" ]; then
  echo "[devify-patch] Applying native Java patches..."
  cp -f "$PATCH_SRC/NativeUpiNotifySender.java" "$TARGET_DIR/NativeUpiNotifySender.java"
  cp -f "$PATCH_SRC/RNAndroidNotificationListener.java" "$TARGET_DIR/RNAndroidNotificationListener.java"
  cp -f "$PATCH_SRC/ServiceWatchdogReceiver.java" "$TARGET_DIR/ServiceWatchdogReceiver.java"
  cp -f "$PATCH_SRC/BootUpReceiver.java" "$TARGET_DIR/BootUpReceiver.java"
  cp -f "$PATCH_SRC/RNAndroidNotificationListenerModule.java" "$TARGET_DIR/RNAndroidNotificationListenerModule.java"
  echo "[devify-patch] Done — 5 files patched."
else
  echo "[devify-patch] Skipped — target dir not found yet."
fi
