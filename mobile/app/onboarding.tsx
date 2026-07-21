// Onboarding flow for Clearday — 9 sequential screens (hero + 8-step wizard).
// Fixed header (progress + title) and fixed footer (continue button) on every
// step except the subscription step, which is a full-bleed custom screen
// with no header/progress bar. Hardware back navigates backward through the
// wizard. Each step gates "Continue" until its required action is completed.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  ImageBackground,
  Image,
  BackHandler,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  Volume2,
  Check,
  Mic,
  MapPin,
  Bell,
  Layers,
  ArrowRight,
  User,
  Square,
  Play,
  Clock,
  Plus,
  X,
  Sun,
  Moon,
} from "lucide-react-native";

import Colors from "@/constants/colors";
import { radii, spacing, typography } from "@/constants/theme";
import { Button, Card, Pill, H1, H2, BodyText, Caption } from "@/components/ui";
import { DarkTimePicker } from "@/components/onboarding/DarkTimePicker";
import StepSubscription from "@/components/onboarding/StepSubscription";
import { useApp } from "@/lib/app-context";
import * as tts from "@/lib/tts";
import * as perms from "@/lib/permissions";
import type { BriefMode, OnboardingReason, VoiceInfo } from "@/lib/types";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// Brand gradient — used on every primary "Get started" style CTA, including
// the subscription screen's primary button, so the whole flow feels like one
// continuous, premium design language.
const GRADIENT_COLORS = ["#F3E6FC", "#CABEF9", "#CABEF9", "#75D2EE", "#70BDCC"] as const;
const GRADIENT_LOCATIONS = [0, 0.25, 0.5, 0.75, 1] as const;
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 0 }; // 90deg, left → right

// TODO: OnboardingReason (in @/lib/types) still only declares the original 6
// ids. It needs to be widened to include the ids below before this compiles
// clean — paste that file back and we'll batch it in one shot. Cast here in
// the meantime so this file isn't blocked on that.
const REASONS = [
  { id: "forget_things", label: "I forget things" },
  { id: "plan_better", label: "Plan better" },
  { id: "daily_reset", label: "Daily reset" },
  { id: "calm_mornings", label: "I want calmer mornings" },
  { id: "stay_organized", label: "To stay organized" },
  { id: "reduce_anxiety", label: "To reduce anxiety" },
  { id: "save_time", label: "Save more time" },
  { id: "stay_on_top_of_tasks", label: "I want to stay on top of tasks" },
  { id: "improve_focus", label: "Improve my focus" },
  { id: "build_routine", label: "Build a routine" },
  { id: "reduce_overwhelm", label: "I feel overwhelmed" },
  { id: "track_goals", label: "To track my goals" },
  { id: "better_sleep", label: "Build sleep habits" },
  { id: "stay_informed", label: "Stay informed" },
  { id: "work_life_balance", label: "I want better work-life balance" },
  { id: "stop_procrastinating", label: "Stop procrastinating" },
  { id: "busy_family", label: "I'm managing a busy family" },
  { id: "student_life", label: "I'm a student staying organized" },
  { id: "new_job", label: "I just started a new job or role" },
  { id: "other", label: "Something else" },
] as { id: OnboardingReason; label: string }[];

// Android-only permission ids — skipped in the "required" check on iOS.
const ANDROID_ONLY_PERMS: perms.PermissionId[] = ["battery"];
const ALL_PERMS: perms.PermissionId[] = [
  "notifications",
  "microphone",
  "location",
  "battery",
];
const REQUIRED_PERMS: perms.PermissionId[] = ALL_PERMS.filter(
  (id) => Platform.OS === "android" || !ANDROID_ONLY_PERMS.includes(id)
);

// Static chrome (title/subtitle) for each wizard step — rendered in the fixed
// header, never inside the scrollable area. Step 7 (subscription) has no
// entry on purpose: that screen renders its own full-bleed layout with no
// header and no progress dots.
const STEP_CHROME: Record<number, { title: string; subtitle: string }> = {
  1: {
    title: "Tell me about you",
    subtitle: "Your name makes the brief feel personal. Age helps me tune the tone.",
  },
  2: {
    title: "What brought you here?",
    subtitle: "Pick everything that applies — this helps us tune your brief.",
  },
  3: {
    title: "Let's set up permissions",
    subtitle: "Every permission below is needed for your brief to work correctly.",
  },
  4: {
    title: "Pick your brief voice",
    subtitle: "We've preselected a voice for you — tap any card to preview and choose it.",
  },
  5: {
    title: "When should your brief arrive?",
    subtitle: "Pick any time — we'll deliver your brief then.",
  },
  6: {
    title: "This is your brief",
    subtitle: "Exactly how your Daily Brief will appear on your phone, every single day. See it wherever you are—no need to open the app to get your reminders.",
  },
  8: {
    title: "You're all set",
    subtitle: "Here's what we've set up for you.",
  },
};

