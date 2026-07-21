// Central app state: user settings, brief generation, notification scheduling.
import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import * as db from "@/lib/db";
import * as groq from "@/lib/groq";
import * as weather from "@/lib/weather";
import * as tts from "@/lib/tts";
import * as perms from "@/lib/permissions";
import * as leadTime from "@/lib/lead-time";
import * as recurrenceEngine from "@/lib/recurrence-engine";
import type { BriefContext, BriefMode, User } from "@/lib/types";

// Local date (not UTC) as YYYY-MM-DD. toISOString() is UTC and caused the brief to
// pick the wrong calendar day whenever local time and UTC disagreed on the date
// (e.g. late evening in a UTC+ timezone).
function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Cached "has this device finished onboarding" flag. Read first, before the
// real DB check, so the redirect effect never sees a moment where loading
// is false but hasOnboarded hasn't caught up yet — that gap was the source
// of the onboarding-flash race condition on cold start.
const ONBOARDED_CACHE_KEY = "clearday.hasOnboarded";

type AppState = {
  user: User | null;
  loading: boolean;
  hasOnboarded: boolean;
  refreshUser: () => Promise<void>;
  completeOnboarding: (input: Parameters<typeof db.createUser>[0]) => Promise<User>;
  updateUser: (patch: Parameters<typeof db.updateUser>[0]) => Promise<void>;
  generateTodayBrief: () => Promise<{ text: string; mode: BriefMode; usedFallback: boolean }>;
  previewBrief: () => Promise<{ text: string; mode: BriefMode; usedFallback: boolean }>;
  speak: (text: string) => void;
  stopSpeak: () => void;
};

