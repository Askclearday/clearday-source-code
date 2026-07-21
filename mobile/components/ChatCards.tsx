// Renders the card groups produced by app/capture.tsx's direct-Groq structuring pipeline
// underneath a chat bubble.
// Cards lay out as a wrapping grid (columns) -- nothing is ever clipped, it just wraps to
// the next row.
// Duplicate card groups (same underlying items, different label) are filtered out
// defensively here on top of whatever dedupe the caller already did.
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Bell, Calendar as CalendarIcon, FileText, Clock, CheckCircle2, AlertTriangle, HelpCircle, Send } from "lucide-react-native";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import type { ChatCardGroup, ChatCardItem } from "@/lib/chat-types";

function formatTime12h(time: string | null | undefined): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h)) return time;
  if (h === 0 && m === 0) return "midnight";
  if (h === 12 && m === 0) return "noon";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = MONTHS[parseInt(m[2], 10) - 1] ?? "";
  return `${month} ${parseInt(m[3], 10)}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  trip: "#4F8EF7",
  birthday: "#E76BB0",
  assignment: "#8B6BE7",
  deadline: "#E7574F",
  general: Colors.light.coral,
};

function categoryColor(category: string | undefined): string {
  return CATEGORY_COLORS[category ?? "general"] ?? Colors.light.coral;
}

function buildEditParams(item: ChatCardItem): { type: string; editId: string; editData: string } | null {
  if (item.kind === "reminder") {
    return {
      type: "reminder",
      editId: String(item.id),
      editData: encodeURIComponent(JSON.stringify({ id: item.id, raw_input: item.title, due_date: item.due_date, due_time: item.due_time })),
    };
  }
  if (item.kind === "calendar_event") {
    return {
      type: "calendar_event",
      editId: String(item.id),
      editData: encodeURIComponent(JSON.stringify({ id: item.id, raw_input: item.title, date: item.date, time: item.time })),
    };
  }
  if (item.kind === "note") {
    return {
      type: "note",
      editId: String(item.id),
      editData: encodeURIComponent(JSON.stringify({ id: item.id, raw_input: item.content || item.title })),
    };
  }
  return null;
}

function ReminderCard({ item }: { item: Extract<ChatCardItem, { kind: "reminder" }> }) {
  const router = useRouter();
  const dateLabel = formatDateLabel(item.due_date);
  const timeLabel = formatTime12h(item.due_time);
  const when = [dateLabel, timeLabel].filter(Boolean).join(" · ") || "No date set";
  const color = categoryColor(item.category);
  const onPress = () => {
    const p = buildEditParams(item);
    if (p) router.push({ pathname: "/capture", params: p });
  };
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.iconChip, { backgroundColor: color + "1A", borderColor: color }]}>
        {item.completed ? <CheckCircle2 size={16} color={color} /> : <Bell size={16} color={color} />}
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, item.completed && styles.cardTitleDone]} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMetaRow}>
          <Clock size={12} color={Colors.light.inkFaint} />
          <Text style={styles.cardMeta}>{when}</Text>
        </View>
        {item.completed && <Text style={styles.cardDoneTag}>Completed</Text>}
      </View>
    </Pressable>
  );
}

function CalendarEventCard({ item }: { item: Extract<ChatCardItem, { kind: "calendar_event" }> }) {
  const router = useRouter();
  const dateLabel = formatDateLabel(item.date);
  const timeLabel = formatTime12h(item.time);
  const endLabel = item.time_range_end ? formatTime12h(item.time_range_end) : null;
  const timePart = timeLabel ? (endLabel ? `${timeLabel} – ${endLabel}` : timeLabel) : "No time set";
  const when = [dateLabel, timePart].filter(Boolean).join(" · ");
  const color = categoryColor(item.category);
  const onPress = () => {
    const p = buildEditParams(item);
    if (p) router.push({ pathname: "/capture", params: p });
  };
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.iconChip, { backgroundColor: color + "1A", borderColor: color }]}>
        {item.completed ? <CheckCircle2 size={16} color={color} /> : <CalendarIcon size={16} color={color} />}
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, item.completed && styles.cardTitleDone]} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMetaRow}>
          <Clock size={12} color={Colors.light.inkFaint} />
          <Text style={styles.cardMeta}>{when}</Text>
        </View>
        {item.completed && <Text style={styles.cardDoneTag}>Completed</Text>}
      </View>
    </Pressable>
  );
}

function NoteCard({ item }: { item: Extract<ChatCardItem, { kind: "note" }> }) {
  const router = useRouter();
  const dateLabel = formatDateLabel(item.event_date);
  const timeLabel = formatTime12h(item.event_time);
  const when = [dateLabel, timeLabel].filter(Boolean).join(" · ");
  const onPress = () => {
    const p = buildEditParams(item);
    if (p) router.push({ pathname: "/capture", params: p });
  };
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.iconChip, { backgroundColor: Colors.light.coral + "1A", borderColor: Colors.light.coral }]}>
        <FileText size={16} color={Colors.light.coral} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.content && <Text style={styles.cardSnippet} numberOfLines={2}>{item.content}</Text>}
        {!!when && (
          <View style={styles.cardMetaRow}>
            <Clock size={12} color={Colors.light.inkFaint} />
            <Text style={styles.cardMeta}>{when}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function FreeSlotsCard({ item }: { item: Extract<ChatCardItem, { kind: "free_slots" }> }) {
  const dateLabel = formatDateLabel(item.date);
  return (
    <View style={[styles.card, styles.wideCard]}>
      <View style={[styles.iconChip, { backgroundColor: Colors.light.coral + "1A", borderColor: Colors.light.coral }]}>
        <Clock size={16} color={Colors.light.coral} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{dateLabel ? `Free time on ${dateLabel}` : "Free time"}</Text>
        {item.slots.length === 0 ? (
          <Text style={styles.cardMeta}>No free slots found.</Text>
        ) : (
          <View style={styles.slotsWrap}>
            {item.slots.map((s, i) => (
              <View key={i} style={styles.slotPill}>
                <Text style={styles.slotPillText}>{formatTime12h(s.start)} – {formatTime12h(s.end)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// Same 4 actions the old full-screen collision banner had. Resolved directly against the DB
// via onCollisionResolve -- never routed back through Groq.
function CollisionCard({
  item,
  onResolve,
}: {
  item: Extract<ChatCardItem, { kind: "collision" }>;
  onResolve?: (item: Extract<ChatCardItem, { kind: "collision" }>, action: "shift_later" | "shift_earlier" | "keep_both" | "discard") => void;
}) {
  return (
    <View style={[styles.card, styles.wideCard, styles.collisionCard]}>
      <View style={[styles.iconChip, { backgroundColor: Colors.light.warn + "1A", borderColor: Colors.light.warn }]}>
        <AlertTriangle size={16} color={Colors.light.warn} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>Scheduling conflict</Text>
        <Text style={styles.cardSnippet}>{item.message}</Text>
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={() => onResolve?.(item, "shift_later")}>
            <Text style={styles.actionBtnLabel}>Move new one 1hr later</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => onResolve?.(item, "keep_both")}>
            <Text style={styles.actionBtnLabel}>Keep both as-is</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => onResolve?.(item, "shift_earlier")}>
            <Text style={styles.actionBtnLabel}>Move new one 1hr earlier</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => onResolve?.(item, "discard")}>
            <Text style={styles.actionBtnLabel}>Discard this one</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Same "Any time" + suggested-time buttons the old full-screen follow-up banner had, now as
// a chat card. A free-text fallback is included too, since the same answer can also just be
// typed as the next chat message (handled in capture.tsx via pendingFollowupRef).
function FollowupCard({
  item,
  onResolve,
}: {
  item: Extract<ChatCardItem, { kind: "followup" }>;
  onResolve?: (item: Extract<ChatCardItem, { kind: "followup" }>, choice: "any" | { date: string; time: string }) => void;
}) {
  if (item.resolved) return null;
  return (
    <View style={[styles.card, styles.wideCard, styles.followupCard]}>
      <View style={[styles.iconChip, { backgroundColor: Colors.light.warn + "1A", borderColor: Colors.light.warn }]}>
        <HelpCircle size={16} color={Colors.light.warn} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>One more thing</Text>
        <Text style={styles.cardSnippet}>{item.message}</Text>
        <View style={styles.actionsRow}>
          <Pressable style={styles.suggestedTimeBtn} onPress={() => onResolve?.(item, "any")}>
            <Text style={styles.suggestedTimeBtnLabel}>Any time</Text>
          </Pressable>
          {item.suggestedTimes.map((s, i) => (
            <Pressable key={i} style={styles.suggestedTimeBtn} onPress={() => onResolve?.(item, { date: s.date, time: s.time })}>
              <Text style={styles.suggestedTimeBtnLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function CardForItem({
  item,
  onCollisionResolve,
  onFollowupResolve,
}: {
  item: ChatCardItem;
  onCollisionResolve?: (item: Extract<ChatCardItem, { kind: "collision" }>, action: "shift_later" | "shift_earlier" | "keep_both" | "discard") => void;
  onFollowupResolve?: (item: Extract<ChatCardItem, { kind: "followup" }>, choice: "any" | { date: string; time: string }) => void;
}) {
  switch (item.kind) {
    case "reminder":
      return <ReminderCard item={item} />;
    case "calendar_event":
      return <CalendarEventCard item={item} />;
    case "note":
      return <NoteCard item={item} />;
    case "free_slots":
      return <FreeSlotsCard item={item} />;
    case "collision":
      return <CollisionCard item={item} onResolve={onCollisionResolve} />;
    case "followup":
      return <FollowupCard item={item} onResolve={onFollowupResolve} />;
    default:
      return null;
  }
}

function itemSignature(item: ChatCardItem): string {
  if (item.kind === "free_slots") return `free_slots:${item.date}`;
  if (item.kind === "collision") return `collision:${item.conflictWith.id}:${item.pendingItem.title}`;
  if (item.kind === "followup") return `followup:${item.rawInput}:${item.pendingItem.title}`;
  return `${item.kind}:${item.id}`;
}

function isWide(item: ChatCardItem): boolean {
  return item.kind === "free_slots" || item.kind === "collision" || item.kind === "followup";
}

function CardGroupRow({
  group,
  onCollisionResolve,
  onFollowupResolve,
}: {
  group: ChatCardGroup;
  onCollisionResolve?: (item: Extract<ChatCardItem, { kind: "collision" }>, action: "shift_later" | "shift_earlier" | "keep_both" | "discard") => void;
  onFollowupResolve?: (item: Extract<ChatCardItem, { kind: "followup" }>, choice: "any" | { date: string; time: string }) => void;
}) {
  return (
    <View style={styles.groupWrap}>
      <Text style={styles.groupLabel}>{group.label}</Text>
      <View style={styles.grid}>
        {group.items.map((item, i) => (
          <View key={`${group.id}_${i}`} style={isWide(item) ? styles.gridItemWide : styles.gridItem}>
            <CardForItem item={item} onCollisionResolve={onCollisionResolve} onFollowupResolve={onFollowupResolve} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ChatCards({
  groups,
  onCollisionResolve,
  onFollowupResolve,
}: {
  groups: ChatCardGroup[];
  onCollisionResolve?: (item: Extract<ChatCardItem, { kind: "collision" }>, action: "shift_later" | "shift_earlier" | "keep_both" | "discard") => void;
  onFollowupResolve?: (item: Extract<ChatCardItem, { kind: "followup" }>, choice: "any" | { date: string; time: string }) => void;
}) {
  // Defensive dedupe: even if two groups ended up describing the exact same set of items,
  // only render the first occurrence.
  const dedupedGroups = useMemo(() => {
    const seen = new Set<string>();
    const out: ChatCardGroup[] = [];
    for (const g of groups ?? []) {
      const sig = g.items.map(itemSignature).sort().join("|");
      if (sig && seen.has(sig)) continue;
      if (sig) seen.add(sig);
      out.push(g);
    }
    return out;
  }, [groups]);

  if (dedupedGroups.length === 0) return null;
  return (
    <View style={styles.container}>
      {dedupedGroups.map((g) => (
        <CardGroupRow key={g.id} group={g} onCollisionResolve={onCollisionResolve} onFollowupResolve={onFollowupResolve} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, marginTop: 6, marginBottom: 4 },

  groupWrap: { gap: 6 },
  groupLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.light.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginLeft: 2,
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { flexBasis: "47%", flexGrow: 1, minWidth: 150 },
  gridItemWide: { flexBasis: "100%", width: "100%" },

  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  wideCard: { width: "100%" },
  collisionCard: { borderColor: Colors.light.warn },
  followupCard: { borderColor: Colors.light.warn },

  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: Colors.light.ink, lineHeight: 18 },
  cardTitleDone: { textDecorationLine: "line-through", color: Colors.light.inkFaint },
  cardSnippet: { fontSize: 12, color: Colors.light.inkMuted, lineHeight: 16 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  cardMeta: { fontSize: 12, color: Colors.light.inkFaint },
  cardDoneTag: { fontSize: 11, fontWeight: "700", color: Colors.light.coral, marginTop: 2 },

  slotsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  slotPill: { backgroundColor: Colors.light.coralSoft, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6 },
  slotPillText: { fontSize: 12, fontWeight: "700", color: Colors.light.coralDeep },

  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  actionBtn: {
    backgroundColor: Colors.light.cream,
    borderWidth: 1.5,
    borderColor: Colors.light.borderStrong,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtnLabel: { fontSize: 12, fontWeight: "600", color: Colors.light.ink },

  suggestedTimeBtn: { backgroundColor: Colors.light.coralSoft, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 8 },
  suggestedTimeBtnLabel: { fontSize: 12, fontWeight: "700", color: Colors.light.coralDeep },
});