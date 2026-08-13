#!/bin/bash
# Postinstall script: Copies patched native Java files into
# react-native-android-notification-listener's source tree.
# This ensures NativeUpiNotifySender.java and the modified
# RNAndroidNotificationListener.java are always present after npm install.

PATCH_SRC="$(dirname "$0")/native-patches/java/com/lesimoes/androidnotificationlistener"
TARGET_DIR="$(dirname "$0")/node_modules/react-native-android-notification-listener/android/src/main/java/com/lesimoes/androidnotificationlistener"

if [ -d "$TARGET_DIR" ] && [ -d "$PATCH_SRC" ]; then
  echo "[devify-patch] Applying native Java patches..."
  cp -f "$PATCH_SRC/NativeUpiNotifySender.java" "$TARGET_DIR/NativeUpiNotifySender.java"
  cp -f "$PATCH_SRC/RNAndroidNotificationListener.java" "$TARGET_DIR/RNAndroidNotificationListener.java"
  echo "[devify-patch] Done."
else
  echo "[devify-patch] Skipped — target dir not found yet."
fi
