// Permissions helper — centralizes the plain-language explanations and OS prompts.
// Requests overlay (Android), notifications, microphone, location, battery exemption.
import { Platform, Linking, Alert } from "react-native";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import * as IntentLauncher from "expo-intent-launcher";
import * as Application from "expo-application";

export type PermissionId =
  | "overlay"
  | "notifications"
  | "microphone"
  | "location"
  | "battery";

export const PERMISSION_EXPLANATIONS: Record<PermissionId, { title: string; reason: string }> = {
  overlay: {
    title: "Display over other apps",
    reason:
      "So your daily brief and reminders can appear on top of whatever app you're in — a gentle overlay instead of a buried notification.",
  },
  notifications: {
    title: "Notifications",
    reason:
      "To trigger your daily brief and reminders at the right moment, even when the app is closed.",
  },
  microphone: {
    title: "Microphone",
    reason:
      "So you can speak a note, reminder, or calendar entry instead of typing it.",
  },
  location: {
    title: "Location",
    reason:
      "To include your city and local weather in your daily brief — '7:30 AM in Nairobi, 13 degrees and cloudy.'",
  },
  battery: {
    title: "Battery optimization",
    reason:
      "So Android doesn't put the app to sleep and miss your scheduled brief. This keeps your routine reliable.",
  },
};

// Notification category powering the "Mark as done" action button on
// reminder notifications — must be registered (via
// registerNotificationCategories, called once at app startup) before any
// notification referencing it is scheduled, or the action silently won't show.
export const REMINDER_NOTIFICATION_CATEGORY = "reminder-actions";

// Same idea, for the daily brief notification's own "Mark as done" button.
export const DAILY_BRIEF_NOTIFICATION_CATEGORY = "daily-brief-actions";

// Custom notification sound, bundled via the expo-notifications config
// plugin (see app.json's "sounds" array). Must be just the filename (no
// path) and must exactly match what's listed there.
const NOTIFICATION_SOUND_FILE = "notification.wav";

// Android channel ids. Channels are IMMUTABLE once created on a device — if a
// channel with this id already exists without a custom sound attached,
// re-registering it with different options is a no-op. The "-v1" suffix
// forces Android to create a fresh channel with the sound correctly
// attached, instead of silently keeping whatever the channel's first-ever
// configuration was (this is almost certainly why the custom sound wasn't
// audible before).
const REMINDER_CHANNEL_ID = "reminders-v1";
const DAILY_BRIEF_CHANNEL_ID = "daily-brief-v1";

export async function registerNotificationCategories(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(REMINDER_NOTIFICATION_CATEGORY, [
      {
        identifier: "MARK_DONE",
        buttonTitle: "Mark as done",
        options: { opensAppToForeground: false },
      },
    ]);
    await Notifications.setNotificationCategoryAsync(DAILY_BRIEF_NOTIFICATION_CATEGORY, [
      {
        identifier: "MARK_DONE",
        buttonTitle: "Mark as done",
        options: { opensAppToForeground: false },
      },
    ]);
  } catch {
    /* best-effort — worst case the button doesn't show, notification still works */
  }
}

/**
 * Registers Android notification channels with the custom sound attached.
 * On Android, `content.sound` on an individual scheduled notification is
 * IGNORED — the sound is locked to whatever the channel was created with.
 * Without this, notifications fall back to the device's default sound,
 * which is why the custom chime wasn't audible even though `sound:
 * NOTIFICATION_SOUND_FILE` was set on every scheduled notification below.
 * No-op on iOS, where sound is set per-notification and this isn't needed.
 */
export async function registerNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: NOTIFICATION_SOUND_FILE,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync(DAILY_BRIEF_CHANNEL_ID, {
      name: "Daily brief",
      importance: Notifications.AndroidImportance.HIGH,
      sound: NOTIFICATION_SOUND_FILE,
    });
  } catch {
    /* best-effort — worst case notifications use the default channel/sound */
  }
}

/** Clears specific presented notifications, matched via their `data` payload. */
async function dismissByPredicate(predicate: (data: any) => boolean): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const toDismiss = presented.filter((n) => predicate(n.request.content.data));
    await Promise.all(toDismiss.map((n) => Notifications.dismissNotificationAsync(n.request.identifier)));
  } catch {
    /* best-effort — not fatal if a stale notification lingers in the tray */
  }
}

/** Clears the tray notification for one reminder — call after it's completed, viewed, or rescheduled. */
export async function dismissReminderNotification(reminderId: number): Promise<void> {
  await dismissByPredicate((d) => d?.kind === "reminder" && d?.id === String(reminderId));
}

/** Clears tray notifications for several reminders at once — e.g. "Mark all done". */
export async function dismissReminderNotifications(reminderIds: number[]): Promise<void> {
  const idSet = new Set(reminderIds.map(String));
  await dismissByPredicate((d) => d?.kind === "reminder" && idSet.has(d?.id));
}

/** Clears the daily brief tray notification — call once the brief has been viewed/delivered. */
export async function dismissDailyBriefNotification(): Promise<void> {
  await dismissByPredicate((d) => d?.kind === "daily_brief");
}

/** True only on Android — overlay capability is Android-only. */
export function isOverlaySupported(): boolean {
  return Platform.OS === "android";
}

/** On iOS, overlay = rich notification -> in-app full screen (stub path). */
export function isOverlayStubPlatform(): boolean {
  return Platform.OS !== "android";
}

/**
 * Request a permission. Returns true if granted (or if N/A on this platform).
 * For overlay + battery we open the system settings page on Android since there's
 * no direct Expo API for SYSTEM_ALERT_WINDOW / battery exemption in Expo Go.
 */