export default function OnboardingScreen() {
  const { completeOnboarding, previewBrief } = useApp();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>(0);
  const [reasons, setReasons] = useState<OnboardingReason[]>(["daily_reset"]); // pre-selected default
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [permStates, setPermStates] = useState<Record<string, boolean>>({});
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [voicePreviewPlayed, setVoicePreviewPlayed] = useState(false);
  const [briefTime, setBriefTime] = useState<Date>(defaultBriefTime());
  const [modeOverride, setModeOverride] = useState<BriefMode | null>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<BriefMode>("morning");
  const [usedFallback, setUsedFallback] = useState(false);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hero-screen "try it out for free" demo — a full-screen, chrome-free
  // preview using the exact same phone-frame component as step 6. There's no
  // way to advance the real wizard from here — the only footer action ("Get
  // started") sends the person to the first real onboarding screen. Fully
  // separate state from the wizard's own step-6 preview so opening/closing
  // it can't interfere with the real flow.
  const [demoVisible, setDemoVisible] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoText, setDemoText] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState<BriefMode>("morning");
  const [demoFallback, setDemoFallback] = useState(false);
  const [demoPlaying, setDemoPlaying] = useState(false);

  const hasAutoPlayedSample = useRef(false);

  // ---- Hardware back: step backward through the wizard instead of exiting ----
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (demoVisible) {
        closeDemo();
        return true;
      }
      if (step > 0) {
        setStep((s) => (s - 1) as Step);
        return true; // handled — don't exit / don't let router pop
      }
      return false; // on the hero screen, allow default behavior
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, demoVisible]);

  // Load voices when we reach the voice step, then curate + preselect + auto-preview.
  useEffect(() => {
    if (step === 4 && voices.length === 0) {
      setVoicesLoading(true);
      tts.getAvailableVoices()
        .then((v) => setVoices(v))
        .catch(() => setVoices([]))
        .finally(() => setVoicesLoading(false));
    }
  }, [step, voices.length]);

  const preferredMaleId = useMemo(() => tts.getPreferredMaleVoiceId(voices), [voices]);
  const curatedVoices = useMemo(
    () => curateVoices(voices, preferredMaleId),
    [voices, preferredMaleId]
  );

  useEffect(() => {
    if (curatedVoices.length > 0 && !selectedVoiceId) {
      // Default = the deepest available MALE voice specifically — never
      // female, never an "unknown"/neutral one. curateVoices() pins this
      // voice to the front of the list whenever one is found, so it's
      // guaranteed to be present and selectable here regardless of how
      // many total voices the device reports.
      const defaultVoice =
        curatedVoices.find((v) => v.id === preferredMaleId) ?? curatedVoices[0];

      setSelectedVoiceId(defaultVoice.id);
      // Auto-preview the preselected voice so the "must actually play" gate
      // is satisfied without forcing an extra tap — reduces friction.
      tts.previewVoice(defaultVoice.id, {
        onDone: () => setVoicePreviewPlayed(true),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curatedVoices, preferredMaleId]);

  // Stop any in-flight speech the moment we navigate away from whichever
  // step started it (voice preview on step 4, sample playback on step 6).
  // Cleanup fires both on step change and on unmount.
  useEffect(() => {
    return () => {
      tts.stopSpeaking();
      setSamplePlaying(false);
    };
  }, [step]);

  const selectAndPreview = (voice: CuratedVoice) => {
    setSelectedVoiceId(voice.id);
    setVoicePreviewPlayed(false);
    tts.previewVoice(voice.id, {
      onDone: () => setVoicePreviewPlayed(true),
    });
  };

  // Escape hatch for devices/emulators with zero installed TTS voices —
  // lets the user proceed with expo-speech's platform default instead of
  // getting stuck on a step that can never satisfy its own gate.
  const useSystemDefaultVoice = () => {
    setSelectedVoiceId("system-default");
    setVoicePreviewPlayed(true);
  };

  const inferredMode: BriefMode = useMemo(() => {
    if (modeOverride) return modeOverride;
    return briefTime.getHours() < 14 ? "morning" : "evening";
  }, [briefTime, modeOverride]);

  const toggleReason = (r: OnboardingReason) => {
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const requestPerm = async (id: perms.PermissionId) => {
    const granted = await perms.requestPermission(id);
    setPermStates((s) => ({ ...s, [id]: granted }));
  };

  const runPreview = async () => {
    setPreviewing(true);
    setPreviewText(null);
    try {
      const result = await previewBrief();
      setPreviewText(result.text);
      setPreviewMode(result.mode);
      setUsedFallback(result.usedFallback);
    } catch (e) {
      // Fail quietly here — the phone preview shows a retry affordance if there's no text.
    } finally {
      setPreviewing(false);
    }
  };

  // Auto-play the sample the moment we land on step 6, once text is ready.
  useEffect(() => {
    if (step === 6 && previewText && !hasAutoPlayedSample.current) {
      hasAutoPlayedSample.current = true;
      playSample();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, previewText]);

  const playSample = () => {
    if (!previewText) return;
    setSamplePlaying(true);
    tts.speakBrief(previewText, selectedVoiceId === "system-default" ? null : selectedVoiceId, {
      onDone: () => setSamplePlaying(false),
    });
  };

  const toggleSamplePlayback = () => {
    if (samplePlaying) {
      tts.stopSpeaking();
      setSamplePlaying(false);
    } else {
      playSample();
    }
  };

  // ---- Hero "try it out for free" demo ----
  // Fetches its own sample brief and auto-plays it inside the phone-frame
  // preview component — the same visual used on step 6.
  const openDemo = async () => {
    setDemoVisible(true);
    setDemoLoading(true);
    setDemoText(null);
    setDemoPlaying(false);
    try {
      const result = await previewBrief();
      setDemoText(result.text);
      setDemoMode(result.mode);
      setDemoFallback(result.usedFallback);
      setDemoPlaying(true);
      tts.speakBrief(result.text, null, {
        onDone: () => setDemoPlaying(false),
      });
    } catch (e) {
      // Screen shows a friendly fallback message when demoText stays null.
    } finally {
      setDemoLoading(false);
    }
  };

  const closeDemo = () => {
    tts.stopSpeaking();
    setDemoPlaying(false);
    setDemoVisible(false);
  };

  const toggleDemoPlayback = () => {
    if (!demoText) return;
    if (demoPlaying) {
      tts.stopSpeaking();
      setDemoPlaying(false);
    } else {
      setDemoPlaying(true);
      tts.speakBrief(demoText, null, { onDone: () => setDemoPlaying(false) });
    }
  };

  // Leaves the demo and drops the person onto the first real onboarding
  // screen (Tell me about you) — not back to the hero.
  const startFromDemo = () => {
    tts.stopSpeaking();
    setDemoPlaying(false);
    setDemoVisible(false);
    setStep(1);
  };

  const finish = async () => {
    if (!name.trim()) {
      Alert.alert("Add your name", "Your name is what makes the brief feel personal.");
      setStep(1);
      return;
    }
    setSaving(true);
    tts.stopSpeaking();
    try {
      await completeOnboarding({
        name: name.trim(),
        age: age ? parseInt(age, 10) : null,
        onboarding_reasons: reasons,
        brief_time: formatTime(briefTime),
        brief_mode_override: modeOverride,
        location_permission_granted: !!permStates.location,
        voice_id: selectedVoiceId === "system-default" ? null : selectedVoiceId,
        chime_enabled: true,
        chime_sound: "soft_chime",
      });
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Setup failed", "Something went wrong saving your preferences. Try again.");
      setSaving(false);
    }
  };

  // ---- Per-step gating: what "Continue" requires before it activates ----
  const canContinue = useMemo(() => {
    switch (step) {
      case 1:
        return name.trim().length > 0;
      case 2:
        return reasons.length > 0;
      case 3:
        return REQUIRED_PERMS.every((id) => permStates[id]);
      case 4:
        return !!selectedVoiceId && voicePreviewPlayed;
      case 5:
        return true; // always has a default time
      case 6:
        return true; // passive phone-frame preview — nothing to gate on
      case 8:
        return true; // never blocked — user should always be able to finish
      default:
        return true;
    }
  }, [step, reasons, name, permStates, voicePreviewPlayed]);

  const goNext = () => {
    if (step === 5) {
      // Kick off generation now so it's ready by the time the user reaches
      // the preview screen — no visible "Generate" button needed there.
      hasAutoPlayedSample.current = false;
      runPreview();
    }
    setStep((s) => (Math.min(8, (s as number) + 1)) as Step);
  };

  const footerLabel =
    step === 6 ? "Looks good" : step === 8 ? (saving ? "Finishing up…" : "Go to home") : "Continue";
  const footerAction = step === 8 ? finish : goNext;

  // Step 0 is the full-bleed hero screen — no shared chrome, own layout.
  // When the demo is open, it takes over as a full-screen, chrome-free
  // phone-frame preview instead of the hero.
  if (step === 0) {
    if (demoVisible) {
      return (
        <LinearGradient colors={Colors.surfaceGradient} style={styles.flex}>
          <View style={[styles.demoTopBar, { paddingTop: insets.top + spacing.md }]}>
            <Pressable onPress={closeDemo} style={styles.demoCloseBtn} hitSlop={10}>
              <X size={18} color={Colors.dark.ink} />
            </Pressable>
          </View>

          <View style={styles.demoBody}>
            <H1 style={styles.demoTitle}>This is your brief</H1>
            <BodyText style={styles.demoSubtitle}>
            Exactly how your Daily Brief will appear on your phone, every single day. See it wherever you are—no need to open the app to get your reminders.</BodyText>

            <PhoneBriefPreview
              name={name}
              previewing={demoLoading}
              previewText={demoText}
              previewMode={demoMode}
              usedFallback={demoFallback}
              playing={demoPlaying}
              onTogglePlay={toggleDemoPlayback}
              onRetry={openDemo}
            />
          </View>

          <View style={[styles.footerFixed, { paddingBottom: insets.bottom + spacing.md }]}>
            <Button label="Get started" onPress={startFromDemo} style={styles.footerBtn} />
          </View>
        </LinearGradient>
      );
    }
    return <StepHero onNext={() => setStep(1)} onTryDemo={openDemo} />;
  }

  // Step 7 (subscription) is a full-bleed custom screen: no fixed header, no
  // progress dots, no shared footer — it drives its own navigation. Imported
  // from components/onboarding/StepSubscription instead of being defined here.
  if (step === 7) {
    return <StepSubscription onAdvance={goNext} />;
  }

  const chrome = STEP_CHROME[step];

  return (
    <LinearGradient colors={Colors.surfaceGradient} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={["bottom"]}>
        {/* ---------- FIXED HEADER (never scrolls) ---------- */}
        <View style={[styles.headerFixed, { paddingTop: insets.top + 20 }]}>
          <ProgressDots step={step} />
          <H1 style={styles.headerTitle}>{chrome.title}</H1>
          <BodyText style={styles.headerSubtitle}>{chrome.subtitle}</BodyText>
        </View>

        {/* ---------- SCROLLABLE BODY (only the variable content) ---------- */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && (
            <StepBasicInfo name={name} setName={setName} age={age} setAge={setAge} />
          )}

          {step === 2 && <StepReasons reasons={reasons} toggleReason={toggleReason} />}

          {step === 3 && <StepPermissions permStates={permStates} requestPerm={requestPerm} />}

          {step === 4 && (
            <StepVoice
              curated={curatedVoices}
              selectedVoiceId={selectedVoiceId}
              onSelect={selectAndPreview}
              voicesLoading={voicesLoading}
              onUseDefault={useSystemDefaultVoice}
            />
          )}

          {step === 5 && (
            <StepBriefTime
              briefTime={briefTime}
              setBriefTime={setBriefTime}
              timePickerOpen={timePickerOpen}
              setTimePickerOpen={setTimePickerOpen}
              inferredMode={inferredMode}
              modeOverride={modeOverride}
              setModeOverride={setModeOverride}
            />
          )}

          {step === 6 && (
            <PhoneBriefPreview
              name={name}
              previewing={previewing}
              previewText={previewText}
              previewMode={previewMode}
              usedFallback={usedFallback}
              playing={samplePlaying}
              onTogglePlay={toggleSamplePlayback}
              onRetry={runPreview}
            />
          )}

          {step === 8 && (
            <StepDone
              name={name}
              reasons={reasons}
              briefTime={briefTime}
              inferredMode={inferredMode}
              voiceLabel={
                curatedVoices.find((v) => v.id === selectedVoiceId)?.displayName ??
                "Default voice"
              }
            />
          )}
        </ScrollView>

        {/* ---------- FIXED FOOTER (never scrolls, always same position) ---------- */}
        <View style={styles.footerFixed}>
          <Button
            label={footerLabel}
            onPress={footerAction}
            disabled={!canContinue}
            loading={step === 8 && saving}
            style={styles.footerBtn}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ---------- Step 0: Hero welcome ----------
// Text-free by design: just the mark and the two CTAs. The "try it out for
// free" path lets someone hear the product before they're asked to commit.
function StepHero({ onNext, onTryDemo }: { onNext: () => void; onTryDemo: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <ImageBackground
      source={require("../assets/images/bg.png")}
      style={styles.heroBg}
      resizeMode="cover"
    >
      <View style={styles.heroScrim} />
      {/* Logo pinned at the same vertical position as the reference screenshot's mark */}
      <View style={[styles.heroLogoAbsolute, { top: "32%" }]}>
        <Image
          source={require("../assets/images/icon2.png")}
          style={styles.heroLogo}
          resizeMode="contain"
        />
      </View>

      <View style={[styles.heroBottomWrap, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable onPress={onNext} style={({ pressed }) => [styles.heroBtnPrimary, pressed && { opacity: 0.9 }]}>
          <LinearGradient
            colors={GRADIENT_COLORS}
            locations={GRADIENT_LOCATIONS}
            start={GRADIENT_START}
            end={GRADIENT_END}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroBtnContent}>
            <Text style={styles.heroBtnLabel}>GET STARTED</Text>
            <ArrowRight size={18} color="#000000" style={{ marginLeft: 8 }} />
          </View>
        </Pressable>

        <Pressable
          onPress={onTryDemo}
          style={({ pressed }) => [styles.heroBtnSecondary, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.heroBtnSecondaryLabel}>PREVIEW YOUR BRIEF</Text>
        </Pressable>
      </View>
    </ImageBackground>
  );
}

// ---------- Progress dots (endowed-progress effect: hero counts as done) ----------
function ProgressDots({ step }: { step: Step }) {
  // 9 total segments — the hero screen (already passed) is segment 0 and is
  // always rendered as "done", so the bar never starts visually empty.
  const dotSteps = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <View style={styles.dotsRow}>
      {dotSteps.map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === step ? styles.dotActive : i < step || i === 0 ? styles.dotDone : null,
          ]}
        />
      ))}
    </View>
  );
}

// ---------- Step 1: Basic info (premium card) ----------
function StepBasicInfo({
  name,
  setName,
  age,
  setAge,
}: {
  name: string;
  setName: (s: string) => void;
  age: string;
  setAge: (s: string) => void;
}) {
  return (
    <View style={styles.premiumCard}>
      <LinearGradient
        colors={[Colors.dark.coral + "33", "transparent"]}
        style={styles.premiumCardGlow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.premiumIconRow}>
        <View style={styles.premiumIconWrap}>
          <User size={20} color={Colors.dark.coral} />
        </View>
        <Text style={styles.premiumEyebrow}>ABOUT YOU</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>YOUR NAME</Text>
        <View style={styles.inputWrap}>
          <LinearGradient
            colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)"]}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Alex"
            placeholderTextColor={Colors.dark.inkFaint}
            style={styles.premiumInput}
            autoFocus
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>AGE (OPTIONAL)</Text>
        <View style={styles.inputWrap}>
          <LinearGradient
            colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)"]}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <TextInput
            value={age}
            onChangeText={setAge}
            placeholder="e.g. 28"
            placeholderTextColor={Colors.dark.inkFaint}
            keyboardType="numeric"
            style={styles.premiumInput}
          />
        </View>
      </View>
    </View>
  );
}

// ---------- Step 2: Reasons ----------
function StepReasons({
  reasons,
  toggleReason,
}: {
  reasons: OnboardingReason[];
  toggleReason: (r: OnboardingReason) => void;
}) {
  return (
    <View style={styles.pillsWrap}>
      {REASONS.map((r) => (
        <Pill key={r.id} label={r.label} selected={reasons.includes(r.id)} onPress={() => toggleReason(r.id)} />
      ))}
    </View>
  );
}

// ---------- Step 3: Permissions ----------
function StepPermissions({
  permStates,
  requestPerm,
}: {
  permStates: Record<string, boolean>;
  requestPerm: (id: perms.PermissionId) => void;
}) {
  const items: { id: perms.PermissionId; icon: React.ReactNode }[] = [
    { id: "notifications", icon: <Bell size={22} color={Colors.dark.coral} /> },
    { id: "microphone", icon: <Mic size={22} color={Colors.dark.coral} /> },
    { id: "location", icon: <MapPin size={22} color={Colors.dark.coral} /> },
    { id: "battery", icon: <Volume2 size={22} color={Colors.dark.coral} /> },
  ];

  return (
    <>
      {items.map(({ id, icon }) => {
        const info = perms.PERMISSION_EXPLANATIONS[id];
        const granted = permStates[id];
        const isAndroidOnly = id === "battery";
        const notApplicable = isAndroidOnly && Platform.OS !== "android";
        return (
          <Card key={id} style={styles.permCard}>
            <View style={styles.permRow}>
              <View style={styles.permIcon}>{icon}</View>
              <View style={styles.permText}>
                <Text style={styles.permTitle}>
                  {info.title}
                  {notApplicable ? "  (Android only)" : ""}
                </Text>
                <Text style={styles.permReason}>{info.reason}</Text>
              </View>
            </View>
            <Pressable
              style={[styles.permBtn, (granted || notApplicable) ? styles.permBtnDone : null]}
              onPress={() => !notApplicable && requestPerm(id)}
              disabled={notApplicable}
            >
              <Text style={styles.permBtnLabel}>
                {notApplicable ? "N/A" : granted ? "Granted" : "Allow"}
              </Text>
              {granted && !notApplicable ? <Check size={16} color="#fff" /> : null}
            </Pressable>
          </Card>
        );
      })}
    </>
  );
}

// ---------- Step 4: Voice selection ----------
type CuratedVoice = {
  id: string;
  displayName: string;
  language: string | null;
  gender: VoiceInfo["gender"];
};

function curateVoices(voices: VoiceInfo[], preferredId?: string | null): CuratedVoice[] {
  const dedupe = (list: VoiceInfo[]) => {
    const seen = new Map<string, VoiceInfo>();
    for (const v of list) {
      // Strip network/local engine-variant suffixes so e.g.
      // "en-au-x-aub-local" and "en-au-x-aub-network" collapse to one entry.
      const key = v.id.toLowerCase().replace(/-(local|network)$/, "");
      const existing = seen.get(key);
      // Prefer the -local variant when both exist (works offline).
      if (!existing || v.id.toLowerCase().endsWith("-local")) {
        seen.set(key, v);
      }
    }
    return Array.from(seen.values());
  };

  let ordered = dedupe(voices);

  // Some devices report hundreds of voices (mostly non-English locale
  // variants), so the male-preference default can easily live outside the
  // first 12 we show. Pin it to the front here so it always survives the
  // slice below and is guaranteed visible/selectable in the UI.
  if (preferredId) {
    const idx = ordered.findIndex((v) => v.id === preferredId);
    if (idx > 0) {
      const [preferred] = ordered.splice(idx, 1);
      ordered = [preferred, ...ordered];
    }
  }

  return ordered.slice(0, 12).map((v, i) => ({
    id: v.id,
    displayName: v.name?.trim() ? v.name : `Voice ${i + 1}`,
    language: v.language ?? null,
    gender: v.gender,
  }));
}

function StepVoice({
  curated,
  selectedVoiceId,
  onSelect,
  voicesLoading,
  onUseDefault,
}: {
  curated: CuratedVoice[];
  selectedVoiceId: string | null;
  onSelect: (v: CuratedVoice) => void;
  voicesLoading: boolean;
  onUseDefault: () => void;
}) {
  if (voicesLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.dark.coral} />
        <Caption>Loading available voices…</Caption>
      </View>
    );
  }

  if (curated.length === 0) {
    return (
      <Card style={styles.permCard}>
        <Text style={styles.permTitle}>No extra voices found on this device</Text>
        <Text style={styles.permReason}>
          We couldn't detect any installed text-to-speech voices. You can still continue with
          your device's default voice.
        </Text>
        <Pressable style={[styles.permBtn, { marginTop: spacing.md }]} onPress={onUseDefault}>
          <Text style={styles.permBtnLabel}>Use system default voice</Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <>
      {curated.map((v) => (
        <VoiceRow key={v.id} voice={v} selected={selectedVoiceId === v.id} onSelect={() => onSelect(v)} />
      ))}
    </>
  );
}

