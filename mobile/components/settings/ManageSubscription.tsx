// Settings > Subscription card. Tapping it opens a full-screen sheet with
// the live subscription state (via RevenueCat) and the correct set of
// actions for whatever tier the user is currently in: free -> monthly/annual
// upgrade CTAs; monthly -> switch-to-annual upsell; annual -> already on
// best plan. Always offers Restore purchases and "Manage in App/Play Store"
// since Apple/Google require cancellation to happen through their own
// subscription settings, not in-app.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Crown, X, Check, RotateCw, ExternalLink, ChevronRight, Sparkles } from "lucide-react-native";
import Purchases, { PurchasesPackage, CustomerInfo } from "react-native-purchases";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";
import { Caption } from "@/components/ui";
import { RevenueService } from "@/lib/revenue";
import { saveSubscriptionState, getSubscriptionState } from "@/lib/db";

// Same brand gradient used across onboarding + home so the manage-sub sheet
// feels like the same product, not a bolted-on settings page.
const GRADIENT_COLORS = ["#F3E6FC", "#CABEF9", "#CABEF9", "#75D2EE", "#70BDCC"] as const;
const GRADIENT_LOCATIONS = [0, 0.25, 0.5, 0.75, 1] as const;
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 0 };

// The brand gradient runs light lavender -> light cyan. Every stop is pale,
// so ANY text sitting on top of it needs a dark, warm ink — not the app's
// standard dark-mode text colors (Colors.dark.ink/inkMuted/inkFaint), which
// are tuned for light text on dark surfaces and disappear here. These are
// scoped to "things drawn directly on GRADIENT_COLORS" only.
const ON_GRADIENT = {
  ink: "#241A38", // near-black plum — primary text on the gradient
  muted: "rgba(36, 26, 56, 0.72)", // secondary text on the gradient
  faint: "rgba(36, 26, 56, 0.52)", // tertiary / metadata text on the gradient
  divider: "rgba(36, 26, 56, 0.14)",
  chipBg: "rgba(36, 26, 56, 0.10)",
  chipBorder: "rgba(36, 26, 56, 0.16)",
} as const;

type PlanId = "MONTHLY" | "ANNUAL";
type Tier = "FREE" | "MONTHLY" | "ANNUAL";

interface SubState {
  tier: Tier;
  willRenew: boolean;
  isTrial: boolean;
  expirationLabel: string | null; // formatted date, or null if no active entitlement
  store: string | null; // "APP_STORE" | "PLAY_STORE" | "PROMOTIONAL" | ...
}

const FREE_STATE: SubState = { tier: "FREE", willRenew: false, isTrial: false, expirationLabel: null, store: null };

const FREE_PERKS = ["Unlimited briefs", "Ai analysis",  "More voices", "Smart reminders"];

