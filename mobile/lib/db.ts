// SQLite database layer for Daily Brief.
// Uses the new expo-sqlite (v16) openDatabaseAsync API.
import * as SQLite from "expo-sqlite";
import type {
  User,
  Note,
  CalendarEvent,
  Reminder,
  DailyBriefLog,
  ItemCategory,
  RecurrencePattern,
} from "./types";

const DB_NAME = "dailybrief.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
    const db = await dbPromise;
    await initSchema(db);
  }
  return dbPromise!;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER,
      onboarding_reasons TEXT NOT NULL DEFAULT '[]',
      voice_id TEXT,
      voice_id_male TEXT,
      voice_id_female TEXT,
      brief_time TEXT NOT NULL DEFAULT '07:00',
      brief_mode_override TEXT,
      location_permission_granted INTEGER NOT NULL DEFAULT 0,
      chime_enabled INTEGER NOT NULL DEFAULT 1,
      chime_sound TEXT NOT NULL DEFAULT 'soft_chime',
      subscription_tier TEXT NOT NULL DEFAULT 'FREE',
      subscription_will_renew INTEGER NOT NULL DEFAULT 0,
      subscription_is_trial INTEGER NOT NULL DEFAULT 0,
      subscription_expiration TEXT,
      subscription_store TEXT,
      subscription_updated_at TEXT,
      rating_session_count INTEGER NOT NULL DEFAULT 0,
      rating_items_completed INTEGER NOT NULL DEFAULT 0,
      rating_prompt_count INTEGER NOT NULL DEFAULT 0,
      rating_prompt_last_shown_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'text',
      tags TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      event_date TEXT,
      event_time TEXT,
      raw_input TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      details TEXT,
      date TEXT NOT NULL,
      time TEXT,
      time_range_end TEXT,
      created_at TEXT NOT NULL,
      reminded INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'general',
      recurrence TEXT NOT NULL DEFAULT 'once',
      raw_input TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(date);

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      details TEXT,
      due_date TEXT,
      due_time TEXT,
      time_range_end TEXT,
      snoozed_until TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      notification_text TEXT,
      confirmation_text TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      recurrence TEXT NOT NULL DEFAULT 'once',
      reminder_offset_minutes INTEGER,
      needs_confirmation INTEGER NOT NULL DEFAULT 0,
      pre_reminder_shown INTEGER NOT NULL DEFAULT 0,
      raw_input TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date, due_time);

    CREATE TABLE IF NOT EXISTS daily_briefs_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      mode TEXT NOT NULL,
      generated_text TEXT NOT NULL,
      delivered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_brief_date ON daily_briefs_log(date);
  `);

  // Migrations for existing installs created before these columns existed.
  const migrations = [
    `ALTER TABLE reminders ADD COLUMN notification_text TEXT;`,
    `ALTER TABLE reminders ADD COLUMN category TEXT NOT NULL DEFAULT 'general';`,
    `ALTER TABLE calendar_events ADD COLUMN category TEXT NOT NULL DEFAULT 'general';`,
    `ALTER TABLE notes ADD COLUMN category TEXT NOT NULL DEFAULT 'general';`,
    `ALTER TABLE notes ADD COLUMN event_date TEXT;`,
    `ALTER TABLE notes ADD COLUMN event_time TEXT;`,
    `ALTER TABLE users ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'FREE';`,
    `ALTER TABLE users ADD COLUMN subscription_will_renew INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN subscription_is_trial INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN subscription_expiration TEXT;`,
    `ALTER TABLE users ADD COLUMN subscription_store TEXT;`,
    `ALTER TABLE users ADD COLUMN subscription_updated_at TEXT;`,
    `ALTER TABLE notes ADD COLUMN raw_input TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE calendar_events ADD COLUMN time_range_end TEXT;`,
    `ALTER TABLE calendar_events ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'once';`,
    `ALTER TABLE calendar_events ADD COLUMN raw_input TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE reminders ADD COLUMN time_range_end TEXT;`,
    `ALTER TABLE reminders ADD COLUMN confirmation_text TEXT;`,
    `ALTER TABLE reminders ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'once';`,
    `ALTER TABLE reminders ADD COLUMN reminder_offset_minutes INTEGER;`,
    `ALTER TABLE reminders ADD COLUMN needs_confirmation INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE reminders ADD COLUMN pre_reminder_shown INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE reminders ADD COLUMN raw_input TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE calendar_events ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN rating_session_count INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN rating_items_completed INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN rating_prompt_count INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN rating_prompt_last_shown_at TEXT;`,
  ];
  for (const sql of migrations) {
    try {
      await db.execAsync(sql);
    } catch {
      // column already exists — fine
    }
  }
}

// ----------------- USERS -----------------

export async function getUser(): Promise<User | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<User & Record<string, unknown>>(
    `SELECT * FROM users ORDER BY id DESC LIMIT 1`
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function createUser(input: {
  name: string;
  age: number | null;
  onboarding_reasons: string[];
  brief_time: string;
  brief_mode_override: "morning" | "evening" | null;
  location_permission_granted: boolean;
  voice_id?: string | null;
  voice_id_male?: string | null;
  voice_id_female?: string | null;
  chime_enabled?: boolean;
  chime_sound?: string;
}): Promise<User> {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO users
      (name, age, onboarding_reasons, voice_id, voice_id_male, voice_id_female,
       brief_time, brief_mode_override, location_permission_granted,
       chime_enabled, chime_sound, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.age ?? null,
      JSON.stringify(input.onboarding_reasons),
      input.voice_id ?? null,
      input.voice_id_male ?? null,
      input.voice_id_female ?? null,
      input.brief_time,
      input.brief_mode_override,
      input.location_permission_granted ? 1 : 0,
      (input.chime_enabled ?? true) ? 1 : 0,
      input.chime_sound ?? "soft_chime",
      now,
    ]
  );
  return {
    id: result.lastInsertRowId as number,
    name: input.name,
    age: input.age ?? null,
    onboarding_reasons: JSON.stringify(input.onboarding_reasons),
    voice_id: input.voice_id ?? null,
    voice_id_male: input.voice_id_male ?? null,
    voice_id_female: input.voice_id_female ?? null,
    brief_time: input.brief_time,
    brief_mode_override: input.brief_mode_override,
    location_permission_granted: input.location_permission_granted,
    chime_enabled: input.chime_enabled ?? true,
    chime_sound: input.chime_sound ?? "soft_chime",
    created_at: now,
  };
}

export async function updateUser(
  patch: Partial<Pick<User, "name" | "age" | "voice_id" | "voice_id_male" | "voice_id_female" | "brief_time" | "brief_mode_override" | "location_permission_granted" | "chime_enabled" | "chime_sound">>
): Promise<void> {
  const db = await getDb();
  const cols: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) { cols.push("name = ?"); args.push(patch.name); }
  if (patch.age !== undefined) { cols.push("age = ?"); args.push(patch.age); }
  if (patch.voice_id !== undefined) { cols.push("voice_id = ?"); args.push(patch.voice_id); }
  if (patch.voice_id_male !== undefined) { cols.push("voice_id_male = ?"); args.push(patch.voice_id_male); }
  if (patch.voice_id_female !== undefined) { cols.push("voice_id_female = ?"); args.push(patch.voice_id_female); }
  if (patch.brief_time !== undefined) { cols.push("brief_time = ?"); args.push(patch.brief_time); }
  if (patch.brief_mode_override !== undefined) { cols.push("brief_mode_override = ?"); args.push(patch.brief_mode_override === null ? null : patch.brief_mode_override); }
  if (patch.location_permission_granted !== undefined) { cols.push("location_permission_granted = ?"); args.push(patch.location_permission_granted ? 1 : 0); }
  if (patch.chime_enabled !== undefined) { cols.push("chime_enabled = ?"); args.push(patch.chime_enabled ? 1 : 0); }
  if (patch.chime_sound !== undefined) { cols.push("chime_sound = ?"); args.push(patch.chime_sound); }
  if (cols.length === 0) return;
  await db.runAsync(`UPDATE users SET ${cols.join(", ")} WHERE id = (SELECT MAX(id) FROM users)`, args);
}

// ----------------- SUBSCRIPTION STATE -----------------

export type SubscriptionTier = "FREE" | "MONTHLY" | "ANNUAL";

export interface SubscriptionStateRecord {
  tier: SubscriptionTier;
  willRenew: boolean;
  isTrial: boolean;
  expirationLabel: string | null;
  store: string | null;
}

export async function saveSubscriptionState(state: SubscriptionStateRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE users SET
       subscription_tier = ?,
       subscription_will_renew = ?,
       subscription_is_trial = ?,
       subscription_expiration = ?,
       subscription_store = ?,
       subscription_updated_at = ?
     WHERE id = (SELECT MAX(id) FROM users)`,
    [
      state.tier,
      state.willRenew ? 1 : 0,
      state.isTrial ? 1 : 0,
      state.expirationLabel,
      state.store,
      new Date().toISOString(),
    ]
  );
}

