// Dark-themed time picker — centered pop-up (matches the Settings modal
// pattern: dimmed backdrop + centered rounded card), no native
// @react-native-community/datetimepicker dependency.
//
// FIX HISTORY (kept as context for future edits):
// 1. Touch handling: the sheet used to be wrapped in nested Pressables
//    (backdrop -> sheet), which made the outer Pressable claim the touch
//    responder before the FlatLists' pan-responder could start a scroll —
//    silently breaking scrolling AND tapping on children. Fixed by making
//    the "tap outside to dismiss" layer an absolutely-positioned sibling
//    BEHIND the card instead of a wrapper around it.
// 2. AM/PM is plain text living in the same wheel row as hour/minute (no
//    button chrome), selected value in the center slot, the other option
//    directly below it — tap the muted one to swap.
// 3. Minute wheel centering drift: snapToInterval is approximated in JS on
//    Android and drifts more on longer/faster scrolls (60 items vs 12).
//    Fixed by force re-snapping to the exact pixel offset on every scroll
//    settle, not just on taps.
// 4. Highlight bar around the active time only had a border on its top and
//    bottom edges (borderTopWidth/borderBottomWidth), so it looked like two
//    floating lines with nothing connecting them on the left/right. Now
//    uses a full four-sided border with the box slightly inset from the
//    wheel row so the rounded corners are actually visible.
// 5. The top/bottom fade masks blend the wheel edges into the card
//    background — but they were hard-coded to the old lighter
//    Colors.dark.surfaceElevated token, which no longer matches the card's
//    actual (darker) background. That mismatch is what showed up as a
//    "glow that fades back to the wrong color before reaching center."
//    Fixed by pulling the fade color from the same CARD_BG constant the
//    card itself uses.
// 6. Set time / Cancel buttons weren't rendering the same size — Cancel
//    had a border (which adds to its box) and Confirm didn't. Both now
//    share the exact same borderWidth/paddingVertical/border-radius so
//    their computed size is identical; only fill color differs.
// 7. Opened at 0:00 instead of the saved/last-set time, and dragging the
//    wheels sometimes visibly "snapped back" mid-scroll. Both traced to
//    the same family of race conditions between this component's state
//    and the FlatLists' own scroll position — see inline FIX comments
//    below for the specifics.
//
// Accepts both prop namings for backward compatibility with existing call
// sites: `date`/`onCancel` (original onboarding usage) and
// `initialTime`/`onClose` (Settings usage) both work.
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { radii, spacing } from "@/constants/theme";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5; // odd, so there's a true center row
const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2);
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const HOURS = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, "0")); // "01".."12"
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")); // "00".."59"

// Darker, more premium neutrals for the card surface/border and the
// cancel button. Hard-coded rather than pulled from Colors.dark since
// they're deliberately darker than the shared surfaceElevated/borderStrong
// tokens used elsewhere in the app.
const CARD_BG = "#141416";
const CARD_BORDER = "#1C1C1E";
const CANCEL_BG = "#0B0B0D";
const CANCEL_BORDER = CANCEL_BG;

type Props = {
  visible: boolean;
  // New naming (used by Settings):
  initialTime?: Date;
  onClose?: () => void;
  // Legacy naming (original onboarding usage) — still supported:
  date?: Date;
  onCancel?: () => void;
  onConfirm: (date: Date) => void;
};

// Fallback used only when no initialTime/date is passed in at all (e.g.
// onboarding's first open). Defaults to 7:00 AM — the same default brief
// time used elsewhere in the app — instead of the device's current real
// time, so the picker doesn't randomly land on PM just because it happens
// to be evening when the user opens it.
function defaultBriefTime(): Date {
  const d = new Date();
  d.setHours(7, 0, 0, 0);
  return d;
}

