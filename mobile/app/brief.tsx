// Full-screen Brief view.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
  Modal,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Notifications from "expo-notifications"; // static import (dynamic import() requires a
                                                       // newer --module target than this project uses)
import { Volume2, Square, X, Plus, Clock, Check, CheckCheck, BellRing, Sun, Moon } from "lucide-react-native";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import * as db from "@/lib/db";
import * as perms from "@/lib/permissions";
import * as tts from "@/lib/tts";
import type { BriefMode, Reminder } from "@/lib/types";

// Local YYYY-MM-DD — never use toISOString() for date-only values: it reads UTC,
// which drifts a day off near midnight in timezones ahead of UTC (e.g. Nairobi, UTC+3).
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const SNOOZE_OPTIONS = [
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "Tomorrow", minutes: 24 * 60 },
];

export default function BriefScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const { user, generateTodayBrief, stopSpeak } = useApp();
  const [text, setText] = useState<string | null>(null);
  const [mode, setMode] = useState<BriefMode>("morning");
  const [usedFallback, setUsedFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [reminderTitle, setReminderTitle] = useState<string | null>(null);
  const [reminderMissing, setReminderMissing] = useState(false);
  const [reminderList, setReminderList] = useState<Reminder[]>([]);
  const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);
  const [snoozeTargetId, setSnoozeTargetId] = useState<number | null>(null);
  const [remindersSpeaking, setRemindersSpeaking] = useState(false);
  const [activeReminderId, setActiveReminderId] = useState<number | null>(null);

  // Guards auto-play per screen visit. Reset whenever the params identity changes
  // (see load()) so re-navigating to a different reminder/brief re-arms it.
  const hasAutoPlayedRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Sequential auto-read of the reminder-overlay cards — mirrors the brief's
  // auto-play, but walks the whole reminderList one card at a time, advancing
  // automatically until stopped.
  const hasAutoReadRemindersRef = useRef(false);
  const readingModeRef = useRef<"sequence" | "single" | null>(null);
  const reminderListRef = useRef<Reminder[]>([]);
  const remindersPulseAnim = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    setLoading(true);
    hasAutoPlayedRef.current = false;

    // Reset ALL prior-visit state up front. Previously, stale `reminderTitle`/`text`
    // from an earlier screen instance could leak into the next one when Expo Router
    // reused the mounted screen (e.g. tapping one notification while another was still
    // showing) — that's what caused "tap a reminder, see the brief instead" and vice versa.
    setReminderTitle(null);
    setReminderMissing(false);
    setReminderList([]);
    setText(null);
    hasAutoReadRemindersRef.current = false;

    // Reminder path — handled EXCLUSIVELY, and now surfaces EVERY pending/overdue
    // reminder (not just the one whose notification was tapped), each in its own card,
    // since reminders no longer get auto-deleted until the user marks them done.
    if (params.kind === "reminder") {
      const nowISO = new Date().toISOString();
      let list = await db.getPendingAndOverdueReminders(nowISO);

      if (params.id) {
        const parsedId = parseInt(params.id, 10);
        if (!Number.isNaN(parsedId)) {
          // The user is viewing this specific notification's content now — clear it from the tray.
          perms.dismissReminderNotification(parsedId).catch(() => {});
        }
        if (!Number.isNaN(parsedId) && !list.some((r) => r.id === parsedId)) {
          const tapped = await db.getReminderById(parsedId);
          if (tapped && !tapped.completed) list = [tapped, ...list];
        }
        // Put the reminder that actually triggered this screen first.
        list = [...list].sort((a, b) => (a.id === parsedId ? -1 : b.id === parsedId ? 1 : 0));
      }

      if (list.length === 0) {
        setReminderMissing(true);
        setLoading(false);
        return;
      }
      setReminderList(list);
      setReminderTitle(list[0].title);
      setMode("morning");
      setUsedFallback(false);
      setLoading(false);
      return;
    }

    // Brief path — only reached when this is NOT a reminder deep link. Always
    // regenerated fresh: opening the brief (from the index tab, the overlay, or a
    // notification) should never show a stale copy sitting from earlier in the day.
    const todayISO = toLocalISODate(new Date());
    try {
      const result = await generateTodayBrief();
      setText(result.text);
      setMode(result.mode);
      setUsedFallback(result.usedFallback);
      const fresh = await db.getBriefForDate(todayISO);
      if (fresh && !fresh.delivered_at) {
        await db.markBriefDelivered(fresh.id);
      }
      perms.dismissDailyBriefNotification().catch(() => {});
      perms.dismissDailyBriefNotification().catch(() => {});
    } catch (e) {
      console.warn("[brief] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [params.kind, params.id, generateTodayBrief]);

  useEffect(() => {
    load();
    return () => {
      stopSpeak();
    };
  }, [load, stopSpeak]);

  useEffect(() => {
    reminderListRef.current = reminderList;
  }, [reminderList]);

  useEffect(() => {
    if (reminderList.length > 0 && !hasAutoReadRemindersRef.current) {
      hasAutoReadRemindersRef.current = true;
      startReminderSequence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderList]);

  const onSpeak = useCallback(() => {
    if (!text) return;
    setSpeaking(true);
    tts.speakBrief(text, user?.voice_id ?? null, {
      onDone: () => setSpeaking(false),
    });
  }, [text, user?.voice_id]);

  const onStop = useCallback(() => {
    stopSpeak();
    setSpeaking(false);
  }, [stopSpeak]);

  const togglePlayback = useCallback(() => {
    if (speaking) onStop();
    else onSpeak();
  }, [speaking, onStop, onSpeak]);

  useEffect(() => {
    if (text && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      onSpeak();
    }
  }, [text, onSpeak]);

  useEffect(() => {
    if (speaking) {
      pulseAnim.setValue(1);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [speaking, pulseAnim]);

  useEffect(() => {
    if (remindersSpeaking) {
      remindersPulseAnim.setValue(1);
      Animated.loop(
        Animated.sequence([
          Animated.timing(remindersPulseAnim, { toValue: 1.15, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(remindersPulseAnim, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
    } else {
      remindersPulseAnim.stopAnimation();
      remindersPulseAnim.setValue(1);
    }
  }, [remindersSpeaking, remindersPulseAnim]);

  const onDismiss = useCallback(() => {
    stopSpeak();
    readingModeRef.current = null;
    setRemindersSpeaking(false);
    setActiveReminderId(null);
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router, stopSpeak]);

  const onRemindLater = useCallback(() => {
    setSnoozeTargetId(null);
    setSnoozeModalVisible(true);
  }, []);

  const onCardSnoozePress = useCallback(
    (id: number) => {
      if (activeReminderId === id) {
        stopSpeak();
        readingModeRef.current = null;
        setRemindersSpeaking(false);
        setActiveReminderId(null);
      }
      setSnoozeTargetId(id);
      setSnoozeModalVisible(true);
    },
    [activeReminderId, stopSpeak]
  );

  const onCardDone = useCallback(
    async (id: number) => {
      if (activeReminderId === id) {
        stopSpeak();
        readingModeRef.current = null;
        setRemindersSpeaking(false);
        setActiveReminderId(null);
      }
      await db.completeReminder(id);
      perms.dismissReminderNotification(id).catch(() => {});
      setReminderList((prev) => {
        const next = prev.filter((r) => r.id !== id);
        if (next.length === 0) onDismiss();
        return next;
      });
    },
    [onDismiss, activeReminderId, stopSpeak]
  );

  const onMarkAllDone = useCallback(async () => {
    try {
      await Promise.all(reminderList.map((r) => db.completeReminder(r.id)));
    } catch (e) {
      console.warn("[brief] mark all done failed", e);
    }
    // Every reminder shown in this overlay has now been actioned — clear
    // ALL of their tray notifications, not just the one that opened this screen.
    perms.dismissReminderNotifications(reminderList.map((r) => r.id)).catch(() => {});
    onDismiss();
  }, [reminderList, onDismiss]);

  // Per-card "Read" reads only that one card and stops. The bottom "Read"
  // control reads every card in reminderList in order, auto-advancing to
  // the next one as each finishes, until stopped — either via the bottom
  // control again or via the currently-active card's own button.
  const stopReminderReading = useCallback(() => {
    stopSpeak();
    readingModeRef.current = null;
    setRemindersSpeaking(false);
    setActiveReminderId(null);
  }, [stopSpeak]);

  const speakReminderAt = useCallback(
    (index: number, mode: "sequence" | "single") => {
      const list = reminderListRef.current;
      const r = list[index];
      if (!r) {
        stopReminderReading();
        return;
      }
      readingModeRef.current = mode;
      setActiveReminderId(r.id);
      setRemindersSpeaking(true);
      const content = r.notification_text || r.details || r.title;
      tts.speakBrief(content, user?.voice_id ?? null, {
        onDone: () => {
          if (readingModeRef.current === "sequence") {
            const nextIndex = index + 1;
            if (nextIndex < reminderListRef.current.length) {
              speakReminderAt(nextIndex, "sequence");
              return;
            }
          }
          stopReminderReading();
        },
      });
    },
    [user?.voice_id, stopReminderReading]
  );

  const startReminderSequence = useCallback(() => {
    if (reminderListRef.current.length === 0) return;
    stopSpeak();
    speakReminderAt(0, "sequence");
  }, [speakReminderAt, stopSpeak]);

  const onCardReadPress = useCallback(
    (r: Reminder) => {
      if (activeReminderId === r.id && remindersSpeaking) {
        stopReminderReading();
        return;
      }
      stopSpeak();
      const index = reminderListRef.current.findIndex((x) => x.id === r.id);
      speakReminderAt(index === -1 ? 0 : index, "single");
    },
    [activeReminderId, remindersSpeaking, speakReminderAt, stopSpeak, stopReminderReading]
  );

  const onBottomReadTogglePress = useCallback(() => {
    if (remindersSpeaking) {
      stopReminderReading();
    } else {
      startReminderSequence();
    }
  }, [remindersSpeaking, stopReminderReading, startReminderSequence]);

  // "Remind me later" now genuinely RESCHEDULES the reminder (same write reminders.tsx's
  // edit flow makes) instead of just setting a local snoozed_until flag — it actually
  // fires again for real at the new time. For the general daily-brief case (no target
  // reminder id) there's no persistent row to reschedule, so we just schedule a local
  // notification to resurface the brief, same as before.
  const confirmSnooze = useCallback(
    async (minutes: number) => {
      setSnoozeModalVisible(false);
      const targetId = snoozeTargetId;
      setSnoozeTargetId(null);
      try {
        if (targetId != null) {
          const r = reminderList.find((x) => x.id === targetId);
          const until = new Date(Date.now() + minutes * 60000);
          const newDate = toLocalISODate(until);
          const newTime = `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`;
          await db.rescheduleReminder(targetId, newDate, newTime);
          perms.dismissReminderNotification(targetId).catch(() => {});
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "Reminder",
                body: r?.notification_text || r?.title || "Reminder",
                data: { kind: "reminder", id: String(targetId) },
                sound: true,
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: until },
            });
          } catch {
            /* notifications may be denied */
          }
          setReminderList((prev) => {
            const next = prev.filter((x) => x.id !== targetId);
            if (next.length === 0) onDismiss();
            return next;
          });
        } else {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Your daily brief is ready",
              body: "Tap to see and hear your brief.",
              data: { kind: "daily_brief" },
              sound: true,
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 },
          });
          onDismiss();
        }
      } catch (e) {
        console.warn("[brief] snooze failed", e);
        onDismiss();
      }
    },
    [snoozeTargetId, reminderList, onDismiss]
  );

  const onAdd = useCallback(() => {
    stopSpeak();
    router.push("/capture?from=brief");
  }, [router, stopSpeak]);

  const isMorning = mode === "morning";
  const palette = isMorning ? Colors.morning : Colors.evening;
  const textColor = isMorning ? Colors.light.ink : Colors.light.text;
  // `textMuted` isn't a guaranteed key on every palette variant in this project's
  // color file; fall back to a known-safe token if it's missing to avoid a TS error.
  const mutedColor = isMorning
    ? Colors.light.inkMuted
    : ((palette as any).textMuted ?? (Colors.dark as any).inkMuted ?? Colors.light.inkMuted);
  const PeriodIcon = isMorning ? Sun : Moon;

  return (
    <LinearGradient colors={[palette.bgTop, palette.bgMid, palette.bgBottom]} style={styles.flex}>
      <ExpoStatusBar style={isMorning ? "dark" : "light"} />
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable
            style={[styles.closeBtn, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder }]}
            onPress={onDismiss}
          >
            <X size={20} color={textColor} />
          </Pressable>
          <View style={[styles.modePill, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder }]}>
            {reminderTitle ? (
              <BellRing size={13} color={palette.accentDeep} />
            ) : (
              <PeriodIcon size={13} color={palette.accentDeep} />
            )}
            <Text style={[styles.modePillText, { color: textColor }]}>
              {reminderTitle ? "Reminder" : isMorning ? "Morning brief" : "Evening brief"}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={palette.accent} />
              <Text style={[styles.loadingText, { color: mutedColor }]}>Preparing your brief…</Text>
            </View>
          ) : reminderMissing ? (
            <View style={styles.loadingWrap}>
              <Text style={[styles.loadingText, { color: mutedColor }]}>
                This reminder is no longer available — it may have already been completed or removed.
              </Text>
            </View>
          ) : reminderList.length > 0 ? (
            <>
              <Text style={[styles.reminderListHeading, { color: mutedColor }]}>
                {reminderList.length === 1
                  ? "1 reminder needs your attention"
                  : `${reminderList.length} reminders need your attention`}
              </Text>
              {reminderList.map((r) => (
                <View
                  key={r.id}
                  style={[styles.reminderCard, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder }]}
                >
                  <LinearGradient
                    colors={[palette.accent + "26", "transparent"]}
                    style={styles.reminderCardGlow}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <View style={styles.premiumIconRow}>
                    <View style={[styles.premiumIconWrap, { backgroundColor: palette.accent + "26" }]}>
                      <BellRing size={16} color={palette.accentDeep} />
                    </View>
                    <Text style={[styles.premiumEyebrow, { color: mutedColor }]}>REMINDER</Text>
                  </View>
                  <Text style={[styles.reminderCardText, { color: textColor }]}>
                    {r.notification_text || r.details || r.title}
                  </Text>
                  <View style={styles.reminderCardActions}>
                    <Pressable
                      style={[styles.reminderCardBtn, { borderColor: palette.accent + "55", backgroundColor: palette.accent + "14" }]}
                      onPress={() => onCardReadPress(r)}
                    >
                      {activeReminderId === r.id && remindersSpeaking ? (
                        <Square size={15} color={palette.accentDeep} fill={palette.accentDeep} />
                      ) : (
                        <Volume2 size={15} color={palette.accentDeep} />
                      )}
                      <Text style={[styles.reminderCardBtnLabel, { color: textColor }]}>
                        {activeReminderId === r.id && remindersSpeaking ? "Stop" : "Read"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.reminderCardBtn, styles.reminderCardBtnPrimary, { backgroundColor: palette.accent }]}
                      onPress={() => onCardDone(r.id)}
                    >
                      <Check size={15} color={isMorning ? "#fff" : palette.bgTop} />
                      <Text style={[styles.reminderCardBtnLabel, { color: isMorning ? "#fff" : palette.bgTop }]}>
                        Done
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.reminderCardBtn, { borderColor: palette.accent + "55", backgroundColor: palette.accent + "14" }]}
                      onPress={() => onCardSnoozePress(r.id)}
                    >
                      <Clock size={15} color={palette.accentDeep} />
                      <Text style={[styles.reminderCardBtnLabel, { color: textColor }]}>Remind me</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </>
          ) : text ? (
            <>
              <View style={[styles.premiumCard, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder }]}>
                <LinearGradient
                  colors={[palette.accent + "26", "transparent"]}
                  style={styles.premiumCardGlow}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <View style={styles.premiumIconRow}>
                  <View style={[styles.premiumIconWrap, { backgroundColor: palette.accent + "26" }]}>
                    <PeriodIcon size={18} color={palette.accentDeep} />
                  </View>
                  <Text style={[styles.premiumEyebrow, { color: mutedColor }]}>
                    {isMorning ? "YOUR MORNING BRIEF" : "YOUR EVENING BRIEF"}
                  </Text>
                </View>
                <Text style={[styles.briefTitle, { color: textColor }]}>{`Hi, ${user?.name ?? "there"}.`}</Text>
                {usedFallback ? (
                  <View style={[styles.fallbackTag, { backgroundColor: palette.accent + "26" }]}>
                    <Text style={[styles.fallbackTagText, { color: palette.accentDeep }]}>
                      Offline template — AI unavailable
                    </Text>
                  </View>
                ) : null}
                <Text style={[styles.briefText, { color: textColor }]}>{text}</Text>
              </View>

              <Pressable
                style={[
                  styles.inlinePlayBtn,
                  { backgroundColor: speaking ? palette.accent : palette.surface, borderColor: palette.surfaceBorder },
                ]}
                onPress={togglePlayback}
              >
                <Animated.View style={{ transform: [{ scale: speaking ? pulseAnim : 1 }] }}>
                  {speaking ? (
                    <Square size={16} color={isMorning ? "#fff" : palette.bgTop} fill={isMorning ? "#fff" : palette.bgTop} />
                  ) : (
                    <Volume2 size={18} color={palette.accentDeep} />
                  )}
                </Animated.View>
                <Text
                  style={[
                    styles.inlinePlayLabel,
                    { color: speaking ? (isMorning ? "#fff" : palette.bgTop) : palette.accentDeep },
                  ]}
                >
                  {speaking ? "Stop reading" : "Read again"}
                </Text>
              </Pressable>

              <View style={[styles.promptCard, { backgroundColor: palette.surface, borderColor: palette.surfaceBorder }]}>
                <View style={styles.premiumIconRow}>
                  <View style={[styles.premiumIconWrap, { backgroundColor: palette.accent + "26" }]}>
                    <Plus size={16} color={palette.accentDeep} />
                  </View>
                  <Text style={[styles.promptText, { color: textColor }]}>
                    Anything you'd like me to remember or add — to your notes or your calendar — {isMorning ? "before we start the day?" : "before you wind down?"}
                  </Text>
                </View>
                <View style={styles.promptActions}>
                  <Pressable style={[styles.promptBtn, styles.promptBtnPrimary, { backgroundColor: palette.accent }]} onPress={onAdd}>
                    <Plus size={16} color={isMorning ? "#fff" : palette.bgTop} />
                    <Text style={[styles.promptBtnLabel, { color: isMorning ? "#fff" : palette.bgTop }]}>Add</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.promptBtn, { borderColor: palette.surfaceBorder, backgroundColor: "transparent" }]}
                    onPress={onDismiss}
                  >
                    <Text style={[styles.promptBtnLabel, { color: textColor }]}>No, thanks</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.loadingWrap}>
              <Text style={[styles.loadingText, { color: mutedColor }]}>Couldn't generate a brief. Pull down to retry.</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.bottomBar, { backgroundColor: palette.surface, borderTopColor: palette.surfaceBorder }]}>
          {reminderList.length > 0 ? (
            <>
              <Pressable
                style={[styles.bottomAction, styles.bottomActionOutline, { borderColor: palette.accent + "55", backgroundColor: palette.accent + "14" }]}
                onPress={onBottomReadTogglePress}
              >
                <Animated.View style={{ transform: [{ scale: remindersSpeaking ? remindersPulseAnim : 1 }] }}>
                  {remindersSpeaking ? (
                    <Square size={17} color={palette.accentDeep} fill={palette.accentDeep} />
                  ) : (
                    <Volume2 size={18} color={palette.accentDeep} />
                  )}
                </Animated.View>
                <Text style={[styles.bottomActionLabel, { color: textColor }]}>
                  {remindersSpeaking ? "Stop" : "Read"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.bottomAction, styles.bottomActionPrimary, { backgroundColor: palette.accent }]}
                onPress={onMarkAllDone}
              >
                <CheckCheck size={18} color={isMorning ? "#fff" : palette.bgTop} />
                <Text style={[styles.bottomActionLabel, { color: isMorning ? "#fff" : palette.bgTop }]}>
                  Mark all done
                </Text>
              </Pressable>
              <Pressable
                style={[styles.bottomAction, styles.bottomActionOutline, { borderColor: palette.accent + "55", backgroundColor: palette.accent + "14" }]}
                onPress={onDismiss}
              >
                <X size={18} color={palette.accentDeep} />
                <Text style={[styles.bottomActionLabel, { color: textColor }]}>Close</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={styles.bottomAction} onPress={onRemindLater}>
                <Clock size={18} color={palette.accentDeep} />
                <Text style={[styles.bottomActionLabel, { color: textColor }]}>Later</Text>
              </Pressable>
              <Pressable style={styles.bottomAction} onPress={togglePlayback}>
                <Animated.View style={{ transform: [{ scale: speaking ? pulseAnim : 1 }] }}>
                  {speaking ? (
                    <Square size={17} color={palette.accentDeep} fill={palette.accentDeep} />
                  ) : (
                    <Volume2 size={18} color={palette.accentDeep} />
                  )}
                </Animated.View>
                <Text style={[styles.bottomActionLabel, { color: textColor }]}>{speaking ? "Stop" : "Play"}</Text>
              </Pressable>
              <Pressable style={styles.bottomAction} onPress={onAdd}>
                <Plus size={18} color={palette.accentDeep} />
                <Text style={[styles.bottomActionLabel, { color: textColor }]}>Add</Text>
              </Pressable>
              <Pressable
                style={[styles.bottomAction, styles.bottomActionPrimary, { backgroundColor: palette.accent }]}
                onPress={onDismiss}
              >
                <Check size={18} color={isMorning ? "#fff" : palette.bgTop} />
                <Text style={[styles.bottomActionLabel, { color: isMorning ? "#fff" : palette.bgTop }]}>OK</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>

      {/* Snooze / "remind me later" — custom pill modal, matching reminders.tsx exactly,
          replacing the old system Alert.alert (which couldn't be restyled and, worse,
          never actually persisted anything — see confirmSnooze above). */}
      <Modal visible={snoozeModalVisible} transparent animationType="fade" onRequestClose={() => setSnoozeModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSnoozeModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {reminderTitle ? "Snooze for how long?" : "When should I show this again?"}
            </Text>
            <View style={styles.pillGroup}>
              {SNOOZE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.label}
                  onPress={() => confirmSnooze(opt.minutes)}
                  style={({ pressed }) => [styles.optionPill, pressed && styles.optionPillPressed]}
                >
                  <Text style={styles.optionPillLabel}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => setSnoozeModalVisible(false)}
              style={({ pressed }) => [styles.cancelPill, pressed && styles.cancelPillPressed]}
            >
              <Text style={styles.cancelPillLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  modePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1 },
  modePillText: { fontSize: 13, fontWeight: "700" },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 140 },
  loadingWrap: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.md },
  loadingText: { fontSize: 15, fontWeight: "500" },
  premiumCard: { borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3 },
  premiumCardGlow: { ...StyleSheet.absoluteFillObject },
  premiumIconRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md, gap: spacing.sm },
  premiumIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  premiumEyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2, flexShrink: 1 },
  briefTitle: { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  fallbackTag: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill, marginBottom: spacing.md },
  fallbackTagText: { fontSize: 12, fontWeight: "700" },
  briefText: { fontSize: 20, lineHeight: 30, fontWeight: "400" },
  reminderText: { fontSize: 24, lineHeight: 34, fontWeight: "600" },
  inlinePlayBtn: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1, marginTop: spacing.md },
  inlinePlayLabel: { fontSize: 14, fontWeight: "700" },
  promptCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1 },
  promptText: { fontSize: 16, lineHeight: 23, fontWeight: "500", flex: 1 },
  promptActions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  promptBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radii.pill, borderWidth: 1.5 },
  promptBtnPrimary: { borderWidth: 0 },
  promptBtnLabel: { fontSize: 15, fontWeight: "700" },
  bottomBar: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, borderTopWidth: 1, paddingBottom: 18, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
  bottomAction: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill },
  bottomActionPrimary: {},
  bottomActionOutline: { borderWidth: 1.5 },
  bottomActionLabel: { fontSize: 14, fontWeight: "700" },

  // ---- Snooze modal — matches reminders.tsx's modal styling exactly ----
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: spacing.sm,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: Colors.light.ink, textAlign: "center" },
  pillGroup: { gap: spacing.sm, marginTop: 4 },
  optionPill: {
    backgroundColor: Colors.light.coralSoft,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  optionPillPressed: { opacity: 0.6 },
  optionPillLabel: { fontSize: 15, fontWeight: "700", color: Colors.light.coralDeep },
  cancelPill: {
    backgroundColor: Colors.light.creamDeep,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  cancelPillPressed: { opacity: 0.6 },
  cancelPillLabel: { fontSize: 15, fontWeight: "700", color: Colors.light.inkMuted },

  // ---- Multi-reminder overlay cards ----
  reminderListHeading: { fontSize: 14, fontWeight: "700", marginBottom: spacing.lg, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" },
  reminderCard: { borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, marginBottom: spacing.md, overflow: "hidden", position: "relative" },
  reminderCardGlow: { ...StyleSheet.absoluteFillObject },
  reminderCardText: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  reminderCardActions: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  reminderCardBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1.5 },
  reminderCardBtnPrimary: { borderWidth: 0 },
  reminderCardBtnLabel: { fontSize: 13, fontWeight: "700" },
});