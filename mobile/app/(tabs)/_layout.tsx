// Tab layout — Home, Notes, Calendar, Reminders (Settings moved to Home
// header; Capture FAB moved out of the Home screen and into the center of
// this tab bar as a floating overlay button).
import { Tabs, useRouter } from "expo-router";
import { Home, NotebookPen, CalendarDays, User, Plus } from "lucide-react-native";
import React from "react";
import { View, StyleSheet, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import Colors from "@/constants/colors";

// ---- Sizing constants (per latest spec) ----------------------------------
// Default tab-bar content height (was BASE_HEIGHT = 125).
const DEFAULT_HEIGHT = 60;
// Default margin top (kept as a named constant for reference — the actual
// paddingTop applied to the bar is the derived MARGIN_TOP below, which
// supersedes this flat value per the "50% of combined height" instruction).
const DEFAULT_MARGIN_TOP = 10;

// 5% of the device's screen height, added on top of the default height to
// get the bar's card height.
const SCREEN_HEIGHT = Dimensions.get("window").height;
const SCREEN_HEIGHT_BONUS = SCREEN_HEIGHT * 0.05;

// Card height = default height (60) + 5% of screen height.
const CARD_HEIGHT = DEFAULT_HEIGHT + SCREEN_HEIGHT_BONUS;

// Margin top = 50% of the combined (default height + 5% screen height),
// i.e. half of CARD_HEIGHT.
const MARGIN_TOP = CARD_HEIGHT / 4;

// Horizontal floating margin either side of the bar.
const SIDE_MARGIN = 48;

// Same brand gradient used across onboarding + the old FAB — diagonal
// top-left -> bottom-right instead of a flat horizontal 19191D.
const GRADIENT_COLORS = ["#19191D", "#19191D", "#19191D", "#19191D", "#19191D"] as const;
const GRADIENT_LOCATIONS = [0, 0.25, 0.5, 0.75, 1] as const;
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 1 };

const CAPTURE_SIZE = 60;

function GlassTabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Fades into the same tail color the page's own surfaceGradient ends
          on, so the bar looks like a continuation of the screen behind it
          rather than a hard-edged panel. */}
      <LinearGradient
        colors={["transparent", Colors.surfaceGradient[Colors.surfaceGradient.length - 1]]}
        style={StyleSheet.absoluteFill}
      />
      {/* Heavy glass blur */}
      <BlurView intensity={99} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Faint dark veil to keep contrast under the labels */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.65)" }]} />
      {/* Top hairline */}
      <View style={styles.topHairline} />
    </View>
  );
}

function GlassTabIcon({
  focused,
  Icon,
}: {
  focused: boolean;
  Icon: React.ComponentType<{ color: string; size: number; strokeWidth?: number }>;
}) {
  return (
    <View style={styles.iconPillWrap}>
    
      <Icon
        color={focused ? "#C9C9D3" : Colors.dark.inkMuted}
        size={22}
        strokeWidth={focused ? 2.3 : 1.8}
      />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = Math.max(insets.bottom, 8);
  // Bar height now derives from CARD_HEIGHT (default height + 5% screen
  // height) instead of the old flat BASE_HEIGHT constant.
  const barHeight = CARD_HEIGHT + bottomInset;

  return (
    <View style={styles.flex}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor:  "#C9C9D3",
          tabBarInactiveTintColor: Colors.dark.inkMuted,
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabLabel,
          sceneStyle: { backgroundColor: Colors.dark.background },
          tabBarStyle: {
            position: "absolute",
            left: SIDE_MARGIN,
            right: SIDE_MARGIN,
            bottom: 0,
            height: barHeight,
            paddingBottom: bottomInset,
            // paddingTop now uses the derived MARGIN_TOP (50% of CARD_HEIGHT)
            // instead of the old flat 20.
            paddingTop: MARGIN_TOP,
            backgroundColor: "transparent",
            borderTopWidth: 0,

            borderTopLeftRadius: 56,
            borderTopRightRadius: 56,
            // Was "hidden" — needs to be visible so the capture button can
            // poke up above the bar instead of getting clipped.
            overflow: "hidden",
            elevation: 0,
          },
          tabBarBackground: () => <GlassTabBarBackground />,
          headerShown: true,
          headerStyle: { backgroundColor: Colors.dark.surfaceElevated },
          headerTitleStyle: { color: Colors.dark.ink, fontWeight: "700" },
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            headerShown: false,
            tabBarLabel: "Home",
            tabBarIcon: ({ focused }) => <GlassTabIcon focused={focused} Icon={Home} />,
          }}
        />
        <Tabs.Screen
          name="notes"
          options={{
            headerShown: false,
            title: "Notes",
            tabBarIcon: ({ focused }) => <GlassTabIcon focused={focused} Icon={NotebookPen} />,
          }}
        />
        <Tabs.Screen
        
          name="calendar"
          options={{
            headerShown: false,
            title: "Calendar",
            tabBarIcon: ({ focused }) => <GlassTabIcon focused={focused} Icon={CalendarDays} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Profile",
            headerShown: false,
            tabBarIcon: ({ focused }) => <GlassTabIcon focused={focused} Icon={User} />,
          }}
        />
        {/* Reminders no longer shows as a tab — the route stays alive via
            href:null so router.push("/(tabs)/reminders") still works if
            something else needs to link to it. */}
        <Tabs.Screen name="reminders" options={{ href: null, headerShown: false, title: "Reminders" }} />
      </Tabs>

  
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.dark.background },
  topHairline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  iconPillWrap: {
    width: 72,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});