export function DarkTimePicker({ visible, initialTime, date, onConfirm, onClose, onCancel }: Props) {
  const baseTime = initialTime ?? date ?? defaultBriefTime();
  const handleClose = onClose ?? onCancel ?? (() => {});

  const [hourIndex, setHourIndex] = useState(0);
  const [minuteIndex, setMinuteIndex] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(0); // 0 = AM, 1 = PM

  // FIX (bug: "opens at 0:00 instead of the saved time"): this component
  // never actually unmounts between opens — the parent always renders it;
  // `if (!visible) return null` below just skips ITS OWN jsx — so
  // hourIndex/minuteIndex/periodIndex carry over from the last time it was
  // open. Recomputing them from baseTime in a `useEffect(..., [visible])`
  // ran too late: the render that flips visible false→true already mounts
  // the wheels with the STALE index values, and each wheel's own
  // scroll-to-position effect is mount-only, so it locks in that stale
  // offset before the correction ever arrives — by the time the effect
  // fires and updates state, the wheels are already sitting at the wrong
  // spot and won't re-scroll themselves.
  //
  // Fix: recompute synchronously during render (React's documented
  // "adjusting state when a prop changes" pattern — comparing against a
  // ref of the last-seen value and calling setState directly in the render
  // body), so the wheels are never mounted with the wrong indices to begin
  // with.
  const prevVisibleRef = useRef(visible);
  // Bumped on every closed→open transition and used as a `key` on the two
  // wheel columns below, forcing a genuinely fresh FlatList mount each
  // time the sheet opens instead of reusing an instance that might still
  // be resting at a stale scroll position from the last time it was open.
  const [openId, setOpenId] = useState(0);

  if (visible !== prevVisibleRef.current) {
    prevVisibleRef.current = visible;
    if (visible) {
      const h24 = baseTime.getHours();
      const period = h24 >= 12 ? 1 : 0;
      let h12 = h24 % 12;
      if (h12 === 0) h12 = 12;
      setHourIndex(h12 - 1);
      setMinuteIndex(baseTime.getMinutes());
      setPeriodIndex(period);
      setOpenId((n) => n + 1);
    }
  }

  if (!visible) return null;

  const handleConfirm = () => {
    const hour12 = hourIndex + 1;
    const isPM = periodIndex === 1;
    let hour24 = hour12 % 12;
    if (isPM) hour24 += 12;
    const result = new Date(baseTime);
    result.setHours(hour24, minuteIndex, 0, 0);
    onConfirm(result);
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleConfirm}>
      <View style={styles.backdrop}>
        {/* Tap-outside-to-dismiss layer. Sits BEHIND the card as an
            absolutely-positioned sibling — NOT a wrapper around it — so it
            never steals touch responder from the FlatLists inside the card.
            Commits whatever the wheels are currently showing (same as "Set
            time") rather than discarding it — dismissing the sheet any way
            saves the scrolled-to time, so forgetting to tap "Set time"
            doesn't silently lose the change. */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleConfirm} />

        <View style={styles.sheet}>
          <Text style={styles.title}>Set brief time</Text>
          <Text style={styles.subtitle}>This is when your daily brief arrives.</Text>

          <View style={styles.pickerWrap}>
            {/* Highlight bar behind the active row — full four-sided
                border, inset slightly from the wheel row so the rounded
                corners show on the left/right, not just top/bottom. */}
            <View style={styles.centerHighlight} pointerEvents="none" />

            <View style={styles.wheelsRow}>
              <WheelColumn
                key={`hour-${openId}`}
                data={HOURS}
                selectedIndex={hourIndex}
                onChange={setHourIndex}
                width={64}
              />
              <Text style={styles.colon}>:</Text>
              <WheelColumn
                key={`minute-${openId}`}
                data={MINUTES}
                selectedIndex={minuteIndex}
                onChange={setMinuteIndex}
                width={64}
              />

              <PeriodToggle selectedIndex={periodIndex} onChange={setPeriodIndex} />
            </View>

            {/* Top/bottom fade masks — fade the wheel edges into the
                card's actual background (CARD_BG), not the old lighter
                surfaceElevated token, so there's no visible color seam
                before reaching the center row. */}
            <LinearGradient
              colors={[CARD_BG, CARD_BG + "00"]}
              style={[styles.fadeMask, styles.fadeMaskTop]}
              pointerEvents="none"
            />
            <LinearGradient
              colors={[CARD_BG + "00", CARD_BG]}
              style={[styles.fadeMask, styles.fadeMaskBottom]}
              pointerEvents="none"
            />
          </View>

          <View style={styles.actionsRow}>
            {/* "Cancel" now also commits the current wheel position — see
                the backdrop-tap comment above for why. */}
            <Pressable style={styles.cancelBtn} onPress={handleConfirm}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmLabel}>Set time</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// AM/PM — no button/pill chrome. The selected label sits in the exact
