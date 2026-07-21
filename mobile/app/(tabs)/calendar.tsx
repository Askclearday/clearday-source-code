// Calendar screen — list upcoming calendar events, edit / reschedule /
// long-press-to-delete, using our own pill-styled popups instead of the
// system Alert. Layout intentionally mirrors reminders.tsx.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  RefreshControl,
  Modal,
  ScrollView,
  TextInput,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, CalendarDays, Clock, Pencil, CheckCheck, Search, X, SearchX } from "lucide-react-native";
import * as Notifications from "expo-notifications";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import * as db from "@/lib/db";
import EmptyStateCard, { WelcomeCard } from "@/components/EmptyStateCards";
import type { CalendarEvent, Reminder } from "@/lib/types";

type Section = { title: string; data: CalendarEvent[] };

// Local YYYY-MM-DD — never use toISOString() for date-only values: it reads UTC,
// which drifts a day off near midnight in timezones ahead of UTC (e.g. Nairobi, UTC+3).
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


// Computes the moment the app will actually nudge the user for a given
// due_date/due_time/offset — mirrors reminders.tsx's computeNudgeMoment.
function computeNudgeMoment(
  dueDate: string | null,
  dueTime: string | null,
  offsetMinutes: number | null
): { date: string; time: string } | null {
  if (!dueDate || !dueTime) return null;
  const target = new Date(`${dueDate}T${dueTime}:00`);
  if (offsetMinutes) {
    target.setMinutes(target.getMinutes() - offsetMinutes);
  }
  return {
    date: toLocalISODate(target),
    time: `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`,
  };
}

const SNOOZE_OPTIONS = [
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "Tomorrow", minutes: 24 * 60 },
];

function isEventOverdue(item: CalendarEvent): boolean {
  if (!item.time) return false;
  const target = new Date(`${item.date}T${item.time}:00`);
  return target.getTime() < Date.now();
}

function formatOverdueMeta(date: string, time: string): string {
  return `Overdue since ${formatDateShort(date)} · ${formatTime(time)}`;
}