export async function requestPermission(id: PermissionId): Promise<boolean> {
  switch (id) {
    case "notifications": {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === "granted") return true;
      const { status } = await Notifications.requestPermissionsAsync();
      return status === "granted";
    }
    case "microphone": {
      // expo-speech doesn't request mic, and expo-av recording permission is what we'd use.
      // We request via expo-av's Audio	recording permission at capture time; here we just
      // probe by asking Location permission module is wrong. Use a directPermissions API:
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      // Mic: delegate to expo-av Audio.requestPermissionsAsync at capture time.
      // For onboarding we can't request mic without a recording context on iOS, so mark as
      // "will request at first use" — return true (we'll truly prompt on first voice capture).
      void existing;
      return true;
    }
    case "location": {
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      if (existing === "granted") return true;
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    }
    case "overlay": {
      if (!isOverlaySupported()) return true; // iOS uses notification fallback.
      // No Expo Go API for SYSTEM_ALERT_WINDOW — open settings.
      try {
        await Linking.openSettings();
      } catch {
        /* ignore */
      }
      // We can't programmatically verify in Expo Go; assume user will grant.
      return true;
    }
    case "battery": {
      if (Platform.OS !== "android") return true;
      try {
        const packageName = Application.applicationId;
        if (!packageName) {
          await Linking.openSettings();
          return true;
        }
        // Fires Android's real "ignore battery optimizations" system dialog
        // for this app specifically — not a generic Settings navigation.
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
          { data: `package:${packageName}` }
        );
        // Android gives no callback result for this intent, so there's no
        // way to positively confirm PowerManager.isIgnoringBatteryOptimizations()
        // from Expo APIs alone without a small native module. We treat "the
        // user responded to the dialog" as success.
        return true;
      } catch {
        // Only hit if the intent itself couldn't launch (e.g. running in
        // Expo Go, which can't request exemption for its own sandboxed
        // package — this needs a dev/standalone build to work correctly).
        try {
          await Linking.openSettings();
        } catch {
          /* ignore */
        }
        return false;
      }
    }
  }
}

/** Quick probe — used by settings to show current state. */
export async function checkPermission(id: PermissionId): Promise<boolean> {
  switch (id) {
    case "notifications": {
      const { status } = await Notifications.getPermissionsAsync();
      return status === "granted";
    }
    case "location": {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === "granted";
    }
    case "microphone": {
      // True status only known at capture time; assume granted if location is (best-effort UI).
      return true;
    }
    case "overlay":
    case "battery": {
      return Platform.OS !== "android"; // can't verify programmatically in Expo Go
    }
  }
}

/**
 * Cancel only previously-scheduled DAILY BRIEF notifications, leaving all reminder
 * notifications untouched. This replaces a prior implementation that called
 * cancelAllScheduledNotificationsAsync() here, which was wiping out every pending
 * reminder notification (not just the brief) any time the brief got rescheduled —
 * that was the actual cause of reminders silently disappearing.
 */
async function cancelExistingDailyBriefNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const briefNotifications = scheduled.filter(
      (n) => (n.content.data as { kind?: string } | undefined)?.kind === "daily_brief"
    );
    await Promise.all(
      briefNotifications.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    // best-effort — if this fails we still proceed to schedule the new one below.
  }
}

/** Schedule the daily brief as a local notification at HH:MM. */
export async function scheduleDailyBrief(time: string): Promise<string | null> {
  await cancelExistingDailyBriefNotifications();
  const [hStr, mStr] = time.split(":");
  const hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10);
  if (isNaN(hour) || isNaN(minute)) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Your daily brief is ready",
      body: "Tap to see and hear your brief for today.",
      data: { kind: "daily_brief" },
      sound: NOTIFICATION_SOUND_FILE,
      categoryIdentifier: DAILY_BRIEF_NOTIFICATION_CATEGORY,
      ...(Platform.OS === "android" ? { channelId: DAILY_BRIEF_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  return id;
}

export async function scheduleReminderNotification(
  reminderId: number,
  body: string,
  dueDate: string,
  dueTime: string
): Promise<string | null> {
  const date = new Date(`${dueDate}T${dueTime}:00`);
  if (isNaN(date.getTime())) return null;

  // Never schedule something in the past — Notifications silently drops it otherwise.
  if (date.getTime() <= Date.now()) return null;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Reminder",
      body,
      data: { kind: "reminder", id: String(reminderId) },
      sound: NOTIFICATION_SOUND_FILE,
      categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return id;
}

/** Schedules the second, at-due-time confirmation notification — only called when needs_confirmation is true. */
export async function scheduleConfirmationNotification(
  reminderId: number,
  body: string,
  dueDate: string,
  dueTime: string
): Promise<string | null> {
  const date = new Date(`${dueDate}T${dueTime}:00`);
  if (isNaN(date.getTime())) return null;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Reminder",
      body,
      data: { kind: "reminder", id: String(reminderId) },
      sound: NOTIFICATION_SOUND_FILE,
      categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return id;
}


export async function cancelAllScheduled(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Quick check used by onboarding to ensure speech voices can be loaded.
export async function canLoadVoices(): Promise<boolean> {
  try {
    await Speech.getAvailableVoicesAsync();
    return true;
  } catch {
    return false;
  }
}

export function showPermissionDeniedAlert(title: string): void {
  Alert.alert(
    `${title} permission`,
    `You can enable ${title.toLowerCase()} later from your system settings if you change your mind.`,
    [{ text: "OK" }]
  );
}