export async function getSubscriptionState(): Promise<SubscriptionStateRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    subscription_tier: string;
    subscription_will_renew: number;
    subscription_is_trial: number;
    subscription_expiration: string | null;
    subscription_store: string | null;
  }>(
    `SELECT subscription_tier, subscription_will_renew, subscription_is_trial,
            subscription_expiration, subscription_store
     FROM users ORDER BY id DESC LIMIT 1`
  );
  if (!row) return null;
  return {
    tier: (row.subscription_tier as SubscriptionTier) || "FREE",
    willRenew: !!row.subscription_will_renew,
    isTrial: !!row.subscription_is_trial,
    expirationLabel: row.subscription_expiration,
    store: row.subscription_store,
  };
}

// ----------------- NOTES -----------------

export async function insertNote(input: {
  title: string;
  content: string;
  source: "voice" | "text";
  tags?: string | null;
  category?: ItemCategory;
  event_date?: string | null;
  event_time?: string | null;
  raw_input?: string;
}): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO notes (title, content, created_at, source, tags, category, event_date, event_time, raw_input)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.title,
      input.content,
      now,
      input.source,
      input.tags ?? null,
      input.category ?? "general",
      input.event_date ?? null,
      input.event_time ?? null,
      input.raw_input ?? input.content,
    ]
  );
  return result.lastInsertRowId as number;
}