export const [AppProvider, useApp] = createContextHook<AppState>(() => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Separate from `user` on purpose: this flips true the instant the cache
  // hits, so hasOnboarded is already true by the time loading goes false —
  // no gap for the redirect effect to catch a stale "false" in.
  const [cachedOnboarded, setCachedOnboarded] = useState(false);

  const refreshUser = useCallback(async () => {
    const u = await db.getUser();
    setUser(u);
    if (loading) setLoading(false);
  }, [loading]);

  useEffect(() => {
    (async () => {
      const cached = await AsyncStorage.getItem(ONBOARDED_CACHE_KEY);
      if (cached === "true") {
        // Trust the cache immediately — don't wait on the DB read before
        // unblocking navigation. The DB read still happens right after, to
        // populate `user`, but it no longer gates the redirect decision.
        setCachedOnboarded(true);
        setLoading(false);
        const u = await db.getUser();
        setUser(u);
      } else {
        const u = await db.getUser();
        setUser(u);
        if (u) {
          setCachedOnboarded(true);
          await AsyncStorage.setItem(ONBOARDED_CACHE_KEY, "true");
        }
        setLoading(false);
      }
    })();

    recurrenceEngine.runRecurrenceSweep();
    const sweepInterval = setInterval(() => {
      recurrenceEngine.runRecurrenceSweep();
    }, 5 * 60 * 1000);
    return () => clearInterval(sweepInterval);
  }, []);

  const completeOnboarding = useCallback(async (input: Parameters<typeof db.createUser>[0]) => {
    const created = await db.createUser(input);
    setUser(created);
    setCachedOnboarded(true);
    await AsyncStorage.setItem(ONBOARDED_CACHE_KEY, "true");
    try {
      await perms.scheduleDailyBrief(created.brief_time);
    } catch {
      /* notifications may be denied; that's okay */
    }
    return created;
  }, []);

  const updateUser = useCallback(async (patch: Parameters<typeof db.updateUser>[0]) => {
    await db.updateUser(patch);
    const refreshed = await db.getUser();
    setUser(refreshed);
    if (patch.brief_time) {
      try {
        await perms.scheduleDailyBrief(patch.brief_time);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Builds the brief context ALWAYS anchored on "today" + "right now". The old
  // morning/evening toggle no longer decides what gets covered — the current
  // clock time does:
  //   - before noon ("morning" phase): the whole day ahead, plus early highlights.
  //   - noon onward ("restOfDay" phase): only what's still pending between now and
  //     midnight. If nothing is left, a tomorrow preview is attached separately
  //     instead of silently jumping the whole brief to tomorrow's date.
  const buildContext = useCallback(async (): Promise<BriefContext> => {
    const u = user ?? (await db.getUser());
    const now = new Date();
    const hour = now.getHours();
    const phase: "morning" | "restOfDay" = hour < 12 ? "morning" : "restOfDay";

    const todayStr = localISODate(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = localISODate(tomorrow);

    const dateLabel = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const timeLabel = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const rawEvents = await db.getCalendarEventsForDate(todayStr);
    const filteredEvents =
      phase === "morning"
        ? rawEvents
        : rawEvents.filter((e) => !e.time || !leadTime.hasTimePassed(e.date, e.time, now));
    const events = filteredEvents.map((e) => ({
      title: e.title,
      time: e.time,
      details: e.details,
      rawInput: (e as any).raw_input ?? null,
    }));

    const rawReminders = await db.getPendingRemindersForDate(todayStr);
    const filteredReminders =
      phase === "morning"
        ? rawReminders
        : rawReminders.filter((r) => !r.due_time || !leadTime.hasTimePassed(r.due_date ?? todayStr, r.due_time, now));
    const reminders = filteredReminders.map((r) => ({
      title: r.title,
      dueTime: r.due_time,
      details: r.details,
      rawInput: (r as any).raw_input ?? null,
    }));

    const hasRemainingToday = events.length > 0 || reminders.length > 0;
    // Previously this only fetched tomorrow's data when NOTHING was left today.
    // That meant an evening brief with remaining tasks today never got a tomorrow
    // preview at all. Now: once it's evening/afternoon (restOfDay), we always look
    // ahead to tomorrow — the brief just decides how to frame it (append vs lead with).
    const previewTomorrow = phase === "restOfDay";

    let tomorrowEvents: typeof events = [];
    let tomorrowReminders: typeof reminders = [];
    if (previewTomorrow) {
      const rawTomorrowEvents = await db.getCalendarEventsForDate(tomorrowStr);
      tomorrowEvents = rawTomorrowEvents.map((e) => ({
        title: e.title,
        time: e.time,
        details: e.details,
        rawInput: (e as any).raw_input ?? null,
      }));
      const rawTomorrowReminders = await db.getPendingRemindersForDate(tomorrowStr);
      tomorrowReminders = rawTomorrowReminders.map((r) => ({
        title: r.title,
        dueTime: r.due_time,
        details: r.details,
        rawInput: (r as any).raw_input ?? null,
      }));
    }

    const notesCount = await db.countUnreadNotes();

    // Lead-time analysis (only meaningful for the "morning" full-day framing, per spec).
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 14);
    const horizonStr = localISODate(horizon);

    const highlights: BriefContext["highlights"] = [];
    if (phase === "morning") {
      const [rangeNotes, rangeEvents, rangeReminders] = await Promise.all([
        db.getNotesWithDatesInRange(todayStr, horizonStr),
        db.getCalendarEventsInRange(todayStr, horizonStr),
        db.getRemindersInRange(todayStr, horizonStr),
      ]);
      for (const n of rangeNotes) {
        if (!n.event_date || n.event_date === todayStr) continue;
        if (leadTime.isDueForSurfacing(n.event_date, n.category, todayStr)) {
          highlights.push({
            text: `${n.title}${n.content ? ` — ${n.content}` : ""}`,
            category: n.category,
            dueDate: n.event_date,
            dueTime: n.event_time,
            rawInput: (n as any).raw_input ?? null,
          } as any);
        }
      }
      for (const e of rangeEvents) {
        if (e.date === todayStr) continue;
        if (leadTime.isDueForSurfacing(e.date, e.category, todayStr) || leadTime.isDeadlineDueTomorrow(e.date, e.category, todayStr)) {
          highlights.push({
            text: `${e.title}${e.details ? ` — ${e.details}` : ""}`,
            category: e.category,
            dueDate: e.date,
            dueTime: e.time,
            rawInput: (e as any).raw_input ?? null,
          } as any);
        }
      }
      for (const r of rangeReminders) {
        if (!r.due_date || r.due_date === todayStr) continue;
        if (leadTime.isDueForSurfacing(r.due_date, r.category, todayStr) || leadTime.isDeadlineDueTomorrow(r.due_date, r.category, todayStr)) {
          highlights.push({
            text: `${r.title}${r.details ? ` — ${r.details}` : ""}`,
            category: r.category,
            dueDate: r.due_date,
            dueTime: r.due_time,
            rawInput: (r as any).raw_input ?? null,
          } as any);
        }
      }
    }

    const timedToday = filteredEvents
      .filter((e): e is typeof e & { time: string } => !!e.time)
      .map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.time as string }));
    const collisionPairs = leadTime.findCollisions(timedToday);
    const collisions: BriefContext["collisions"] = collisionPairs.map(([a, b]) => ({
      titleA: a.title,
      timeA: a.time,
      titleB: b.title,
      timeB: b.time,
    }));

    let city: string | null = null;
    let weatherNow: weather.WeatherSnapshot | null = null;
    let weatherEvening: weather.WeatherSnapshot | null = null;
    if (u?.location_permission_granted) {
      const loc = await weather.getCurrentLocation();
      if (loc) {
        city = loc.city;
        weatherNow = await weather.getCurrentWeather(loc);
        weatherEvening = await weather.getEveningForecast(loc);
      }
    }

    const reasons: string[] = (() => {
      try {
        return JSON.parse(u?.onboarding_reasons ?? "[]");
      } catch {
        return [];
      }
    })();

    const ctx = {
      name: u?.name ?? "there",
      date: dateLabel,
      currentTime: timeLabel,
      city,
      mode: (phase === "morning" ? "morning" : "evening") as BriefMode,
      weatherNow,
      weatherEvening,
      events,
      pendingReminders: reminders,
      unreadNotesCount: notesCount,
      onboardingReasons: reasons,
      highlights,
      collisions,
      // extra fields consumed by lib/groq.ts via `as any` — not part of the
      // base BriefContext type, kept on a plain variable (not a literal return)
      // so TS structural typing allows the extra props through.
      phase,
      hasRemainingToday,
      previewTomorrow,
      tomorrowEvents,
      tomorrowReminders,
    };

    return ctx as unknown as BriefContext;
  }, [user]);

  const generateTodayBrief = useCallback(async () => {
    const ctx = await buildContext();
    const phase: "morning" | "restOfDay" = (ctx as any).phase;
    let text: string;
    let usedFallback = false;
    try {
      text = await groq.generateDailyBrief(ctx);
    } catch (e) {
      console.warn("[brief] Groq failed, using fallback:", e);
      text = groq.fallbackBrief(ctx);
      usedFallback = true;
    }

    const todayISO = localISODate(new Date());
    await db.insertBriefLog({
      date: todayISO,
      mode: phase === "morning" ? "morning" : "evening",
      generated_text: text,
      delivered_at: null,
    });
    return { text, mode: ctx.mode, usedFallback };
  }, [buildContext]);

  // Preview brief for onboarding — placeholder data, works before any user exists.
  const previewBrief = useCallback(async () => {
    const now = new Date();
    const hour = now.getHours();
    const mode: BriefMode = hour < 12 ? "morning" : "evening";
    const ctx: BriefContext = {
      name: "Alex",
      date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      currentTime: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
      city: "Nairobi",
      mode,
      weatherNow: { tempC: 13, condition: "cloudy" },
      weatherEvening: { tempC: 18, condition: "rain" },
      events: [
        { title: "Morning workout", time: "07:00", details: null },
        { title: "Client meeting with Acme Co.", time: "11:30", details: null },
        { title: "Project review", time: "14:00", details: null },
        { title: "Team sync", time: "15:00", details: null },
        { title: "Dinner with Jamie", time: "20:00", details: null },
      ],
      pendingReminders: [],
      unreadNotesCount: 0,
      onboardingReasons: ["forget_things", "calm_mornings"],
      highlights: [],
      collisions: [],
    };
    try {
      const text = await groq.generateDailyBrief(ctx);
      return { text, mode, usedFallback: false };
    } catch (e) {
      console.warn("[preview] Groq failed, using fallback:", e);
      return { text: groq.fallbackBrief(ctx), mode, usedFallback: true };
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      tts.speakBrief(text, user?.voice_id ?? null);
    },
    [user]
  );

  const stopSpeak = useCallback(() => {
    tts.stopSpeaking();
  }, []);

  return {
    user,
    loading,
    hasOnboarded: cachedOnboarded || !!user,
    refreshUser,
    completeOnboarding,
    updateUser,
    generateTodayBrief,
    previewBrief,
    speak,
    stopSpeak,
  };
});