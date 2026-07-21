// Shared UI primitives for Clearday — warm, calm, "morning routine" aesthetic.
import React from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  PressableProps,
} from "react-native";
import Colors from "@/constants/colors";
import { radii, spacing, typography } from "@/constants/theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = {
  variant?: ButtonVariant;
  label: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
} & PressableProps;

export function Button({ variant = "primary", label, loading, style, disabled, ...rest }: ButtonProps) {
  const palette = Colors.dark;
  const bg =
    variant === "primary" ? palette.coral
    : variant === "secondary" ? palette.sage
    : variant === "danger" ? palette.danger
    : "transparent";
  const fg = variant === "ghost" ? palette.ink : "#FFFFFF";
  const borderCol = variant === "ghost" ? palette.borderStrong : "transparent";

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: borderCol, opacity: pressed ? 0.86 : 1 },
        disabled && { opacity: 0.5 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        selected ? { backgroundColor: Colors.dark.coral, borderColor: Colors.dark.coral } : null,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.pillLabel, selected ? { color: "#fff" } : null]}>{label}</Text>
    </Pressable>
  );
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[typography.h1, { color: Colors.dark.ink }, style]}>{children}</Text>;
}

export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[typography.h2, { color: Colors.dark.ink }, style]}>{children}</Text>;
}

export function BodyText({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[typography.body, { color: Colors.dark.inkMuted }, style]}>{children}</Text>;
}

export function Caption({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[typography.caption, { color: Colors.dark.inkFaint }, style]}>{children}</Text>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function ScreenScroll({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.screen, style]}>
      <View style={styles.screenInner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.cream,
  },
  screenInner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  btn: {
    height: 54,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
  },
  btnLabel: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: Colors.dark.borderStrong,
    backgroundColor: Colors.dark.surface,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.ink,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: spacing.md,
  },
});