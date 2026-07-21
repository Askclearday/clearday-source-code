// Clearday — single dark theme, built from the app icon's gradient.
// Field names are kept compatible with existing call sites (coral, sage, dusk,
// cream, etc.) even though the actual hues have changed — this lets every other
// screen in the app go dark automatically just by importing this file, with zero
// per-screen edits required.

const palette = {
  // Backgrounds
  cream: "#0B0B0D",        // primary app background (was warm cream, now near-black)
  creamDeep: "#151518",    // slightly elevated background (badges, pills, empty states)
  surface: "#19191D",      // cards
  surfaceElevated: "#212126",
  surfaceBorder: "#26262C", // alias, some call sites use this instead of border

  // Brand gradient, sampled from the app icon: pink -> violet -> cyan
  pink: "#F472D0",
  violet: "#7C7CF0",
  cyan: "#3EE6D8",

  // Primary accent (was "coral") — now the violet from the gradient's midpoint
  coral: "#7C7CF0",
  coralDeep: "#6363D1",
  coralSoft: "rgba(124,124,240,0.16)",
  // Aliases for brief.tsx / onboarding phone-preview, which reference
  // "accent"/"accentDeep" from the old two-theme (morning/evening) system.
  // Same values as coral/coralDeep — just a second name for the same color.
  accent: "#7C7CF0",
  accentDeep: "#6363D1",

  // Secondary accent (was "sage") — kept greenish for success/complete states
  sage: "#34D399",
  sageDeep: "#22B383",
  sageSoft: "rgba(52,211,153,0.16)",

  // Tertiary accent (was "dusk") — now the cyan endpoint, used for note-source badges etc.
  dusk: "#3EE6D8",
  duskDeep: "#2BC3B7",
  duskSoft: "rgba(62,230,216,0.16)",

  // Text
  ink: "#F5F5F7",
  inkMuted: "#9B9BA5",
  inkFaint: "#6E6E78",

  // Borders & dividers
  border: "#26262C",
  borderStrong: "#34343B",

  // Functional
  warn: "#FBBF24",
  success: "#34D399",
  danger: "#F87171",
};

export type ThemeMode = "morning" | "evening";

export default {
  light: {
    ...palette,
    text: palette.ink,
    background: palette.cream,
    tint: palette.coral,
    tabIconDefault: palette.inkFaint,
    tabIconSelected: palette.coral,
  },
  dark: {
    ...palette,
    text: palette.ink,
    background: palette.cream,
    tint: palette.coral,
    tabIconDefault: palette.inkFaint,
    tabIconSelected: palette.coral,
  },
  // Back-compat aliases: screens still reference Colors.morning / Colors.evening
  // (leftover from the old two-theme system). Both now just point at the single
  // dark palette so nothing crashes, with bg gradient stops added for LinearGradient use.
  morning: {
    ...palette,
    bgTop: palette.cream,
    bgMid: "#101013",
    bgBottom: palette.creamDeep,
  },
  evening: {
    ...palette,
    bgTop: palette.cream,
    bgMid: "#101013",
    bgBottom: palette.creamDeep,
  },
  // Brand gradient stops for LinearGradient — hero screens, primary buttons, onboarding.
  brandGradient: [palette.pink, palette.violet, palette.cyan] as const,
  // Single dark surface gradient used for full-screen brief/overlay/onboarding
  // backgrounds — replaces the old separate morning/evening palettes.
  surfaceGradient: [palette.cream, "#101013", palette.creamDeep] as const,
  surfaceBlack: [palette.cream, "#000000", palette.creamDeep] as const,
};