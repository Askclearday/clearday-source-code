// Step 7 of onboarding: Subscription (premium, full-bleed, no header/progress).
// Extracted from onboarding.tsx so it can be imported as a standalone
// component instead of being hardcoded inline in the wizard.
//
// CHANGES FROM THE TRIAL-BASED VERSION:
// - No free trial anywhere: no "7 days free" copy, no Today/Day 5/Day 7
//   timeline, no trial-end date math. This app charges immediately on
//   subscribe.
// - Monthly/Annual is now a real plan selector (PlanOption cards). Tapping
//   either one updates every price-related string on the screen (subhead,
//   CTA label) to match that plan — it does NOT purchase by itself. A
//   single CTA button purchases whichever plan is currently selected.
// - The top-right X/close button on the hero image is gone.
// - The "Store unavailable" system Alert is replaced with a custom dark,
//   rounded, centered modal: Retry and Restore Purchases are real buttons
//   (not Alert text actions), and tapping outside the card dismisses it.
//   "Continue for free" no longer appears in this modal at all — it only
//   ever appears as the plain text link at the bottom of the screen.
// - Added a short "what you get" feature list under the subhead, using the
//   same visual language as the rest of the screen (coral checkmarks,
//   existing type scale/spacing tokens) — no new components, no layout
//   restructure, just more of the informational content standard
//   subscription screens carry, tailored to what this app actually does.
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import { Caption } from "@/components/ui";
import { RevenueService } from "@/lib/revenue";
import { saveSubscriptionState } from "@/lib/db";
import type { PurchasesPackage } from "react-native-purchases";

// Brand gradient — used on every primary CTA elsewhere in the onboarding
// flow too, so the whole flow feels like one continuous, premium design
// language. Duplicated here so this component stays self-contained and
// importable on its own.
const GRADIENT_COLORS = ["#F3E6FC", "#CABEF9", "#CABEF9", "#75D2EE", "#70BDCC"] as const;
const GRADIENT_LOCATIONS = [0, 0.25, 0.5, 0.75, 1] as const;
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 0 }; // 90deg, left → right

// Solid (fully opaque) color used to block the safe-area strip at the very
// bottom of the screen, so nothing — gradients, scrolled content, button
// shadows — can ever show through behind the device's home indicator /
// gesture bar. Intentionally opaque (no alpha channel) and matched to the
// last stop of the screen's background gradient so it reads as a seamless
// continuation of the background rather than a visible seam.
const BOTTOM_SAFE_AREA_COLOR = Colors.surfaceGradient[Colors.surfaceGradient.length - 1];


// Dark, premium neutrals for the custom "store unavailable" modal — kept
// local to this file rather than pulled from a shared token since they're
// deliberately darker than the app's general surface colors.
const MODAL_BG = "#141416";
const MODAL_BORDER = "#2A2A2E";

// "What you get" — the value-prop list standard subscription paywalls
// carry, written against what this specific app does (daily briefs, voice
// capture, calendar/reminders, playback) rather than generic boilerplate.
const FEATURES: string[] = [
  "Unlimited daily briefs, morning and evening",
  "Voice or text capture — auto-sorted into notes, events, and reminders",
  "Every playback voice unlocked, with read-aloud briefs",
  "Smart scheduling that catches conflicts before they happen",
  "Reminders with snooze, follow-up questions, and smart notifications",
];

type PlanId = "MONTHLY" | "ANNUAL";