/** Notes whose event_date falls within [fromDate, toDate] inclusive — for lead-time analysis. */
export async function getNotesWithDatesInRange(fromDate: string, toDate: string): Promise<Note[]> {
  const db = await getDb();
  return db.getAllAsync<Note>(
    `SELECT * FROM notes WHERE event_date IS NOT NULL AND event_date >= ? AND event_date <= ? ORDER BY event_date ASC`,
    [fromDate, toDate]
  );
}

export async function getNotes(limit = 200): Promise<Note[]> {
  const db = await getDb();
  return db.getAllAsync<Note>(`SELECT * FROM notes ORDER BY created_at DESC LIMIT ?`, [limit]);
}

export async function getNoteById(id: number): Promise<Note | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<Note>(`SELECT * FROM notes WHERE id = ?`, [id]);
  return rows.length > 0 ? rows[0] : null;
}

/** Keyword search across notes' title/content — used by the chat agent's "find that note" tool. */
export async function searchNotesByKeyword(keyword: string, limit = 20): Promise<Note[]> {
  const db = await getDb();
  const like = `%${keyword.toLowerCase()}%`;
  return db.getAllAsync<Note>(
    `SELECT * FROM notes WHERE LOWER(title) LIKE ? OR LOWER(content) LIKE ? ORDER BY created_at DESC LIMIT ?`,
    [like, like, limit]
  );
}

export async function deleteNote(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM notes WHERE id = ?`, [id]);
}

export async function countUnreadNotes(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM notes`);
  return row?.c ?? 0;
}

/**
 * Generic partial-field update for notes — powers chat-driven edits like
 * "rename that note" or "attach a date to it" without needing a bespoke
 * setter for every single field combination.
 */
