// Reusable reminders list — list pending reminders, complete / snooze / edit /
// long-press-to-delete, using our own pill-styled popups instead of the
// system Alert. Section grouping mirrors calendar.tsx (Today / Tomorrow /
// weekday / date). The time pill shows the actual moment the app will
// nudge you (due time minus reminder_offset_minutes) — not the deadline
// itself, which is what due_time represents.
//
// Tapping a card shows the RAW input (raw_input) as a popup — the literal
// text/voice transcript the item was created from, not the AI-parsed
// fields. Editing hands the raw_input (plus due_date/due_time, since those
// aren't recoverable from raw text alone) to capture.tsx, so capture
// re-parses from the original input rather than prefilling from the
// already-AI-generated title/details.
//
// No header/title here — this is meant to be embedded (e.g. in the
// reminders tab under its own header, or inline on the home screen).
// Pass `scrollable={false}` when embedding inside another ScrollView
// (e.g. home screen) to avoid nested-VirtualizedList scrolling issues;
// pull-to-refresh only works when scrollable is true.
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
} from "react-native";
import { useRouter } from "expo-router";
import { BellRing, Check, CheckCheck, CheckCircle, Clock, Pencil, AlarmClock, SearchX } from "lucide-react-native";
import * as Notifications from "expo-notifications";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import * as db from "@/lib/db";
import EmptyStateCard, { WelcomeCard } from "@/components/EmptyStateCards";
import type { Reminder } from "@/lib/types";

// Local YYYY-MM-DD — never use toISOString() for date-only values: it reads UTC,
// which drifts a day off near midnight in timezones ahead of UTC (e.g. Nairobi, UTC+3).
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Section = { title: string; data: Reminder[] };

const SNOOZE_OPTIONS = [
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "Tomorrow", minutes: 24 * 60 },
];

// Computes the moment the app will actually nudge the user — due_time minus
// reminder_offset_minutes — as opposed to due_time itself, which is the
// deadline. Mirrors computeOffsetDateTime in capture.tsx. Returns null if
// there's no date/time to compute from (a someday task with no due time).
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

function isReminderOverdue(nudge: { date: string; time: string } | null): boolean {
  if (!nudge) return false;
  const target = new Date(`${nudge.date}T${nudge.time}:00`);
  return target.getTime() < Date.now();
}

// Past-tense phrasing for something whose nudge moment has already passed —
// "Nudges Today · 6:44 PM" reads wrong once that moment is behind you.
function formatOverdueMeta(nudge: { date: string; time: string }): string {
  return `Overdue since ${formatDateShort(nudge.date)} · ${formatTime(nudge.time)}`;
}

