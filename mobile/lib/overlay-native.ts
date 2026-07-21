// Overlay native module — documented stub.
//
// TRUE system-wide overlay (rendered on top of ANY foreground app, regardless of
// which app is open) is an Android-only capability. It requires:
//   1. `SYSTEM_ALERT_WINDOW` permission (draw over other apps)
//   2. A foreground Service that adds a `WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY` view
//   3. Battery-optimization exemption so the service isn't killed
//
// None of this can be done from pure JS or Expo Go. It requires:
//   - A custom native module (Kotlin on Android) OR a config plugin that injects the
//     service + permission into the native project, AND
//   - An EAS development build (NOT Expo Go) to run it.
//
// For v1 we provide an in-app full-screen Brief view (app/brief.tsx) that is opened
// when the user taps the scheduled local notification. This is also the iOS fallback
// path (iOS does not allow arbitrary full-screen overlays on top of other apps).
//
// To ship the real Android overlay later, the work needed is:
//   - expo-modules-core: write a Kotlin module exposing `showOverlay(text, mode)` /
//     `dismissOverlay()` that inflates a native Android view into a TYPE_APPLICATION_OVERLAY
//     window from a foreground service.
//   - A config plugin (app.plugin.ts) that edits AndroidManifest.xml to add
//     <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
//     and <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
//     and registers the service.
//   - Build with `eas build --profile development --platform android` (EAS dev build).
//
// This file exists so the codebase has a single place that documents the gap and so
// callers can feature-detect: `isOverlayAvailable()` returns false in Expo Go / JS-only
// builds, and the notification → in-app full-screen fallback is used instead.

import { Platform } from "react-native";

/** True only on Android AND when a native overlay module is linked. In Expo Go this is always false. */
export function isOverlayAvailable(): boolean {
  // A real native module would expose a JS module here, e.g.:
  //   return Platform.OS === "android" && !!NativeModules.DailyBriefOverlay;
  return false;
}

/** Whether the current platform supports true system-wide overlays (Android only). */
export function isOverlayPlatformSupported(): boolean {
  return Platform.OS === "android";
}

/**
 * Show the system-wide overlay with the given text. In v1 (Expo Go / no native module)
 * this is a no-op — the caller should fall back to opening app/brief.tsx via a
 * notification or deep link.
 */
export async function showOverlay(_text: string, _mode: "morning" | "evening"): Promise<boolean> {
  // Native implementation would call:
  //   await NativeModules.DailyBriefOverlay.show(text, mode);
  return false;
}

/** Dismiss the system-wide overlay if currently shown. */
export async function dismissOverlay(): Promise<void> {
  // Native: await NativeModules.DailyBriefOverlay.dismiss();
}