export async function updateNoteFields(
  id: number,
  patch: Partial<{
    title: string;
    content: string;
    category: ItemCategory;
    event_date: string | null;
    event_time: string | null;
  }>
): Promise<void> {
  const db = await getDb();
  const cols: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) { cols.push("title = ?"); args.push(patch.title); }
  if (patch.content !== undefined) { cols.push("content = ?"); args.push(patch.content); }
  if (patch.category !== undefined) { cols.push("category = ?"); args.push(patch.category); }
  if (patch.event_date !== undefined) { cols.push("event_date = ?"); args.push(patch.event_date); }
  if (patch.event_time !== undefined) { cols.push("event_time = ?"); args.push(patch.event_time); }
  if (cols.length === 0) return;
  args.push(id);
  await db.runAsync(`UPDATE notes SET ${cols.join(", ")} WHERE id = ?`, args);
}

// ----------------- CALENDAR EVENTS -----------------

export async function insertCalendarEvent(input: {
  title: string;
  details?: string | null;
  date: string;
  time?: string | null;
  time_range_end?: string | null;
  category?: ItemCategory;
  recurrence?: RecurrencePattern;
  raw_input?: string;
}): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO calendar_events (title, details, date, time, time_range_end, created_at, reminded, category, recurrence, raw_input)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      input.title,
      input.details ?? null,
      input.date,
      input.time ?? null,
      input.time_range_end ?? null,
      now,
      input.category ?? "general",
      input.recurrence ?? "once",
      input.raw_input ?? input.title,
    ]
  );
  return result.lastInsertRowId as number;
}

export async function updateCalendarEventDateTime(id: number, date: string, time: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE calendar_events SET date = ?, time = ? WHERE id = ?`, [date, time, id]);
}

/** All timed events between [fromDate, toDate] — used for both lead-time analysis and collision checks. */
export async function getCalendarEventsInRange(fromDate: string, toDate: string): Promise<CalendarEvent[]> {
  const db = await getDb();
  return db.getAllAsync<CalendarEvent>(
    `SELECT * FROM calendar_events WHERE date >= ? AND date <= ? ORDER BY date ASC, time ASC`,
    [fromDate, toDate]
  );
}

export async function updateCalendarEventTime(id: number, time: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE calendar_events SET time = ? WHERE id = ?`, [time, id]);
}

export async function getCalendarEventsForDate(date: string): Promise<CalendarEvent[]> {
  const db = await getDb();
  return db.getAllAsync<CalendarEvent>(
    `SELECT * FROM calendar_events WHERE date = ? ORDER BY time ASC, created_at ASC`,
    [date]
  );
}

export async function getUpcomingCalendarEvents(fromDate: string, limit = 50): Promise<CalendarEvent[]> {
  const db = await getDb();
  return db.getAllAsync<CalendarEvent>(
    `SELECT * FROM calendar_events WHERE date >= ? AND completed = 0 ORDER BY date ASC, time ASC LIMIT ?`,
    [fromDate, limit]
  );
}

export async function getCalendarEventById(id: number): Promise<CalendarEvent | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<CalendarEvent>(`SELECT * FROM calendar_events WHERE id = ?`, [id]);
  return rows.length > 0 ? rows[0] : null;
}

/** Keyword search across calendar events — mirrors searchNotesByKeyword/searchRemindersAndEventsByKeyword. */
export async function searchCalendarEventsByKeyword(keyword: string, limit = 20): Promise<CalendarEvent[]> {
  const db = await getDb();
  const like = `%${keyword.toLowerCase()}%`;
  return db.getAllAsync<CalendarEvent>(
    `SELECT * FROM calendar_events WHERE LOWER(title) LIKE ? OR LOWER(details) LIKE ? ORDER BY date ASC, time ASC LIMIT ?`,
    [like, like, limit]
  );
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM calendar_events WHERE id = ?`, [id]);
}

/**
 * Deletes a calendar event and, if a reminder was cloned from it (matched
 * best-effort by due_date + title, case-insensitive — the reverse of the
 * match used by deleteReminderCascade, since there's no FK either way),
 * deletes that reminder too.
 */
export async function deleteCalendarEventCascade(id: number): Promise<void> {
  const db = await getDb();
  const event = await getCalendarEventById(id);
  await db.runAsync(`DELETE FROM calendar_events WHERE id = ?`, [id]);
  if (event) {
    await db.runAsync(
      `DELETE FROM reminders WHERE due_date = ? AND LOWER(title) = LOWER(?)`,
      [event.date, event.title]
    );
  }
}

export async function markCalendarEventReminded(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE calendar_events SET reminded = 1 WHERE id = ?`, [id]);
}

