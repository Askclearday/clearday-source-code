// Notes screen — list saved notes, edit / long-press-to-delete, using our
// own pill-styled popups instead of the system Alert. Layout mirrors
// reminders.tsx / calendar.tsx.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Modal,
  ScrollView,
  TextInput,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, NotebookPen, Mic, Type, Pencil, Search, X, SearchX } from "lucide-react-native";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import * as db from "@/lib/db";
import EmptyStateCard, { WelcomeCard } from "@/components/EmptyStateCards";
import type { Note } from "@/lib/types";

export default function NotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [rawTarget, setRawTarget] = useState<Note | null>(null);
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
    const rows = await db.getNotes();
    setNotes(rows);
  }, []);

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
    await db.deleteNote(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  const onEdit = (item: Note) => {
    // Hands the RAW input off to capture for editing — not the AI-parsed
    // title/content — so capture re-parses from what the user actually
    // said/typed, mirroring reminders.tsx and calendar.tsx's edit flow.
    // Notes have no due date/time to carry along. Capture will delete this
    // id and write the new capture on save, rather than creating a
    // duplicate.
    const payload = encodeURIComponent(
      JSON.stringify({
        id: item.id,
        raw_input: item.raw_input,
      })
    );
    router.push(`/capture?type=note&editId=${item.id}&editData=${payload}`);
  };

  const filteredNotes = searchQuery.trim()
    ? notes.filter((n) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          (n.content ?? "").toLowerCase().includes(q) ||
          (n.raw_input ?? "").toLowerCase().includes(q)
        );
      })
    : notes;

  const renderItem = ({ item }: { item: Note }) => (
    <Pressable
      style={({ pressed }) => [styles.noteCard, pressed && styles.noteCardPressed]}
      onPress={() => setRawTarget(item)}
      onLongPress={() => setDeleteTarget(item)}
      delayLongPress={380}
    >
      <View style={styles.noteIconCircle}>
        {item.source === "voice" ? (
          <NotebookPen size={14} color={Colors.light.coralDeep} />
        ) : (
          <Type size={14} color={Colors.light.coralDeep} />
        )}
      </View>
      <View style={styles.noteBody}>
        <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
        {item.content ? <Text style={styles.noteContent} numberOfLines={3}>{item.content}</Text> : null}
        <View style={styles.noteMeta}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{formatDate(item.created_at)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.noteActions}>
        <Pressable style={styles.iconBtn} onPress={() => onEdit(item)} hitSlop={6}>
          <Pencil size={16} color={Colors.light.inkMuted} />
        </Pressable>
      </View>
    </Pressable>
  );

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
                placeholder="Search notes..."
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
              <Text style={styles.headerTitle}>Notes</Text>
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

        <FlatList
          data={filteredNotes}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
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
                  icon={NotebookPen}
                  title="No notes"
                  description="Notes are for anything you want to remember but that doesn't need a due date — quick thoughts, ideas, or things to look up later. Tap the feather icon at the bottom right and speak or type it out, and Clear Day will save it exactly as you said it."
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

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDeleteTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Delete note?</Text>
            <Text style={styles.modalSubtitle}>
              {deleteTarget ? `"${deleteTarget.title}" will be permanently removed.` : ""}
            </Text>
            <View style={styles.confirmRow}>
              <Pressable
                onPress={() => setDeleteTarget(null)}
                style={({ pressed }) => [styles.cancelPill, styles.confirmRowPill, pressed && styles.cancelPillPressed]}
              >
                <Text style={styles.cancelPillLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                style={({ pressed }) => [styles.deletePill, styles.confirmRowPill, pressed && styles.deletePillPressed]}
              >
                <Text style={styles.deletePillLabel}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!rawTarget} transparent animationType="fade" onRequestClose={() => setRawTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRawTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Raw input</Text>
            <ScrollView style={styles.rawScroll} bounces={false} showsVerticalScrollIndicator={false}>
              <Text style={styles.rawText}>{rawTarget?.raw_input || "(no raw input saved)"}</Text>
            </ScrollView>
            <View style={styles.confirmRow}>
              <Pressable
                onPress={async () => {
                  const target = rawTarget;
                  setRawTarget(null);
                  if (target) {
                    await db.deleteNote(target.id);
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffH > 24 * 365 ? "numeric" : undefined });
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
  noteCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface,
    borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: Colors.light.border,
  },
  noteCardPressed: { opacity: 0.85 },
  noteIconCircle: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.light.coralDeep,
    alignItems: "center", justifyContent: "center", marginRight: spacing.md,
  },
  noteBody: { flex: 1 },
  noteTitle: { fontSize: 16, fontWeight: "700", color: Colors.light.ink },
  noteContent: { fontSize: 14, color: Colors.light.inkMuted, marginTop: 2, lineHeight: 20 },
  noteMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.light.coralSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  metaPillText: { fontSize: 11, fontWeight: "600", color: Colors.light.coralDeep },
  noteActions: { flexDirection: "row", gap: 4 },
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
