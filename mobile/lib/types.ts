// Shared domain types for Clearday.

export type OnboardingReason =
  | "forget_things"
  | "plan_better"
  | "daily_reset"
  | "calm_mornings"
  | "stay_organized"
  | "other";

export type ItemCategory = "trip" | "birthday" | "assignment" | "deadline" | "general";

export type RecurrencePattern = "once" | "daily" | "weekly" | "weekdays" | "monthly" | "annually";

export type BriefMode = "morning" | "evening";

export type User = {
  id: number;
  name: string;
  age: number | null;
  onboarding_reasons: string; // JSON-encoded array of OnboardingReason
  voice_id: string | null;
  voice_id_male: string | null;
  voice_id_female: string | null;
  brief_time: string; // "HH:MM"
  brief_mode_override: BriefMode | null; // null = infer from time
  location_permission_granted: boolean;
  chime_enabled: boolean;
  chime_sound: string; // "silent" | "soft_chime" | "gentle_bell"
  created_at: string;
};

export type Note = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  source: "voice" | "text";
  tags: string | null;
  category: ItemCategory;
  event_date: string | null;
  event_time: string | null;
  raw_input: string; // exact words the user typed/spoke, shown in the tap-to-view popup
};

export type CalendarEvent = {
  id: number;
  title: string;
  details: string | null;
  date: string;
  time: string | null;
  time_range_end: string | null; // HH:MM — end of a busy block, if the user gave a range
  created_at: string;
  reminded: number;
  completed: number;
  category: ItemCategory;
  recurrence: RecurrencePattern;
  raw_input: string;
};

export type Reminder = {
  id: number;
  title: string;
  details: string | null;
  due_date: string | null;
  due_time: string | null; // the real deadline/event moment
  time_range_end: string | null;
  snoozed_until: string | null;
  completed: number;
  created_at: string;
  notification_text: string | null; // text shown at the PRE-reminder moment
  confirmation_text: string | null; // text shown at the due moment, only if needs_confirmation
  category: ItemCategory;
  recurrence: RecurrencePattern;
  reminder_offset_minutes: number | null;
  needs_confirmation: number; // 0/1
  pre_reminder_shown: number; // 0/1 — set once the offset-earlier notification has actually fired
  raw_input: string;
};

export type DailyBriefLog = {
  id: number;
  date: string; // YYYY-MM-DD
  mode: BriefMode;
  generated_text: string;
  delivered_at: string | null; // ISO, null if not yet shown
};

/** Result of Groq structuring a raw transcript/text into a typed item. */
export type StructuredItem = {
  type: "note" | "calendar_event" | "reminder";
  title: string;
  details: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM — the actual due/event moment (e.g. the "4 PM" in "by 4pm", NOT the pre-reminder time)
  time_range_end: string | null; // HH:MM — set when the user gave a range ("between 3 and 6", "from 7 to 10")
  recurring: boolean; // kept for backward compat; superseded by `recurrence`
  recurrence: RecurrencePattern;
  category: ItemCategory;
  reminder_offset_minutes: number | null; // minutes BEFORE `time` to fire the pre-reminder; null = show at `time` itself
  needs_confirmation: boolean; // whether a second notification fires at/near `time` confirming the deadline passed
};

/** Small helper type used by the recurrence engine and cross-reference lookup, kept here since it rides alongside the other shared types. */
export type RecurrenceDecision = {
  action: "delete" | "reschedule";
  recurrence: RecurrencePattern;
  reason: string; // short, for logs — not shown to the user
};

export type BriefHighlight = {
  text: string; // exact, specific detail — "Trip to Mombasa in 3 days", "Deadline: submit project by midnight tomorrow"
  category: ItemCategory;
  dueDate: string;
  dueTime: string | null;
};

export type BriefCollision = {
  titleA: string;
  timeA: string;
  titleB: string;
  timeB: string;
};

/** Context payload sent to Groq to generate the daily brief. */
export type BriefContext = {
  name: string;
  date: string; // e.g. "Monday, June 5th"
  currentTime: string; // e.g. "7:30 AM"
  city: string | null;
  mode: BriefMode;
  weatherNow: { tempC: number; condition: string } | null;
  weatherEvening: { tempC: number; condition: string } | null;
  events: { title: string; time: string | null; details: string | null }[];
  pendingReminders: { title: string; dueTime: string | null; details: string | null }[];
  unreadNotesCount: number;
  onboardingReasons: string[];
  highlights: BriefHighlight[]; // things surfacing today due to lead-time rules, not literal due-today items
  collisions: BriefCollision[];
};

export type VoiceInfo = {
  id: string;
  name: string;
  language: string | null;
  gender: "male" | "female" | "unknown";
};