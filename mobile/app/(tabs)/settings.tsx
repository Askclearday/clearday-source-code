// Settings screen — profile, adjust brief time, voice, mode, chime, view
// history. Card shape/spacing/pop-up pattern mirrors reminders.tsx; icon
// color is a single coral accent throughout (no green/sage/dusk mix).
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Modal,
  TextInput,
  Share,
  Image,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import { useLocalSearchParams } from "expo-router";
import {
  Clock,
  Volume2,
  Sun,
  Moon,
  Bell,
  Info,
  ChevronRight,
  Check,
  User,
  Pen,
  Globe,
  FileText,
  ShieldCheck,
  Mail,
} from "lucide-react-native";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import { useApp } from "@/lib/app-context";
import * as tts from "@/lib/tts";
import * as perms from "@/lib/permissions";
import * as db from "@/lib/db";
import type { BriefMode, DailyBriefLog, VoiceInfo } from "@/lib/types";
import { DarkTimePicker } from "@/components/onboarding/DarkTimePicker";
import ManageSubscription from "@/components/settings/ManageSubscription";

// Dark gray used for the profile avatar circle and its edit badge —
// deliberately darker than the card's own background so both read as a
// solid, neutral accent instead of the previous purple-tinted coralSoft.
const AVATAR_DARK_GRAY = "#3A3A3E";
const EDIT_BADGE_DARK_GRAY = "#4A4A4F";

// Same gradient construction as the glow overlay on the subscription card
// in ManageSubscription.tsx (soft coral fading into transparent), rendered
// left-to-right here so it reads as fading toward gray on the card's right
// edge rather than diagonally.
const PROFILE_CARD_GRADIENT_COLORS = [Colors.light.coral + "33", "transparent"] as const;
const PROFILE_CARD_GRADIENT_START = { x: 0, y: 0 };
const PROFILE_CARD_GRADIENT_END = { x: 1, y: 0 };

const CHIME_OPTIONS = [
  { id: "silent", label: "Silent" },
  { id: "soft_chime", label: "Soft chime" },
  { id: "gentle_bell", label: "Gentle bell" },
];

const MODE_OPTIONS: { id: BriefMode | null; label: string; sub: string }[] = [
  { id: null, label: "Auto", sub: "Infer from your brief time" },
  { id: "morning", label: "Morning", sub: "About today" },
  { id: "evening", label: "Evening", sub: "About tomorrow" },
];

// About / support links. Update these if the marketing site or support
// address ever changes — they're the single source of truth for this screen.
const ABOUT_LINKS = [
  { id: "website", label: "Visit our website", url: "https://useclearday.com/" },
  { id: "about", label: "About us", url: "https://useclearday.com/about" },
  { id: "terms", label: "Terms & Conditions", url: "https://useclearday.com/terms" },
  { id: "privacy", label: "Privacy Policy", url: "https://useclearday.com/privacy" },
] as const;

const SUPPORT_EMAIL = "support@useclearday.com";