export default function StepSubscription({ onAdvance }: { onAdvance: () => void }) {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [purchasingPlan, setPurchasingPlan] = useState<PlanId | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [offeringsError, setOfferingsError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("MONTHLY");
  const [showStoreUnavailable, setShowStoreUnavailable] = useState(false);

  useEffect(() => {
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    setOfferingsError(null);
    try {
      const isPro = await RevenueService.isUserPro();
      if (isPro) {
        onAdvance();
        return;
      }
      const available = await RevenueService.getOfferings();
      if (!available || available.length === 0) {
        setOfferingsError(
          "We couldn't load live pricing from the store right now. You can retry, or continue for free and upgrade later."
        );
      }
      setPackages(available || []);
    } catch (e) {
      console.warn("[onboarding] subscription offerings failed", e);
      setOfferingsError(
        "We couldn't connect to the App Store. Please check your connection and try again."
      );
    } finally {
      setChecking(false);
    }
  };

  const monthlyPkg = packages.find((p) => p.packageType === "MONTHLY");
  const annualPkg = packages.find((p) => p.packageType === "ANNUAL");
  const monthlyPrice = monthlyPkg?.product.priceString || "$4.99";
  const annualPrice = annualPkg?.product.priceString || "$29.99";

  // Everything price-related on screen is derived from selectedPlan, so
  // tapping the other plan card immediately updates all of it at once.
  const selectedPrice = selectedPlan === "MONTHLY" ? monthlyPrice : annualPrice;
  const selectedCadence = selectedPlan === "MONTHLY" ? "month" : "year";

  // Persists the user's choice to continue without subscribing, then
  // advances — same DB write path as a successful purchase, just with the
  // FREE tier, so the local record always reflects reality even before any
  // live RevenueCat fetch happens later.
  const handleContinueFree = async () => {
    try {
      await saveSubscriptionState({
        tier: "FREE",
        willRenew: false,
        isTrial: false,
        expirationLabel: null,
        store: null,
      });
    } catch (e) {
      console.warn("[onboarding] failed to save free tier state", e);
    }
    onAdvance();
  };

  const doPurchase = async (plan: PlanId) => {
    const pkg = plan === "MONTHLY" ? monthlyPkg : annualPkg;

    if (!pkg) {
      // Offerings never loaded (store unreachable, sandbox not configured,
      // network down, etc). Don't silently skip the user past a paywall
      // that never actually charged them — show the custom modal so they
      // can retry or restore instead of a plain system Alert.
      setShowStoreUnavailable(true);
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPurchasingPlan(plan);
    try {
      const success = await RevenueService.purchasePackage(pkg);
      if (success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
          await saveSubscriptionState({
            tier: plan,
            willRenew: true,
            isTrial: false,
            expirationLabel: null,
            store: null,
          });
        } catch (e) {
          console.warn("[onboarding] failed to save subscription state", e);
        }
        onAdvance();
      } else {
        // Call completed without throwing but didn't confirm an active
        // entitlement — do not advance past the paywall.
        Alert.alert(
          "Purchase not completed",
          "We weren't able to confirm your subscription. Please try again."
        );
      }
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert("Purchase error", e?.message || "Something went wrong. Please try again.");
      }
      // Cancelled or failed — stay on this screen either way, never advance.
    } finally {
      setPurchasingPlan(null);
    }
  };

  // NOTE: assumes RevenueService exposes a restorePurchases() method (a
  // thin wrapper around react-native-purchases' Purchases.restorePurchases()
  // that returns whether the restored customer info has an active
  // entitlement). If lib/revenue.ts doesn't have this yet, add it next to
  // isUserPro/purchasePackage — this screen depends on it.
  const handleRestore = async () => {
    setRestoring(true);
    try {
      const isPro = await RevenueService.restorePurchases();
      if (isPro) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
          await saveSubscriptionState({
            tier: selectedPlan,
            willRenew: true,
            isTrial: false,
            expirationLabel: null,
            store: null,
          });
        } catch (e) {
          console.warn("[onboarding] failed to save restored subscription state", e);
        }
        setShowStoreUnavailable(false);
        onAdvance();
      } else {
        Alert.alert("No purchases found", "We couldn't find any active purchases to restore.");
      }
    } catch (e: any) {
      Alert.alert("Restore failed", e?.message || "Something went wrong restoring your purchase.");
    } finally {
      setRestoring(false);
    }
  };

  const handleRetry = () => {
    setShowStoreUnavailable(false);
    checkStatus();
  };

  if (checking) {
    return (
      <LinearGradient colors={Colors.surfaceGradient} style={styles.flex}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.dark.coral} />
          <Caption>Loading offers…</Caption>
        </View>
      </LinearGradient>
    );
  }

  const purchasing = purchasingPlan !== null;

  return (
    <LinearGradient colors={Colors.surfaceGradient} style={styles.flex}>
      <ScrollView
        style={styles.flex}
        // Content stops above the opaque bottom-safe-area block below, so
        // nothing scrolls underneath the home indicator / gesture bar.
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {/* Full-bleed image — no side padding, flush with the very top of
            the phone (runs behind the status bar). No title, no subtitle,
            no progress dots, and no close button on this screen by design —
            this whole step bypasses the shared wizard chrome. */}
        <View style={styles.subImageWrap}>
          {/* True alpha mask, not a color overlay — the image's own opacity
              fades to zero, so whatever actually renders behind it shows
              through with no guessed color and no visible seam. The many
              intermediate stops (rather than a straight 2-stop fade) ease
              the ramp so it reads as a soft blur, not a hard line. */}
          <MaskedView
            style={StyleSheet.absoluteFillObject}
            maskElement={
              <LinearGradient
                colors={[
                  "rgba(255,255,255,1)",
                  "rgba(255,255,255,1)",
                  "rgba(255,255,255,0.85)",
                  "rgba(255,255,255,0.55)",
                  "rgba(255,255,255,0.28)",
                  "rgba(255,255,255,0.1)",
                  "rgba(255,255,255,0)",
                ]}
                locations={[0, 0.85, 0.88, 0.91, 0.93, 0.96, 1]}
                style={StyleSheet.absoluteFillObject}
              />
            }
          >
            <Image
              source={require("../../assets/images/subscription_image.png")}
              style={styles.subImage}
              resizeMode="cover"
            />
          </MaskedView>
        </View>

        <View style={styles.subContent}>
          <Text style={styles.subHeadline}>Plan your days better</Text>
          <Text style={styles.subSubhead}>
            Unlimited daily briefs, and smart reminders —{" "}
            <Text style={styles.subSubheadBold}>
              {selectedPrice}/{selectedCadence}
            </Text>
            .
          </Text>

          {/* What's included — same coral-checkmark language used
              throughout the screen, just listed out so the value is
              explicit rather than implied by the subhead alone. */}
          <View style={styles.featuresList}>
            {FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <View style={styles.featureIconWrap}>
                  <Check size={12} color={Colors.dark.coral} />
                </View>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          <View style={styles.planRow}>
            <PlanOption
              label="Monthly"
              price={`${monthlyPrice}/mo`}
              selected={selectedPlan === "MONTHLY"}
              onPress={() => setSelectedPlan("MONTHLY")}
            />
            <PlanOption
              label="Annual"
              price={`${annualPrice}/yr`}
              badge="Best value"
              selected={selectedPlan === "ANNUAL"}
              onPress={() => setSelectedPlan("ANNUAL")}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.subPrimaryBtn,
              pressed && { opacity: 0.9 },
              purchasing && { opacity: 0.7 },
            ]}
            onPress={() => doPurchase(selectedPlan)}
            disabled={purchasing}
          >
            <LinearGradient
              colors={GRADIENT_COLORS}
              locations={GRADIENT_LOCATIONS}
              start={GRADIENT_START}
              end={GRADIENT_END}
              style={StyleSheet.absoluteFillObject}
            />
            {purchasing ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.subPrimaryBtnLabel}>
                Try Clearday — {selectedPrice}/{selectedCadence}
              </Text>
            )}
          </Pressable>

          <Caption style={styles.subFinePrint}>Renews automatically. Cancel anytime.</Caption>

          <Pressable onPress={handleContinueFree} disabled={purchasing} style={styles.subContinueFreeWrap}>
            <Text style={styles.subLinkTextMuted}>Continue for free</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Opaque bottom safe-area block. Sits above the ScrollView in paint
          order (sibling declared after it, plus an explicit high zIndex/
          elevation for Android) and is fully solid — no alpha, no gradient
          fade — so nothing can ever be visible through it. This guarantees
          the device's home indicator / gesture bar always sits over solid
          background color, never over scrolled content, button shadows, or
          card content. */}
      <View
        pointerEvents="none"
        style={[
          styles.bottomSafeAreaBlock,
          { height: insets.bottom, backgroundColor: BOTTOM_SAFE_AREA_COLOR },
        ]}
      />

      <StoreUnavailableModal
        visible={showStoreUnavailable}
        message={
          offeringsError ||
          "We couldn't load this plan from the store right now. Please check your connection and try again."
        }
        restoring={restoring}
        onDismiss={() => setShowStoreUnavailable(false)}
        onRetry={handleRetry}
        onRestore={handleRestore}
      />
    </LinearGradient>
  );
}

