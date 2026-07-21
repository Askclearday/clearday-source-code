// Capture screen — three modes depending on state, in this priority order:
//   1. isOffline === null   -> checking connectivity, spinner only.
//   2. isOffline === true   -> manual offline entry form (unchanged).
//   3. isOffline === false && editing (editId/editData present) -> the single-shot
//      structuring pipeline: mic/text -> structureAndSave -> persist, with the original
//      full-screen follow-up-question and calendar-collision cards. This is the exact flow
//      used when opened from Reminders' or Calendar's edit button, untouched.
//   4. isOffline === false && NOT editing -> chat screen. Every message goes straight
//      through lib/groq.ts's structuring calls (structureInput / structureMultipleInputs),
//      exactly the same calls and logic the edit-mode pipeline below uses -- there is no
//      agent, no tool-calling loop, nothing else in between. The only things that changed
//      versus the edit-mode pipeline are presentational: the user's message appears
//      immediately as a sent chat bubble instead of sitting in the composer while we wait,
//      and the confirmation / collision / "what time?" cards render as an assistant chat
//      reply instead of a full-screen banner. Chat history lives in AsyncStorage (cleared
//      only via the header refresh button) and in this component's React state.
//
// ---------------------------------------------------------------------------------------
// PATCH NOTES (this revision) -- see the request this addresses for full context:
//   1. Past chat bubbles are now COPY-ONLY once something else exists after them (a later
//      user message or the assistant's own reply) -- editing an old message once the
//      conversation has moved on would contradict what's already been said/saved. Only the
//      single most-recent message in the whole thread is still editable.
//   2. Same "locked once superseded" idea applies to actionable cards (collision /
//      needs-a-time follow-up): their buttons only remain live while they're attached to
//      the LAST message in the thread. Older cards render read-only. NOTE: this assumes
//      ChatCards.tsx treats an `undefined` onCollisionResolve/onFollowupResolve prop as
//      "render read-only" -- please check that file; if it currently requires the handler,
//      it needs a small tweak to disable its buttons when the prop is missing.
//   3. Failed messages now show BOTH "Retry" and "Try offline" side by side, plus a
//      specific failure reason instead of a generic string.
//   4. All free-text inputs are capped at 10,000 characters (CHAT_MAX_CHARS /
//      OFFLINE_MAX_CHARS below).
//   5. Voice recording auto-stops at a fair-use cap (AUDIO_MAX_MINUTES).
//   6. On a fresh open / navigating back to this screen, the chat auto-scrolls to the
//      bottom (via useFocusEffect) -- but NOT while the user is mid-visit scrolled up to
//      copy something, since that doesn't refire focus.
//   7. Audio transcription is now actually wired up (lib/groq.ts: transcribeAudioFile,
//      real Groq Whisper call) instead of the old stub that always returned null. The
//      recording is cached to disk BEFORE the network call so a failed upload never loses
//      the audio -- a failed transcription shows as its own retryable bubble.
//   8. Transcribed text is inserted at the composer's cursor position rather than
//      overwriting/replacing whatever was already typed, and is NOT auto-sent -- the user
//      reviews then sends manually.
//   9. When a turn began from a voice transcript, the assistant's reply now auto-plays via
//      TTS, the way an ongoing voice conversation would -- until the user manually stops
//      playback once, after which auto-read is off for the REST OF THIS SESSION (mount)
//      only; leaving and reopening the screen resets it.
//  10. Network-state handling is more proactive: periodic background connectivity checks,
//      a "Retry online" button in the offline banner, and offline-vs-editData population so
//      editing a reminder/event while offline actually fills in the manual-entry fields.
//  11. Offline manual-entry details field got a taller max height; input backgrounds are
//      forced to a neutral grey rather than whatever was rendering black.
//  12. Editing an existing sent message now expands the composer into a near full-screen
//      overlay (content starts at the top, like a real edit surface) instead of reusing the
//      small bottom composer bar; sending or cancelling collapses it back to normal.
//  13. The empty/idle state replaces the plain centered logo+text with a small grid of
//      tappable example prompts.
// ---------------------------------------------------------------------------------------
//
// Query params (unchanged):
//   - type: "note" | "calendar_event" | "reminder" | undefined (hint, not forced)
//   - from: "brief" | "overlay" | undefined
//   - editId / editData: present when opened from Reminders' or Calendar's edit button —
//     editData is the URI-encoded JSON of the RAW capture being edited.
import React, { useEffect, useState, useCallback, useRef } from "react";
import type { StructuredItem, Reminder, CalendarEvent, Note } from "@/lib/types";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  FlatList,
  Animated,
  Easing,
  Dimensions,
  Image,
  Keyboard,
  Share,
  BackHandler,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Mic, Send, ChevronLeft, Sparkles, Check, AlertCircle, X, FileText, Bell, Calendar as CalendarIcon, WifiOff, RefreshCw,
  Copy, Share2, Pencil, RotateCw, Volume2, Square as StopIcon } from "lucide-react-native";
import { Audio } from "expo-av";
import * as Network from "expo-network";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import * as groq from "@/lib/groq";
import * as db from "@/lib/db";
import * as perms from "@/lib/permissions";
import * as tts from "@/lib/tts";
import type { ChatMessage, ChatCardGroup, ChatCardItem } from "@/lib/chat-types";
import ChatCards from "@/components/ChatCards";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const COMPOSER_LIFT = Math.round(SCREEN_HEIGHT * 0.01);

const CHAT_HISTORY_STORAGE_KEY = "clearday_chat_history_v1";