export default function SettingsScreen() {
  const { user, updateUser } = useApp();
  // Set by the Home screen's brief card (?openTimePicker=1) so arriving
  // here from that shortcut opens the time picker immediately instead of
  // making the user find + tap the row themselves.
  const { openTimePicker } = useLocalSearchParams<{ openTimePicker?: string }>();
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name ?? "");
  const [briefDate, setBriefDate] = useState<Date>(() => parseTime(user?.brief_time ?? "07:00"));
  const [history, setHistory] = useState<DailyBriefLog[]>([]);
  // Tracks which voice's preview is currently playing so its row can light up.
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const h = await db.getBriefHistory(10);
    setHistory(h);
  }, []);

  useEffect(() => {
    tts.getAvailableVoices().then(setVoices).catch(() => setVoices([]));
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (openTimePicker) {
      setShowTimePicker(true);
    }
  }, [openTimePicker]);

  useEffect(() => {
    setBriefDate(parseTime(user?.brief_time ?? "07:00"));
  }, [user?.brief_time]);

  useEffect(() => {
    setNameDraft(user?.name ?? "");
  }, [user?.name]);

  // Stop any in-flight voice preview the moment the picker closes, so audio
  // never keeps playing behind a dismissed pop-up.
  useEffect(() => {
    if (!showVoicePicker) {
      tts.stopSpeaking();
      setPreviewingVoiceId(null);
    }
  }, [showVoicePicker]);

  const currentMode: BriefMode = user?.brief_mode_override ?? (parseInt((user?.brief_time ?? "07:00").split(":")[0] ?? "7", 10) < 14 ? "morning" : "evening");

  const onSaveTime = useCallback(async (d: Date) => {
    setShowTimePicker(false);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    await updateUser({ brief_time: `${h}:${m}` });
  }, [updateUser]);

  const onModeChange = useCallback(async (m: BriefMode | null) => {
    await updateUser({ brief_mode_override: m });
    setShowModePicker(false);
  }, [updateUser]);


  // Selecting a voice card (or its speaker icon) both picks that voice AND
  // plays a preview — it never closes the picker. Tapping the same voice
  // again while it's already playing stops playback instead of restarting
  // it. The picker only closes via its own Close button (or the "picker
  // just closed" effect below, which stops any in-flight preview).
  //
  // IMPORTANT: tts.previewVoice() is a synchronous, fire-and-forget void
  // function — it does NOT return a promise that resolves when speech
  // finishes. Awaiting it (as this used to) resolved on the very next
  // tick, long before the voice was done talking, which cleared
  // previewingVoiceId almost immediately (the speaker icon only looked
  // "active" for an instant) AND made a second tap during real playback
  // look like nothing was playing, so it called previewVoice() again and
  // restarted the same line instead of stopping it. Tracking completion
  // via the onDone callback instead fixes both.
  const handleVoicePress = useCallback((id: string) => {
    if (user?.voice_id !== id) {
      updateUser({ voice_id: id });
    }
    if (previewingVoiceId === id) {
      tts.stopSpeaking();
      setPreviewingVoiceId(null);
      return;
    }
    setPreviewingVoiceId(id);
    tts.previewVoice(id, {
      onDone: () => setPreviewingVoiceId((cur) => (cur === id ? null : cur)),
    });
  }, [user?.voice_id, updateUser, previewingVoiceId]);

  const onSaveName = useCallback(async () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0) return;
    await updateUser({ name: trimmed });
    setShowProfileEdit(false);
  }, [nameDraft, updateUser]);

  const currentVoice = voices.find((v) => v.id === user?.voice_id);
  // avatar_uri isn't on the User type yet — falls back to the dark-gray
  // profile-icon circle until a photo-upload flow exists. Cast defensively
  // so this doesn't break the build in the meantime.
  const avatarUri = (user as any)?.avatar_uri as string | undefined;

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {/* Standard fixed header — does not scroll */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable
            style={({ pressed }) => [styles.profileCard, pressed && { opacity: 0.9 }]}
            onPress={() => setShowProfileEdit(true)}
          >
            <LinearGradient
              colors={PROFILE_CARD_GRADIENT_COLORS}
              start={PROFILE_CARD_GRADIENT_START}
              end={PROFILE_CARD_GRADIENT_END}
              style={styles.profileCardGradient}
            />
            <View style={styles.avatarWrap}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <User size={44} color="#ffffff" />
                </View>
              )}
              <View style={styles.editBadge}>
                <Pen size={14} color="#ffffff" />
              </View>
            </View>
            <Text style={styles.profileName}>{user?.name ?? "Add your name"}</Text>
            <Text style={styles.profileSub}>
              {user?.created_at ? `Member since ${formatMemberSince(user.created_at)}` : "Tap to set up your profile"}
            </Text>
          </Pressable>

          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Subscription</Text>
          <ManageSubscription />

          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Daily brief</Text>

      <SettingsRow
        icon={<Clock size={18} color={Colors.light.coral} />}
        label="Brief time"
        value={formatTimeLabel(briefDate)}
        onPress={() => setShowTimePicker(true)}
      />

      <DarkTimePicker
        visible={showTimePicker}
        initialTime={briefDate}
        onConfirm={onSaveTime}
        onClose={() => setShowTimePicker(false)}
      />

      <SettingsRow
        icon={currentMode === "morning" ? <Sun size={18} color={Colors.light.coral} /> : <Moon size={18} color={Colors.light.coral} />}
        label="Brief mode"
        value={user?.brief_mode_override ? capitalize(user.brief_mode_override) : "Auto"}
        onPress={() => setShowModePicker(true)}
      />

      <SettingsRow
        icon={<Volume2 size={18} color={Colors.light.coral} />}
        label="Voice"
        value={currentVoice?.name ?? "Default"}
        onPress={() => setShowVoicePicker(true)}
      />

  
      <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>About</Text>
      <LinkRow
        icon={<Globe size={18} color={Colors.light.coral} />}
        label="Visit our website"
        onPress={() => Linking.openURL(ABOUT_LINKS[0].url)}
      />
      <LinkRow
        icon={<Info size={18} color={Colors.light.coral} />}
        label="About us"
        onPress={() => Linking.openURL(ABOUT_LINKS[1].url)}
      />
      <LinkRow
        icon={<FileText size={18} color={Colors.light.coral} />}
        label="Terms & Conditions"
        onPress={() => Linking.openURL(ABOUT_LINKS[2].url)}
      />
      <LinkRow
        icon={<ShieldCheck size={18} color={Colors.light.coral} />}
        label="Privacy Policy"
        onPress={() => Linking.openURL(ABOUT_LINKS[3].url)}
      />
      <LinkRow
        icon={<Mail size={18} color={Colors.light.coral} />}
        label="Contact support"
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}

      />











<Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Recent briefs</Text>
      {history.length === 0 ? (
        <Text style={styles.emptyHistory}>No briefs generated yet.</Text>
      ) : (
        history.map((h) => (
          <Pressable
            key={h.id}
            style={styles.historyRow}
            onPress={() => Share.share({ message: h.generated_text })}
          >
            <View style={styles.historyLeft}>
              <Text style={styles.historyDate}>{formatHistoryDate(h.date)}</Text>
              <Text style={styles.historyMode}>
                {h.mode === "morning" ? "Morning" : "Evening"}
                {h.delivered_at ? " · delivered" : " · not delivered"}
              </Text>
            </View>
            <ChevronRight size={18} color={Colors.light.inkFaint} />
          </Pressable>
        ))
      )}


          <View style={styles.footer}>
            <Text style={styles.footerText}> Clearday · v1.0{"\n"}
              {perms.isOverlaySupported() ? "Android overlay mode active" : "iOS: notification → in-app full-screen fallback"}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Profile edit — centered pop-up, closes on backdrop tap */}
      <Modal visible={showProfileEdit} transparent animationType="fade" onRequestClose={() => setShowProfileEdit(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowProfileEdit(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Your name</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Enter your name"
              placeholderTextColor={Colors.light.inkFaint}
              style={styles.nameInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onSaveName}
            />
            <View style={styles.confirmRow}>
              <Pressable
                onPress={() => setShowProfileEdit(false)}
                style={({ pressed }) => [styles.cancelPill, styles.confirmRowPill, pressed && styles.cancelPillPressed]}
              >
                <Text style={styles.cancelPillLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSaveName}
                style={({ pressed }) => [styles.savePill, styles.confirmRowPill, pressed && styles.savePillPressed]}
              >
                <Text style={styles.savePillLabel}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Brief mode — centered pop-up with real buttons instead of a system Alert */}
      <Modal visible={showModePicker} transparent animationType="fade" onRequestClose={() => setShowModePicker(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowModePicker(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Brief mode</Text>
            <Text style={styles.modalSubtitle}>Choose how your brief is generated.</Text>
            <View style={styles.pillGroup}>
              {MODE_OPTIONS.map((opt) => {
                const selected = user?.brief_mode_override === opt.id || (opt.id === null && !user?.brief_mode_override);
                return (
                  <Pressable
                    key={opt.label}
                    onPress={() => onModeChange(opt.id)}
                    style={({ pressed }) => [
                      styles.modeOption,
                      selected && styles.modeOptionSel,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modeOptionLabel, selected && styles.modeOptionLabelSel]}>{opt.label}</Text>
                      <Text style={[styles.modeOptionSub, selected && styles.modeOptionSubSel]}>{opt.sub}</Text>
                    </View>
                    {selected ? <Check size={18} color="#ffffff" /> : null}
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              onPress={() => setShowModePicker(false)}
              style={({ pressed }) => [styles.cancelPill, pressed && styles.cancelPillPressed]}
            >
              <Text style={styles.cancelPillLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Voice picker — centered pop-up (was a bottom sheet) */}
      <Modal visible={showVoicePicker} transparent animationType="fade" onRequestClose={() => setShowVoicePicker(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowVoicePicker(false)}>
          <Pressable style={[styles.modalCard, styles.voiceModalCard]} onPress={() => {}}>
            <Text style={styles.modalTitle}>Pick a voice</Text>
            <ScrollView style={styles.voiceScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {voices.slice(0, 30).map((v) => {
                const isPreviewing = previewingVoiceId === v.id;
                return (
                  <Pressable
                    key={v.id}
                    style={[styles.voiceRow, user?.voice_id === v.id && styles.voiceRowSel]}
                    onPress={() => handleVoicePress(v.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.voiceName} numberOfLines={1}>{v.name}</Text>
                      <Text style={styles.voiceLang}>{v.language ?? "—"}</Text>
                    </View>
                    <Pressable
                      style={[styles.voicePreview, isPreviewing && styles.voicePreviewActive]}
                      onPress={() => handleVoicePress(v.id)}
                      hitSlop={6}
                    >
                      <Volume2 size={18} color={isPreviewing ? "#ffffff" : Colors.light.coral} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => setShowVoicePicker(false)}
              style={({ pressed }) => [styles.cancelPill, pressed && styles.cancelPillPressed]}
            >
              <Text style={styles.cancelPillLabel}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SettingsRow({
  icon, label, value, onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <View style={styles.rowLeft}>
        <View style={styles.rowIcon}>{icon}</View>
        <View>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      </View>
      <ChevronRight size={18} color={Colors.light.inkFaint} />
    </Pressable>
  );
}

// Same row chrome as SettingsRow but without a value line — used for the
// About section where each row is just a label + external link.
function LinkRow({
  icon, label, onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <View style={styles.rowLeft}>
        <View style={styles.rowIcon}>{icon}</View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <ChevronRight size={18} color={Colors.light.inkFaint} />
    </Pressable>
  );
}

function parseTime(t: string): Date {
  const d = new Date();
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  d.setHours(h ?? 7, m ?? 0, 0, 0);
  return d;
}

function formatTimeLabel(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatHistoryDate(d: string): string {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.light.cream },
  scroll: { padding: spacing.lg, paddingBottom: 150 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: Colors.light.coralDeep, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: spacing.sm },

  // Fixed header — same construction as reminders.tsx's header.
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: Colors.light.ink },

  // Profile — big centered avatar, premium card treatment. relative +
  // overflow hidden so the gradient overlay clips to the card's rounded
  // corners instead of bleeding past them.
  profileCard: {
    alignItems: "center",
    backgroundColor: Colors.light.surface, borderRadius: radii.lg, padding: spacing.xl,
    borderWidth: 1, borderColor: Colors.light.border, marginBottom: spacing.md,
    position: "relative",
    overflow: "hidden",
  },
  // Same gradient construction as ManageSubscription's card glow — soft
  // coral fading to transparent, sitting behind all card content.
  profileCardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarWrap: { width: 96, height: 96, marginBottom: spacing.md },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: AVATAR_DARK_GRAY,
    alignItems: "center", justifyContent: "center",
  },
  editBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 30, height: 30, borderRadius: 15, backgroundColor: EDIT_BADGE_DARK_GRAY,
    borderWidth: 2, borderColor: Colors.light.surface,
    alignItems: "center", justifyContent: "center",
  },
  profileName: { fontSize: 20, fontWeight: "800", color: Colors.light.ink, textAlign: "center" },
  profileSub: { fontSize: 13, color: Colors.light.inkMuted, marginTop: 4, textAlign: "center" },

  // Standard rows — same shape/spacing as reminders.tsx's reminderCard,
  // with a standard spacing.md gap between every card (matching the
  // reminders list's ItemSeparatorComponent gap).
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.light.surface, borderRadius: radii.lg, padding: spacing.md,
    borderWidth: 1, borderColor: Colors.light.border, marginBottom: spacing.md,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.light.coralSoft, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontWeight: "600", color: Colors.light.ink },
  rowValue: { fontSize: 13, color: Colors.light.inkMuted, marginTop: 2 },
  rowSub: { fontSize: 13, color: Colors.light.inkMuted, marginTop: 2, lineHeight: 18, flex: 1 },

  premiumSwitch: { transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] },

  // Chime sound — one horizontal row, each option sharing the width equally.
  chimeGroup: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  chimeOption: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderRadius: radii.lg, borderWidth: 1.5, borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  chimeOptionSel: { backgroundColor: Colors.light.coral, borderColor: Colors.light.coral },
  chimeOptionLabel: { fontSize: 13, fontWeight: "700", color: Colors.light.ink },
  chimeOptionLabelSel: { color: "#ffffff" },

  historyRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.light.surface, borderRadius: radii.lg, padding: spacing.md,
    borderWidth: 1, borderColor: Colors.light.border, marginBottom: spacing.md,
  },
  historyLeft: { flex: 1 },
  historyDate: { fontSize: 15, fontWeight: "700", color: Colors.light.ink },
  historyMode: { fontSize: 12, color: Colors.light.inkMuted, marginTop: 2 },
  emptyHistory: { fontSize: 14, color: Colors.light.inkMuted, padding: spacing.md },

  footer: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.sm },
  footerText: { fontSize: 12, color: Colors.light.inkFaint, lineHeight: 18, textAlign: "center" },

  // Shared centered pop-up chrome — same construction as reminders.tsx's
  // snooze/delete modals: transparent Modal, dimmed backdrop that closes on
  // tap, inner card that swallows its own taps so it doesn't close itself.
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%", maxWidth: 360, backgroundColor: Colors.light.surface,
    borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: Colors.light.border,
    gap: spacing.sm,
  },
  voiceModalCard: { maxHeight: "75%" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: Colors.light.ink, textAlign: "center" },
  modalSubtitle: { fontSize: 14, color: Colors.light.inkMuted, textAlign: "center", marginTop: -2, marginBottom: 4, lineHeight: 20 },

  nameInput: {
    borderWidth: 1.5, borderColor: Colors.light.borderStrong, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, color: Colors.light.ink,
    backgroundColor: Colors.light.cream, marginTop: 4,
  },

  pillGroup: { gap: spacing.sm, marginTop: 4 },
  modeOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.light.coralSoft, borderRadius: radii.md, paddingVertical: 14, paddingHorizontal: spacing.md,
  },
  modeOptionSel: { backgroundColor: Colors.light.coral },
  modeOptionLabel: { fontSize: 15, fontWeight: "700", color: Colors.light.coralDeep },
  modeOptionLabelSel: { color: "#ffffff" },
  modeOptionSub: { fontSize: 12, color: Colors.light.coralDeep, opacity: 0.75, marginTop: 2 },
  modeOptionSubSel: { color: "#ffffff", opacity: 0.85 },

  cancelPill: {
    backgroundColor: Colors.light.creamDeep, borderRadius: radii.pill, paddingVertical: 14,
    alignItems: "center", marginTop: 4,
  },
  cancelPillPressed: { opacity: 0.6 },
  cancelPillLabel: { fontSize: 15, fontWeight: "700", color: Colors.light.inkMuted },

  savePill: {
    backgroundColor: Colors.light.coral, borderRadius: radii.pill, paddingVertical: 14,
    alignItems: "center", marginTop: 4,
  },
  savePillPressed: { opacity: 0.85 },
  savePillLabel: { fontSize: 15, fontWeight: "700", color: "#ffffff" },

  confirmRow: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  confirmRowPill: { flex: 1, marginTop: 0 },

  voiceScroll: { marginTop: 4, maxHeight: 340 },
  voiceRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: spacing.md, backgroundColor: Colors.light.cream, borderRadius: radii.md, marginBottom: 6, borderWidth: 1, borderColor: Colors.light.border },
  voiceRowSel: { borderColor: Colors.light.coral, backgroundColor: Colors.light.coralSoft + "44" },
  voiceName: { fontSize: 15, fontWeight: "600", color: Colors.light.ink },
  voiceLang: { fontSize: 12, color: Colors.light.inkMuted, marginTop: 2 },
  // Now a filled circle instead of bare padding, so the speaker icon reads
  // as its own tappable control and can flip to a solid coral "now playing"
  // state.
  voicePreview: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.light.coralSoft,
    alignItems: "center", justifyContent: "center",
  },
  voicePreviewActive: { backgroundColor: Colors.light.coral },
});