function PlanOption({
  label,
  price,
  badge,
  selected,
  onPress,
}: {
  label: string;
  price: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.planOption, selected && styles.planOptionSelected]}
      onPress={onPress}
    >
      {badge ? (
        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.planOptionTopRow}>
        <Text style={[styles.planLabel, selected && styles.planLabelSelected]}>{label}</Text>
        <View style={[styles.planCheck, selected && styles.planCheckSelected]}>
          {selected ? <Check size={12} color="#000000" /> : null}
        </View>
      </View>
      <Text style={[styles.planPrice, selected && styles.planPriceSelected]}>{price}</Text>
    </Pressable>
  );
}

// Custom replacement for the old system Alert.alert("Store unavailable", ...).
// Centered, dark, rounded card. Retry and Restore Purchases are real
// buttons. No "Continue for free" option lives here — tapping the backdrop
// is the only way to dismiss without taking an action.
function StoreUnavailableModal({
  visible,
  message,
  restoring,
  onDismiss,
  onRetry,
  onRestore,
}: {
  visible: boolean;
  message: string;
  restoring: boolean;
  onDismiss: () => void;
  onRetry: () => void;
  onRestore: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.modalBackdrop}>
        {/* Tap-outside-to-dismiss layer — an absolutely-positioned sibling
            BEHIND the card, not a wrapper around it, so it never steals
            touch responder from the buttons inside the card. */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />

        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Store unavailable</Text>
          <Text style={styles.modalMessage}>{message}</Text>

          <Pressable
            style={({ pressed }) => [styles.modalRetryBtn, pressed && { opacity: 0.9 }]}
            onPress={onRetry}
          >
            <Text style={styles.modalRetryLabel}>Retry</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.modalRestoreBtn, pressed && { opacity: 0.85 }]}
            onPress={onRestore}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator color={Colors.dark.ink} />
            ) : (
              <Text style={styles.modalRestoreLabel}>Restore purchases</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },

  subImageWrap: { width: "100%", height: 260, position: "relative", overflow: "hidden" },
  subImage: { width: "100%", height: "100%" },
  subImageFade: { ...StyleSheet.absoluteFillObject },

  subContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  subHeadline: { fontSize: 26, fontWeight: "800", color: Colors.dark.ink },
  subSubhead: { fontSize: 14, color: Colors.dark.inkMuted, marginTop: spacing.sm, lineHeight: 20 },
  subSubheadBold: { fontWeight: "700", color: Colors.dark.ink },

  // "What's included" list — inserted between the subhead and the plan
  // cards. Reuses the same Check icon + coral accent used everywhere else
  // on this screen so it reads as part of the same design, not a bolted-on
  // section.
  featuresList: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  featureIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.coral + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.ink,
    lineHeight: 20,
  },

  // Two side-by-side selectable plan cards. Tapping one selects it and
  // updates every price string on the screen (subhead + CTA) to match —
  // it does not purchase on its own.
  planRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  planOption: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: spacing.md,
    position: "relative",
  },
  planOptionSelected: {
    borderColor: Colors.dark.coral,
    backgroundColor: Colors.dark.coral + "14",
  },
  planBadge: {
    position: "absolute",
    top: -10,
    right: spacing.sm,
    backgroundColor: Colors.dark.coral,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  planBadgeText: { fontSize: 10, fontWeight: "800", color: "#000000", letterSpacing: 0.3 },
  planOptionTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planLabel: { fontSize: 14, fontWeight: "700", color: Colors.dark.inkMuted },
  planLabelSelected: { color: Colors.dark.ink },
  planCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  planCheckSelected: { backgroundColor: Colors.dark.coral, borderColor: Colors.dark.coral },
  planPrice: { fontSize: 18, fontWeight: "800", color: Colors.dark.inkMuted, marginTop: spacing.sm },
  planPriceSelected: { color: Colors.dark.ink },

  subPrimaryBtn: {
    marginTop: spacing.xl,
    height: 58,
    borderRadius: radii.sm,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.coral,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  subPrimaryBtnLabel: { fontSize: 16, fontWeight: "800", letterSpacing: 0.3, color: "#000000" },
  subFinePrint: { textAlign: "center", marginTop: spacing.sm },

  subContinueFreeWrap: {
    alignItems: "center",
    marginTop: spacing.lg,
    paddingVertical: spacing.xs,
  },
  subLinkTextMuted: { fontSize: 13, fontWeight: "600", color: Colors.dark.inkMuted },

  // Fully opaque strip pinned to the very bottom of the screen, exactly
  // insets.bottom tall — covers the device's home-indicator / gesture-bar
  // area so no gradient, image, or scrolled content can ever show through
  // it. High zIndex/elevation keeps it painted above the ScrollView on
  // both platforms.
  bottomSafeAreaBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },

  // Custom "store unavailable" modal — dark, rounded, centered card.
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11,11,13,0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: MODAL_BG,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: MODAL_BORDER,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.dark.ink,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    color: Colors.dark.inkMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  modalRetryBtn: {
    marginTop: spacing.lg,
    height: 50,
    borderRadius: radii.pill,
    backgroundColor: Colors.dark.coralDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRetryLabel: { fontSize: 15, fontWeight: "800", color: "#ffffff" },
  modalRestoreBtn: {
    marginTop: spacing.sm,
    height: 50,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalRestoreLabel: { fontSize: 15, fontWeight: "700", color: Colors.dark.ink },
});