// Root layout — wires AppProvider, redirects to onboarding when no user exists.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";

import Colors from "@/constants/colors";
import { AppProvider, useApp } from "@/lib/app-context";
import { NotificationRedirector, consumeLaunchNotificationResponse } from "@/lib/notification-redirector";
import { RevenueService } from "@/lib/revenue";
import * as perms from "@/lib/permissions";
import * as db from "@/lib/db";
import * as ratingPrompt from "@/lib/rating-prompt";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Configure how notifications appear when received while app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RootLayoutNav() {
  const { loading, hasOnboarded } = useApp();
  const router = useRouter();
  const navState = useRootNavigationState();
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (hasRedirected) return;
    if (!navState?.key) return;
    if (loading) return;

    // Resolve the TRUE initial destination before navigating anywhere. This is
    // the one and only router.replace() on cold start — previously a second,
    // async effect in NotificationRedirector could push("/brief") either before
    // or after this ran, depending on how slow cold-start init was. When init
    // was slow (app idle for hours), this replace("/(tabs)") would land AFTER
    // the notification's push and silently stomp it, sending the user to the
    // home tab instead of the brief/reminder overlay. Deciding the destination
    // up front — the same way a deep link would be handled — removes the race
    // entirely instead of trying to win it.
    (async () => {
      const pendingNotificationPath = hasOnboarded
        ? await consumeLaunchNotificationResponse()
        : null;

      router.replace(pendingNotificationPath ?? (hasOnboarded ? "/(tabs)" : "/onboarding"));
      setHasRedirected(true);
    })();
  }, [navState?.key, loading, hasOnboarded, hasRedirected, router]);

  useEffect(() => {
    if (hasRedirected) {
      SplashScreen.hideAsync();
    }
  }, [hasRedirected]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back", contentStyle: { backgroundColor: Colors.dark.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="brief" options={{ headerShown: false, presentation: "fullScreenModal", contentStyle: { backgroundColor: Colors.dark.background } }} />
      <Stack.Screen name="capture" options={{ headerShown: false, presentation: "modal", contentStyle: { backgroundColor: Colors.dark.background } }} />
      <Stack.Screen name="modal" options={{ headerShown: false, presentation: "modal", contentStyle: { backgroundColor: Colors.dark.background } }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Configure RevenueCat exactly once, as early as possible — before
  // AppProvider's children mount and before any screen (e.g. the
  // onboarding paywall) has a chance to call getOfferings()/isUserPro().
  // Without this, every RevenueCat call fails silently against the
  // "no singleton instance" error and gets swallowed by our own
  // try/catch blocks, which is why offerings/pro-status looked empty.
  useEffect(() => {
    RevenueService.initialize();
  }, []);

  // One-time per-app-launch setup: register the "Mark as done" notification
  // action, bump the session counter the rating-prompt logic reads, and
  // check whether this is a good moment to show the native rate-this-app
  // sheet. All best-effort — never blocks rendering.
  useEffect(() => {
    perms.registerNotificationCategories();
    perms.registerNotificationChannels();
    db.incrementSessionCount()
      .then(() => ratingPrompt.maybeRequestRating())
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.dark.background }}>
          <RootLayoutNav />
          <NotificationRedirector />
        </GestureHandlerRootView>
      </AppProvider>
    </QueryClientProvider>
  );
}