export async function completeCalendarEvent(id: number): Promise<void> {
  const db = await getDb();
  const event = await getCalendarEventById(id);
  await db.runAsync(`UPDATE calendar_events SET completed = 1 WHERE id = ?`, [id]);
  // Vice versa of completeReminderCascade: if this event was cloned into a
  // reminder (every calendar event with a time is — see
  // cloneCalendarEventAsReminder in capture.tsx), mark that reminder done
  // too. Same best-effort date+title match used everywhere else in this
  // file, since there's no FK between the two tables.
  if (event) {
    await db.runAsync(
      `UPDATE reminders SET completed = 1 WHERE due_date = ? AND LOWER(title) = LOWER(?)`,
      [event.date, event.title]
    );
  }
  await bumpRatingItemsCompleted();
}

/**
 * Generic partial-field update for calendar events — powers chat-driven edits like
 * "rename this event", "move it to Friday", "change the details" in one call instead
 * of composing several narrow setters.
 */
export async function updateCalendarEventFields(
  id: number,
  patch: Partial<{
    title: string;
    details: string | null;
    date: string;
    time: string | null;
    time_range_end: string | null;
    category: ItemCategory;
    recurrence: RecurrencePattern;
    raw_input: string;
  }>
): Promise<void> {
  const db = await getDb();
  const cols: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) { cols.push("title = ?"); args.push(patch.title); }
  if (patch.details !== undefined) { cols.push("details = ?"); args.push(patch.details); }
  if (patch.date !== undefined) { cols.push("date = ?"); args.push(patch.date); }
  if (patch.time !== undefined) { cols.push("time = ?"); args.push(patch.time); }
  if (patch.time_range_end !== undefined) { cols.push("time_range_end = ?"); args.push(patch.time_range_end); }
  if (patch.category !== undefined) { cols.push("category = ?"); args.push(patch.category); }
  if (patch.recurrence !== undefined) { cols.push("recurrence = ?"); args.push(patch.recurrence); }
  if (patch.raw_input !== undefined) { cols.push("raw_input = ?"); args.push(patch.raw_input); }
  if (cols.length === 0) return;
  args.push(id);
  await db.runAsync(`UPDATE calendar_events SET ${cols.join(", ")} WHERE id = ?`, args);
}

/**
 * Finds the calendar event that was originally cloned into a given reminder
 * (or vice versa a reminder was cloned from), matched best-effort by
 * date/due_date + title, case-insensitive — same convention as every other
 * cascade helper in this file, since there's no FK linking the two tables.
 * Callers should look this up using the OLD date/title (i.e. before an edit
 * changes them), since that's the identity the link was originally made
 * under.
 */
export async function findCalendarEventLinkedToReminder(
  dueDate: string | null,
  title: string
): Promise<CalendarEvent | null> {
  if (!dueDate) return null;
  const db = await getDb();
  const rows = await db.getAllAsync<CalendarEvent>(
    `SELECT * FROM calendar_events WHERE date = ? AND LOWER(title) = LOWER(?) LIMIT 1`,
    [dueDate, title]
  );
  return rows.length > 0 ? rows[0] : null;
}

/** Reverse direction of findCalendarEventLinkedToReminder — see its doc comment. */
export async function findReminderLinkedToCalendarEvent(
  date: string,
  title: string
): Promise<Reminder | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<Reminder>(
    `SELECT * FROM reminders WHERE due_date = ? AND LOWER(title) = LOWER(?) LIMIT 1`,
    [date, title]
  );
  return rows.length > 0 ? rows[0] : null;
}

// ----------------- REMINDERS -----------------

export async function insertReminder(input: {
  title: string;
  details?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  time_range_end?: string | null;
  notification_text?: string | null;
  confirmation_text?: string | null;
  category?: ItemCategory;
  recurrence?: RecurrencePattern;
  reminder_offset_minutes?: number | null;
  needs_confirmation?: boolean;
  raw_input?: string;
}): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO reminders
      (title, details, due_date, due_time, time_range_end, snoozed_until, completed, created_at,
       notification_text, confirmation_text, category, recurrence, reminder_offset_minutes,
       needs_confirmation, pre_reminder_shown, raw_input)
     VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      input.title,
      input.details ?? null,
      input.due_date ?? null,
      input.due_time ?? null,
      input.time_range_end ?? null,
      now,
      input.notification_text ?? null,
      input.confirmation_text ?? null,
      input.category ?? "general",
      input.recurrence ?? "once",
      input.reminder_offset_minutes ?? null,
      input.needs_confirmation ? 1 : 0,
      input.raw_input ?? input.title,
    ]
  );
  return result.lastInsertRowId as number;
}

