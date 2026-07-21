// Notification redirector — listens for notification taps and opens the brief screen.
//
// Handles TWO cases, and they must never race each other:
//   - warm/background tap: addNotificationResponseReceivedListener fires normally,
//     handled entirely here.
//   - cold start (app was fully closed, user tapped a notification to launch it):
//     the listener above never sees that original response. Instead of this file
//     recovering it independently (which used to race the root layout's home
//     redirect), the ROOT LAYOUT now consumes it as part of choosing the initial
//     route — see consumeLaunchNotificationResponse() below, called from
//     app/_layout.tsx BEFORE the first router.replace(). That removes the race
//     entirely: there is only ever one navigation decision on cold start, not
//     "go home, then maybe get overridden by a late push to /brief."
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import * as db from "./db";
import { dismissReminderNotification } from "./permissions";

type Router = ReturnType<typeof useRouter>;

// Module-level (not per-component-instance) so the cold-start consumer used by
// the root layout and the warm/background listener below share one de-dupe set.
// A notification consumed by one path must never be re-handled by the other.
const handledIdentifiers = new Set<string>();

// Returns a proper Href OBJECT rather than a hand-built string like
// `/brief?kind=reminder&id=${id}`. With Expo Router's typed routes enabled,
// router.push()/replace() only accept known route literals or an { pathname,
// params } object — a plain interpolated string doesn't satisfy that type,
// which is the TS2345 error this used to throw.
function hrefForResponse(response: Notifications.NotificationResponse): Href {
  const data = response.notification.request.content.data as {
    kind?: string;
    id?: string;
  };
  if (data?.kind === "daily_brief") {
    return { pathname: "/brief", params: { kind: "daily_brief" } };
  }
  if (data?.kind === "reminder" && data.id) {
    return { pathname: "/brief", params: { kind: "reminder", id: data.id } };
  }
  return "/brief";
}

function routeForResponse(router: Router, response: Notifications.NotificationResponse) {
  router.push(hrefForResponse(response));
}

/**
 * Consumes (and marks handled) the notification response that actually launched
 * the app, if any. Called ONCE, by the root layout, as part of deciding the
 * initial route — so a cold start launched via notification tap goes straight
 * to /brief instead of landing on (tabs) first and racing a second navigation
 * on top of it. Returns null if there's no pending response, or it was already
 * handled (e.g. by the warm listener, in an edge case where both fire).
 */
export async function consumeLaunchNotificationResponse(): Promise<Href | null> {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (last && !handledIdentifiers.has(last.notification.request.identifier)) {
      handledIdentifiers.add(last.notification.request.identifier);

      if (last.actionIdentifier === "MARK_DONE") {
        const data = last.notification.request.content.data as { kind?: string; id?: string };
        if (data?.kind === "reminder" && data.id) {
          db.completeReminderCascade(Number(data.id)).catch(() => {});
          dismissReminderNotification(Number(data.id)).catch(() => {});
        }
        return null; // handled in place — no navigation for a background action tap
      }

      return hrefForResponse(last);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function NotificationRedirector() {
  const router = useRouter();

  // Warm/background tap only. Cold-start launch responses are consumed by
  // consumeLaunchNotificationResponse() from the root layout instead — via the
  // SAME handledIdentifiers set — so a notification that launched the app is
  // never double-handled here.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (handledIdentifiers.has(response.notification.request.identifier)) return;
      handledIdentifiers.add(response.notification.request.identifier);

      if (response.actionIdentifier === "MARK_DONE") {
        const data = response.notification.request.content.data as { kind?: string; id?: string };
        if (data?.kind === "reminder" && data.id) {
          db.completeReminderCascade(Number(data.id)).catch(() => {});
          dismissReminderNotification(Number(data.id)).catch(() => {});
        }
        return; // handled in place — no navigation for a background action tap
      }

      routeForResponse(router, response);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}