// same center row as the highlighted hour/minute digits (same active text
// style), and the other option sits directly below it, muted, like the
// next row down on a wheel. Tapping the muted one swaps the two positions.
function PeriodToggle({
  selectedIndex,
  onChange,
}: {
  selectedIndex: number;
  onChange: (index: number) => void;
}) {
  const select = (index: number) => {
    if (index === selectedIndex) return;
    Haptics.selectionAsync();
    onChange(index);
  };

  const selectedLabel = selectedIndex === 0 ? "AM" : "PM";
  const inactiveLabel = selectedIndex === 0 ? "PM" : "AM";
  const inactiveIndex = selectedIndex === 0 ? 1 : 0;

  return (
    <View style={[styles.periodColumn, { width: 64 }]}>
      <View style={styles.periodSlot}>
        <Pressable onPress={() => select(selectedIndex)} hitSlop={10}>
          <Text style={[styles.wheelItemText, styles.wheelItemTextActive]}>{selectedLabel}</Text>
        </Pressable>
      </View>
      <View style={[styles.periodSlot, styles.periodSlotBelow]}>
        <Pressable onPress={() => select(inactiveIndex)} hitSlop={10}>
          <Text style={styles.wheelItemText}>{inactiveLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WheelColumn({
  data,
  selectedIndex,
  onChange,
  width,
}: {
  data: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  width: number;
}) {
  const listRef = useRef<FlatList<string>>(null);
  const lastReportedIndex = useRef(selectedIndex);
  // FIX (bug: "scrolling isn't smooth, sometimes snaps back"): tracks
  // whether native momentum scrolling is currently in flight.
  const isMomentumScrolling = useRef(false);
  // FIX (bug: "stuck scrolling back after a long scroll to one end"): the
  // corrective re-snap scheduled by onScrollEndDrag below used to be a
  // bare setTimeout with nothing to cancel it. If the user started a new
  // drag or fling before that 60ms fired, the stale timeout would still go
  // off and force an animated scrollTo back to the OLD (pre-new-gesture)
  // offset — yanking the wheel back mid-gesture. That's what made
  // scrolling back after a long scroll feel "stuck" (worse the longer the
  // scroll, since the corrective snap had further to travel). Tracking the
  // timeout in a ref and clearing it the moment a new drag or momentum
  // scroll begins (and on unmount) fixes it.
  const dragEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dragEndTimeoutRef.current) clearTimeout(dragEndTimeoutRef.current);
    };
  }, []);

  // Jump to the correct offset without animation whenever this column
  // mounts. Combined with the `key={...}` the parent now puts on this
  // component (bumped on every open), this runs fresh each time the sheet
  // opens with an already-correct `selectedIndex` — instead of the old
  // behavior where the column could mount with a stale index on open and
  // never get a chance to re-scroll once the correct value arrived a beat
  // later.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: selectedIndex * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitIndex = (rawIndex: number, animateTo?: boolean) => {
    const clamped = Math.max(0, Math.min(data.length - 1, rawIndex));
    if (animateTo) {
      listRef.current?.scrollToOffset({ offset: clamped * ITEM_HEIGHT, animated: true });
    }
    if (clamped !== lastReportedIndex.current) {
      lastReportedIndex.current = clamped;
      Haptics.selectionAsync();
      onChange(clamped);
    }
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    // Force the list back onto the exact pixel offset for this index.
    // snapToInterval is native/precise on iOS but only approximated in JS
    // on Android, and that approximation drifts more the longer/faster the
    // scroll — which is why the 60-item minute wheel could rest a few
    // pixels off-center while the 12-item hour wheel (shorter flings)
    // never showed it. Re-snapping here guarantees pixel-exact centering
    // regardless of where the native scroll actually stopped.
    commitIndex(index, true);
  };

  return (
    <View style={[styles.wheelColumn, { width }]}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item, i) => `${item}-${i}`}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * PADDING_ITEMS }}
        onScrollBeginDrag={() => {
          if (dragEndTimeoutRef.current) {
            clearTimeout(dragEndTimeoutRef.current);
            dragEndTimeoutRef.current = null;
          }
        }}
        onMomentumScrollBegin={() => {
          isMomentumScrolling.current = true;
          if (dragEndTimeoutRef.current) {
            clearTimeout(dragEndTimeoutRef.current);
            dragEndTimeoutRef.current = null;
          }
        }}
        onMomentumScrollEnd={(e) => {
          isMomentumScrolling.current = false;
          handleMomentumEnd(e);
        }}
        // FIX: this used to call handleMomentumEnd directly whenever
        // release velocity was under a small threshold — but that
        // threshold was loose enough that real momentum could still kick
        // in afterward. When it did, onScrollEndDrag snapped the list to
        // the release-point index WHILE onMomentumScrollEnd was about to
        // snap it again to wherever momentum actually settled a moment
        // later — two corrections fighting each other, which is what
        // showed up as the wheel visibly "scrolling back" mid-gesture.
        //
        // Fix: capture the offset now (safe — RN doesn't pool these events
        // like legacy web synthetic events), then wait briefly to see if
        // momentum actually starts. Android sometimes never fires a
        // momentum event at all for a very slow release, so this timeout
        // is still needed as a fallback — it just no longer races a
        // momentum scroll that IS coming.
        onScrollEndDrag={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          isMomentumScrolling.current = false;
          if (dragEndTimeoutRef.current) clearTimeout(dragEndTimeoutRef.current);
          dragEndTimeoutRef.current = setTimeout(() => {
            dragEndTimeoutRef.current = null;
            if (!isMomentumScrolling.current) {
              const index = Math.round(offsetY / ITEM_HEIGHT);
              commitIndex(index, true);
            }
          }, 60);
        }}
        renderItem={({ item, index }) => {
          const active = index === selectedIndex;
          return (
            // Tapping a number directly selects it (in addition to
            // scrolling) — fixes "I cannot click on any number".
            <Pressable style={styles.wheelItem} onPress={() => commitIndex(index, true)}>
              <Text style={[styles.wheelItemText, active && styles.wheelItemTextActive]}>{item}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11,11,13,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  // Centered pop-up card — same shape/pattern as the Settings modals
  // (modalBackdrop/modalCard): rounded on all corners, capped width.
  sheet: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: CARD_BG,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: spacing.lg,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.ink,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.inkMuted,
    textAlign: "center",
    marginTop: 2,
    marginBottom: spacing.md,
  },

  pickerWrap: {
    height: WHEEL_HEIGHT,
    position: "relative",
    justifyContent: "center",
  },
  // Full four-sided border (was top/bottom only, which read as two
  // disconnected lines with nothing on the left/right). Inset a few px
  // from the wheel row's own edges so the rounded corners are visible
  // instead of getting flush-cut by the row bounds.
  centerHighlight: {
    position: "absolute",
    left: 4,
    right: 4,
    top: ITEM_HEIGHT * PADDING_ITEMS,
    height: ITEM_HEIGHT,
    borderRadius: radii.sm,
    backgroundColor: Colors.dark.coral + "14",
    borderWidth: 1,
    borderColor: Colors.dark.coral + "40",
  },
  wheelsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  wheelColumn: {
    height: WHEEL_HEIGHT,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.inkMuted,
  },
  wheelItemTextActive: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.dark.ink,
  },
  colon: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.inkMuted,
    marginBottom: 2,
  },

  // AM/PM — plain text, no pill/border chrome. Selected slot lines up with
  // the same center row as the highlighted hour/minute digits; the other
  // slot sits directly below it, muted. Same footprint as a wheel column
  // so the overall row layout is unchanged.
  periodColumn: {
    height: WHEEL_HEIGHT,
    position: "relative",
  },
  periodSlot: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ITEM_HEIGHT * PADDING_ITEMS,
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  periodSlotBelow: {
    top: ITEM_HEIGHT * (PADDING_ITEMS + 1),
  },

  fadeMask: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 1.5,
    zIndex: 2,
  },
  fadeMaskTop: { top: 0 },
  fadeMaskBottom: { bottom: 0 },

  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  // Cancel and Confirm now share identical borderWidth/paddingVertical/
  // borderRadius so their computed box size is exactly the same — only
  // the fill (and, for cancel, a visible border) differs.
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: CANCEL_BG,
    borderWidth: 1.5,
    borderColor: CANCEL_BORDER,
  },
  cancelLabel: {
    color: Colors.dark.inkMuted,
    fontWeight: "700",
    fontSize: 15,
  },
  // Solid deep-coral fill (matches the Settings "savePill" treatment)
  // instead of the old multi-stop gradient. borderWidth matches cancelBtn
  // (transparent, so invisible) purely so both buttons compute to the
  // exact same size.
  confirmBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: Colors.dark.coralSoft,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  confirmLabel: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.2,
  },
});