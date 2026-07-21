// Home / Today screen
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  BackHandler,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import {
  CalendarDays,
  BellRing,
  NotebookPen,
  Feather,
  User,
  Search,
  X,
} from "lucide-react-native";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import RemindersList from "@/components/RemindersList";
import * as db from "@/lib/db";
import type { BriefMode, CalendarEvent, Reminder, User as UserType } from "@/lib/types";

// Local YYYY-MM-DD — never use toISOString() for date-only values: it reads UTC,
// which drifts a day off near midnight in timezones ahead of UTC (e.g. Nairobi, UTC+3).
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


export default function HomeScreen() {
  const { user } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!searchOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setSearchOpen(false);
      setSearchQuery("");
      return true;
    });
    return () => sub.remove();
  }, [searchOpen]);

  const loadData = useCallback(async () => {
    const today = toLocalISODate(new Date());
    const [evs, rems, nc] = await Promise.all([
      db.getCalendarEventsForDate(today),
      db.getPendingRemindersForDate(today),
      db.countUnreadNotes(),
    ]);
    setEvents(evs);
    setReminders(rems);
    setNotesCount(nc);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const mode: BriefMode = inferMode(user);

  return (
    <LinearGradient colors={Colors.surfaceGradient} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        {/* Fixed header — "Clear Day" wordmark on the left, Profile
            (-> /settings) icon on the right. Capture now lives in the
            floating action button, not the header. */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerTextCol}>
              <View style={styles.logoRow}>
                <Image
                  source={require("@/assets/images/icon2.png")}
                  style={styles.logoIcon}
                  resizeMode="contain"
                />
                <Text style={styles.clearDayText}>Clearday</Text>
              </View>
            </View>

            <View style={styles.headerIconRow}>
              <Pressable
                onPress={() =>
                  setSearchOpen((s) => {
                    if (s) setSearchQuery("");
                    return !s;
                  })
                }
                style={styles.headerIconBtn}
                hitSlop={8}
              >
                <Search size={20} color={Colors.dark.inkMuted} />
              </Pressable>
            </View>
          </View>

          {searchOpen && (
            <View style={styles.searchBarWrap}>
              <Search size={16} color={Colors.dark.inkMuted} />
              <TextInput
                autoFocus
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search reminders..."
                placeholderTextColor={Colors.dark.inkMuted}
                style={styles.searchInput}
              />
              <Pressable
                onPress={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                hitSlop={8}
              >
                <X size={16} color={Colors.dark.inkMuted} />
              </Pressable>
            </View>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.coral} />
          }
        >
          {/* Next brief — time-only card, no reload button. Hidden while
              searching so the reminder results aren't pushed off screen.
              Tapping it jumps to Settings with the brief-time picker
              already open — this card is a shortcut to change the time,
              not a brief preview, so nothing here triggers a generation. */}
          {!searchOpen && (
            <Pressable
              style={({ pressed }) => [styles.premiumCard, pressed && { opacity: 0.9 }]}
              onPress={() => router.push(`/(tabs)/settings?openTimePicker=${Date.now()}`)}
            >
              <LinearGradient
                colors={[Colors.dark.coral + "33", "transparent"]}
                style={styles.premiumCardGlow}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.premiumIconRow}>
                <View style={styles.premiumIconWrap}>
                  <BellRing size={20} color={Colors.dark.coral} />
                </View>
                <Text style={styles.premiumEyebrow}>YOUR NEXT BRIEF</Text>
              </View>

              <Text style={styles.briefTime}>{formatBriefTime(user?.brief_time ?? "07:00")}</Text>
              <Text style={styles.cardSub}>
                {mode === "morning"
                  ? "Summarizes today — calendar, weather, reminders."
                  : "Summarizes tomorrow — what's ahead."}
              </Text>
            </Pressable>
          )}

          {/* Reminders — rendered non-scrollable since it sits inside this ScrollView */}
          <RemindersList scrollable={false} searchQuery={searchQuery} />

       

          <View style={{ height: 140 }} />
        </ScrollView>

        {/* Floating capture button — bottom-right, floating at least
            150px up from the bottom edge, slightly larger than the old
            header icon. */}
        <Pressable
          onPress={() => router.push("/capture")}
          style={styles.floatingCaptureBtn}
          hitSlop={10}
        >
          <Feather size={26} color={Colors.dark.ink} />
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
}

function SnapshotCard({
  icon,
  label,
  count,
  hint,
  onPress,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  hint: string;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.snapshotCard,
        wide && styles.snapshotWide,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
      onPress={onPress}
    >
      <View style={styles.snapshotHeader}>
        <View style={styles.snapshotIcon}>{icon}</View>
        <Text style={styles.snapshotCount}>{count}</Text>
      </View>
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotHint} numberOfLines={1}>{hint}</Text>
    </Pressable>
  );
}

function inferMode(user: UserType | null): BriefMode {
  if (user?.brief_mode_override) return user.brief_mode_override;
  const t = user?.brief_time ?? "07:00";
  const h = parseInt(t.split(":")[0] ?? "7", 10);
  return h < 14 ? "morning" : "evening";
}

function formatBriefTime(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr?.padStart(2, "0") ?? "00"} ${ampm}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, paddingTop: spacing.sm },

  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerTextCol: { flexShrink: 1 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon: { width: 22, height: 22 },
  // Color matches the old "greeting" style; font size matches the old
  // "nameText" style (26), per the redesign that collapsed both into
  // a single "ClearDay" wordmark.
  clearDayText: { fontSize: 26, fontWeight: "800", color: Colors.dark.inkMuted },

  headerIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },

  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.sm,
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.ink,
    paddingVertical: 0,
  },

  premiumCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    overflow: "hidden",
  },
  premiumCardGlow: { ...StyleSheet.absoluteFillObject },
  premiumIconRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  premiumIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.coralSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  premiumEyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: Colors.dark.inkMuted, flex: 1 },
  briefTime: { fontSize: 34, fontWeight: "800", color: Colors.dark.ink, marginTop: 2 },
  cardSub: { fontSize: 14, color: Colors.dark.inkMuted, marginTop: 6, lineHeight: 20 },

  // Floating capture FAB — right margin reduced by 20px then given 10px
  // back (net -10), and moved down 20px (bottom 190 -> 170) from the
  // previous pass. Background/border are both near-black so the border
  // barely shows.
  floatingCaptureBtn: {
    position: "absolute",
    right: spacing.lg - 10,
    bottom: 170,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#0d0d0d",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },

  snapshotRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  snapshotCard: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  snapshotWide: { marginTop: spacing.md },
  snapshotHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  snapshotIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.coralSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  snapshotCount: { fontSize: 26, fontWeight: "800", color: Colors.dark.ink },
  snapshotLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.inkMuted,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  snapshotHint: { fontSize: 14, color: Colors.dark.ink, marginTop: 2, fontWeight: "500" },
});