export async function markPreReminderShown(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE reminders SET pre_reminder_shown = 1 WHERE id = ?`, [id]);
}

export async function rescheduleReminder(
  id: number,
  due_date: string,
  due_time: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reminders SET due_date = ?, due_time = ?, completed = 0, pre_reminder_shown = 0 WHERE id = ?`,
    [due_date, due_time, id]
  );
}

/** Reminders/events whose due moment (or grace window past it) has already passed and are still "active" — candidates for the recurrence/cleanup pass. Never touches notes. */
export async function getStaleReminders(nowISO: string, graceMinutes: number): Promise<Reminder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Reminder>(
    `SELECT * FROM reminders WHERE due_date IS NOT NULL AND due_time IS NOT NULL
     AND (snoozed_until IS NULL OR snoozed_until <= ?)`,
    [nowISO]
  );
  const now = new Date(nowISO);
  return rows.filter((r) => {
    const due = new Date(`${r.due_date}T${r.due_time}:00`);
    return now.getTime() - due.getTime() >= graceMinutes * 60000;
  });
}

export async function getStaleCalendarEvents(nowISO: string, graceMinutes: number): Promise<CalendarEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CalendarEvent>(
    `SELECT * FROM calendar_events WHERE time IS NOT NULL`
  );
  const now = new Date(nowISO);
  return rows.filter((e) => {
    const end = new Date(`${e.date}T${e.time_range_end ?? e.time}:00`);
    return now.getTime() - end.getTime() >= graceMinutes * 60000;
  });
}

/** Simple keyword search across reminders/calendar_events for cross-referencing ("during my walk"). Never searches notes — same scope restriction as the recurrence pass. */
export async function searchRemindersAndEventsByKeyword(keyword: string): Promise<(Reminder | CalendarEvent)[]> {
  const db = await getDb();
  const like = `%${keyword.toLowerCase()}%`;
  const reminders = await db.getAllAsync<Reminder>(
    `SELECT * FROM reminders WHERE completed = 0 AND LOWER(title) LIKE ? ORDER BY due_date ASC, due_time ASC LIMIT 5`,
    [like]
  );
  const events = await db.getAllAsync<CalendarEvent>(
    `SELECT * FROM calendar_events WHERE LOWER(title) LIKE ? ORDER BY date ASC, time ASC LIMIT 5`,
    [like]
  );
  return [...reminders, ...events];
}

/** All active reminders with a due_date in [fromDate, toDate] — for lead-time analysis. */
export async function getRemindersInRange(fromDate: string, toDate: string): Promise<Reminder[]> {
  const db = await getDb();
  return db.getAllAsync<Reminder>(
    `SELECT * FROM reminders WHERE completed = 0 AND due_date IS NOT NULL AND due_date >= ? AND due_date <= ?
     ORDER BY due_date ASC, due_time ASC`,
    [fromDate, toDate]
  );
}

export async function getReminders(includeCompleted = false): Promise<Reminder[]> {
  const db = await getDb();
  if (includeCompleted) {
    return db.getAllAsync<Reminder>(`SELECT * FROM reminders ORDER BY due_date ASC, due_time ASC`);
  }
  return db.getAllAsync<Reminder>(
    `SELECT * FROM reminders WHERE completed = 0 ORDER BY due_date ASC, due_time ASC`
  );
}

export async function getReminderById(id: number): Promise<Reminder | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<Reminder>(`SELECT * FROM reminders WHERE id = ?`, [id]);
  return rows.length > 0 ? rows[0] : null;
}