export default function ManageSubscription() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subState, setSubState] = useState<SubState>(FREE_STATE);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [offeringsError, setOfferingsError] = useState<string | null>(null);
  const [purchasingPlan, setPurchasingPlan] = useState<PlanId | null>(null);
  const [restoring, setRestoring] = useState(false);

  const insets = useSafeAreaInsets();

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setOfferingsError(null);
    try {
      const [info, offerings] = await Promise.all([
        Purchases.getCustomerInfo(),
        RevenueService.getOfferings().catch(() => null),
      ]);
      const derived = deriveSubState(info);
      setSubState(derived);
      // Cache the freshly-confirmed state so the sheet has something to
      // fall back on the next time the live fetch fails.
      saveSubscriptionState(derived).catch((e) =>
        console.warn("[settings] failed to cache subscription state", e)
      );
      if (!offerings || offerings.length === 0) {
        setOfferingsError("Live pricing is unavailable right now. Pull to retry.");
        setPackages([]);
      } else {
        setPackages(offerings);
      }
    } catch (e) {
      console.warn("[settings] subscription status failed", e);
      // Live fetch failed entirely (offline, store unreachable, etc). Fall
      // back to the last known state saved locally instead of leaving the
      // sheet blank — only show the hard error screen if there's truly
      // nothing cached yet.
      const cached = await getSubscriptionState().catch(() => null);
      if (cached) {
        setSubState(cached);
        setLoadError(null);
        setOfferingsError(
          "Showing your last known plan — couldn't refresh live pricing right now. Pull to retry."
        );
      } else {
        setLoadError("We couldn't reach the store to check your subscription. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sheetOpen) {
      loadStatus();
    }
  }, [sheetOpen, loadStatus]);

  const monthlyPkg = packages.find((p) => p.packageType === "MONTHLY");
  const annualPkg = packages.find((p) => p.packageType === "ANNUAL");
  const monthlyPrice = monthlyPkg?.product.priceString || "$4.99";
  const annualPrice = annualPkg?.product.priceString || "$29.99";

  const doPurchase = async (plan: PlanId) => {
    const pkg = plan === "MONTHLY" ? monthlyPkg : annualPkg;
    if (!pkg) {
      Alert.alert(
        "Store unavailable",
        offeringsError || "We couldn't load this plan from the store right now. Please check your connection and try again.",
        [
          { text: "Retry", onPress: () => loadStatus() },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPurchasingPlan(plan);
    try {
      const success = await RevenueService.purchasePackage(pkg);
      if (success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await loadStatus();
      } else {
        Alert.alert("Purchase not completed", "We weren't able to confirm your subscription. Please try again.");
      }
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert("Purchase error", e?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setPurchasingPlan(null);
    }
  };

  const onRestore = async () => {
    setRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      const next = deriveSubState(info);
      setSubState(next);
      if (next.tier === "FREE") {
        Alert.alert("No purchases found", "We didn't find an active subscription tied to this account.");
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await saveSubscriptionState(next).catch((e) =>
          console.warn("[settings] failed to cache restored subscription state", e)
        );
        Alert.alert("Restored", "Your subscription has been restored.");
      }
    } catch (e: any) {
      Alert.alert("Restore failed", e?.message || "Something went wrong. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const onManageInStore = () => {
    const url =
      Platform.OS === "ios"
        ? "https://apps.apple.com/account/subscriptions"
        : "https://play.google.com/store/account/subscriptions";
    Linking.openURL(url).catch(() =>
      Alert.alert("Couldn't open store", "Please open the App Store / Play Store app manually to manage your subscription.")
    );
  };

  const purchasing = purchasingPlan !== null;
  const tierLabel = tierDisplayName(subState.tier);

  return (
    <>
      {/* Settings list card — mirrors the "premium card" construction from
          the home tab: soft coral glow, coral icon chip, eyebrow label. */}
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        onPress={() => setSheetOpen(true)}
      >
        <LinearGradient
          colors={[Colors.dark.coral + "33", "transparent"]}
          style={styles.cardGlow}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.cardIconWrap}>
          <Crown size={20} color={Colors.dark.coral} />
        </View>
        <View style={styles.cardTextCol}>
          <Text style={styles.cardEyebrow}>SUBSCRIPTION</Text>
          <Text style={styles.cardTitle}>{tierLabel}</Text>
        </View>
        <ChevronRight size={20} color={Colors.dark.inkMuted} />
      </Pressable>

      <Modal
        visible={sheetOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSheetOpen(false)}
      >
        <LinearGradient colors={Colors.surfaceGradient} style={styles.flex}>
          <View style={[styles.sheetHeader, { paddingTop: insets.top + spacing.sm }]}>
            <Text style={styles.sheetTitle}>Subscription</Text>
            <Pressable onPress={() => setSheetOpen(false)} style={styles.closeBtn} hitSlop={10}>
              <X size={18} color={Colors.dark.ink} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Colors.dark.coral} />
              <Caption>Checking your subscription…</Caption>
            </View>
          ) : loadError ? (
            <View style={styles.loadingWrap}>
              <Caption style={{ textAlign: "center", paddingHorizontal: spacing.xl }}>{loadError}</Caption>
              <Pressable style={styles.retryBtn} onPress={loadStatus}>
                <RotateCw size={16} color={Colors.dark.coral} />
                <Text style={styles.retryLabel}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[styles.sheetScroll, { paddingBottom: insets.bottom + spacing.xl }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Hero status card — the premium moment of the screen. Full
                  brand gradient, dark warm ink text (never light/gray —
                  the gradient is pale, so light text has no contrast). */}
              <View style={styles.statusCard}>
                <LinearGradient
                  colors={GRADIENT_COLORS}
                  locations={GRADIENT_LOCATIONS}
                  start={GRADIENT_START}
                  end={GRADIENT_END}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.statusCardInner}>
                  <View style={styles.statusTopRow}>
                    <View style={styles.statusBadge}>
                      <Crown size={14} color={ON_GRADIENT.ink} />
                      <Text style={styles.statusBadgeText}>{tierLabel.toUpperCase()}</Text>
                    </View>
                    {subState.tier !== "FREE" && <Sparkles size={18} color={ON_GRADIENT.faint} />}
                  </View>

                  <Text style={styles.statusHeadline}>
                    {subState.tier === "FREE" ? "Unlock premium" : tierLabel}
                  </Text>

                  {subState.tier === "FREE" ? (
                    <Text style={styles.statusSub}>
                      Upgrade for unlimited daily briefs, smart voice analysis & classification, and smart reminders.
                    </Text>
                  ) : (
                    <Text style={styles.statusSub}>
                      {subState.isTrial
                        ? `Free trial active. Renews as ${subState.tier === "ANNUAL" ? annualPrice + "/year" : monthlyPrice + "/month"} on ${subState.expirationLabel}.`
                        : subState.willRenew
                        ? `Renews ${subState.expirationLabel}.`
                        : `Active until ${subState.expirationLabel}. Won't auto-renew.`}
                    </Text>
                  )}

                  {subState.tier === "FREE" ? (
                    <View style={styles.perkRow}>
                      {FREE_PERKS.map((perk) => (
                        <View key={perk} style={styles.perkChip}>
                          <Check size={12} color={ON_GRADIENT.ink} />
                          <Text style={styles.perkChipText}>{perk}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    subState.store && (
                      <>
                        <View style={styles.statusDivider} />
                        <Text style={styles.statusStore}>Billed via {storeLabel(subState.store)}</Text>
                      </>
                    )
                  )}
                </View>
              </View>

              {offeringsError ? (
                <View style={styles.inlineError}>
                  <Caption style={{ textAlign: "center" }}>{offeringsError}</Caption>
                </View>
              ) : null}

              {/* Upgrade options — free users see both plans; monthly users
                  see an annual upsell; annual users see nothing more to buy. */}
              {subState.tier !== "ANNUAL" && (
                <>
                  <View style={styles.primaryBtnCard}>
                    <LinearGradient
                      colors={GRADIENT_COLORS}
                      locations={GRADIENT_LOCATIONS}
                      start={GRADIENT_START}
                      end={GRADIENT_END}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryBtnPressable,
                        pressed && { opacity: 0.85 },
                        purchasing && { opacity: 0.7 },
                      ]}
                      onPress={() => doPurchase("ANNUAL")}
                      disabled={purchasing || restoring}
                    >
                      {purchasingPlan === "ANNUAL" ? (
                        <ActivityIndicator color={ON_GRADIENT.ink} />
                      ) : (
                        <>
                          <Crown size={16} color={ON_GRADIENT.ink} />
                          <Text style={styles.primaryBtnLabel}>
                            {subState.tier === "FREE" ? `Go annual — ${annualPrice}/year` : `Switch to annual — ${annualPrice}/year`}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>

                  {subState.tier === "FREE" && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.secondaryBtn,
                        pressed && { opacity: 0.85 },
                        purchasing && { opacity: 0.7 },
                      ]}
                      onPress={() => doPurchase("MONTHLY")}
                      disabled={purchasing || restoring}
                    >
                      {purchasingPlan === "MONTHLY" ? (
                        <ActivityIndicator color={Colors.dark.ink} />
                      ) : (
                        <Text style={styles.secondaryBtnLabel}>Start monthly — {monthlyPrice}/month</Text>
                      )}
                    </Pressable>
                  )}
                </>
              )}

              {subState.tier === "ANNUAL" && (
                <View style={styles.bestPlanRow}>
                  <Check size={16} color={Colors.dark.coral} />
                  <Text style={styles.bestPlanText}>You're on the best value plan.</Text>
                </View>
              )}

              {/* Account-level actions — always available regardless of tier. */}
              <View style={styles.actionsGroup}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionRow,
                    subState.tier === "FREE" && styles.actionRowLast,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={onRestore}
                  disabled={restoring || purchasing}
                >
                  <View style={styles.actionIconWrap}>
                    {restoring ? (
                      <ActivityIndicator color={Colors.dark.coral} size="small" />
                    ) : (
                      <RotateCw size={15} color={Colors.dark.inkMuted} />
                    )}
                  </View>
                  <Text style={styles.actionLabel}>Restore purchases</Text>
                  <ChevronRight size={16} color={Colors.dark.inkFaint} />
                </Pressable>

                {subState.tier !== "FREE" && (
                  <Pressable
                    style={({ pressed }) => [styles.actionRow, styles.actionRowLast, pressed && { opacity: 0.85 }]}
                    onPress={onManageInStore}
                  >
                    <View style={styles.actionIconWrap}>
                      <ExternalLink size={15} color={Colors.dark.inkMuted} />
                    </View>
                    <Text style={styles.actionLabel}>
                      Manage or cancel in {Platform.OS === "ios" ? "App Store" : "Play Store"}
                    </Text>
                    <ChevronRight size={16} color={Colors.dark.inkFaint} />
                  </Pressable>
                )}
              </View>

              <Caption style={styles.finePrint}>
                {subState.tier === "FREE"
                  ? "Cancel anytime before your trial ends and you won't be charged."
                  : "Subscriptions are billed through the App Store or Play Store and can be cancelled there at any time."}
              </Caption>
            </ScrollView>
          )}
        </LinearGradient>
      </Modal>
    </>
  );
}