// ----------------- FAIR-USE / SAFETY LIMITS -----------------
const CHAT_MAX_CHARS = 10000;
const OFFLINE_MAX_CHARS = 10000;
const AUDIO_MAX_MINUTES = 5;
const AUDIO_MAX_DURATION_MS = AUDIO_MAX_MINUTES * 60 * 1000;
// Cached recordings live here until either a successful transcription or the user discards them,
// so a failed upload never silently loses the audio -- see stopAndTranscribe/retryAudioMessage.
const PENDING_AUDIO_DIR = `${FileSystem.cacheDirectory}clearday_pending_audio/`;
// Background connectivity re-check interval -- catches "connected to wifi but no internet" and
// auto-recovery in either direction without waiting for a failed send to notice.
const CONNECTIVITY_POLL_MS = 20000;

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ----------------- OFFLINE MANUAL-ENTRY PARSING (unchanged) -----------------
function parseOfflineTime(timeText: string, ampm: "AM" | "PM"): string | null {
  const m = timeText.trim().match(/^([0-9]{1,2}):([0-9]{2})$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 1 || h > 12 || min < 0 || min > 59) return null;
  if (ampm === "AM") h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function resolveOfflineDate(choice: "today" | "tomorrow" | "custom", customDate: string): string | null {
  const now = new Date();
  if (choice === "today") return toLocalISODate(now);
  if (choice === "tomorrow") {
    const t = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return toLocalISODate(t);
  }
  const trimmed = customDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function formatTimeDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return digits;
  const hourPart = digits.slice(0, digits.length - 2);
  const minutePart = digits.slice(-2);
  let hourNum = parseInt(hourPart, 10);
  if (Number.isNaN(hourNum)) hourNum = 0;
  hourNum = Math.min(Math.max(hourNum, 1), 12);
  let minNum = parseInt(minutePart, 10);
  if (Number.isNaN(minNum)) minNum = 0;
  minNum = Math.min(minNum, 59);
  return `${hourNum}:${String(minNum).padStart(2, "0")}`;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function formatDateDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) {
    const year = digits.slice(0, 4);
    const monthDigits = digits.slice(4, 6);
    return `${year}-${monthDigits}`;
  }
  const year = digits.slice(0, 4);
  const monthDigits = digits.slice(4, 6);
  const dayDigits = digits.slice(6, 8);
  const month = Math.min(Math.max(parseInt(monthDigits, 10) || 1, 1), 12);
  const maxDay = DAYS_IN_MONTH[month - 1] ?? 31;
  const day = Math.min(Math.max(parseInt(dayDigits, 10) || 1, 1), maxDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatPreviewDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const month = MONTH_NAMES[parseInt(m[2], 10) - 1] ?? "";
  return `${month} ${parseInt(m[3], 10)}, ${m[1]}`;
}

async function ensureMicPermission(): Promise<boolean> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr?.padStart(2, "0") ?? "00"} ${ampm}`;
}

function getCurrentTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function rollDateIfAlreadyPast(date: string | null, time: string | null): string | null {
  if (!date || !time) return date;
  const now = new Date();
  const todayISO = toLocalISODate(now);
  if (date !== todayISO) return date;

  const [hStr, mStr] = time.split(":");
  const timeMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (timeMinutes <= nowMinutes) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return toLocalISODate(tomorrow);
  }
  return date;
}

function computeOffsetDateTime(
  date: string | null,
  time: string | null,
  offsetMinutes: number | null
): { date: string; time: string } | null {
  if (!date || !time || !offsetMinutes) return null;
  const target = new Date(`${date}T${time}:00`);
  target.setMinutes(target.getMinutes() - offsetMinutes);
  return {
    date: toLocalISODate(target),
    time: `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`,
  };
}

const RELATIONAL_WORDS =
  /\bduring\b|\bwhile\b|\bafter my\b|\bbefore my\b|\bin the middle of\b|\bas part of\b|\bright after\b|\bright before\b/i;
const RELATIONAL_KEYWORD_MATCH =
  /(?:during|while|after my|before my|in the middle of|as part of|right after|right before)\s+(?:my\s+)?(\w+)/i;

function buildKeywordVariants(word: string): string[] {
  const w = word.toLowerCase();
  const variants = new Set<string>([w]);
  if (w.endsWith("ing") && w.length > 4) {
    variants.add(w.slice(0, -3));
    variants.add(w.slice(0, -3) + "e");
  }
  if (w.endsWith("ed") && w.length > 3) {
    variants.add(w.slice(0, -2));
    variants.add(w.slice(0, -1));
  }
  if (w.endsWith("s") && w.length > 3) {
    variants.add(w.slice(0, -1));
  }
  variants.add(w + "ing");
  variants.add(w + "s");
  return Array.from(variants);
}

type CaptureState = "idle" | "recording" | "transcribing" | "structuring" | "confirming" | "saved";

// ----------------- CHAT DISPLAY TYPES -----------------
interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cardGroups?: ChatCardGroup[];
  status?: "sent" | "failed" | "transcribing";
  // A short, specific reason a send/transcription failed -- shown next to Retry/Try offline
  // instead of a generic "failed to send".
  failReason?: string;
  // Present only on a placeholder bubble for a voice recording that failed to transcribe --
  // holds the cached-on-disk audio file so retrying doesn't require re-recording.
  audioUri?: string;
}

let displayMsgCounter = 0;
function nextDisplayId(): string {
  displayMsgCounter += 1;
  return `dm_${Date.now()}_${displayMsgCounter}`;
}

// ----------------- NETWORK ERROR MESSAGING -----------------
// Turns a raw thrown error into a short, specific, user-facing reason instead of a generic
// "couldn't send" -- used on failed chat sends and failed transcriptions alike.
function describeNetworkError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/MISSING_GROQ_KEY/.test(msg)) return "AI capture isn't configured on this build.";
  if (/network request failed/i.test(msg) || /Network Error/i.test(msg) || /TypeError: Failed to fetch/i.test(msg)) {
    return "Network error — check your connection and retry.";
  }
  if (/GROQ_TRANSCRIBE_HTTP_4\d\d/.test(msg)) return "Couldn't process that recording — please retry.";
  if (/GROQ_HTTP_429|GROQ_TRANSCRIBE_HTTP_429/.test(msg)) return "The AI service is busy right now — please retry in a moment.";
  if (/GROQ_HTTP_5\d\d|GROQ_TRANSCRIBE_HTTP_5\d\d/.test(msg)) return "The AI service is temporarily unavailable — please retry.";
  if (/GROQ_EMPTY_RESPONSE/.test(msg)) return "The AI didn't return a usable response — please retry.";
  if (/EMPTY_TRANSCRIPT/.test(msg)) return "Couldn't hear anything in that recording — please retry.";
  if (/GROQ_BAD_JSON/.test(msg)) return "The AI's response couldn't be read — please retry.";
  return "Something went wrong — please retry.";
}

// ----------------- CURSOR-AWARE TEXT INSERTION (for voice transcripts) -----------------
function insertAtCursor(original: string, insertion: string, sel: { start: number; end: number }): string {
  const start = Math.max(0, Math.min(sel.start, original.length));
  const end = Math.max(start, Math.min(sel.end, original.length));
  const before = original.slice(0, start);
  const after = original.slice(end);
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
  return `${before}${needsLeadingSpace ? " " : ""}${insertion}${needsTrailingSpace ? " " : ""}${after}`;
}

// ----------------- PERSIST OUTCOME (shared by edit-mode and chat-mode) -----------------
// Both modes call the exact same DB-writing logic below (doPersist) -- only what happens
// with the RESULT differs: edit mode drives the old CaptureState machine (savedCard /
// collisionCard), chat mode turns it into an assistant message + ChatCards group.
type PersistOutcome =
  | { kind: "saved"; itemType: "note" | "calendar_event" | "reminder"; id: number; item: StructuredItem }
  | { kind: "collision"; item: StructuredItem; conflictWith: { id: number; title: string; time: string | null }; message: string };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function shiftTime(hhmm: string, minutesOffset: number): string {
  const total = Math.max(0, toMinutes(hhmm) + minutesOffset);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function confirmLabel(item: StructuredItem): string {
  const typeLabel = item.type === "calendar_event" ? "calendar event" : item.type;
  const when =
    item.type === "note"
      ? ""
      : item.date && item.time
        ? ` for ${item.date} at ${item.time}`
        : item.date
          ? ` for ${item.date}`
          : item.time
            ? ` at ${item.time}`
            : "";
  const reminderNote = item.type === "calendar_event" ? " A reminder was set for it too." : "";
  return `Saved as a ${typeLabel}: "${item.title}"${when}.${reminderNote}`;
}

function cardItemForOutcome(outcome: Extract<PersistOutcome, { kind: "saved" }>): ChatCardItem {
  const item = outcome.item;
  if (outcome.itemType === "note") {
    return { kind: "note", id: outcome.id, title: item.title, content: item.details, event_date: item.date, event_time: item.time };
  }
  if (outcome.itemType === "calendar_event") {
    return {
      kind: "calendar_event",
      id: outcome.id,
      title: item.title,
      date: item.date,
      time: item.time,
      time_range_end: item.time_range_end,
      category: item.category,
      completed: false,
    };
  }
  return {
    kind: "reminder",
    id: outcome.id,
    title: item.title,
    due_date: item.date,
    due_time: item.time,
    category: item.category,
    completed: false,
  };
}

function PulseRings() {
  const anims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const loops = anims.map((av, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 420),
          Animated.timing(av, {
            toValue: 1,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(av, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(2 * 420 - i * 420),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.pulseRingsBox} pointerEvents="none">
      {anims.map((av, i) => {
        const scale = av.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.4] });
        const opacity = av.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.16, 0] });
        return <Animated.View key={i} style={[styles.pulseRing, { opacity, transform: [{ scale }] }]} />;
      })}
      <View style={styles.pulseCore}>
        <Mic size={26} color="#fff" />
      </View>
    </View>
  );
}

const CAPTURE_TIPS: string[] = [
  "Remind me of my dinner date tomorrow evening",
  "Remind me to call my dad in the afternoon",
  "Remind me of my girlfriend's upcoming birthday",
  "Remind me of my partner's upcoming anniversary",
  "Remind me to submit my project before the deadline tomorrow at midnight",
  "Remind me of my client meeting tomorrow at noon",
  "Remind me to pick up groceries after work",
  "New note — ideas for the weekend trip",
  "New calendar event — team standup at 9 AM",
  "Remind me to take my medication tonight at 4 PM",
];

// ----------------- REDESIGNED IDLE/EMPTY STATE -----------------
// Replaces the old centered-logo-and-rotating-caption layout (which read as a generic chatbot
// splash) with a warmer greeting plus a small grid of tappable example prompts. Tapping a card
// inserts its text into the composer for the user to send (or edit first) rather than firing it
// off immediately, keeping it consistent with how voice transcripts are now handled too.
function CaptureIntro({ userName, onPickSuggestion }: { userName: string | null; onPickSuggestion: (text: string) => void }) {
  const tips = CAPTURE_TIPS.slice(0, 6);
  return (
    <View style={styles.introBox}>
      <Image source={require("@/assets/images/icon2.png")} style={styles.introLogoSmall} resizeMode="contain" />
      <Text style={styles.introGreeting}>{userName ? `Hey ${userName}` : "Hey there"}</Text>
      <Text style={styles.introSubtitle}>Speak or type anything to save it — try one of these, or write your own:</Text>
      <View style={styles.introGrid}>
        {tips.map((tip, i) => (
          <Pressable
            key={i}
            style={({ pressed }) => [styles.introCard, pressed && styles.introCardPressed]}
            onPress={() => onPickSuggestion(tip)}
          >
            <Text style={styles.introCardText} numberOfLines={3}>
              {tip}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TypingBubble() {
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        {dots.map((d, i) => {
          const translateY = d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
          return <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY }] }]} />;
        })}
      </View>
    </View>
  );
}

export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; from?: string; editId?: string; editData?: string }>();
  const hintType = (params.type as StructuredItem["type"] | undefined) ?? undefined;

  const [editType, setEditType] = useState<"note" | "calendar_event" | "reminder" | null>(null);
  const editTypeRef = useRef<typeof editType>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<CaptureState>("idle");
  const [structured, setStructured] = useState<StructuredItem | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [needsFollowup, setNeedsFollowup] = useState<string | null>(null);
  const [followupAnswer, setFollowupAnswer] = useState("");
  const [suggestedTimes, setSuggestedTimes] = useState<{ label: string; date: string; time: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userVoiceId, setUserVoiceId] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Controlled cursor position -- only ever SET programmatically right after a voice transcript
  // is inserted, then cleared a beat later so the TextInput goes back to being freely editable.
  const [textSelection, setTextSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const textSelectionRef = useRef<{ start: number; end: number } | undefined>(undefined);

  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message?: string;
    actions: { label: string; onPress?: () => void; style?: "cancel" | "default" }[];
  } | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // ----------------- CHAT MODE STATE -----------------
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const messagesRef = useRef<DisplayMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatListRef = useRef<FlatList<DisplayMessage>>(null);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const prevMessagesCountRef = useRef(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingOriginalText, setEditingOriginalText] = useState("");
  // When a chat turn came back needing a date/time, this holds what's needed to finish
  // the save once the user answers -- either by tapping a suggested-time button on the
  // follow-up card, or by just typing the answer as their next chat message.
  const pendingFollowupRef = useRef<{ rawInput: string; item: StructuredItem } | null>(null);

  // Whether the text about to be sent originated (at least partly) from a voice transcript --
  // used to decide whether to auto-read the assistant's reply back, like an ongoing voice
  // conversation. Reset to false the moment a message is actually sent.
  const voiceInputPendingRef = useRef(false);
  // Per-SESSION (per mount) switch: once the user manually stops an auto-started playback, no
  // further replies auto-read until the screen is left and reopened.
  const autoReadStoppedRef = useRef(false);
  // Tracks whether the CURRENTLY playing speech was started automatically (vs a manual tap),
  // so stopping it can flip autoReadStoppedRef only when appropriate.
  const autoPlayingRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setMessages(parsed);
        }
      } catch (e) {
        console.warn("[capture] failed to load persisted chat history", e);
      } finally {
        setChatHistoryLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!chatHistoryLoaded) return;
    AsyncStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(messages)).catch((e) =>
      console.warn("[capture] failed to persist chat history", e)
    );
  }, [messages, chatHistoryLoaded]);

  const onRefreshChat = useCallback(() => {
    setAlertConfig({
      title: "Clear chat?",
      message: "This clears the conversation shown here. Your saved reminders, events, and notes are not affected.",
      actions: [
        { label: "Cancel", style: "cancel" },
        {
          label: "Clear",
          onPress: () => {
            setMessages([]);
            pendingFollowupRef.current = null;
            AsyncStorage.removeItem(CHAT_HISTORY_STORAGE_KEY).catch(() => {});
          },
        },
      ],
    });
  }, []);

  // Fresh open / returning to this screen -- always land at the bottom so the user can start a
  // new entry immediately. useFocusEffect only fires on mount/focus (screen gaining focus), never
  // while the user is scrolled up mid-visit copying older messages, so it can't fight them.
  useFocusEffect(
    useCallback(() => {
      if (!chatHistoryLoaded) return;
      const t = setTimeout(() => {
        chatListRef.current?.scrollToEnd({ animated: false });
      }, 60);
      return () => clearTimeout(t);
    }, [chatHistoryLoaded])
  );

  // OFFLINE MODE
  const [isOffline, setIsOffline] = useState<boolean | null>(null);
  const [offlineType, setOfflineType] = useState<"note" | "reminder" | "calendar_event">("reminder");
  const [offlineTitle, setOfflineTitle] = useState("");
  const [offlineDetails, setOfflineDetails] = useState("");
  const [offlineDateChoice, setOfflineDateChoice] = useState<"today" | "tomorrow" | "custom">("today");
  const [offlineCustomDate, setOfflineCustomDate] = useState("");
  const [offlineTimeText, setOfflineTimeText] = useState("");
  const [offlineAmPm, setOfflineAmPm] = useState<"AM" | "PM">("PM");
  const [offlineSaving, setOfflineSaving] = useState(false);
  const [offlineFormError, setOfflineFormError] = useState<string | null>(null);
  const editIdRef = useRef<number | null>(null);
  const linkedReminderIdRef = useRef<number | null>(null);
  const [collision, setCollision] = useState<{
    newItem: StructuredItem;
    conflictWith: { id: number; title: string; time: string | null };
    message: string;
  } | null>(null);

  // Holds a just-parsed edit target (from editData) in offline-form shape, so that whichever
  // mode we're actually in (or later switch to) when the parse happens, the offline manual-entry
  // fields still get populated correctly instead of silently staying blank.
  const pendingOfflineEditRef = useRef<{
    type: "note" | "calendar_event" | "reminder";
    title: string;
    details: string;
    date: string | null;
    time: string | null;
  } | null>(null);

  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      if (recording) recording.stopAndUnloadAsync().catch(() => {});
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      tts.stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const user = await db.getUser();
        setUserName(user?.name ?? null);
        setUserVoiceId((user as any)?.voice_id ?? null);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const netState = await Network.getNetworkStateAsync();
        const offline = !netState.isConnected || netState.isInternetReachable === false;
        setIsOffline(offline);
      } catch {
        setIsOffline(true);
      }
    })();
  }, []);

  // Background connectivity re-check -- catches "connected to a network but no real internet
  // access" and auto-recovers/auto-flips offline without requiring a failed send first.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const netState = await Network.getNetworkStateAsync();
        const offlineNow = !netState.isConnected || netState.isInternetReachable === false;
        setIsOffline((prev) => (prev === null ? prev : offlineNow));
      } catch {
        /* keep previous state if the check itself fails */
      }
    }, CONNECTIVITY_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (hintType === "note" || hintType === "reminder" || hintType === "calendar_event") {
      setOfflineType(hintType);
    }
  }, [hintType]);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e: any) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e?.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (typeof params.editData !== "string") return;
    const type = (params.type as "note" | "calendar_event" | "reminder" | undefined) ?? "reminder";
    try {
      const raw = decodeURIComponent(params.editData);
      const parsed = JSON.parse(raw);

      if (type === "calendar_event") {
        setEditId(parsed.id);
        editIdRef.current = parsed.id;
        setEditType("calendar_event");
        editTypeRef.current = "calendar_event";

        if ("raw_input" in parsed) {
          let t = parsed.raw_input || "";
          const when = [parsed.date ?? "", parsed.time ? `at ${formatTime(parsed.time)}` : ""].filter(Boolean).join(" ");
          if (when) t += ` (on ${when})`;
          setText(t);
          pendingOfflineEditRef.current = {
            type: "calendar_event",
            title: parsed.title ?? "",
            details: parsed.details ?? parsed.raw_input ?? "",
            date: parsed.date ?? null,
            time: parsed.time ?? null,
          };
        } else {
          const item: CalendarEvent = parsed;
          const bits = [item.title];
          if (item.details) bits.push(item.details);
          let t = bits.join(" — ");
          const when = [item.date ?? "", item.time ? `at ${formatTime(item.time)}` : ""].filter(Boolean).join(" ");
          if (when) t += ` (on ${when})`;
          setText(t);
          pendingOfflineEditRef.current = {
            type: "calendar_event",
            title: item.title ?? "",
            details: item.details ?? "",
            date: item.date ?? null,
            time: item.time ?? null,
          };
        }
      } else if (type === "note") {
        setEditId(parsed.id);
        editIdRef.current = parsed.id;
        setEditType("note");
        editTypeRef.current = "note";

        if ("raw_input" in parsed) {
          setText(parsed.raw_input || "");
          pendingOfflineEditRef.current = {
            type: "note",
            title: parsed.title ?? "",
            details: parsed.details ?? parsed.raw_input ?? "",
            date: null,
            time: null,
          };
        } else {
          const item: Note = parsed;
          const bits = [item.title];
          if (item.content) bits.push(item.content);
          setText(bits.join(" — "));
          pendingOfflineEditRef.current = {
            type: "note",
            title: item.title ?? "",
            details: item.content ?? "",
            date: null,
            time: null,
          };
        }
      } else {
        setEditId(parsed.id);
        editIdRef.current = parsed.id;
        setEditType("reminder");
        editTypeRef.current = "reminder";

        if ("raw_input" in parsed) {
          let t = parsed.raw_input || "";
          const when = [parsed.due_date ?? "", parsed.due_time ? `at ${formatTime(parsed.due_time)}` : ""].filter(Boolean).join(" ");
          if (when) t += ` (due ${when})`;
          setText(t);
          pendingOfflineEditRef.current = {
            type: "reminder",
            title: parsed.title ?? "",
            details: parsed.details ?? parsed.raw_input ?? "",
            date: parsed.due_date ?? null,
            time: parsed.due_time ?? null,
          };
        } else {
          const item: Reminder = parsed;
          const bits = [item.title];
          if (item.details) bits.push(item.details);
          let t = bits.join(" — ");
          if (item.due_date || item.due_time) {
            const when = [item.due_date ?? "", item.due_time ? `at ${formatTime(item.due_time)}` : ""].filter(Boolean).join(" ");
            t += ` (due ${when})`;
          }
          setText(t);
          pendingOfflineEditRef.current = {
            type: "reminder",
            title: item.title ?? "",
            details: item.details ?? "",
            date: item.due_date ?? null,
            time: item.due_time ?? null,
          };
        }
      }
    } catch (e) {
      console.warn("[capture] failed to parse editData", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flushes a pending edit-target into the offline manual-entry fields as soon as we're actually
  // offline (whether that was already true when editData arrived, or we go offline moments
  // later) -- fixes editing while offline silently not populating the form.
  useEffect(() => {
    if (isOffline !== true) return;
    const pending = pendingOfflineEditRef.current;
    if (!pending) return;
    pendingOfflineEditRef.current = null; // flush once only

    setOfflineType(pending.type);
    setOfflineTitle(pending.title);
    setOfflineDetails(pending.details);

    if (pending.date) {
      setOfflineDateChoice("custom");
      setOfflineCustomDate(pending.date);
    }
    if (pending.time) {
      const [hStr, mStr] = pending.time.split(":");
      let h = parseInt(hStr, 10);
      if (!Number.isNaN(h)) {
        const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        setOfflineTimeText(`${h12}:${mStr ?? "00"}`);
        setOfflineAmPm(ampm);
      }
    }
  }, [isOffline]);

  const checkAndFlipOffline = useCallback(async (): Promise<boolean> => {
    try {
      const netState = await Network.getNetworkStateAsync();
      const offlineNow = !netState.isConnected || netState.isInternetReachable === false;
      if (offlineNow) setIsOffline(true);
      return offlineNow;
    } catch {
      setIsOffline(true);
      return true;
    }
  }, []);

  // Manual "Retry online" button in the offline banner -- re-checks connectivity on demand
  // instead of making the user wait for the passive background poll.
  const onRetryOnline = useCallback(async () => {
    setIsOffline(null);
    try {
      const netState = await Network.getNetworkStateAsync();
      const stillOffline = !netState.isConnected || netState.isInternetReachable === false;
      setIsOffline(stillOffline);
    } catch {
      setIsOffline(true);
    }
  }, []);

  const handlePossibleNetworkFailure = useCallback(
    async (raw: string): Promise<boolean> => {
      const offlineNow = await checkAndFlipOffline();
      if (offlineNow) {
        setOfflineTitle((prev) => prev || raw);
        setError(null);
        setState("idle");
      }
      return offlineNow;
    },
    [checkAndFlipOffline]
  );

  // "Try offline" action on a failed chat message -- lets the user immediately drop into the
  // manual-entry form with that message's text pre-filled, rather than only being able to retry
  // online over and over.
  const onTryOffline = useCallback((msg: DisplayMessage) => {
    setOfflineTitle((prev) => prev || msg.content);
    setIsOffline(true);
  }, []);

  const cloneCalendarEventAsReminder = useCallback(
    async (item: StructuredItem, rawInput: string, existingReminderId?: number) => {
      if (!item.date) return;
      try {
        const currentUser = await db.getUser();
        const userNameLocal = currentUser?.name ?? "there";
        const offsetMinutes = item.reminder_offset_minutes ?? null;
        const preReminderDateTime = computeOffsetDateTime(item.date, item.time, offsetMinutes);

        let id: number;
        if (existingReminderId) {
          id = existingReminderId;
          await db.updateReminderFields(id, {
            title: item.title,
            details: item.details || null,
            due_date: item.date,
            due_time: item.time,
            time_range_end: item.time_range_end,
            category: item.category,
            recurrence: item.recurrence,
            reminder_offset_minutes: offsetMinutes,
            needs_confirmation: item.needs_confirmation ?? false,
            raw_input: rawInput,
          });
        } else {
          id = await db.insertReminder({
            title: item.title,
            details: item.details || null,
            due_date: item.date,
            due_time: item.time,
            time_range_end: item.time_range_end,
            category: item.category,
            recurrence: item.recurrence,
            reminder_offset_minutes: offsetMinutes,
            needs_confirmation: item.needs_confirmation ?? false,
            raw_input: rawInput,
          });
        }

        if (item.date && item.time) {
          const notificationText = isOffline
            ? groq.offlineReminderNotificationText(userNameLocal, item.title, item.time)
            : await groq.generateReminderNotification(userNameLocal, {
                title: item.title,
                details: item.details || null,
                due_time: item.time,
              });
          await db.updateReminderNotificationText(id, notificationText);

          try {
            if (preReminderDateTime) {
              await perms.scheduleReminderNotification(id, notificationText, preReminderDateTime.date, preReminderDateTime.time);
            } else {
              await perms.scheduleReminderNotification(id, notificationText, item.date, item.time);
            }

            if (item.needs_confirmation && !isOffline) {
              const confirmationText = await groq.generateConfirmationText(userNameLocal, {
                title: item.title,
                offsetMinutes,
              });
              await perms.scheduleConfirmationNotification(id, confirmationText, item.date, item.time);
            }
          } catch {
            /* notification may be denied */
          }
        }
        return id;
      } catch (e) {
        console.warn("[capture] failed to clone calendar event as reminder", e);
        await checkAndFlipOffline();
        return null;
      }
    },
    [isOffline, checkAndFlipOffline]
  );

  // ----------------- SHARED DB-WRITE LOGIC (edit mode AND chat mode both call this) -----------------
  const doPersist = useCallback(
    async (item: StructuredItem, rawInput: string): Promise<PersistOutcome> => {
      const source: "voice" | "text" = isOffline ? "text" : rawInput !== text ? "voice" : "text";

      let cascadeOldReminder: Reminder | null = null;
      let cascadeOldEvent: CalendarEvent | null = null;
      if (editTypeRef.current && editIdRef.current) {
        const id = editIdRef.current;
        const kind = editTypeRef.current;
        editIdRef.current = null;
        editTypeRef.current = null;
        if (kind === "reminder") {
          cascadeOldReminder = await db.getReminderById(id);
          await db.deleteReminder(id);
        } else if (kind === "calendar_event") {
          cascadeOldEvent = await db.getCalendarEventById(id);
          await db.deleteCalendarEvent(id);
        } else if (kind === "note") {
          await db.deleteNote(id);
        }
      }

      if (item.type === "note") {
        const insertedId = await db.insertNote({
          title: item.title,
          content: item.details || rawInput,
          source,
          tags: null,
          category: item.category,
          event_date: item.date,
          event_time: item.time,
          raw_input: rawInput,
        });
        const noteId = typeof insertedId === "number" ? insertedId : Date.now();
        return { kind: "saved", itemType: "note", id: noteId, item };
      }

      if (item.type === "calendar_event") {
        const eventDate = item.date ?? toLocalISODate(new Date());

        const linkedEventFromReminderEdit = cascadeOldReminder?.due_date
          ? await db.findCalendarEventLinkedToReminder(cascadeOldReminder.due_date, cascadeOldReminder.title)
          : null;

        if (item.time) {
          const existing = await db.getCalendarEventsForDate(eventDate);
          const conflict = existing.find((e) => {
            if (!e.time) return false;
            if (linkedEventFromReminderEdit && e.id === linkedEventFromReminderEdit.id) return false;
            return Math.abs(toMinutes(e.time) - toMinutes(item.time as string)) < 45;
          });
          if (conflict) {
            const message = isOffline
              ? groq.offlineCollisionMessage(conflict.title, conflict.time as string, item.title, item.time as string)
              : await groq.generateCollisionMessage(
                  { title: conflict.title, time: conflict.time as string },
                  { title: item.title, time: item.time }
                );
            linkedReminderIdRef.current = cascadeOldEvent
              ? (await db.findReminderLinkedToCalendarEvent(cascadeOldEvent.date, cascadeOldEvent.title))?.id ?? null
              : null;
            return { kind: "collision", item, conflictWith: conflict, message };
          }
        }

        let eventId: number;
        if (linkedEventFromReminderEdit) {
          await db.updateCalendarEventFields(linkedEventFromReminderEdit.id, {
            title: item.title,
            details: item.details || null,
            date: eventDate,
            time: item.time,
            time_range_end: item.time_range_end,
            category: item.category,
            recurrence: item.recurrence,
            raw_input: rawInput,
          });
          eventId = linkedEventFromReminderEdit.id;
        } else {
          const insertedId = await db.insertCalendarEvent({
            title: item.title,
            details: item.details || null,
            date: eventDate,
            time: item.time,
            time_range_end: item.time_range_end,
            category: item.category,
            recurrence: item.recurrence,
            raw_input: rawInput,
          });
          eventId = typeof insertedId === "number" ? insertedId : Date.now();
        }

        const linkedReminder = cascadeOldEvent
          ? await db.findReminderLinkedToCalendarEvent(cascadeOldEvent.date, cascadeOldEvent.title)
          : null;
        await cloneCalendarEventAsReminder({ ...item, date: eventDate }, rawInput, linkedReminder?.id);

        return { kind: "saved", itemType: "calendar_event", id: eventId, item: { ...item, date: eventDate } };
      }

      // reminder
      const currentUser = await db.getUser();
      const userNameLocal = currentUser?.name ?? "there";
      const preReminderDateTime = computeOffsetDateTime(item.date, item.time, item.reminder_offset_minutes);

      const id = await db.insertReminder({
        title: item.title,
        details: item.details || null,
        due_date: item.date,
        due_time: item.time,
        time_range_end: item.time_range_end,
        category: item.category,
        recurrence: item.recurrence,
        reminder_offset_minutes: item.reminder_offset_minutes,
        needs_confirmation: item.needs_confirmation,
        raw_input: rawInput,
      });

      if (cascadeOldReminder?.due_date) {
        const linkedEvent = await db.findCalendarEventLinkedToReminder(cascadeOldReminder.due_date, cascadeOldReminder.title);
        if (linkedEvent) {
          await db.updateCalendarEventFields(linkedEvent.id, {
            title: item.title,
            details: item.details || null,
            date: item.date ?? linkedEvent.date,
            time: item.time,
            time_range_end: item.time_range_end,
            category: item.category,
            recurrence: item.recurrence,
            raw_input: rawInput,
          });
        }
      }

      if (item.date && item.time) {
        const notificationText = isOffline
          ? groq.offlineReminderNotificationText(userNameLocal, item.title, item.time)
          : await groq.generateReminderNotification(userNameLocal, {
              title: item.title,
              details: item.details || null,
              due_time: item.time,
            });
        await db.updateReminderNotificationText(id, notificationText);

        try {
          if (preReminderDateTime) {
            await perms.scheduleReminderNotification(id, notificationText, preReminderDateTime.date, preReminderDateTime.time);
          } else {
            await perms.scheduleReminderNotification(id, notificationText, item.date, item.time);
          }
          if (item.needs_confirmation && !isOffline) {
            const confirmationText = await groq.generateConfirmationText(userNameLocal, {
              title: item.title,
              offsetMinutes: item.reminder_offset_minutes,
            });
            await perms.scheduleConfirmationNotification(id, confirmationText, item.date, item.time);
          }
        } catch {
          /* notification may be denied */
        }
      }

      return { kind: "saved", itemType: "reminder", id, item };
    },
    [text, cloneCalendarEventAsReminder, isOffline]
  );

  // ----------------- EDIT-MODE WRAPPER (drives the old full-screen state machine, unchanged) ---
  const persist = useCallback(
    async (item: StructuredItem, rawInput: string) => {
      try {
        const outcome = await doPersist(item, rawInput);
        if (outcome.kind === "collision") {
          setCollision({ newItem: outcome.item, conflictWith: outcome.conflictWith, message: outcome.message });
          setState("confirming");
          return;
        }
        setStructured(outcome.item);
        setState("saved");
        setText("");
      } catch (e) {
        console.warn("[capture] persist failed", e);
        const wentOffline = await handlePossibleNetworkFailure(rawInput);
        if (wentOffline) return;
        setError(describeNetworkError(e));
        setState("idle");
      }
    },
    [doPersist, handlePossibleNetworkFailure]
  );

  // ----------------- EDIT-MODE PIPELINE (structureAndSave) — untouched from the direct-Groq flow
  const structureAndSave = useCallback(
    async (raw: string, extraFollowup?: string) => {
      if (isOffline) {
        setError("You're offline — use the manual entry form below instead of free text.");
        return;
      }
      setState("structuring");
      setError(null);
      setNeedsFollowup(null);
      setSuggestedTimes([]);
      try {
        const todayISO = toLocalISODate(new Date());
        const item = await groq.structureInput(raw, todayISO, getCurrentTimeHHMM());
        if (hintType && item.type !== hintType) {
          if (/unclear|gibberish|untitled/i.test(item.title)) {
            item.type = hintType;
          }
        }

        if (item.type === "reminder" || item.type === "calendar_event") {
          item.date = rollDateIfAlreadyPast(item.date, item.time);
        }

        if ((item.type === "reminder" || item.type === "calendar_event") && !item.time) {
          if (RELATIONAL_WORDS.test(raw)) {
            const keywordMatch = raw.match(RELATIONAL_KEYWORD_MATCH);
            const rawKeyword = keywordMatch?.[1];
            if (rawKeyword) {
              const variants = buildKeywordVariants(rawKeyword);
              const candidateById = new Map<number, Reminder | CalendarEvent>();
              for (const variant of variants) {
                const found = await db.searchRemindersAndEventsByKeyword(variant);
                for (const c of found) candidateById.set(c.id, c);
              }
              const candidates = Array.from(candidateById.values());
              if (candidates.length > 0) {
                const resolved = await groq.resolveRelatedTime(
                  raw,
                  candidates.map((c) => ({
                    title: c.title,
                    date: "date" in c ? c.date : c.due_date,
                    time: "time" in c ? c.time : c.due_time,
                    kind: "date" in c ? "calendar_event" : "reminder",
                  }))
                );
                if (resolved) {
                  item.date = resolved.date ?? item.date;
                  item.time = resolved.time ?? item.time;
                }
              }
            }
          }
        }

        if (item.time && item.time_range_end && /\bbetween\b|\bin between\b/i.test(raw)) {
          item.time = await groq.pickTimeWithinRange(item.time, item.time_range_end);
        }

        if ((item.type === "reminder" || item.type === "calendar_event") && (item.date === null || item.time === null)) {
          const anyItem = item as any;
          if (anyItem.suggested_date && anyItem.suggested_time) {
            item.date = anyItem.suggested_date;
            item.time = anyItem.suggested_time;
            await persist(item, raw);
            return;
          }

          const missing: string[] = [];
          if (item.date === null) missing.push("date");
          if (item.time === null) missing.push("time");
          setStructured(item);
          setNeedsFollowup(`What ${missing.join(" and ")} should I set for "${item.title}"? (e.g. "tomorrow at 3pm")`);
          setState("confirming");
          groq
            .suggestTimesForItem(item.title, item.details || null, todayISO, getCurrentTimeHHMM())
            .then(setSuggestedTimes)
            .catch(() => setSuggestedTimes([]));
          if (extraFollowup) {
            const combined = `${raw}. ${extraFollowup}`;
            const item2 = await groq.structureInput(combined, todayISO, getCurrentTimeHHMM());
            if (item2.type === "reminder" || item2.type === "calendar_event") {
              item2.date = rollDateIfAlreadyPast(item2.date, item2.time);
            }
            if (item2.date || item2.time) {
              setNeedsFollowup(null);
              await persist(item2, raw);
              return;
            }
          }
          return;
        }

        await persist(item, raw);
      } catch (e) {
        console.warn("[capture] structuring failed", e);
        const wentOffline = await handlePossibleNetworkFailure(raw);
        if (wentOffline) return;
        setError(describeNetworkError(e));
        setState("idle");
      }
    },
    [hintType, isOffline, handlePossibleNetworkFailure, persist]
  );

  // ----------------- CHAT MODE PIPELINE -----------------
  const appendAssistantMessage = useCallback((content: string, cardGroups?: ChatCardGroup[]) => {
    setMessages((prev) => [...prev, { id: nextDisplayId(), role: "assistant", content, cardGroups, status: "sent" }]);
  }, []);

  const runCaptureTurn = useCallback(
    async (raw: string, extraFollowup?: string) => {
      const todayISO = toLocalISODate(new Date());

      // Bulk path: only on a fresh (non-followup) turn -- a single message may contain
      // several distinct notes/reminders/events at once.
      if (!extraFollowup) {
        try {
          const items = await groq.structureMultipleInputs(raw, todayISO, getCurrentTimeHHMM());
          if (items.length > 1) {
            const savedCards: ChatCardItem[] = [];
            for (const it of items) {
              if (it.type === "reminder" || it.type === "calendar_event") {
                it.date = rollDateIfAlreadyPast(it.date, it.time);
                const anyIt = it as any;
                if ((it.date === null || it.time === null) && anyIt.suggested_date && anyIt.suggested_time) {
                  it.date = anyIt.suggested_date;
                  it.time = anyIt.suggested_time;
                }
              }
              const outcome = await doPersist(it, it.raw_input || raw);
              if (outcome.kind === "saved") {
                savedCards.push(cardItemForOutcome(outcome));
              } else {
                appendAssistantMessage(outcome.message, [
                  { id: nextDisplayId(), label: "Conflict", items: [{ kind: "collision", message: outcome.message, pendingItem: outcome.item, conflictWith: outcome.conflictWith }] },
                ]);
              }
            }
            if (savedCards.length > 0) {
              appendAssistantMessage(
                `Saved ${savedCards.length} item${savedCards.length > 1 ? "s" : ""}.`,
                [{ id: nextDisplayId(), label: "Saved", items: savedCards }]
              );
            }
            return;
          }
        } catch (e) {
          console.warn("[capture] bulk structuring failed, falling back to single-item", e);
        }
      }

      const item = await groq.structureInput(raw, todayISO, getCurrentTimeHHMM());
      if (hintType && item.type !== hintType) {
        if (/unclear|gibberish|untitled/i.test(item.title)) {
          item.type = hintType;
        }
      }

      if (item.type === "reminder" || item.type === "calendar_event") {
        item.date = rollDateIfAlreadyPast(item.date, item.time);
      }

      if ((item.type === "reminder" || item.type === "calendar_event") && !item.time) {
        if (RELATIONAL_WORDS.test(raw)) {
          const keywordMatch = raw.match(RELATIONAL_KEYWORD_MATCH);
          const rawKeyword = keywordMatch?.[1];
          if (rawKeyword) {
            const variants = buildKeywordVariants(rawKeyword);
            const candidateById = new Map<number, Reminder | CalendarEvent>();
            for (const variant of variants) {
              const found = await db.searchRemindersAndEventsByKeyword(variant);
              for (const c of found) candidateById.set(c.id, c);
            }
            const candidates = Array.from(candidateById.values());
            if (candidates.length > 0) {
              const resolved = await groq.resolveRelatedTime(
                raw,
                candidates.map((c) => ({
                  title: c.title,
                  date: "date" in c ? c.date : c.due_date,
                  time: "time" in c ? c.time : c.due_time,
                  kind: "date" in c ? "calendar_event" : "reminder",
                }))
              );
              if (resolved) {
                item.date = resolved.date ?? item.date;
                item.time = resolved.time ?? item.time;
              }
            }
          }
        }
      }

      if (item.time && item.time_range_end && /\bbetween\b|\bin between\b/i.test(raw)) {
        item.time = await groq.pickTimeWithinRange(item.time, item.time_range_end);
      }

      if ((item.type === "reminder" || item.type === "calendar_event") && (item.date === null || item.time === null)) {
        const anyItem = item as any;
        if (anyItem.suggested_date && anyItem.suggested_time) {
          item.date = anyItem.suggested_date;
          item.time = anyItem.suggested_time;
          const outcome = await doPersist(item, raw);
          if (outcome.kind === "collision") {
            appendAssistantMessage(outcome.message, [
              { id: nextDisplayId(), label: "Conflict", items: [{ kind: "collision", message: outcome.message, pendingItem: outcome.item, conflictWith: outcome.conflictWith }] },
            ]);
          } else {
            appendAssistantMessage(confirmLabel(outcome.item), [{ id: nextDisplayId(), label: "Saved", items: [cardItemForOutcome(outcome)] }]);
          }
          return;
        }

        const missing: string[] = [];
        if (item.date === null) missing.push("date");
        if (item.time === null) missing.push("time");
        const followupMessage = `What ${missing.join(" and ")} should I set for "${item.title}"? (e.g. "tomorrow at 3pm")`;

        if (extraFollowup) {
          const combined = `${raw}. ${extraFollowup}`;
          const item2 = await groq.structureInput(combined, todayISO, getCurrentTimeHHMM());
          if (item2.type === "reminder" || item2.type === "calendar_event") {
            item2.date = rollDateIfAlreadyPast(item2.date, item2.time);
          }
          if (item2.date || item2.time) {
            const outcome = await doPersist(item2, raw);
            if (outcome.kind === "collision") {
              appendAssistantMessage(outcome.message, [
                { id: nextDisplayId(), label: "Conflict", items: [{ kind: "collision", message: outcome.message, pendingItem: outcome.item, conflictWith: outcome.conflictWith }] },
              ]);
            } else {
              appendAssistantMessage(confirmLabel(outcome.item), [{ id: nextDisplayId(), label: "Saved", items: [cardItemForOutcome(outcome)] }]);
            }
            return;
          }
        }

        const suggestions = await groq
          .suggestTimesForItem(item.title, item.details || null, todayISO, getCurrentTimeHHMM())
          .catch(() => [] as { label: string; date: string; time: string }[]);

        pendingFollowupRef.current = { rawInput: raw, item };
        appendAssistantMessage(followupMessage, [
          {
            id: nextDisplayId(),
            label: "Needs a time",
            items: [{ kind: "followup", message: followupMessage, pendingItem: item, rawInput: raw, suggestedTimes: suggestions }],
          },
        ]);
        return;
      }

      const outcome = await doPersist(item, raw);
      if (outcome.kind === "collision") {
        appendAssistantMessage(outcome.message, [
          { id: nextDisplayId(), label: "Conflict", items: [{ kind: "collision", message: outcome.message, pendingItem: outcome.item, conflictWith: outcome.conflictWith }] },
        ]);
      } else {
        appendAssistantMessage(confirmLabel(outcome.item), [{ id: nextDisplayId(), label: "Saved", items: [cardItemForOutcome(outcome)] }]);
      }
    },
    [hintType, doPersist, appendAssistantMessage]
  );

  // ----------------- TTS AUTO-READ (voice-session behavior) -----------------
  const startSpeaking = useCallback(
    (msg: DisplayMessage, isAuto: boolean) => {
      tts.stopSpeaking();
      autoPlayingRef.current = isAuto;
      setSpeakingMessageId(msg.id);
      tts.speakBrief(msg.content, userVoiceId, {
        onDone: () => {
          autoPlayingRef.current = false;
          setSpeakingMessageId((cur) => (cur === msg.id ? null : cur));
        },
      });
    },
    [userVoiceId]
  );
  const startSpeakingRef = useRef(startSpeaking);
  useEffect(() => {
    startSpeakingRef.current = startSpeaking;
  }, [startSpeaking]);

  const onToggleSpeak = useCallback(
    (msg: DisplayMessage) => {
      if (speakingMessageId === msg.id) {
        if (autoPlayingRef.current) {
          // The user is stopping a reply that started playing automatically -- per this
          // session, stop auto-reading from here on. Manually tapping play on any bubble
          // still always works below, regardless of this flag.
          autoReadStoppedRef.current = true;
        }
        autoPlayingRef.current = false;
        tts.stopSpeaking();
        setSpeakingMessageId(null);
        return;
      }
      startSpeaking(msg, false);
    },
    [speakingMessageId, startSpeaking]
  );

  const sendChatMessage = useCallback(
    async (raw: string, retryId?: string) => {
      const trimmed = raw.trim().slice(0, CHAT_MAX_CHARS);
      if (!trimmed || chatLoading) return;

      const usedVoice = voiceInputPendingRef.current;
      voiceInputPendingRef.current = false;

      const existing = retryId ? messagesRef.current.find((m) => m.id === retryId) : undefined;
      const userMsg: DisplayMessage = existing ?? { id: nextDisplayId(), role: "user", content: trimmed, status: "sent" };

      if (existing) {
        setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, status: "sent", failReason: undefined } : m)));
      } else {
        setMessages((prev) => [...prev, userMsg]);
        setText("");
      }
      setChatLoading(true);
      setError(null);

      try {
        if (pendingFollowupRef.current) {
          const { rawInput, item } = pendingFollowupRef.current;
          pendingFollowupRef.current = null;
          await runCaptureTurn(`${rawInput} ${trimmed}`.trim(), trimmed);
        } else {
          await runCaptureTurn(trimmed);
        }

        if (usedVoice && !autoReadStoppedRef.current) {
          const latest = messagesRef.current[messagesRef.current.length - 1];
          if (latest && latest.role === "assistant") {
            startSpeakingRef.current(latest, true);
          }
        }
      } catch (e) {
        console.warn("[capture] chat structuring failed", e);
        const wentOffline = await checkAndFlipOffline();
        const reason = wentOffline
          ? "You went offline mid-send — try again once connected, or switch to offline entry."
          : describeNetworkError(e);
        if (wentOffline) {
          setOfflineTitle((prev) => prev || trimmed);
        }
        setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, status: "failed" as const, failReason: reason } : m)));
      } finally {
        setChatLoading(false);
      }
    },
    [chatLoading, runCaptureTurn, checkAndFlipOffline]
  );

  const retryMessage = useCallback(
    (id: string) => {
      const target = messagesRef.current.find((m) => m.id === id);
      if (!target) return;
      sendChatMessage(target.content, id);
    },
    [sendChatMessage]
  );

  // ----------------- VOICE TRANSCRIPTION (real Groq Whisper call + cursor insertion) -----------
  const transcribeAndInsert = useCallback(async (uri: string) => {
    const transcript = await groq.transcribeAudioFile(uri);
    const clean = transcript.trim();
    if (!clean) throw new Error("EMPTY_TRANSCRIPT");

    setText((prevText) => {
      const sel = textSelectionRef.current ?? { start: prevText.length, end: prevText.length };
      const merged = insertAtCursor(prevText, clean, sel).slice(0, CHAT_MAX_CHARS);
      const before = prevText.slice(0, sel.start);
      const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
      const newCursorPos = Math.min(sel.start + (needsLeadingSpace ? 1 : 0) + clean.length, merged.length);
      textSelectionRef.current = { start: newCursorPos, end: newCursorPos };
      setTextSelection({ start: newCursorPos, end: newCursorPos });
      return merged;
    });

    // Marks that the NEXT message sent originated from voice, so its reply auto-reads -- but we
    // deliberately do NOT auto-send here; the user reviews the inserted text and sends manually,
    // the same way typed text works.
    voiceInputPendingRef.current = true;
    setState("idle");
  }, []);

  // Programmatic selection is only meant to "stick" for a beat after an insertion -- clear it
  // right after so the TextInput goes back to being freely, manually editable.
  useEffect(() => {
    if (textSelection) {
      const t = setTimeout(() => setTextSelection(undefined), 60);
      return () => clearTimeout(t);
    }
  }, [textSelection]);

  const appendFailedAudioMessage = useCallback((uri: string, reason: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextDisplayId(), role: "user", content: "🎤 Voice message (not yet transcribed)", status: "failed", failReason: reason, audioUri: uri },
    ]);
  }, []);

  const retryAudioMessage = useCallback(
    async (id: string) => {
      const target = messagesRef.current.find((m) => m.id === id);
      if (!target?.audioUri) return;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "transcribing" as const } : m)));
      try {
        await transcribeAndInsert(target.audioUri);
        // Success: drop the placeholder now that its text is sitting in the composer for review.
        setMessages((prev) => prev.filter((m) => m.id !== id));
        FileSystem.deleteAsync(target.audioUri, { idempotent: true }).catch(() => {});
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status: "failed" as const, failReason: describeNetworkError(e) } : m))
        );
      }
    },
    [transcribeAndInsert]
  );

  // ----------------- COLLISION / FOLLOW-UP CARD HANDLERS (chat mode) -----------------
  const handleCollisionResolve = useCallback(
    async (
      cardItem: Extract<ChatCardItem, { kind: "collision" }>,
      action: "shift_later" | "shift_earlier" | "keep_both" | "discard"
    ) => {
      if (action === "discard") {
        appendAssistantMessage("Okay, discarded — the existing item is untouched.");
        return;
      }
      setChatLoading(true);
      try {
        const newItem = cardItem.pendingItem;
        const eventDate = newItem.date ?? toLocalISODate(new Date());

        if (action === "keep_both") {
          const insertedId = await db.insertCalendarEvent({
            title: newItem.title,
            details: newItem.details || null,
            date: eventDate,
            time: newItem.time,
            time_range_end: newItem.time_range_end,
            category: newItem.category,
            recurrence: newItem.recurrence,
            raw_input: newItem.title,
          });
          const eventId = typeof insertedId === "number" ? insertedId : Date.now();
          await cloneCalendarEventAsReminder({ ...newItem, date: eventDate }, newItem.title, linkedReminderIdRef.current ?? undefined);
          linkedReminderIdRef.current = null;
          appendAssistantMessage(confirmLabel(newItem), [
            { id: nextDisplayId(), label: "Saved", items: [{ kind: "calendar_event", id: eventId, title: newItem.title, date: eventDate, time: newItem.time, time_range_end: newItem.time_range_end, category: newItem.category }] },
          ]);
          return;
        }

        if (!newItem.time) {
          appendAssistantMessage("That item has no time set, so there's nothing to shift.");
          return;
        }
        const shifted = shiftTime(newItem.time, action === "shift_later" ? 60 : -60);
        const updatedItem = { ...newItem, time: shifted };
        const insertedId = await db.insertCalendarEvent({
          title: updatedItem.title,
          details: updatedItem.details || null,
          date: eventDate,
          time: updatedItem.time,
          time_range_end: updatedItem.time_range_end,
          category: updatedItem.category,
          recurrence: updatedItem.recurrence,
          raw_input: updatedItem.title,
        });
        const eventId = typeof insertedId === "number" ? insertedId : Date.now();
        await cloneCalendarEventAsReminder({ ...updatedItem, date: eventDate }, updatedItem.title, linkedReminderIdRef.current ?? undefined);
        linkedReminderIdRef.current = null;
        appendAssistantMessage(confirmLabel(updatedItem), [
          { id: nextDisplayId(), label: "Saved", items: [{ kind: "calendar_event", id: eventId, title: updatedItem.title, date: eventDate, time: updatedItem.time, time_range_end: updatedItem.time_range_end, category: updatedItem.category }] },
        ]);
      } catch (e) {
        console.warn("[capture] collision resolution failed", e);
        appendAssistantMessage("Couldn't complete that — try again?");
      } finally {
        setChatLoading(false);
      }
    },
    [appendAssistantMessage, cloneCalendarEventAsReminder]
  );

  const handleFollowupResolve = useCallback(
    async (cardItem: Extract<ChatCardItem, { kind: "followup" }>, choice: "any" | { date: string; time: string }) => {
      pendingFollowupRef.current = null;
      setChatLoading(true);
      try {
        let finalDate: string | null;
        let finalTime: string | null;
        if (choice === "any") {
          const anyItem = cardItem.pendingItem as any;
          finalDate = anyItem.suggested_date ?? cardItem.suggestedTimes[0]?.date ?? null;
          finalTime = anyItem.suggested_time ?? cardItem.suggestedTimes[0]?.time ?? null;
          if (!finalDate || !finalTime) {
            const soon = new Date(Date.now() + 30 * 60 * 1000);
            finalDate = toLocalISODate(soon);
            finalTime = `${String(soon.getHours()).padStart(2, "0")}:${String(soon.getMinutes()).padStart(2, "0")}`;
          }
        } else {
          finalDate = choice.date;
          finalTime = choice.time;
        }

        const finalItem: StructuredItem = { ...cardItem.pendingItem, date: finalDate, time: finalTime };
        const outcome = await doPersist(finalItem, cardItem.rawInput);
        if (outcome.kind === "collision") {
          appendAssistantMessage(outcome.message, [
            { id: nextDisplayId(), label: "Conflict", items: [{ kind: "collision", message: outcome.message, pendingItem: outcome.item, conflictWith: outcome.conflictWith }] },
          ]);
        } else {
          appendAssistantMessage(confirmLabel(outcome.item), [{ id: nextDisplayId(), label: "Saved", items: [cardItemForOutcome(outcome)] }]);
        }
      } catch (e) {
        console.warn("[capture] followup resolution failed", e);
        appendAssistantMessage("Couldn't complete that — try again?");
      } finally {
        setChatLoading(false);
      }
    },
    [doPersist, appendAssistantMessage]
  );

  // ----------------- SELECTION / COPY / SHARE / EDIT / TTS HANDLERS -----------------
  const selectedUserCount = messages.filter((m) => selectedIds.has(m.id) && m.role === "user").length;

  // A message is only editable if NOTHING follows it -- once anything else exists further down
  // the thread (a reply, or a later message), editing it would contradict what's already been
  // said/saved, so it becomes copy-only.
  const isLastMessage = useCallback((id: string) => {
    const arr = messagesRef.current;
    return arr.length > 0 && arr[arr.length - 1].id === id;
  }, []);

  const selectedIdsArray = Array.from(selectedIds);
  const soleSelectionEditable =
    selectedUserCount === 1 && selectedIdsArray.length === 1 && isLastMessage(selectedIdsArray[0]);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const cancelRecording = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (recording) {
      recording.stopAndUnloadAsync().catch(() => {});
      setRecording(null);
    }
    setState("idle");
  }, [recording]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (state === "recording") {
        cancelRecording();
        return true;
      }
      if (selectionMode) {
        cancelSelection();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [state, cancelRecording, selectionMode, cancelSelection]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onBubbleLongPress = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds((prev) => new Set(prev).add(id));
  }, []);

  const onBubblePress = useCallback(
    (id: string) => {
      if (!selectionMode) return;
      toggleSelect(id);
    },
    [selectionMode, toggleSelect]
  );

  useEffect(() => {
    if (selectionMode && selectedIds.size === 0) setSelectionMode(false);
  }, [selectionMode, selectedIds]);

  const getSelectedText = useCallback(() => {
    return messages
      .filter((m) => selectedIds.has(m.id))
      .map((m) => `${m.role === "user" ? "You" : "Clearday"}: ${m.content}`)
      .join("\n\n");
  }, [messages, selectedIds]);

  const onCopySelected = useCallback(async () => {
    const t = getSelectedText();
    if (!t) return;
    await Clipboard.setStringAsync(t);
    cancelSelection();
  }, [getSelectedText, cancelSelection]);

  const onShareSelected = useCallback(async () => {
    const t = getSelectedText();
    if (!t) return;
    try {
      await Share.share({ message: t });
    } catch (e) {
      console.warn("[capture] share failed", e);
    }
    cancelSelection();
  }, [getSelectedText, cancelSelection]);

  const onEditSelected = useCallback(() => {
    const target = messages.find((m) => selectedIds.has(m.id) && m.role === "user");
    if (!target) return;
    if (!isLastMessage(target.id)) return; // locked: something already follows this message
    setText(target.content);
    setEditingMessageId(target.id);
    setEditingOriginalText(target.content);
    cancelSelection();
  }, [messages, selectedIds, cancelSelection, isLastMessage]);

  const onCancelEditing = useCallback(() => {
    setEditingMessageId(null);
    setEditingOriginalText("");
    setText("");
  }, []);

  const onPickSuggestion = useCallback((tip: string) => {
    setText((prev) => (prev.trim() ? `${prev} ${tip}` : tip));
  }, []);

  const startRecording = useCallback(async () => {
    if (isOffline) return;
    setError(null);
    const ok = await ensureMicPermission();
    if (!ok) {
      setAlertConfig({
        title: "Microphone needed",
        message: "Grant microphone access in settings to capture by voice.",
        actions: [{ label: "OK" }],
      });
      return;
    }
    try {
      setState("recording");
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HighQuality);
      await rec.startAsync();
      setRecording(rec);

      // Fair-use cap -- auto-stop (and transcribe whatever was captured) if the mic is held open
      // past AUDIO_MAX_MINUTES instead of recording indefinitely.
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = setTimeout(() => {
        stopAndTranscribeRef.current();
      }, AUDIO_MAX_DURATION_MS);
    } catch (e) {
      console.warn("[capture] recording failed", e);
      setError("Couldn't start recording. Try typing instead.");
      setState("idle");
    }
  }, [isOffline]);

  const stopAndTranscribe = useCallback(async () => {
    if (!recording) return;
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    setState("transcribing");
    let cachedUri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) {
        setError("Recording failed — no audio captured.");
        setState("idle");
        return;
      }

      // Cache the recording BEFORE attempting the network transcription call, so a failed
      // upload never loses the audio -- the user can retry from the cached copy instead of
      // having to re-record from scratch.
      try {
        await FileSystem.makeDirectoryAsync(PENDING_AUDIO_DIR, { intermediates: true }).catch(() => {});
        cachedUri = `${PENDING_AUDIO_DIR}${Date.now()}.m4a`;
        await FileSystem.copyAsync({ from: uri, to: cachedUri });
      } catch (copyErr) {
        console.warn("[capture] failed to cache recording, falling back to transient uri", copyErr);
        cachedUri = uri;
      }

      await transcribeAndInsert(cachedUri);
      // Successful transcription: the cached copy is no longer needed.
      if (cachedUri) FileSystem.deleteAsync(cachedUri, { idempotent: true }).catch(() => {});
    } catch (e) {
      console.warn("[capture] transcribe failed", e);
      if (cachedUri) {
        appendFailedAudioMessage(cachedUri, describeNetworkError(e));
        setState("idle");
      } else {
        const wentOffline = await checkAndFlipOffline();
        if (!wentOffline) setError("Transcription failed. Type what you wanted to say.");
        setState("idle");
      }
    }
  }, [recording, transcribeAndInsert, appendFailedAudioMessage, checkAndFlipOffline]);

  const stopAndTranscribeRef = useRef(stopAndTranscribe);
  useEffect(() => {
    stopAndTranscribeRef.current = stopAndTranscribe;
  }, [stopAndTranscribe]);

  const resetOfflineForm = useCallback(() => {
    setOfflineTitle("");
    setOfflineDetails("");
    setOfflineDateChoice("today");
    setOfflineCustomDate("");
    setOfflineTimeText("");
    setOfflineAmPm("PM");
    setOfflineFormError(null);
  }, []);

  const onOfflineTimeChange = useCallback((val: string) => setOfflineTimeText(formatTimeDigits(val)), []);
  const onOfflineDateChange = useCallback((val: string) => setOfflineCustomDate(formatDateDigits(val)), []);

  const onOfflineSubmit = useCallback(async () => {
    setOfflineFormError(null);
    const title = offlineTitle.trim();
    if (!title) {
      setOfflineFormError("Enter a title first.");
      return;
    }

    if (offlineType === "note") {
      setOfflineSaving(true);
      const item: StructuredItem = {
        type: "note",
        title,
        details: offlineDetails.trim(),
        date: null,
        time: null,
        time_range_end: null,
        recurring: false,
        recurrence: "once",
        category: "general",
        reminder_offset_minutes: null,
        needs_confirmation: false,
      } as StructuredItem;
      await persist(item, title);
      setOfflineSaving(false);
      resetOfflineForm();
      return;
    }

    const date = resolveOfflineDate(offlineDateChoice, offlineCustomDate);
    if (!date) {
      setOfflineFormError("Enter the date — we'll format it as YYYY-MM-DD as you type.");
      return;
    }
    const time = parseOfflineTime(offlineTimeText, offlineAmPm);
    if (!time) {
      setOfflineFormError('Enter the time — e.g. "644" becomes 6:44 — then pick AM or PM.');
      return;
    }

    const item: StructuredItem = {
      type: offlineType,
      title,
      details: offlineDetails.trim(),
      date,
      time,
      time_range_end: null,
      recurring: false,
      recurrence: "once",
      category: "general",
      reminder_offset_minutes: offlineType === "reminder" ? 15 : null,
      needs_confirmation: false,
    } as StructuredItem;

    setOfflineSaving(true);
    await persist(item, title);
    setOfflineSaving(false);
    resetOfflineForm();
  }, [offlineType, offlineTitle, offlineDetails, offlineDateChoice, offlineCustomDate, offlineTimeText, offlineAmPm, persist, resetOfflineForm]);

  const isChatMode = isOffline === false && editType === null;

  const onSendText = () => {
    if (!text.trim()) return;
    Keyboard.dismiss();
    if (isChatMode) {
      if (editingMessageId) {
        const idx = messages.findIndex((m) => m.id === editingMessageId);
        const newText = text.trim();
        setEditingMessageId(null);
        setEditingOriginalText("");
        if (idx !== -1) {
          const truncated = messages.slice(0, idx);
          setMessages(truncated);
          messagesRef.current = truncated;
        }
        sendChatMessage(newText);
      } else {
        sendChatMessage(text.trim());
      }
    } else {
      structureAndSave(text.trim());
    }
  };

  const onSubmitFollowup = () => {
    if (!followupAnswer.trim() || !structured) return;
    structureAndSave(`${text} ${followupAnswer}`.trim(), followupAnswer.trim());
  };

  const onPickSuggestedTime = useCallback(
    async (suggestion: { date: string; time: string }) => {
      if (!structured) return;
      const finalItem: StructuredItem = { ...structured, date: suggestion.date, time: suggestion.time };
      setNeedsFollowup(null);
      setSuggestedTimes([]);
      await persist(finalItem, text || structured.title);
    },
    [structured, text, persist]
  );

  const onPickAnyTime = useCallback(async () => {
    if (!structured) return;
    setNeedsFollowup(null);
    setSuggestedTimes([]);
    setFollowupAnswer("");

    const anyStructured = structured as any;
    let finalDate: string | null = anyStructured.suggested_date ?? null;
    let finalTime: string | null = anyStructured.suggested_time ?? null;

    if ((!finalDate || !finalTime) && suggestedTimes.length > 0) {
      finalDate = suggestedTimes[0].date;
      finalTime = suggestedTimes[0].time;
    }
    if (!finalDate || !finalTime) {
      const soon = new Date(Date.now() + 30 * 60 * 1000);
      finalDate = toLocalISODate(soon);
      finalTime = `${String(soon.getHours()).padStart(2, "0")}:${String(soon.getMinutes()).padStart(2, "0")}`;
    }

    const finalItem: StructuredItem = { ...structured, date: finalDate, time: finalTime };
    await persist(finalItem, text || structured.title);
  }, [structured, suggestedTimes, text, persist]);

  const resolveCollisionKeepBoth = useCallback(async () => {
    if (!collision) return;
    const { newItem } = collision;
    const eventDate = newItem.date ?? toLocalISODate(new Date());
    await db.insertCalendarEvent({
      title: newItem.title,
      details: newItem.details || null,
      date: eventDate,
      time: newItem.time,
      time_range_end: newItem.time_range_end,
      category: newItem.category,
      recurrence: newItem.recurrence,
      raw_input: text,
    });
    await cloneCalendarEventAsReminder({ ...newItem, date: eventDate }, text, linkedReminderIdRef.current ?? undefined);
    linkedReminderIdRef.current = null;
    setStructured(newItem);
    setCollision(null);
    setState("saved");
    setText("");
  }, [collision, cloneCalendarEventAsReminder, text]);

  const resolveCollisionPickTime = useCallback(
    async (minutesOffset: number) => {
      if (!collision || !collision.newItem.time) return;
      const shifted = shiftTime(collision.newItem.time, minutesOffset);
      const updatedItem = { ...collision.newItem, time: shifted };
      const eventDate = updatedItem.date ?? toLocalISODate(new Date());
      await db.insertCalendarEvent({
        title: updatedItem.title,
        details: updatedItem.details || null,
        date: eventDate,
        time: updatedItem.time,
        time_range_end: updatedItem.time_range_end,
        category: updatedItem.category,
        recurrence: updatedItem.recurrence,
        raw_input: text,
      });
      await cloneCalendarEventAsReminder({ ...updatedItem, date: eventDate }, text, linkedReminderIdRef.current ?? undefined);
      linkedReminderIdRef.current = null;
      setStructured(updatedItem);
      setCollision(null);
      setState("saved");
      setText("");
    },
    [collision, cloneCalendarEventAsReminder, text]
  );

  const resolveCollisionDiscardNew = useCallback(() => {
    setCollision(null);
    setStructured(null);
    setText("");
    setState("idle");
  }, []);

  const onClose = () => {
    if (recording) recording.stopAndUnloadAsync().catch(() => {});
    tts.stopSpeaking();
    router.back();
  };

  const confirmationLabel = structured ? confirmLabel(structured) : "";
  const composerDisabled = isChatMode ? chatLoading || state === "transcribing" : state === "structuring" || state === "transcribing";

  const showIntro =
    isOffline === false &&
    !editId &&
    state === "idle" &&
    !keyboardVisible &&
    !text.trim() &&
    !error &&
    !collision &&
    !needsFollowup &&
    messages.length === 0;

  const offlinePreviewDateISO = resolveOfflineDate(offlineDateChoice, offlineCustomDate);
  const offlinePreviewTime24 = parseOfflineTime(offlineTimeText, offlineAmPm);

  const renderChatMessage = useCallback(
    ({ item, index }: { item: DisplayMessage; index: number }) => {
      const isUser = item.role === "user";
      const isSelected = selectedIds.has(item.id);
      const isSpeaking = speakingMessageId === item.id;
      const isLast = index === messages.length - 1;
      return (
        <Pressable onLongPress={() => onBubbleLongPress(item.id)} onPress={() => onBubblePress(item.id)} style={styles.bubbleTapArea}>
          <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
            <View style={styles.bubbleSelectRow}>
              {selectionMode && (
                <View style={[styles.selectCheckbox, isSelected && styles.selectCheckboxActive]}>
                  {isSelected && <Check size={12} color="#fff" />}
                </View>
              )}
              <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant, isSelected && styles.bubbleSelected]}>
                <Text selectable style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
                  {item.content}
                </Text>
              </View>
            </View>
            {!isUser && (
              <View style={selectionMode ? styles.speakBtnIndent : undefined}>
                <Pressable style={[styles.speakBtn, isSpeaking && styles.speakBtnActive]} onPress={() => onToggleSpeak(item)} hitSlop={8}>
                  {isSpeaking ? <StopIcon size={12} color="#fff" fill="#fff" /> : <Volume2 size={12} color={Colors.light.inkFaint} />}
                </Pressable>
              </View>
            )}
            {isUser && item.status === "failed" && (
              <View style={styles.retryRow}>
                <AlertCircle size={13} color={Colors.light.danger} />
                <Text style={styles.retryText}>{item.failReason ?? "Failed to send"}</Text>
                <View style={styles.retryButtonsGroup}>
                  <Pressable
                    style={styles.retryBtn}
                    onPress={() => (item.audioUri ? retryAudioMessage(item.id) : retryMessage(item.id))}
                    hitSlop={8}
                  >
                    <RotateCw size={12} color={Colors.light.coralDeep} />
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </Pressable>
                  <Pressable style={styles.tryOfflineBtn} onPress={() => onTryOffline(item)} hitSlop={8}>
                    <WifiOff size={12} color={Colors.light.inkMuted} />
                    <Text style={styles.tryOfflineBtnText}>Try offline</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {isUser && item.status === "transcribing" && (
              <View style={styles.retryRow}>
                <ActivityIndicator size="small" color={Colors.light.coral} />
                <Text style={styles.retryText}>Transcribing…</Text>
              </View>
            )}
            {!isUser && item.cardGroups && item.cardGroups.length > 0 && (
              <View style={styles.cardGroupsUnderBubble}>
                <ChatCards
                  groups={item.cardGroups}
                  // Cards attached to any message except the very last one are locked read-only --
                  // resolving/answering an old card once the conversation has moved on would
                  // contradict what's already been said/saved. See ChatCards.tsx: it should treat
                  // an undefined handler as "render buttons disabled" rather than requiring one.
                  onCollisionResolve={isLast ? handleCollisionResolve : undefined}
                  onFollowupResolve={isLast ? handleFollowupResolve : undefined}
                />
              </View>
            )}
          </View>
        </Pressable>
      );
    },
    [
      selectionMode,
      selectedIds,
      speakingMessageId,
      messages.length,
      onBubbleLongPress,
      onBubblePress,
      onToggleSpeak,
      retryMessage,
      retryAudioMessage,
      onTryOffline,
      handleCollisionResolve,
      handleFollowupResolve,
    ]
  );

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <View style={styles.flex}>
          {selectionMode && state !== "recording" ? (
            <View style={styles.header}>
              <Pressable style={styles.closeBtn} onPress={cancelSelection} hitSlop={8}>
                <X size={20} color={Colors.light.ink} />
              </Pressable>
              <Text style={styles.headerTitle}>{selectedIds.size} selected</Text>
              <View style={styles.selectionActionsRow}>
                {soleSelectionEditable && (
                  <Pressable style={styles.selectionIconBtn} onPress={onEditSelected} hitSlop={8}>
                    <Pencil size={18} color={Colors.light.ink} />
                  </Pressable>
                )}
                <Pressable style={styles.selectionIconBtn} onPress={onCopySelected} hitSlop={8}>
                  <Copy size={18} color={Colors.light.ink} />
                </Pressable>
                <Pressable style={styles.selectionIconBtn} onPress={onShareSelected} hitSlop={8}>
                  <Share2 size={18} color={Colors.light.ink} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.header}>
              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
                <ChevronLeft size={24} color={Colors.light.ink} />
              </Pressable>
              <Text style={styles.headerTitle}>
                {editId
                  ? `Edit ${editType === "calendar_event" ? "event" : editType === "note" ? "note" : "reminder"}`
                  : hintType
                  ? `New ${hintType.replace("_", " ")}`
                  : isChatMode
                  ? "Clearday"
                  : "Quick capture"}
              </Text>
              {isChatMode ? (
                <Pressable style={styles.closeBtn} onPress={onRefreshChat} hitSlop={8}>
                  <RefreshCw size={20} color={Colors.light.ink} />
                </Pressable>
              ) : (
                <View style={{ width: 40 }} />
              )}
            </View>
          )}

          {isOffline === true && (
            <View style={styles.offlineBanner}>
              <WifiOff size={14} color={Colors.light.warn} />
              <Text style={styles.offlineBannerText}>Offline — manual entry only</Text>
              <Pressable style={styles.retryOnlineBtn} onPress={onRetryOnline} hitSlop={6}>
                <RefreshCw size={12} color={Colors.light.coralDeep} />
                <Text style={styles.retryOnlineText}>Retry online</Text>
              </Pressable>
            </View>
          )}

          {/* ================= CHAT MODE ================= */}
          {isOffline === false && editType === null && (
            <View style={styles.contentArea}>
              <FlatList
                ref={chatListRef}
                data={messages}
                keyExtractor={(m) => m.id}
                renderItem={renderChatMessage}
                contentContainerStyle={styles.chatListContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => {
                  if (messages.length !== prevMessagesCountRef.current) {
                    prevMessagesCountRef.current = messages.length;
                    chatListRef.current?.scrollToEnd({ animated: true });
                  }
                }}
                ListFooterComponent={chatLoading ? <TypingBubble /> : null}
              />

              {error && (
                <View style={styles.errorCardFloating}>
                  <AlertCircle size={16} color={Colors.light.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {showIntro && (
                <View style={styles.centerOverlay} pointerEvents="box-none">
                  <CaptureIntro userName={userName} onPickSuggestion={onPickSuggestion} />
                </View>
              )}

              {state === "recording" && (
                <View style={[styles.centerOverlay, styles.centerOverlayRecording]} pointerEvents="none">
                  <PulseRings />
                  <Text style={styles.pulseLabel}>Listening… release to send (max {AUDIO_MAX_MINUTES} min)</Text>
                </View>
              )}
            </View>
          )}

          {/* ================= EDIT MODE (original single-shot pipeline, untouched) ========== */}
          {isOffline === false && editType !== null && (
            <View style={styles.contentArea}>
              <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {editId && (
                  <View style={styles.hintCard}>
                    <Text style={styles.hint}>Edit the details below, then send to update this item.</Text>
                  </View>
                )}

                {collision && state === "confirming" && (
                  <View style={styles.followupCard}>
                    <View style={styles.followupHeader}>
                      <AlertCircle size={16} color={Colors.light.warn} />
                      <Text style={styles.followupTitle}>These two are close together</Text>
                    </View>
                    <Text style={styles.followupText}>{collision.message}</Text>
                    <View style={styles.promptActionsRow}>
                      <Pressable style={styles.collisionBtn} onPress={() => resolveCollisionPickTime(60)}>
                        <Text style={styles.collisionBtnLabel}>Move new one 1hr later</Text>
                      </Pressable>
                      <Pressable style={styles.collisionBtn} onPress={resolveCollisionKeepBoth}>
                        <Text style={styles.collisionBtnLabel}>Keep both as-is</Text>
                      </Pressable>
                      <Pressable style={styles.collisionBtn} onPress={() => resolveCollisionPickTime(-60)}>
                        <Text style={styles.collisionBtnLabel}>Move new one 1hr earlier</Text>
                      </Pressable>
                      <Pressable style={styles.collisionBtn} onPress={resolveCollisionDiscardNew}>
                        <Text style={styles.collisionBtnLabel}>Discard this one</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {needsFollowup && state === "confirming" && (
                  <View style={styles.followupCard}>
                    <View style={styles.followupHeader}>
                      <AlertCircle size={16} color={Colors.light.warn} />
                      <Text style={styles.followupTitle}>One more thing</Text>
                    </View>
                    <Text style={styles.followupText}>{needsFollowup}</Text>
                    <View style={styles.suggestedTimesRow}>
                      <Pressable style={styles.suggestedTimeBtn} onPress={onPickAnyTime}>
                        <Text style={styles.suggestedTimeBtnLabel}>Any time</Text>
                      </Pressable>
                      {suggestedTimes.map((s, i) => (
                        <Pressable key={i} style={styles.suggestedTimeBtn} onPress={() => onPickSuggestedTime(s)}>
                          <Text style={styles.suggestedTimeBtnLabel}>{s.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.followupInputRow}>
                      <TextInput
                        value={followupAnswer}
                        onChangeText={setFollowupAnswer}
                        placeholder="e.g. tomorrow at 3 PM"
                        placeholderTextColor={Colors.light.inkFaint}
                        style={styles.followupInput}
                        maxLength={CHAT_MAX_CHARS}
                        autoFocus
                      />
                      <Pressable
                        style={[styles.followupSendBtn, !followupAnswer.trim() && styles.btnDisabled]}
                        onPress={onSubmitFollowup}
                        disabled={!followupAnswer.trim()}
                      >
                        <Send size={16} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                )}

                {error && (
                  <View style={styles.errorCard}>
                    <AlertCircle size={16} color={Colors.light.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {state === "saved" && structured && (
                  <View style={styles.savedCard}>
                    <LinearGradient
                      colors={[Colors.light.coral + "26", "transparent"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.savedCardGlow}
                    />
                    <View style={styles.savedCheck}>
                      <Check size={22} color={Colors.light.coral} />
                    </View>
                    <Text style={styles.savedTitle}>Got it</Text>
                    <Text style={styles.savedText}>{confirmationLabel}</Text>
                    <Pressable style={styles.savedDoneBtn} onPress={onClose}>
                      <Text style={styles.savedDoneLabel}>Done</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>

              {state === "structuring" && (
                <View style={styles.centerOverlay} pointerEvents="none">
                  <View style={styles.structuringPill}>
                    <Sparkles size={16} color={Colors.light.coral} />
                    <Text style={styles.structuringPillText}>Structuring with AI…</Text>
                  </View>
                </View>
              )}

              {state === "recording" && (
                <View style={[styles.centerOverlay, styles.centerOverlayRecording]} pointerEvents="none">
                  <PulseRings />
                  <Text style={styles.pulseLabel}>Listening… release to send (max {AUDIO_MAX_MINUTES} min)</Text>
                </View>
              )}
            </View>
          )}

          {/* ================= OFFLINE MANUAL ENTRY (unchanged persist logic) ================= */}
          {isOffline === true && (
            <View style={styles.contentArea}>
              <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {error && (
                  <View style={styles.errorCard}>
                    <AlertCircle size={16} color={Colors.light.danger} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {state === "saved" && structured && (
                  <View style={styles.savedCard}>
                    <LinearGradient
                      colors={[Colors.light.coral + "26", "transparent"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.savedCardGlow}
                    />
                    <View style={styles.savedCheck}>
                      <Check size={22} color={Colors.light.coral} />
                    </View>
                    <Text style={styles.savedTitle}>Got it</Text>
                    <Text style={styles.savedText}>{confirmationLabel}</Text>
                    <Pressable style={styles.savedDoneBtn} onPress={onClose}>
                      <Text style={styles.savedDoneLabel}>Done</Text>
                    </Pressable>
                  </View>
                )}

                <View style={styles.offlineCard}>
                  <LinearGradient
                    colors={[Colors.light.coral + "26", "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.offlineCardGlow}
                  />
                  <View style={styles.offlineCardHeader}>
                    <View style={styles.offlineIconWrap}>
                      <WifiOff size={16} color={Colors.light.coral} />
                    </View>
                    <Text style={styles.offlineEyebrow}>OFFLINE ENTRY</Text>
                  </View>

                  <View style={styles.offlineTypeRow}>
                    <Pressable style={[styles.offlineTypeBtn, offlineType === "note" && styles.offlineTypeBtnActive]} onPress={() => setOfflineType("note")}>
                      <FileText size={16} color={offlineType === "note" ? "#fff" : Colors.light.coralDeep} />
                      <Text style={[styles.offlineTypeBtnLabel, offlineType === "note" && styles.offlineTypeBtnLabelActive]}>Note</Text>
                    </Pressable>
                    <Pressable style={[styles.offlineTypeBtn, offlineType === "reminder" && styles.offlineTypeBtnActive]} onPress={() => setOfflineType("reminder")}>
                      <Bell size={16} color={offlineType === "reminder" ? "#fff" : Colors.light.coralDeep} />
                      <Text style={[styles.offlineTypeBtnLabel, offlineType === "reminder" && styles.offlineTypeBtnLabelActive]}>Reminder</Text>
                    </Pressable>
                    <Pressable style={[styles.offlineTypeBtn, offlineType === "calendar_event" && styles.offlineTypeBtnActive]} onPress={() => setOfflineType("calendar_event")}>
                      <CalendarIcon size={16} color={offlineType === "calendar_event" ? "#fff" : Colors.light.coralDeep} />
                      <Text style={[styles.offlineTypeBtnLabel, offlineType === "calendar_event" && styles.offlineTypeBtnLabelActive]}>Event</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.offlineFieldLabel}>Title</Text>
                  <TextInput
                    value={offlineTitle}
                    onChangeText={setOfflineTitle}
                    placeholder={offlineType === "note" ? "What do you want to note down?" : "What should I remind you of?"}
                    placeholderTextColor={Colors.light.inkFaint}
                    style={styles.offlineInput}
                    maxLength={OFFLINE_MAX_CHARS}
                  />

                  <Text style={styles.offlineFieldLabel}>Details (optional)</Text>
                  <TextInput
                    value={offlineDetails}
                    onChangeText={setOfflineDetails}
                    placeholder="Anything else worth remembering"
                    placeholderTextColor={Colors.light.inkFaint}
                    style={[styles.offlineInput, styles.offlineInputMultiline]}
                    maxLength={OFFLINE_MAX_CHARS}
                    multiline
                  />

                  {offlineType !== "note" && (
                    <>
                      <Text style={styles.offlineFieldLabel}>Date</Text>
                      <View style={styles.offlineChoiceRow}>
                        <Pressable style={[styles.offlineChoiceBtn, offlineDateChoice === "today" && styles.offlineChoiceBtnActive]} onPress={() => setOfflineDateChoice("today")}>
                          <Text style={[styles.offlineChoiceLabel, offlineDateChoice === "today" && styles.offlineChoiceLabelActive]}>Today</Text>
                        </Pressable>
                        <Pressable style={[styles.offlineChoiceBtn, offlineDateChoice === "tomorrow" && styles.offlineChoiceBtnActive]} onPress={() => setOfflineDateChoice("tomorrow")}>
                          <Text style={[styles.offlineChoiceLabel, offlineDateChoice === "tomorrow" && styles.offlineChoiceLabelActive]}>Tomorrow</Text>
                        </Pressable>
                        <Pressable style={[styles.offlineChoiceBtn, offlineDateChoice === "custom" && styles.offlineChoiceBtnActive]} onPress={() => setOfflineDateChoice("custom")}>
                          <Text style={[styles.offlineChoiceLabel, offlineDateChoice === "custom" && styles.offlineChoiceLabelActive]}>Custom</Text>
                        </Pressable>
                      </View>
                      {offlineDateChoice === "custom" && (
                        <>
                          <TextInput
                            value={offlineCustomDate}
                            onChangeText={onOfflineDateChange}
                            placeholder="e.g. 20260718"
                            placeholderTextColor={Colors.light.inkFaint}
                            style={styles.offlineInput}
                            keyboardType="number-pad"
                            maxLength={10}
                          />
                          <Text style={styles.offlineHelperText}>Just type digits — we'll format it as YYYY-MM-DD.</Text>
                        </>
                      )}

                      <Text style={styles.offlineFieldLabel}>Time</Text>
                      <View style={styles.offlineTimeRow}>
                        <TextInput
                          value={offlineTimeText}
                          onChangeText={onOfflineTimeChange}
                          placeholder="e.g. 644"
                          placeholderTextColor={Colors.light.inkFaint}
                          style={[styles.offlineInput, styles.offlineTimeInput]}
                          keyboardType="number-pad"
                          maxLength={5}
                        />
                        <View style={styles.offlineAmPmGroup}>
                          <Pressable style={[styles.offlineAmPmBtn, offlineAmPm === "AM" && styles.offlineAmPmBtnActive]} onPress={() => setOfflineAmPm("AM")}>
                            <Text style={[styles.offlineAmPmLabel, offlineAmPm === "AM" && styles.offlineAmPmLabelActive]}>AM</Text>
                          </Pressable>
                          <Pressable style={[styles.offlineAmPmBtn, offlineAmPm === "PM" && styles.offlineAmPmBtnActive]} onPress={() => setOfflineAmPm("PM")}>
                            <Text style={[styles.offlineAmPmLabel, offlineAmPm === "PM" && styles.offlineAmPmLabelActive]}>PM</Text>
                          </Pressable>
                        </View>
                      </View>
                      <Text style={styles.offlineHelperText}>Just type digits — we'll format it for you.</Text>

                      <View style={styles.offlinePreviewPill}>
                        <Text style={styles.offlinePreviewText}>
                          {offlinePreviewDateISO ? formatPreviewDate(offlinePreviewDateISO) : "Pick a date"}
                          {"  ·  "}
                          {offlinePreviewTime24 ? formatTime(offlinePreviewTime24) : "Set a time"}
                        </Text>
                      </View>
                    </>
                  )}

                  {offlineFormError && (
                    <View style={styles.offlineErrorRow}>
                      <AlertCircle size={14} color={Colors.light.danger} />
                      <Text style={styles.offlineFormErrorText}>{offlineFormError}</Text>
                    </View>
                  )}

                  <Pressable
                    style={[styles.offlineSubmitBtn, (!offlineTitle.trim() || offlineSaving) && styles.btnDisabled]}
                    onPress={onOfflineSubmit}
                    disabled={!offlineTitle.trim() || offlineSaving}
                  >
                    {offlineSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Send size={16} color="#fff" />
                        <Text style={styles.offlineSubmitLabel}>Save {offlineType === "note" ? "note" : offlineType === "reminder" ? "reminder" : "event"}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          )}

          {isOffline === null && (
            <View style={styles.offlineCheckingBox}>
              <ActivityIndicator size="small" color={Colors.light.coral} />
            </View>
          )}

          {/* Normal composer -- hidden entirely while editing a message (see the full-screen
              editing overlay below instead), and while offline. */}
          {isOffline === false && !editingMessageId && (
            <View style={[styles.composerOuter, { paddingBottom: keyboardVisible ? keyboardHeight + 55 : 65 }]}>
              <View style={styles.composerBar}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={isChatMode ? "Ask or tell me anything…" : "Add New Reminders"}
                  placeholderTextColor={Colors.light.inkFaint}
                  style={styles.composerInput}
                  multiline
                  maxLength={CHAT_MAX_CHARS}
                  editable={state !== "transcribing"}
                  selection={textSelection}
                  onSelectionChange={(e) => {
                    textSelectionRef.current = e.nativeEvent.selection;
                  }}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.composerMicBtn,
                    state === "recording" && styles.composerMicBtnActive,
                    pressed && !composerDisabled && { opacity: 0.85 },
                  ]}
                  onPressIn={startRecording}
                  onPressOut={stopAndTranscribe}
                  disabled={composerDisabled}
                  hitSlop={4}
                >
                  {state === "transcribing" ? <ActivityIndicator size="small" color={Colors.light.coral} /> : <Mic size={18} color="#fff" />}
                </Pressable>
                <Pressable
                  style={[styles.composerSendBtn, (!text.trim() || composerDisabled) && styles.btnDisabled]}
                  onPress={onSendText}
                  disabled={!text.trim() || composerDisabled || state === "recording"}
                  hitSlop={4}
                >
                  {state === "recording" ? (
                    <View style={styles.composerSendDot} />
                  ) : (isChatMode ? chatLoading : state === "structuring") ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Send size={17} color="#fff" />
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* Editing overlay -- near full-screen so it actually feels like editing something
              rather than starting a new entry; content starts at the top. Sending or cancelling
              collapses this back to the normal bottom composer above. */}
          {isOffline === false && !!editingMessageId && (
            <View style={[styles.editingOverlay, { paddingTop: insets.top + spacing.md, paddingBottom: keyboardVisible ? keyboardHeight + 12 : insets.bottom + spacing.lg }]}>
              <View style={styles.editingOverlayHeader}>
                <Text style={styles.editingOverlayTitle}>Editing message</Text>
                <Pressable onPress={onCancelEditing} hitSlop={10}>
                  <X size={22} color={Colors.light.ink} />
                </Pressable>
              </View>
              <TextInput
                value={text}
                onChangeText={setText}
                style={styles.editingOverlayInput}
                placeholder="Edit your message…"
                placeholderTextColor={Colors.light.inkFaint}
                multiline
                autoFocus
                maxLength={CHAT_MAX_CHARS}
                selection={textSelection}
                onSelectionChange={(e) => {
                  textSelectionRef.current = e.nativeEvent.selection;
                }}
              />
              <View style={styles.editingOverlayFooter}>
                <Pressable
                  style={[styles.composerMicBtn, state === "recording" && styles.composerMicBtnActive]}
                  onPressIn={startRecording}
                  onPressOut={stopAndTranscribe}
                  disabled={composerDisabled}
                  hitSlop={4}
                >
                  {state === "transcribing" ? <ActivityIndicator size="small" color={Colors.light.coral} /> : <Mic size={18} color="#fff" />}
                </Pressable>
                <Pressable
                  style={[styles.composerSendBtn, (!text.trim() || composerDisabled) && styles.btnDisabled]}
                  onPress={onSendText}
                  disabled={!text.trim() || composerDisabled}
                  hitSlop={4}
                >
                  {chatLoading ? <ActivityIndicator size="small" color="#fff" /> : <Send size={17} color="#fff" />}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>

      <Modal visible={!!alertConfig} transparent animationType="fade" onRequestClose={() => setAlertConfig(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAlertConfig(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{alertConfig?.title}</Text>
            {!!alertConfig?.message && <Text style={styles.modalMessage}>{alertConfig.message}</Text>}
            <View style={styles.modalActionsRow}>
              {alertConfig?.actions.map((a, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.modalActionBtn, a.style === "cancel" && styles.modalActionBtnCancel, pressed && styles.modalActionBtnPressed]}
                  onPress={() => {
                    setAlertConfig(null);
                    a.onPress?.();
                  }}
                >
                  <Text style={[styles.modalActionText, a.style === "cancel" && styles.modalActionTextCancel]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.light.cream },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: Colors.light.ink },

  contentArea: { flex: 1, position: "relative" },

  body: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm },

  hintCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: spacing.md,
  },
  hint: { fontSize: 14, color: Colors.light.inkMuted, lineHeight: 20 },

  // ----- Redesigned idle/empty state -----
  introBox: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, gap: 10 },
  introLogoSmall: { width: 44, height: 44, marginBottom: 4 },
  introGreeting: { fontSize: 22, fontWeight: "800", color: Colors.light.ink },
  introSubtitle: { fontSize: 14, color: Colors.light.inkMuted, textAlign: "center", marginBottom: 8, paddingHorizontal: 10 },
  introGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  introCard: {
    width: "44%",
    minHeight: 74,
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: spacing.md,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  introCardPressed: { opacity: 0.7, backgroundColor: Colors.light.coralSoft },
  introCardText: { fontSize: 12.5, color: Colors.light.inkMuted, lineHeight: 17, fontWeight: "600" },

  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 38 },
  centerOverlayRecording: { backgroundColor: Colors.light.cream },

  structuringPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.light.borderStrong,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  structuringPillText: { fontSize: 14, color: Colors.light.coralDeep, fontWeight: "600" },

  chatListContent: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  bubbleRow: { maxWidth: "88%", marginBottom: 4 },
  bubbleRowUser: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleRowAssistant: { alignSelf: "flex-start" },
  bubble: { borderRadius: radii.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: Colors.light.coral, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: Colors.light.ink },
  bubbleTextUser: { color: "#fff" },
  cardGroupsUnderBubble: { marginTop: 6 },
  typingBubble: { flexDirection: "row", gap: 4, paddingVertical: 14 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.light.inkFaint },
  errorCardFloating: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },

  followupCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  followupHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  followupTitle: { fontSize: 15, fontWeight: "700", color: Colors.light.ink },
  followupText: { fontSize: 14, color: Colors.light.inkMuted, lineHeight: 20, marginBottom: spacing.sm },
  followupInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  followupInput: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.light.ink,
  },
  followupSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.light.coral, alignItems: "center", justifyContent: "center" },

  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 14, color: Colors.light.danger, lineHeight: 20 },

  savedCard: {
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: Colors.light.borderStrong,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    overflow: "hidden",
    position: "relative",
  },
  savedCardGlow: { ...StyleSheet.absoluteFillObject },
  savedCheck: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.coral + "1A",
    borderWidth: 1.5,
    borderColor: Colors.light.coral,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  savedTitle: { fontSize: 22, fontWeight: "800", color: Colors.light.ink, marginBottom: 6 },
  savedText: { fontSize: 15, color: Colors.light.inkMuted, textAlign: "center", lineHeight: 22, marginBottom: spacing.lg },
  savedDoneBtn: { backgroundColor: Colors.light.coral, paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radii.pill },
  savedDoneLabel: { fontSize: 16, fontWeight: "700", color: "#fff" },

  promptActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  collisionBtn: { backgroundColor: Colors.light.surface, borderWidth: 1.5, borderColor: Colors.light.borderStrong, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 10 },
  collisionBtnLabel: { fontSize: 13, fontWeight: "600", color: Colors.light.ink },
  suggestedTimesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  suggestedTimeBtn: { backgroundColor: Colors.light.coralSoft, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 10 },
  suggestedTimeBtnLabel: { fontSize: 13, fontWeight: "700", color: Colors.light.coralDeep },

  composerOuter: { paddingHorizontal: spacing.md, paddingTop: spacing.xs ?? 4 },
  composerBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: 55,
    paddingHorizontal: 18,
    paddingVertical: 22,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  composerInput: { flex: 1, fontSize: 18, color: Colors.light.ink, paddingHorizontal: 8, paddingVertical: 8, maxHeight: 120 },
  composerMicBtn: { width: 40, height: 40, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.coral, opacity: 0.4 },
  composerMicBtnActive: { backgroundColor: Colors.light.coral, opacity: 1 },
  composerSendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.coral },
  composerSendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  btnDisabled: { opacity: 0.4 },

  // ----- Full-screen message-editing overlay -----
  editingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.light.cream,
    paddingHorizontal: spacing.md,
    zIndex: 30,
    elevation: 10,
  },
  editingOverlayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  editingOverlayTitle: { fontSize: 16, fontWeight: "700", color: Colors.light.coralDeep },
  editingOverlayInput: {
    flex: 1,
    fontSize: 18,
    lineHeight: 26,
    color: Colors.light.ink,
    textAlignVertical: "top",
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    padding: spacing.md,
  },
  editingOverlayFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.sm,
  },

  pulseRingsBox: { width: 112, height: 112, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  pulseRing: { position: "absolute", width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.light.coral },
  pulseCore: { width: 62, height: 62, borderRadius: 31, backgroundColor: Colors.light.coralDeep, alignItems: "center", justifyContent: "center" },
  pulseLabel: { fontSize: 13, fontWeight: "600", color: Colors.light.inkMuted },

  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: Colors.light.warn + "1A",
    borderWidth: 1,
    borderColor: Colors.light.warn,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 4,
  },
  offlineBannerText: { fontSize: 12, fontWeight: "700", color: Colors.light.warn },
  retryOnlineBtn: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: Colors.light.coralSoft },
  retryOnlineText: { fontSize: 11, fontWeight: "700", color: Colors.light.coralDeep },

  offlineCheckingBox: { paddingVertical: spacing.lg, alignItems: "center", justifyContent: "center" },

  offlineCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.borderStrong,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    gap: spacing.sm,
  },
  offlineCardGlow: { ...StyleSheet.absoluteFillObject },
  offlineCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 2 },
  offlineIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.light.coralSoft, alignItems: "center", justifyContent: "center" },
  offlineEyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: Colors.light.inkMuted },

  offlineTypeRow: { flexDirection: "row", gap: 8 },
  offlineTypeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: radii.pill,
    paddingVertical: 10,
  },
  offlineTypeBtnActive: { backgroundColor: Colors.light.coral, borderColor: Colors.light.coral },
  offlineTypeBtnLabel: { fontSize: 13, fontWeight: "700", color: Colors.light.coralDeep },
  offlineTypeBtnLabelActive: { color: "#fff" },

  offlineFieldLabel: { fontSize: 12, fontWeight: "700", color: Colors.light.inkMuted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 },
  offlineInput: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.light.ink,
  },
  // Taller than the online chat composer's cap, per request -- offline entries often need more
  // room since there's no back-and-forth to split details across turns.
  offlineInputMultiline: { minHeight: 90, maxHeight: 220, textAlignVertical: "top" },

  offlineChoiceRow: { flexDirection: "row", gap: 8 },
  offlineChoiceBtn: { flex: 1, alignItems: "center", backgroundColor: Colors.light.surface, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: radii.pill, paddingVertical: 10 },
  offlineChoiceBtnActive: { backgroundColor: Colors.light.coral, borderColor: Colors.light.coral },
  offlineChoiceLabel: { fontSize: 13, fontWeight: "600", color: Colors.light.ink },
  offlineChoiceLabelActive: { color: "#fff" },

  offlineHelperText: { fontSize: 12, color: Colors.light.inkFaint, marginTop: -2 },

  offlineTimeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  offlineTimeInput: { flex: 1 },
  offlineAmPmGroup: { flexDirection: "row", gap: 6 },
  offlineAmPmBtn: { width: 48, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.surface, borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: radii.md, paddingVertical: 12 },
  offlineAmPmBtnActive: { backgroundColor: Colors.light.coral, borderColor: Colors.light.coral },
  offlineAmPmLabel: { fontSize: 13, fontWeight: "700", color: Colors.light.ink },
  offlineAmPmLabelActive: { color: "#fff" },

  offlinePreviewPill: { alignSelf: "flex-start", backgroundColor: Colors.light.coralSoft, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  offlinePreviewText: { fontSize: 13, fontWeight: "700", color: Colors.light.coralDeep },

  offlineErrorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  offlineFormErrorText: { fontSize: 13, color: Colors.light.danger, flex: 1 },

  offlineSubmitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.light.coral, borderRadius: radii.pill, paddingVertical: 14, marginTop: spacing.sm },
  offlineSubmitLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },

  selectionActionsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectionIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  bubbleSelectRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  selectCheckbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.light.borderStrong, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  selectCheckboxActive: { backgroundColor: Colors.light.coral, borderColor: Colors.light.coral },
  bubbleSelected: { borderColor: Colors.light.coral, borderWidth: 1.5 },
  bubbleTapArea: { width: "100%" },
  speakBtn: { alignSelf: "flex-start", marginTop: 4, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  speakBtnActive: { backgroundColor: Colors.light.coralDeep, borderColor: Colors.light.coralDeep },
  speakBtnIndent: { marginLeft: 28 },
  retryRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 6, marginTop: 4, alignSelf: "flex-end", width: "100%" },
  retryText: { fontSize: 12, color: Colors.light.danger, flexShrink: 1 },
  retryButtonsGroup: { flexDirection: "row", gap: 6 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: Colors.light.coralSoft },
  retryBtnText: { fontSize: 12, fontWeight: "700", color: Colors.light.coralDeep },
  tryOfflineBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  tryOfflineBtnText: { fontSize: 12, fontWeight: "700", color: Colors.light.inkMuted },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: Colors.light.ink, textAlign: "center", marginBottom: 6 },
  modalMessage: { fontSize: 14, color: Colors.light.inkMuted, textAlign: "center", lineHeight: 20, marginBottom: spacing.md },
  modalActionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalActionBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radii.pill, backgroundColor: Colors.light.coral },
  modalActionBtnCancel: { backgroundColor: Colors.light.surface, borderWidth: 1.5, borderColor: Colors.light.border },
  modalActionBtnPressed: { opacity: 0.85 },
  modalActionText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  modalActionTextCancel: { color: Colors.light.ink },
});