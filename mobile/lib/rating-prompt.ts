// Rating prompt — decides when it's a good moment to show the native
// "rate this app" sheet, using engagement counters stored on the user row
// (see db.ts's RATING PROMPT section). Never shows a custom UI — only ever
// triggers the OS-native review sheet, which the OS itself may also silently
// throttle beyond what this logic allows.
import * as StoreReview from "expo-store-review";
import * as db from "./db";

const MIN_SESSIONS = 3;
const MIN_DAYS_SINCE_INSTALL = 5;
const MIN_ITEMS_COMPLETED = 3;
const COOLDOWN_DAYS = 90;
const MAX_LIFETIME_PROMPTS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Checks engagement thresholds and, if all are met, shows the native
 * rate-this-app sheet. Best-effort: never throws, never blocks whatever
 * called it (app launch, in this app's case — see app/_layout.tsx).
 */
export async function maybeRequestRating(): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    const state = await db.getRatingPromptState();
    if (!state) return;

    if (state.promptCount >= MAX_LIFETIME_PROMPTS) return;
    if (state.sessionCount < MIN_SESSIONS) return;
    if (state.itemsCompleted < MIN_ITEMS_COMPLETED) return;

    const daysSinceInstall = (Date.now() - new Date(state.createdAt).getTime()) / DAY_MS;
    if (daysSinceInstall < MIN_DAYS_SINCE_INSTALL) return;

    if (state.lastShownAt) {
      const daysSinceLastPrompt = (Date.now() - new Date(state.lastShownAt).getTime()) / DAY_MS;
      if (daysSinceLastPrompt < COOLDOWN_DAYS) return;
    }

    await db.recordRatingPromptShown();
    await StoreReview.requestReview();
  } catch {
    /* best-effort — a failed rating check should never affect anything else */
  }
}
