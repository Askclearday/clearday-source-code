// Smart cleanup/recurrence pass. Runs foreground-only (app open, on an interval) —
// there is no real background cron in this environment. Touches ONLY reminders and
// calendar_events; notes are never analyzed or deleted here, per spec.
import * as db from "./db";
import * as groqRecurrence from "./groq";
import * as perms from "./permissions";
import type { Reminder, CalendarEvent, RecurrencePattern } from "./types";

const GRACE_MINUTES = 2; // how long after due-time to wait, if no snooze, before analyzing

// Local YYYY-MM-DD — never use toISOString() for date-only values: it reads UTC,
// which drifts a day off near midnight in timezones ahead of UTC (e.g. Nairobi, UTC+3).
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function nextDateForRecurrence(
  fromDateISO: string,
  recurrence: RecurrencePattern
): string {
  const d = new Date(fromDateISO + "T00:00:00");
  switch (recurrence) {
    case "daily":
      d.setDate(d.getDate() + 1);
      return toLocalISODate(d);
    case "weekly":
      d.setDate(d.getDate() + 7);
      return toLocalISODate(d);
    case "weekdays": {
      // Advance to the next weekday (Mon-Fri); if today was Friday, jump to Monday.
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6);
      return toLocalISODate(d);
    }
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      return toLocalISODate(d);
    case "annually":
      d.setFullYear(d.getFullYear() + 1);
      return toLocalISODate(d);
    case "once":
    default:
      return fromDateISO;
  }
}

async function processReminder(r: Reminder): Promise<void> {
  // Only ever delete/reschedule a reminder the user has explicitly marked done. An
  // overdue-but-unacknowledged reminder must keep showing up everywhere (widget, brief,
  // reminders list) as "overdue" rather than silently disappearing after the grace window.
  if (!r.completed) return;

  const decision = await groqRecurrence.analyzeRecurrence({
    title: r.title,
    details: r.details,
    raw_input: r.raw_input,
    currentRecurrence: r.recurrence,
  });

  if (decision.action === "delete") {
    await db.deleteReminder(r.id);
    return;
  }

  // Reschedule: figure out the next date, keep the same time-of-day.
  const nextDate = nextDateForRecurrence(r.due_date as string, decision.recurrence);
  await db.rescheduleReminder(r.id, nextDate, r.due_time);

  // Re-schedule its notification(s) for the new date.
  if (r.due_time) {
    try {
      await perms.scheduleReminderNotification(
        r.id,
        r.notification_text ?? r.title,
        nextDate,
        r.due_time
      );
    } catch {
      /* notifications may be denied */
    }
  }
}

async function processCalendarEvent(e: CalendarEvent): Promise<void> {
  // Same rule as reminders: leave it alone (still "overdue") until marked completed.
  if (!e.completed) return;

  const decision = await groqRecurrence.analyzeRecurrence({
    title: e.title,
    details: e.details,
    raw_input: e.raw_input,
    currentRecurrence: e.recurrence,
  });

  if (decision.action === "delete") {
    await db.deleteCalendarEvent(e.id);
    return;
  }

  const nextDate = nextDateForRecurrence(e.date, decision.recurrence);
  await db.updateCalendarEventDateTime(e.id, nextDate, e.time);
}

/** Entry point — call on app foreground and on a periodic interval while the app is open. */
export async function runRecurrenceSweep(): Promise<void> {
  const nowISO = new Date().toISOString();
  try {
    const staleReminders = await db.getStaleReminders(nowISO, GRACE_MINUTES);
    for (const r of staleReminders) {
      await processReminder(r);
    }
    const staleEvents = await db.getStaleCalendarEvents(nowISO, GRACE_MINUTES);
    for (const e of staleEvents) {
      await processCalendarEvent(e);
    }
  } catch (e) {
    console.warn("[recurrence-engine] sweep failed", e);
  }
}

