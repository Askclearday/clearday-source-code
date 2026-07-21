// Deterministic lead-time, "surface early", and collision rules.
// Kept independent of Groq so reminder timing never depends on an LLM being reachable.
import type { ItemCategory } from "./types";

// Local YYYY-MM-DD — never use toISOString() for date-only values: it reads UTC,
// which drifts a day off near midnight in timezones ahead of UTC (e.g. Nairobi, UTC+3).
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const LEAD_DAYS: Record<ItemCategory, number> = {
  trip: 3,
  birthday: 1,
  assignment: 1,
  deadline: 1,
  general: 0,
};

/** The date (YYYY-MM-DD) an item should first be surfaced, given its due date & category. */
export function computeLeadDate(dueDateISO: string, category: ItemCategory): string {
  const lead = LEAD_DAYS[category] ?? 0;
  const d = new Date(dueDateISO + "T00:00:00");
  d.setDate(d.getDate() - lead);
  return toLocalISODate(d);
}

/** True if todayISO falls inside [leadDate, dueDate] — i.e. it belongs in today's brief. */
export function isDueForSurfacing(dueDateISO: string, category: ItemCategory, todayISO: string): boolean {
  const leadDate = computeLeadDate(dueDateISO, category);
  return todayISO >= leadDate && todayISO <= dueDateISO;
}

/** True if a dated+timed item's moment has already passed today (so it drops out of the brief). */
export function hasTimePassed(dueDateISO: string, dueTime: string | null, now: Date): boolean {
  if (!dueTime) return false;
  const target = new Date(`${dueDateISO}T${dueTime}:00`);
  return target.getTime() < now.getTime();
}

/** Deadlines due tomorrow get a heads-up in TODAY's brief, not just on the day itself. */
export function isDeadlineDueTomorrow(dueDateISO: string, category: ItemCategory, todayISO: string): boolean {
  if (category !== "deadline") return false;
  const tomorrow = new Date(todayISO + "T00:00:00");
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dueDateISO === toLocalISODate(tomorrow);
}

export type TimedItem = { id: number; title: string; date: string; time: string };

/** Same-day items whose start times sit within `windowMinutes` of each other. */
export function findCollisions(items: TimedItem[], windowMinutes = 45): [TimedItem, TimedItem][] {
  const collisions: [TimedItem, TimedItem][] = [];
  const byDate = new Map<string, TimedItem[]>();
  for (const it of items) {
    const arr = byDate.get(it.date) ?? [];
    arr.push(it);
    byDate.set(it.date, arr);
  }
  for (const dayItems of byDate.values()) {
    for (let i = 0; i < dayItems.length; i++) {
      for (let j = i + 1; j < dayItems.length; j++) {
        if (Math.abs(toMinutes(dayItems[i].time) - toMinutes(dayItems[j].time)) < windowMinutes) {
          collisions.push([dayItems[i], dayItems[j]]);
        }
      }
    }
  }
  return collisions;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}