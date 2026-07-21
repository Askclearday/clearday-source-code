// Clearday — typography tokens. Larger, legible-at-a-glance sizes for half-asleep reading.
import { Platform } from "react-native";

export const typography = {
  // Display — brief title, hero numbers
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800" as const },
  display2: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const },

  // Brief body — larger than usual since users may be half-asleep
  brief: { fontSize: 22, lineHeight: 32, fontWeight: "400" as const },
  briefLarge: { fontSize: 26, lineHeight: 38, fontWeight: "400" as const },

  // Headings
  h1: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
  h3: { fontSize: 17, lineHeight: 23, fontWeight: "600" as const },

  // Body
  body: { fontSize: 16, lineHeight: 23, fontWeight: "400" as const },
  bodyLg: { fontSize: 18, lineHeight: 25, fontWeight: "400" as const },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },

  // Meta / captions
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: "600" as const },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const shadows = {
  card: Platform.select({
    ios: { shadowColor: "#2C2418", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12 },
    android: { elevation: 3 },
  }),
  elevated: Platform.select({
    ios: { shadowColor: "#2C2418", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 20 },
    android: { elevation: 6 },
  }),
  overlay: Platform.select({
    ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 30 },
    android: { elevation: 12 },
  }),
};