export default function RemindersList({
  scrollable = true,
  searchQuery = "",
}: {
  scrollable?: boolean;
  searchQuery?: string;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // `deleteTarget` now doubles as the target for the combined long-press
  // popup (reschedule options + delete), replacing the separate
  // clock-triggered snooze popup.
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [rawTarget, setRawTarget] = useState<Reminder | null>(null);
  // Target for the standalone "mark as done" confirm popup, opened from the
  // card's circle-check icon. Marking as done is destructive here — it
  // fully deletes the reminder (and its calendar clone) via
  // deleteReminderCascade, rather than just flipping `completed`.
  const [markDoneTarget, setMarkDoneTarget] = useState<Reminder | null>(null);

  const load = useCallback(async () => {
    const allRows = await db.getReminders(false);
    const q = searchQuery.trim().toLowerCase();
    const rows = q
      ? allRows.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.details ?? "").toLowerCase().includes(q) ||
            (r.raw_input ?? "").toLowerCase().includes(q)
        )
      : allRows;

    // Split into overdue (nudge moment already passed) vs. everything else,
    // then group the rest by due_date same as before. Reminders with no
    // due_date at all (someday tasks) fall into their own trailing section.
    const grouped = new Map<string, Reminder[]>();
    const someday: Reminder[] = [];
    const overdue: Reminder[] = [];
    for (const r of rows) {
      const nudge = computeNudgeMoment(r.due_date, r.due_time, r.reminder_offset_minutes);
      if (isReminderOverdue(nudge)) {
        overdue.push(r);
        continue;
      }
      if (!r.due_date) {
        someday.push(r);
        continue;
      }
      const arr = grouped.get(r.due_date) ?? [];
      arr.push(r);
      grouped.set(r.due_date, arr);
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

    if (someday.length > 0) {
      secs.push({ title: "Someday", data: someday });
    }

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

  const onComplete = async (item: Reminder) => {
    await db.completeReminderCascade(item.id);
    load();
  };

  const onMarkAllOverdueDone = async (items: Reminder[]) => {
    await Promise.all(items.map((r) => db.completeReminderCascade(r.id)));
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    // Cascades to the source calendar event (if this reminder was cloned
    // from one) via a best-effort date+title match -- see the comment on
    // deleteReminderCascade in lib/db.ts.
    await db.deleteReminderCascade(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  // "Mark as done" is destructive: it deletes the reminder outright
  // (cascading to its calendar clone) rather than setting completed = 1.
  const confirmMarkDone = async () => {
    if (!markDoneTarget) return;
    await db.deleteReminderCascade(markDoneTarget.id);
    setMarkDoneTarget(null);
    load();
  };

  const rescheduleTarget = async (target: Reminder, minutes: number) => {
    const until = new Date(Date.now() + minutes * 60000);
    const newDate = toLocalISODate(until);
    const newTime = `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`;
    await db.rescheduleReminder(target.id, newDate, newTime);
    await db.snoozeReminder(target.id, until.toISOString());
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Reminder",
          body: target.notification_text || target.title || "Reminder",
          data: { kind: "reminder", id: String(target.id) },
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: until },
      });
    } catch {
      /* notifications may be denied */
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

  const onEdit = (item: Reminder) => {
    const payload = encodeURIComponent(
      JSON.stringify({
        id: item.id,
        raw_input: item.raw_input,
        due_date: item.due_date,
        due_time: item.due_time,
      })
    );
    router.push(`/capture?type=reminder&editId=${item.id}&editData=${payload}`);
  };

  const renderItem = ({ item, section }: { item: Reminder; section: Section }) => {
    const nudge = computeNudgeMoment(item.due_date, item.due_time, item.reminder_offset_minutes);
    const overdue = section.title === "Overdue";
    const nudgeColor = Colors.light.coralDeep;

    return (
      <Pressable
        style={({ pressed }) => [styles.reminderCard, pressed && styles.reminderCardPressed]}
        onPress={() => setRawTarget(item)}
        onLongPress={() => setDeleteTarget(item)}
        delayLongPress={380}
      >
        <Pressable style={styles.checkBtn} onPress={() => onComplete(item)} hitSlop={6}>
          <BellRing size={16} color={Colors.light.coralDeep} />
        </Pressable>
        <View style={styles.reminderBody}>
          <Text style={styles.reminderTitle}>{item.title}</Text>
          {item.raw_input ? <Text style={styles.reminderDetails} numberOfLines={3}>{item.raw_input}</Text> : null}
          <View style={styles.reminderMeta}>
            {nudge ? (
              <View style={styles.metaPill}>
                <Clock size={11} color={nudgeColor} />
                <Text style={[styles.metaPillText, { color: nudgeColor }]}>
                  {overdue ? formatOverdueMeta(nudge) : `Nudges ${formatDateShort(nudge.date)} · ${formatTime(nudge.time)}`}
                </Text>
              </View>
            ) : item.due_date ? (
              <View style={styles.metaPill}>
                <Clock size={11} color={Colors.light.coralDeep} />
                <Text style={styles.metaPillText}>{formatDateShort(item.due_date)}</Text>
              </View>
            ) : null}
            {item.snoozed_until ? (
              <View style={[styles.metaPill, { backgroundColor: Colors.light.creamDeep }]}>
                <AlarmClock size={11} color={Colors.light.inkMuted} />
                <Text style={[styles.metaPillText, { color: Colors.light.inkMuted }]}>
                  rescheduled until {formatDateTimeShort(item.snoozed_until)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.reminderActions}>
          <Pressable style={styles.iconBtn} onPress={() => setMarkDoneTarget(item)} hitSlop={6}>
            <CheckCircle size={16} color={Colors.light.inkMuted} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={scrollable ? styles.flex : undefined}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        scrollEnabled={scrollable}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) =>
          section.title === "Overdue" ? (
            <View style={styles.overdueHeaderRow}>
              <Text style={[styles.sectionHeader, styles.overdueSectionHeader]}>{section.title}</Text>
              <Pressable
                onPress={() => onMarkAllOverdueDone(section.data)}
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
        contentContainerStyle={scrollable ? styles.list : styles.listInline}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          scrollable ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.coral} />
          ) : undefined
        }
        ListEmptyComponent={
          searchQuery.trim() ? (
            <EmptyStateCard
              icon={SearchX}
              title="No results found"
              description={`Nothing matches "${searchQuery.trim()}". Try a different search term.`}
              style={{ marginTop: 20 }}
            />
          ) : (
            <View>
              <EmptyStateCard
                icon={BellRing}
                title="No pending reminders"
                description="Reminders nudge you before something's due. Tap the feather icon at the bottom right, then type or speak what you need to remember — like 'call the dentist tomorrow at 3pm' or 'pay rent on the 1st.' Clear Day figures out the date, time, and how far ahead to nudge you."
                style={{ marginTop: 20 }}
              />
              <WelcomeCard />
            </View>
          )
        }
      />

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
              <Text style={styles.deletePillLabel}>Delete reminder</Text>
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
                {rawTarget?.due_date ? (
                  <Text style={styles.rawMeta}>
                    due_date: {rawTarget.due_date}
                    {rawTarget.due_time ? `  ·  due_time: ${rawTarget.due_time}` : ""}
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
                onPress={() => {
                  const target = rawTarget;
                  setRawTarget(null);
                  if (target) onEdit(target);
                }}
                style={({ pressed }) => [styles.optionPill, styles.confirmRowPill, pressed && styles.optionPillPressed]}
              >
                <Text style={styles.optionPillLabel}>Edit</Text>
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

      <Modal visible={!!markDoneTarget} transparent animationType="fade" onRequestClose={() => setMarkDoneTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMarkDoneTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Mark this as done?</Text>
            <Text style={styles.modalSubtitle}>
              Mark this reminder as done? This will delete it and remove it from the database.
            </Text>
            <Pressable
              onPress={confirmMarkDone}
              style={({ pressed }) => [styles.markDonePill, pressed && styles.markDonePillPressed]}
            >
              <CheckCircle size={18} color="#ffffff" />
              <Text style={styles.markDoneLabel}>Mark as Done</Text>
            </Pressable>
            <Pressable
              onPress={() => setMarkDoneTarget(null)}
              style={({ pressed }) => [styles.cancelPill, pressed && styles.cancelPillPressed]}
            >
              <Text style={styles.cancelPillLabel}>Cancel</Text>
            </Pressable>
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

function formatDateShort(d: string): string {
  const date = new Date(d + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  list: { paddingHorizontal: spacing.md, paddingTop: 0, paddingBottom: 140 },
  listInline: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  sectionHeader: {
    fontSize: 13, fontWeight: "700", color: Colors.light.coralDeep,
    textTransform: "uppercase", letterSpacing: 0.5,
    marginTop: spacing.md, marginBottom: 8, paddingLeft: 4,
  },
  overdueHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing.lg, marginBottom: 18, paddingLeft: 4, paddingRight: 4,
  },
  overdueSectionHeader: { marginTop: 0, marginBottom: 0, paddingLeft: 0 },
  overdueMarkAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.light.coralSoft, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radii.pill,
  },
  overdueMarkAllLabel: { fontSize: 11, fontWeight: "700", color: Colors.light.coralDeep },
  reminderCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface,
    borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: Colors.light.border,
  },
  reminderCardPressed: { opacity: 0.85 },
  checkBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.light.coralDeep,
    alignItems: "center", justifyContent: "center", marginRight: spacing.md,
  },
  reminderBody: { flex: 1 },
  reminderTitle: { fontSize: 16, fontWeight: "700", color: Colors.light.ink },
  reminderDetails: { fontSize: 14, color: Colors.light.inkMuted, marginTop: 2, lineHeight: 20 },
  reminderMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.light.coralSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  metaPillText: { fontSize: 11, fontWeight: "600", color: Colors.light.coralDeep },
  reminderActions: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 8 },

  empty: { alignItems: "center", justifyContent: "center", paddingTop: 40, paddingBottom: 40,paddingHorizontal: spacing.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.light.creamDeep, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: Colors.light.ink, marginBottom: 6 },
  emptyText: { fontSize: 14, color: Colors.light.inkMuted, textAlign: "center", lineHeight: 20 },

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

  markDonePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.coralDeep,
    borderRadius: radii.pill,
    paddingVertical: 14,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  markDonePillPressed: { opacity: 0.8 },
  markDoneLabel: { fontSize: 15, fontWeight: "700", color: "#ffffff" },

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
});