export default function CalendarScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // `deleteTarget` doubles as the target for the combined long-press popup
  // (reschedule options + delete), replacing the separate clock-triggered
  // snooze popup — mirrors reminders.tsx.
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [rawTarget, setRawTarget] = useState<CalendarEvent | null>(null);
  const [nudgeByKey, setNudgeByKey] = useState<Map<string, { date: string; time: string }>>(new Map());
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

  const load = useCallback(async () => {
    const today = toLocalISODate(new Date());
    const [allRows, reminderRows] = await Promise.all([
      db.getUpcomingCalendarEvents(today, 80),
      db.getReminders(true),
    ]);
    const q = searchQuery.trim().toLowerCase();
    const rows = q
      ? allRows.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.details ?? "").toLowerCase().includes(q) ||
            (r.raw_input ?? "").toLowerCase().includes(q)
        )
      : allRows;

    // Calendar events are cloned as reminders on save (that clone is what
    // actually schedules the push notification), but there's no FK back to
    // the source event, so we match on date+title to find the clone and
    // read its nudge offset. Falls back to the event's own time if no
    // match is found.
    const nudges = new Map<string, { date: string; time: string }>();
    for (const rem of reminderRows) {
      if (!rem.due_date || !rem.due_time) continue;
      const key = `${rem.due_date}::${rem.title.toLowerCase()}`;
      const nudge = computeNudgeMoment(rem.due_date, rem.due_time, rem.reminder_offset_minutes);
      if (nudge) nudges.set(key, nudge);
    }
    setNudgeByKey(nudges);

    const grouped = new Map<string, CalendarEvent[]>();
    const overdue: CalendarEvent[] = [];
    for (const r of rows) {
      if (isEventOverdue(r)) {
        overdue.push(r);
        continue;
      }
      const arr = grouped.get(r.date) ?? [];
      arr.push(r);
      grouped.set(r.date, arr);
    }
    const secs: Section[] = [];
    if (overdue.length > 0) {
      secs.push({ title: "Overdue", data: overdue });
    }
    secs.push(
      ...Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => ({ title: formatDateLabel(date), data: items }))
    );
    setSections(secs);
  }, [searchQuery]);

  useEffect(() => {
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    // Cascades to the cloned reminder (if this event has one) via a
    // best-effort date+title match -- see deleteCalendarEventCascade in lib/db.ts.
    await db.deleteCalendarEventCascade(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  // Calendar events don't have a "completed" concept the way reminders do
  // (no per-card tick anymore), so overdue events are cleared by deleting
  // them outright rather than marking them done.
  const onMarkAllOverdueDelete = async (items: CalendarEvent[]) => {
    await Promise.all(items.map((r) => db.deleteCalendarEventCascade(r.id)));
    load();
  };

  // Shared by the long-press popup (deleteTarget) and the raw-input popup
  // (rawTarget) — combine existing date + time (default to now if no time
  // set), push forward by the chosen offset, then split back into
  // date/time strings and actually schedule the follow-up notification.
  const rescheduleTarget = async (target: CalendarEvent, minutes: number) => {
    const base = target.time
      ? new Date(`${target.date}T${target.time}:00`)
      : new Date(`${target.date}T00:00:00`);
    const shifted = new Date(base.getTime() + minutes * 60000);
    const newDate = toLocalISODate(shifted);
    const newTime = target.time
      ? `${String(shifted.getHours()).padStart(2, "0")}:${String(shifted.getMinutes()).padStart(2, "0")}`
      : undefined;
    await db.rescheduleCalendarEvent(target.id, newDate, newTime);
    if (newTime) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Event",
            body: target.title || "Event",
            data: { kind: "calendar_event", id: String(target.id) },
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: shifted },
        });
      } catch {
        /* notifications may be denied */
      }
    }
  };

  const confirmSnooze = async (minutes: number) => {
    if (!deleteTarget) return;
    await rescheduleTarget(deleteTarget, minutes);
    setDeleteTarget(null);
    load();
  };

  const confirmSnoozeRaw = async (minutes: number) => {
    if (!rawTarget) return;
    await rescheduleTarget(rawTarget, minutes);
    setRawTarget(null);
    load();
  };

  const onEdit = (item: CalendarEvent) => {
    // Hands the RAW input off to capture for editing — not the AI-parsed
    // title/details — so capture re-parses from what the user actually
    // said/typed, mirroring reminders.tsx's edit flow. date/time are
    // included because they can't be reliably recovered by re-parsing raw
    // text alone. Capture will delete this id and write the new capture on
    // save, rather than creating a duplicate.
    const payload = encodeURIComponent(
      JSON.stringify({
        id: item.id,
        raw_input: item.raw_input,
        date: item.date,
        time: item.time,
      })
    );
    router.push(`/capture?type=calendar_event&editId=${item.id}&editData=${payload}`);
  };

  const renderItem = ({ item, section }: { item: CalendarEvent; section: Section }) => {
    const nudge = item.time
      ? nudgeByKey.get(`${item.date}::${item.title.toLowerCase()}`)
      : null;
    const overdue = section.title === "Overdue";

    return (
      <Pressable
        style={({ pressed }) => [styles.eventCard, pressed && styles.eventCardPressed]}
        onPress={() => setRawTarget(item)}
        onLongPress={() => setDeleteTarget(item)}
        delayLongPress={380}
      >
        <View style={styles.calendarIconCircle}>
          <CalendarDays size={16} color={Colors.light.coralDeep} />
        </View>
        <View style={styles.eventBody}>
          <Text style={styles.eventTitle}>{item.title}</Text>
          {item.raw_input ? <Text style={styles.eventDetails} numberOfLines={3}>{item.raw_input}</Text> : null}
          <View style={styles.eventMeta}>
            <View style={styles.metaPill}>
              <Clock size={11} color={Colors.light.coralDeep} />
              <Text style={styles.metaPillText}>
                {item.time
                  ? overdue
                    ? formatOverdueMeta(nudge ? nudge.date : item.date, nudge ? nudge.time : item.time)
                    : nudge
                    ? `Nudges ${formatDateShort(nudge.date)} · ${formatTime(nudge.time)}`
                    : formatTime(item.time)
                  : "All day"}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.eventActions}>
          <Pressable style={styles.iconBtn} onPress={() => onEdit(item)} hitSlop={6}>
            <Pencil size={16} color={Colors.light.inkMuted} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.header}>
          {searchOpen ? (
            <View style={styles.searchBarWrap}>
              <Search size={16} color={Colors.light.inkMuted} />
              <TextInput
                autoFocus
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search events..."
                placeholderTextColor={Colors.light.inkMuted}
                style={styles.searchInput}
              />
              <Pressable
                onPress={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                hitSlop={8}
              >
                <X size={18} color={Colors.light.inkMuted} />
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.headerTitle}>Calendar</Text>
              <Pressable
                onPress={() => setSearchOpen(true)}
                style={styles.headerIconBtn}
                hitSlop={8}
              >
                <Search size={20} color={Colors.light.inkMuted} />
              </Pressable>
            </>
          )}
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) =>
            section.title === "Overdue" ? (
              <View style={styles.overdueHeaderRow}>
                <Text style={[styles.sectionHeader, styles.overdueSectionHeader]}>{section.title}</Text>
                <Pressable
                  onPress={() => onMarkAllOverdueDelete(section.data)}
                  style={({ pressed }) => [styles.overdueMarkAllBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={6}
                >
                  <CheckCheck size={13} color={Colors.light.coralDeep} />
                  <Text style={styles.overdueMarkAllLabel}>Mark all done</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            )
          }
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.coral} />}
          ListEmptyComponent={
            searchQuery.trim() ? (
              <EmptyStateCard
                icon={SearchX}
                title="No results found"
                description={`Nothing matches "${searchQuery.trim()}". Try a different search term.`}
              />
            ) : (
              <View>
                <EmptyStateCard
                  icon={CalendarDays}
                  title="No upcoming events"
                  description="Calendar events are for things with a fixed date and time — meetings, appointments, trips, anything on the clock. Tap the feather icon at the bottom right to add one, and Clear Day will also set a reminder so you don't miss it."
                />
                <WelcomeCard />
              </View>
            )
          }
        />

        {/* Floating capture button — bottom-right, mirrors the FAB on the
            Home tab, adapted to this screen's light theme. */}
        <Pressable
          onPress={() => router.push("/capture")}
          style={styles.floatingCaptureBtn}
          hitSlop={10}
        >
          <Feather size={26} color="#ffffff" />
        </Pressable>
      </SafeAreaView>

      {/* Combined long-press popup: reschedule options first, delete at the
          bottom — replaces the separate clock-triggered snooze popup. */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDeleteTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Remind me after</Text>
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
              onPress={confirmDelete}
              style={({ pressed }) => [styles.deletePill, pressed && styles.deletePillPressed]}
            >
              <Text style={styles.deletePillLabel}>Delete event</Text>
            </Pressable>
            <Pressable
              onPress={() => setDeleteTarget(null)}
              style={({ pressed }) => [styles.cancelPill, pressed && styles.cancelPillPressed]}
            >
              <Text style={styles.cancelPillLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!rawTarget} transparent animationType="fade" onRequestClose={() => setRawTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRawTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Raw input</Text>
            <View style={styles.rawInputCard}>
              <ScrollView style={styles.rawScroll} bounces={false} showsVerticalScrollIndicator={false}>
                <Text style={styles.rawText}>{rawTarget?.raw_input || "(no raw input saved)"}</Text>
                {rawTarget ? (
                  <Text style={styles.rawMeta}>
                    date: {rawTarget.date}
                    {rawTarget.time ? `  ·  time: ${rawTarget.time}` : ""}
                  </Text>
                ) : null}
              </ScrollView>
            </View>
            <View style={styles.remindCard}>
              <Text style={styles.remindCardTitle}>Remind me after</Text>
              <View style={styles.pillGroup}>
                {SNOOZE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.label}
                    onPress={() => confirmSnoozeRaw(opt.minutes)}
                    style={({ pressed }) => [styles.optionPill, pressed && styles.optionPillPressed]}
                  >
                    <Text style={styles.optionPillLabel}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.confirmRow}>
              <Pressable
                onPress={async () => {
                  const target = rawTarget;
                  setRawTarget(null);
                  if (target) {
                    await db.deleteCalendarEventCascade(target.id);
                    load();
                  }
                }}
                style={({ pressed }) => [styles.rawDeletePill, styles.confirmRowPill, pressed && styles.rawDeletePillPressed]}
              >
                <Text style={styles.rawDeletePillLabel}>Delete</Text>
              </Pressable>
              <Pressable
                onPress={() => setRawTarget(null)}
                style={({ pressed }) => [styles.cancelPill, styles.confirmRowPill, pressed && styles.cancelPillPressed]}
              >
                <Text style={styles.cancelPillLabel}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr?.padStart(2, "0") ?? "00"} ${ampm}`;
}

function formatDateLabel(yyyy_mm_dd: string): string {
  const d = new Date(yyyy_mm_dd + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateShort(d: string): string {
  const date = new Date(d + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.light.cream },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: Colors.light.ink },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },

  searchBarWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.creamDeep,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.light.ink,
    paddingVertical: 0,
  },

  floatingCaptureBtn: {
    position: "absolute",
    right: spacing.lg - 10,
    bottom: 170,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },

  list: { paddingHorizontal: spacing.md, paddingTop: 0, paddingBottom: 140 },
  sectionHeader: {
    fontSize: 13, fontWeight: "700", color: Colors.light.coralDeep,
    textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: spacing.md, marginBottom: 8, paddingLeft: 4,
  },
  overdueHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing.md, marginBottom: 8, paddingLeft: 4, paddingRight: 4,
  },
  overdueSectionHeader: { marginTop: 0, marginBottom: 0, paddingLeft: 0 },
  overdueMarkAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.light.coralSoft, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radii.pill,
  },
  overdueMarkAllLabel: { fontSize: 11, fontWeight: "700", color: Colors.light.coralDeep },
  eventCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface,
    borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: Colors.light.border,
  },
  eventCardPressed: { opacity: 0.85 },
  calendarIconCircle: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.light.coralDeep,
    alignItems: "center", justifyContent: "center", marginRight: spacing.md,
  },
  eventBody: { flex: 1 },
  eventTitle: { fontSize: 16, fontWeight: "700", color: Colors.light.ink },
  eventDetails: { fontSize: 14, color: Colors.light.inkMuted, marginTop: 2, lineHeight: 20 },
  eventMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.light.coralSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  metaPillText: { fontSize: 11, fontWeight: "600", color: Colors.light.coralDeep },
  eventActions: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 8 },

  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.light.creamDeep, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: Colors.light.ink, marginBottom: 6 },
  emptyText: { fontSize: 14, color: Colors.light.inkMuted, textAlign: "center", lineHeight: 20 },
  emptyHint: { fontSize: 12, color: Colors.light.inkFaint, textAlign: "center", marginTop: 8 },

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
  modalSubtitle: { fontSize: 14, color: Colors.light.inkMuted, textAlign: "center", marginTop: -2, marginBottom: 4, lineHeight: 20 },

  rawScroll: { maxHeight: 220, marginTop: 2, marginBottom: 4 },
  rawText: { fontSize: 15, color: Colors.light.ink, lineHeight: 22 },
  rawMeta: { fontSize: 12, color: Colors.light.inkMuted, marginTop: 10, fontWeight: "600" },

  rawInputCard: {
    backgroundColor: Colors.light.creamDeep,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: Colors.light.creamDeep,
    padding: spacing.md,
  },
  remindCard: {
    backgroundColor: Colors.light.creamDeep,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: Colors.light.creamDeep,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  remindCardTitle: { fontSize: 15, fontWeight: "700", color: Colors.light.ink, textAlign: "center" },

  pillGroup: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 },
  optionPill: {
    width: "48%",
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

  confirmRow: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  confirmRowPill: { flex: 1, marginTop: 0 },
  deletePill: {
    backgroundColor: Colors.light.coralDeep,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  deletePillPressed: { opacity: 0.75 },
  deletePillLabel: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
  // Used only by the Delete button inside the raw-input popup — matches
  // the "Remind me after" option pill coloring rather than the solid
  // coralDeep used by other delete confirmations.
  rawDeletePill: {
    backgroundColor: Colors.light.coralSoft,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  rawDeletePillPressed: { opacity: 0.6 },
  rawDeletePillLabel: { fontSize: 15, fontWeight: "700", color: Colors.light.coralDeep },
});