function VoiceRow({
  voice,
  selected,
  onSelect,
}: {
  voice: CuratedVoice;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.voiceRow, selected && styles.voiceRowSel, pressed && { opacity: 0.85 }]}
      onPress={onSelect}
    >
      <View style={styles.previewBtnCircle}>
        <Volume2 size={18} color={Colors.dark.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.voiceName}>{voice.displayName}</Text>
        <Caption>{voice.language ?? "English"}</Caption>
      </View>
      {selected && (
        <View style={styles.checkBadge}>
          <Check size={14} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

// ---------- Step 5: Brief time ----------
function StepBriefTime({
  briefTime,
  setBriefTime,
  timePickerOpen,
  setTimePickerOpen,
  inferredMode,
  modeOverride,
  setModeOverride,
}: {
  briefTime: Date;
  setBriefTime: (d: Date) => void;
  timePickerOpen: boolean;
  setTimePickerOpen: (b: boolean) => void;
  inferredMode: BriefMode;
  modeOverride: BriefMode | null;
  setModeOverride: (m: BriefMode | null) => void;
}) {
  const timeLabel = briefTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <>
      <Pressable style={styles.timePicker} onPress={() => setTimePickerOpen(true)}>
        <Text style={styles.timeBig}>{timeLabel}</Text>
        <Caption>Tap to change</Caption>
      </Pressable>

      <DarkTimePicker
        visible={timePickerOpen}
        date={briefTime}
        onConfirm={(d) => {
          setBriefTime(d);
          setTimePickerOpen(false);
        }}
        onCancel={() => setTimePickerOpen(false)}
      />

      <Card style={styles.modeCard}>
        <Text style={styles.modeTitle}>How your brief will work</Text>
        <Text style={styles.modeText}>
          {inferredMode === "morning"
            ? "🌞 Morning-style — delivered at your chosen time, summarizes TODAY: today's calendar, weather, pending reminders."
            : "🌙 Evening-style — delivered at your chosen time, summarizes TOMORROW: tomorrow's calendar, forecast, what's due."}
        </Text>

        <View style={styles.modeToggleRow}>
          <Text style={styles.modeToggleLabel}>Override mode manually</Text>
          <View style={styles.togglePills}>
            <Pill label="Auto" selected={modeOverride === null} onPress={() => setModeOverride(null)} />
            <Pill label="Morning" selected={modeOverride === "morning"} onPress={() => setModeOverride("morning")} />
            <Pill label="Evening" selected={modeOverride === "evening"} onPress={() => setModeOverride("evening")} />
          </View>
        </View>
      </Card>
    </>
  );
}

// ---------- Step 6 (and hero demo): phone-frame brief preview ----------
// A border-only phone silhouette (theme-coral outline, transparent fill) with
// a structural replica of brief.tsx inside — same top bar / bottom action
// bar shape — fed with the REAL generated preview (previewBrief()), not a
// hardcoded sample. Shared between step 6 and the hero's "try it out for
// free" demo so both places show the exact same component.
//
// NOTE: only a `Colors.morning` palette was confirmed to exist in this
// codebase, so both morning and evening modes render with it for now — swap
// in `Colors.evening` here once/if that palette is added to the theme file.
function PhoneBriefPreview({
  name,
  previewing,
  previewText,
  previewMode,
  usedFallback,
  playing,
  onTogglePlay,
  onRetry,
}: {
  name: string;
  previewing: boolean;
  previewText: string | null;
  previewMode: BriefMode;
  usedFallback: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  onRetry: () => void;
}) {
  const palette = Colors.morning;
  const PeriodIcon = previewMode === "morning" ? Sun : Moon;

  return (
    <View style={styles.phoneFrameWrap}>
      {/* Border-only phone bezel — theme coral outline, no fill */}
      <View style={styles.phoneFrame}>
        <View style={styles.phoneNotch} />
        <LinearGradient
          colors={[palette.bgTop, palette.bgMid, palette.bgBottom]}
          style={styles.phoneScreenGradient}
        >
          <View style={styles.phoneTopBar}>
            <View style={styles.phoneCloseDot}>
              <X size={14} color={Colors.light.ink} />
            </View>
            <View style={styles.phoneModePill}>
              <PeriodIcon size={10} color={palette.accentDeep} />
              <Text style={styles.phoneModePillText}>
                {previewMode === "morning" ? "Morning brief" : "Evening brief"}
              </Text>
            </View>
            <View style={{ width: 26 }} />
          </View>

          {previewing || !previewText ? (
            <View style={styles.phoneLoadingWrap}>
              <ActivityIndicator color={palette.accentDeep} />
              <Text style={styles.phoneLoadingText}>
                {previewing ? "Preparing your sample…" : "Couldn't generate a sample."}
              </Text>
              {!previewing && (
                <Pressable onPress={onRetry} style={styles.phoneRetryBtn}>
                  <Text style={styles.phoneRetryLabel}>Try again</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <ScrollView style={styles.phoneScroll} showsVerticalScrollIndicator={false}>
              {/* Premium content card — mirrors the real brief screen (app/brief.tsx)
                  exactly: icon + eyebrow row, "Hi, {name}." title, fallback tag, THEN
                  the brief text — instead of the old bare title-then-text layout. */}
              <View style={styles.phonePremiumCard}>
                <View style={styles.phonePremiumIconRow}>
                  <View style={styles.phonePremiumIconWrap}>
                    <PeriodIcon size={12} color={palette.accentDeep} />
                  </View>
                  <Text style={styles.phonePremiumEyebrow}>
                    {previewMode === "morning" ? "YOUR MORNING BRIEF" : "YOUR EVENING BRIEF"}
                  </Text>
                </View>
                <Text style={styles.phoneBriefTitle}>{`Hi, ${name || "there"}.`}</Text>
                {usedFallback ? (
                  <View style={styles.phoneFallbackTag}>
                    <Text style={styles.phoneFallbackTagText}>Offline template — AI unavailable</Text>
                  </View>
                ) : null}
                <Text style={styles.phoneBriefText}>{previewText}</Text>
              </View>

              {/* Inline "Read again"/"Stop reading" pill beneath the card — same
                  pattern as the real brief screen, not just the tiny bottom-bar icon. */}
              <Pressable
                style={[styles.phoneInlinePlayBtn, playing && styles.phoneInlinePlayBtnActive]}
                onPress={onTogglePlay}
              >
                {playing ? (
                  <Square size={12} color="#fff" fill="#fff" />
                ) : (
                  <Volume2 size={13} color={palette.accentDeep} />
                )}
                <Text style={[styles.phoneInlinePlayLabel, playing && styles.phoneInlinePlayLabelActive]}>
                  {playing ? "Stop reading" : "Read again"}
                </Text>
              </Pressable>
            </ScrollView>
          )}

          <View style={styles.phoneBottomBar}>
            <View style={styles.phoneBottomAction}>
              <Clock size={14} color={palette.accentDeep} />
              <Text style={styles.phoneBottomActionLabel}>Later</Text>
            </View>
            <Pressable style={styles.phoneBottomAction} onPress={onTogglePlay} disabled={!previewText}>
              {playing ? (
                <Square size={14} color={palette.accentDeep} fill={palette.accentDeep} />
              ) : (
                <Volume2 size={14} color={palette.accentDeep} />
              )}
              <Text style={styles.phoneBottomActionLabel}>{playing ? "Stop" : "Play"}</Text>
            </Pressable>
            <View style={styles.phoneBottomAction}>
              <Plus size={14} color={palette.accentDeep} />
              <Text style={styles.phoneBottomActionLabel}>Add</Text>
            </View>
            <View style={[styles.phoneBottomAction, styles.phoneBottomActionPrimary]}>
              <Check size={14} color="#fff" />
              <Text style={[styles.phoneBottomActionLabel, { color: "#fff" }]}>OK</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <Caption style={styles.phoneFrameCaption}>
        {previewText ? "This is a live preview — tap Play to hear it in your selected voice." : " "}
      </Caption>
    </View>
  );
}

// ---------- Step 8: Done (premium summary) ----------
function StepDone({
  name,
  reasons,
  briefTime,
  inferredMode,
  voiceLabel,
}: {
  name: string;
  reasons: OnboardingReason[];
  briefTime: Date;
  inferredMode: BriefMode;
  voiceLabel: string;
}) {
  const timeLabel = briefTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const reasonLabels = reasons
    .map((r) => REASONS.find((x) => x.id === r)?.label)
    .filter(Boolean)
    .join(", ");

  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <User size={18} color={Colors.dark.coral} />, label: "Name", value: name || "—" },
    { icon: <Layers size={18} color={Colors.dark.coral} />, label: "Focus", value: reasonLabels || "—" },
    {
      icon: <Bell size={18} color={Colors.dark.coral} />,
      label: "Brief arrives",
      value: `${timeLabel} · ${inferredMode === "morning" ? "Morning" : "Evening"} style`,
    },
    { icon: <Volume2 size={18} color={Colors.dark.coral} />, label: "Voice", value: voiceLabel },
  ];

  return (
    <>
      <View style={styles.doneHeroWrap}>
        <View style={styles.doneCheckRing}>
          <View style={styles.doneCheckCircle}>
            <Check size={30} color="#fff" strokeWidth={3} />
          </View>
        </View>
      </View>

      <View style={styles.summaryCardV2}>
        {rows.map((r, i) => (
          <View
            key={r.label}
            style={[styles.summaryRowV2, i !== rows.length - 1 && styles.summaryRowV2Border]}
          >
            <View style={styles.summaryIconChip}>{r.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabelV2}>{r.label}</Text>
              <Text style={styles.summaryValueV2}>{r.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

// ---------- helpers ----------
function defaultBriefTime(): Date {
  const d = new Date();
  d.setHours(7, 30, 0, 0);
  return d;
}

function formatTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // Hero (step 0)
  heroBg: { flex: 1, width: "100%", height: "100%" },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(11,11,13,0.45)" },
  heroLogoAbsolute: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  heroLogo: { width: 160, height: 160 },
  heroBottomWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg },
  heroBtnPrimary: {
    height: 56,
    borderRadius: radii.sm,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  heroBtnContent: { flexDirection: "row", alignItems: "center" },
  heroBtnLabel: { fontSize: 15, fontWeight: "700", letterSpacing: 0.5, color: "#000000" },
  heroBtnSecondary: {
    height: 56,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  heroBtnSecondaryLabel: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5, color: "#ffffff" },

  // Hero-triggered demo (chrome-free phone-frame preview)
  demoTopBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  demoCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  demoBody: { flex: 1, alignItems: "center", paddingHorizontal: spacing.lg },
  demoTitle: { textAlign: "center", marginTop: spacing.md },
  demoSubtitle: { textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.lg, paddingHorizontal: spacing.md },

  // Fixed header / footer chrome
  headerFixed: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { marginTop: spacing.md, textAlign: "center" },
  headerSubtitle: { marginTop: spacing.sm, textAlign: "center" },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, marginTop: spacing.md,  paddingBottom: spacing.xl },
  footerFixed: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  footerBtn: {},

  // Progress dots — circular, active dot stretches into a pill.
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.dark.border },
  dotActive: { backgroundColor: Colors.dark.coral, width: 24 },
  dotDone: { backgroundColor: Colors.dark.coralDeep },

  pillsWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, justifyContent: "center" },

  // Premium "about you" card
  premiumCard: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    overflow: "hidden",
  },
  premiumCardGlow: { ...StyleSheet.absoluteFillObject },
  premiumIconRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  premiumIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.coralSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  premiumEyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: Colors.dark.inkMuted },
  field: { marginTop: spacing.md },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, color: Colors.dark.inkMuted, marginBottom: 8 },
  inputWrap: {
    borderRadius: radii.md,
    overflow: "hidden",
  },
  premiumInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 54,
    fontSize: 17,
    color: Colors.dark.ink,
  },

  permCard: { marginTop: spacing.md },
  permRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm },
  permIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.coralSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  permText: { flex: 1 },
  permTitle: { fontSize: 16, fontWeight: "600", color: Colors.dark.ink, marginBottom: 2 },
  permReason: { fontSize: 14, color: Colors.dark.inkMuted, lineHeight: 20 },
  permBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.coral,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  permBtnDone: { backgroundColor: Colors.dark.sage },
  permBtnLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  retryBtn: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8 },
  retryLabel: { color: Colors.dark.coral, fontWeight: "700" },

  voiceGroupTitle: { marginTop: spacing.md, marginBottom: spacing.sm, color: Colors.dark.ink },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: Colors.dark.surface,
    borderRadius: radii.md,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
  },
  voiceRowSel: { borderColor: Colors.dark.coral, backgroundColor: Colors.dark.coralSoft },
  voiceName: { fontSize: 15, fontWeight: "600", color: Colors.dark.ink },
  previewBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.coral,
    alignItems: "center",
    justifyContent: "center",
  },

  timePicker: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: Colors.dark.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
  },
  timeBig: { fontSize: 44, fontWeight: "800", color: Colors.dark.ink },
  modeCard: { marginTop: spacing.lg },
  modeTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.ink, marginBottom: 6 },
  modeText: { fontSize: 15, color: Colors.dark.inkMuted, lineHeight: 22 },
  modeToggleRow: { marginTop: spacing.md, flexDirection: "column", alignItems: "flex-start" },
  modeToggleLabel: { fontSize: 14, fontWeight: "600", color: Colors.dark.ink },
  togglePills: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.md },

  // ---- Step 6 / hero demo: phone-frame preview ----
  phoneFrameWrap: { alignItems: "center", marginTop: spacing.md },
  phoneFrame: {
    width: 260,
    height: 480,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.dark.coral,
    padding: 8,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  phoneNotch: {
    position: "absolute",
    top: 8,
    left: "50%",
    marginLeft: -28,
    width: 56,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.coral,
    zIndex: 2,
    opacity: 0.5,
  },
  phoneScreenGradient: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
  },
  phoneTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 6,
  },
  phoneCloseDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.6,
  },
  phoneModePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderColor: "rgba(255,255,255,0.5)",
  },
  phoneModePillEmoji: { fontSize: 10 },
  phoneModePillText: { fontSize: 10, fontWeight: "700", color: Colors.light.ink },
  phoneScroll: { flex: 1, paddingHorizontal: 14 },
  // Premium content card — scaled-down phone-frame equivalent of the real
  // brief screen's premiumCard (icon + eyebrow row, title, fallback tag).
  phonePremiumCard: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: 10,
  },
  phonePremiumIconRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  phonePremiumIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  phonePremiumEyebrow: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, color: Colors.light.ink, opacity: 0.7 },
  phoneBriefTitle: { fontSize: 17, fontWeight: "800", color: Colors.light.ink, marginBottom: 6 },
  phoneOfflineTag: { fontSize: 10, fontWeight: "700", color: Colors.light.ink, opacity: 0.6, marginBottom: 4 },
  phoneFallbackTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginBottom: 8,
  },
  phoneFallbackTagText: { fontSize: 9, fontWeight: "700", color: Colors.light.ink },
  phoneBriefText: { fontSize: 12.5, lineHeight: 18, color: Colors.light.ink, paddingBottom: 4 },
  phoneInlinePlayBtn: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.14)",
    marginTop: 4,
    marginBottom: 12,
  },
  phoneInlinePlayBtnActive: { backgroundColor: Colors.light.coral, borderColor: Colors.light.coral },
  phoneInlinePlayLabel: { fontSize: 11, fontWeight: "700", color: Colors.light.ink },
  phoneInlinePlayLabelActive: { color: "#fff" },
  phoneBottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.3)",
  },
  phoneBottomAction: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 5, borderRadius: radii.pill },
  phoneBottomActionPrimary: { backgroundColor: Colors.light.coral },
  phoneBottomActionLabel: { fontSize: 9, fontWeight: "700", color: Colors.light.ink },
  phoneFrameCaption: { marginTop: spacing.md, textAlign: "center" },
  phoneLoadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  phoneLoadingText: { fontSize: 11, color: Colors.light.ink, textAlign: "center" },
  phoneRetryBtn: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.3)" },
  phoneRetryLabel: { fontSize: 11, fontWeight: "700", color: Colors.light.ink },

  // Step 8 — premium summary
  doneHeroWrap: { alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.xl },
  doneCheckRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.dark.coralSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  doneCheckCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCardV2: {
    borderRadius: radii.lg,
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    paddingHorizontal: spacing.lg,
    overflow: "hidden",
  },
  summaryRowV2: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  summaryRowV2Border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  summaryIconChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.coralSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabelV2: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: Colors.dark.inkMuted, marginBottom: 2 },
  summaryValueV2: { fontSize: 15, fontWeight: "600", color: Colors.dark.ink },
});