export async function updateReminderNotificationText(id: number, text: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE reminders SET notification_text = ? WHERE id = ?`, [text, id]);
}

export async function getPendingRemindersForDate(date: string): Promise<Reminder[]> {
  const db = await getDb();
  return db.getAllAsync<Reminder>(
    `SELECT * FROM reminders WHERE completed = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?)
       AND (due_date IS NULL OR due_date <= ?)
       ORDER BY due_time ASC NULLS LAST`,
    [new Date().toISOString(), date]
  );
}

export async function getPendingAndOverdueReminders(nowISO: string): Promise<Reminder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Reminder>(
    `SELECT * FROM reminders WHERE completed = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?)
     ORDER BY due_date ASC, due_time ASC`,
    [nowISO]
  );
  const now = new Date(nowISO);
  return rows.filter((r) => {
    if (!r.due_date || !r.due_time) return true;
    const due = new Date(`${r.due_date}T${r.due_time}:00`);
    return due.getTime() <= now.getTime();
  });
}

export async function completeReminder(id: number): Promise<void> {
  // Delegates to the cascade version — a reminder and any calendar event it
  // was cloned from (see capture.tsx's cloneCalendarEventAsReminder) must
  // always move together, whether "done" is triggered from the reminders
  // list, the brief overlay, or a notification's action button.
  await completeReminderCascade(id);
}

export async function snoozeReminder(id: number, snoozedUntilISO: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE reminders SET snoozed_until = ? WHERE id = ?`, [snoozedUntilISO, id]);
}

export async function deleteReminder(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM reminders WHERE id = ?`, [id]);
}

/**
 * Deletes a reminder and, if it was cloned from a calendar event (matched
 * best-effort by due_date + title, case-insensitive — there's no FK back
 * to the source event), deletes that calendar event too.
 */
export async function deleteReminderCascade(id: number): Promise<void> {
  const db = await getDb();
  const reminder = await getReminderById(id);
  await db.runAsync(`DELETE FROM reminders WHERE id = ?`, [id]);
  if (reminder?.due_date) {
    await db.runAsync(
      `DELETE FROM calendar_events WHERE date = ? AND LOWER(title) = LOWER(?)`,
      [reminder.due_date, reminder.title]
    );
  }
}

/**
 * Completes a reminder and, if it was cloned from a calendar event (same
 * best-effort date+title match as deleteReminderCascade), marks that
 * calendar event completed too so it stops showing up as upcoming.
 */
export async function completeReminderCascade(id: number): Promise<void> {
  const db = await getDb();
  const reminder = await getReminderById(id);
  await db.runAsync(`UPDATE reminders SET completed = 1 WHERE id = ?`, [id]);
  if (reminder?.due_date) {
    await db.runAsync(
      `UPDATE calendar_events SET completed = 1 WHERE date = ? AND LOWER(title) = LOWER(?)`,
      [reminder.due_date, reminder.title]
    );
  }
  await bumpRatingItemsCompleted();
}

/**
 * Whether the user has ever created any note, reminder, or calendar event —
 * used to decide whether to show the first-run onboarding cards on the
 * empty list screens (reminders/notes/calendar). Deliberately counts across
 * all three tables regardless of completed status, since "created" means
 * ever created, not currently active.
 */
export async function hasAnyUserContent(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT
       (SELECT COUNT(*) FROM notes) +
       (SELECT COUNT(*) FROM reminders) +
       (SELECT COUNT(*) FROM calendar_events) as c`
  );
  return (row?.c ?? 0) > 0;
}

/**
 * Generic partial-field update for reminders — powers chat-driven edits like
 * "change this reminder's time", "rename it", "make it recurring" without a
 * bespoke setter per field combination. Distinct from rescheduleReminder,
 * which additionally resets completed/pre_reminder_shown flags for the
 * "snap it back to pending" reschedule flow.
 */