function deriveSubState(info: CustomerInfo): SubState {
  const entitlements = Object.values(info.entitlements.active);
  if (entitlements.length === 0) return FREE_STATE;

  // Prefer the entitlement with the furthest expiration if more than one is
  // active (shouldn't normally happen with a single-entitlement setup, but
  // don't crash if it does).
  const ent = entitlements.sort((a, b) => {
    const ta = a.expirationDate ? new Date(a.expirationDate).getTime() : 0;
    const tb = b.expirationDate ? new Date(b.expirationDate).getTime() : 0;
    return tb - ta;
  })[0];

  const productId = (ent.productIdentifier || "").toLowerCase();
  const tier: Tier = productId.includes("annual") || productId.includes("year") ? "ANNUAL" : "MONTHLY";

  return {
    tier,
    willRenew: !!ent.willRenew,
    isTrial: ent.periodType === "TRIAL",
    expirationLabel: ent.expirationDate ? formatDate(ent.expirationDate) : null,
    store: ent.store || null,
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const yyyy = d.getFullYear();
  return `${dd} ${month} ${yyyy}`;
}

function tierDisplayName(tier: Tier): string {
  if (tier === "ANNUAL") return "Annual plan";
  if (tier === "MONTHLY") return "Monthly plan";
  return "Free plan";
}

function storeLabel(store: string): string {
  switch (store) {
    case "APP_STORE":
      return "App Store";
    case "PLAY_STORE":
      return "Play Store";
    case "PROMOTIONAL":
      return "promotional access";
    case "STRIPE":
      return "Stripe";
    default:
      return store;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // Settings list card
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    overflow: "hidden",
  },
  cardGlow: { ...StyleSheet.absoluteFillObject },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.coralSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  cardTextCol: { flex: 1 },
  cardEyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: Colors.dark.inkMuted },
  cardTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.ink, marginTop: 2 },

  // Sheet chrome
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: Colors.dark.ink },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: Colors.dark.coralSoft,
  },
  retryLabel: { fontSize: 14, fontWeight: "700", color: Colors.dark.coral },

  sheetScroll: { paddingHorizontal: spacing.lg },

  // Hero status card — gradient surface, dark warm ink text throughout.
  statusCard: {
    borderRadius: radii.lg,
    height: 256,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(36, 26, 56, 0.10)",
  },
  statusCardInner: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  statusTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: ON_GRADIENT.chipBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: ON_GRADIENT.chipBorder,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: ON_GRADIENT.ink },
  statusHeadline: { fontSize: 28, fontWeight: "800", color: ON_GRADIENT.ink, marginTop: spacing.md },
  statusSub: { fontSize: 14, color: ON_GRADIENT.muted, marginTop: spacing.xs, lineHeight: 20 },
  statusDivider: { height: 1, backgroundColor: ON_GRADIENT.divider, marginTop: spacing.md, marginBottom: spacing.sm },
  statusStore: { fontSize: 12, fontWeight: "600", color: ON_GRADIENT.faint },

  perkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: spacing.md,
  },
  perkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: ON_GRADIENT.chipBg,
    borderWidth: 1,
    borderColor: ON_GRADIENT.chipBorder,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  perkChipText: { fontSize: 11, fontWeight: "700", color: ON_GRADIENT.ink },

  inlineError: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
  },

  // Primary CTA — standard button height, brand gradient fill, dark ink
  // text/icon so it stays legible against the pale gradient.
  primaryBtnCard: {
    marginTop: spacing.lg,
    height: 54,
    borderRadius: radii.sm,
    overflow: "hidden",
    shadowColor: Colors.dark.coral,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnLabel: { fontSize: 15, fontWeight: "800", letterSpacing: 0.2, color: ON_GRADIENT.ink },

  secondaryBtn: {
    height: 54,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: Colors.dark.borderStrong,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  secondaryBtnLabel: { fontSize: 14, fontWeight: "700", letterSpacing: 0.2, color: Colors.dark.ink },

  bestPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.lg,
    alignSelf: "center",
  },
  bestPlanText: { fontSize: 14, fontWeight: "600", color: Colors.dark.ink },

  actionsGroup: {
    marginTop: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  actionRowLast: { borderBottomWidth: 0 },
  actionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.dark.ink },

  finePrint: { textAlign: "center", marginTop: spacing.lg },
});