// Empty-state cards shown when a list (notes / reminders / calendar) has no
// items. Styled to match the app's normal item cards — same background,
// border, radius, padding, and full list width. Description text truncates
// to 3 lines with an ellipsis just like the normal cards; tapping the card
// opens a popup with the full text, reusing the same popup design used
// throughout the app (modalBackdrop / modalCard / modalTitle / scrollable
// text / Close pill). Not deletable, no edit icon — informational only.
// Independent per tab — having content in one tab does not hide the empty
// state in another.
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, StyleProp, ViewStyle } from "react-native";
import { Sparkles } from "lucide-react-native";

import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

interface ExpandableCardProps {
  icon: IconComponent;
  title: string;
  description: string;
  style?: StyleProp<ViewStyle>;
}

// Shared by EmptyStateCard and WelcomeCard — truncated card + tap-to-expand
// popup, both driven off the same title/description.
function ExpandableCard({ icon: Icon, title, description, style }: ExpandableCardProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.card, style, pressed && styles.cardPressed]}
        onPress={() => setVisible(true)}
      >
        <View style={styles.iconCircle}>
          <Icon size={22} color={Colors.light.coralDeep} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description} numberOfLines={3} ellipsizeMode="tail">
            {description}
          </Text>
        </View>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{title}</Text>
            <ScrollView style={styles.rawScroll} bounces={false} showsVerticalScrollIndicator={false}>
              <Text style={styles.rawText}>{description}</Text>
            </ScrollView>
            <Pressable
              onPress={() => setVisible(false)}
              style={({ pressed }) => [styles.cancelPill, pressed && styles.cancelPillPressed]}
            >
              <Text style={styles.cancelPillLabel}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

interface EmptyStateCardProps {
  icon: IconComponent;
  title: string;
  description: string;
  style?: StyleProp<ViewStyle>;
}

export default function EmptyStateCard({ icon, title, description, style }: EmptyStateCardProps) {
  return <ExpandableCard icon={icon} title={title} description={description} style={style} />;
}

// Same card shape as EmptyStateCard, reused as-is across notes, reminders,
// and calendar — the welcome/tutorial content is identical everywhere.
export function WelcomeCard() {
  const description =
    "Clear Day is your personal assistant for staying on top of your day — reminders, calendar " +
    "events, and notes, all captured the way you'd naturally say or type them. Tap the feather " +
    "icon at the bottom right of any screen, then speak or type what's on your mind: \"remind me " +
    "to call the dentist tomorrow at 3pm,\" \"team meeting Friday at 10,\" or just a thought you " +
    "want to save for later. Clear Day figures out what kind of item it is, along with the date, " +
    "time, and how far ahead to nudge you, so you don't have to fill out a form.\n\n" +
    "Reminders nudge you before something's due. Calendar events are for anything with a fixed " +
    "date and time. Notes are for anything you want to remember that doesn't need a due date at " +
    "all. Each morning and evening, Clear Day also pulls everything together into a short daily " +
    "brief so you always know what's ahead.";

  return <ExpandableCard icon={Sparkles} title="Welcome to Clear Day" description={description} />;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: spacing.md,
  },
  cardPressed: { opacity: 0.85 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.coralSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  body: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: Colors.light.ink, marginBottom: 4 },
  description: { fontSize: 14, color: Colors.light.inkMuted, lineHeight: 20 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.light.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: spacing.sm,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: Colors.light.ink, textAlign: "center" },
  rawScroll: { maxHeight: 320, marginTop: 2, marginBottom: 4 },
  rawText: { fontSize: 15, color: Colors.light.ink, lineHeight: 22 },
  cancelPill: {
    backgroundColor: Colors.light.creamDeep,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  cancelPillPressed: { opacity: 0.6 },
  cancelPillLabel: { fontSize: 15, fontWeight: "700", color: Colors.light.inkMuted },
});