export async function updateReminderFields(
  id: number,
  patch: Partial<{
    title: string;
    details: string | null;
    due_date: string | null;
    due_time: string | null;
    time_range_end: string | null;
    category: ItemCategory;
    recurrence: RecurrencePattern;
    reminder_offset_minutes: number | null;
    needs_confirmation: boolean;
    raw_input: string;
  }>
): Promise<void> {
  const db = await getDb();
  const cols: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) { cols.push("title = ?"); args.push(patch.title); }
  if (patch.details !== undefined) { cols.push("details = ?"); args.push(patch.details); }
  if (patch.due_date !== undefined) { cols.push("due_date = ?"); args.push(patch.due_date); }
  if (patch.due_time !== undefined) { cols.push("due_time = ?"); args.push(patch.due_time); }
  if (patch.time_range_end !== undefined) { cols.push("time_range_end = ?"); args.push(patch.time_range_end); }
  if (patch.category !== undefined) { cols.push("category = ?"); args.push(patch.category); }
  if (patch.recurrence !== undefined) { cols.push("recurrence = ?"); args.push(patch.recurrence); }
  if (patch.reminder_offset_minutes !== undefined) { cols.push("reminder_offset_minutes = ?"); args.push(patch.reminder_offset_minutes); }
  if (patch.needs_confirmation !== undefined) { cols.push("needs_confirmation = ?"); args.push(patch.needs_confirmation ? 1 : 0); }
  if (patch.raw_input !== undefined) { cols.push("raw_input = ?"); args.push(patch.raw_input); }
  if (cols.length === 0) return;
  args.push(id);
  await db.runAsync(`UPDATE reminders SET ${cols.join(", ")} WHERE id = ?`, args);
}

// ----------------- DAILY BRIEFS LOG -----------------

export async function insertBriefLog(input: {
  date: string;
  mode: "morning" | "evening";
  generated_text: string;
  delivered_at?: string | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO daily_briefs_log (date, mode, generated_text, delivered_at) VALUES (?, ?, ?, ?)`,
    [input.date, input.mode, input.generated_text, input.delivered_at ?? null]
  );
  return result.lastInsertRowId as number;
}

export async function markBriefDelivered(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE daily_briefs_log SET delivered_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    id,
  ]);
}

export async function getBriefHistory(limit = 30): Promise<DailyBriefLog[]> {
  const db = await getDb();
  return db.getAllAsync<DailyBriefLog>(
    `SELECT * FROM daily_briefs_log ORDER BY date DESC, id DESC LIMIT ?`,
    [limit]
  );
}

export async function getBriefForDate(date: string): Promise<DailyBriefLog | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<DailyBriefLog>(
    `SELECT * FROM daily_briefs_log WHERE date = ? ORDER BY id DESC LIMIT 1`,
    [date]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function rescheduleCalendarEvent(
  id: number,
  date: string,
  time?: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE calendar_events SET date = ?, time = ? WHERE id = ?`, [
    date,
    time ?? null,
    id,
  ]);
}

// ----------------- RATING PROMPT -----------------
// Lightweight engagement counters used to decide when it's a good moment to
// show the native "rate this app" prompt. See lib/rating-prompt.ts for the
// actual thresholds/cooldown logic — this section only stores raw counters.

async function bumpRatingItemsCompleted(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE users SET rating_items_completed = rating_items_completed + 1 WHERE id = (SELECT MAX(id) FROM users)`
  );
}

export async function incrementSessionCount(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE users SET rating_session_count = rating_session_count + 1 WHERE id = (SELECT MAX(id) FROM users)`
  );
}

export interface RatingPromptState {
  sessionCount: number;
  itemsCompleted: number;
  promptCount: number;
  lastShownAt: string | null;
  createdAt: string;
}

export async function getRatingPromptState(): Promise<RatingPromptState | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    rating_session_count: number;
    rating_items_completed: number;
    rating_prompt_count: number;
    rating_prompt_last_shown_at: string | null;
    created_at: string;
  }>(
    `SELECT rating_session_count, rating_items_completed, rating_prompt_count,
            rating_prompt_last_shown_at, created_at
     FROM users ORDER BY id DESC LIMIT 1`
  );
  if (!row) return null;
  return {
    sessionCount: row.rating_session_count ?? 0,
    itemsCompleted: row.rating_items_completed ?? 0,
    promptCount: row.rating_prompt_count ?? 0,
    lastShownAt: row.rating_prompt_last_shown_at,
    createdAt: row.created_at,
  };
}

export async function recordRatingPromptShown(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE users SET rating_prompt_count = rating_prompt_count + 1, rating_prompt_last_shown_at = ?
     WHERE id = (SELECT MAX(id) FROM users)`,
    [new Date().toISOString()]
  );
}