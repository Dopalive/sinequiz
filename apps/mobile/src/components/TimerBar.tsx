import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts, radius } from "@/theme";

interface Props {
  /** Seconds left, updated by the owner once per second. */
  secondsLeft: number;
  totalSeconds: number;
  /** When true the bar freezes (answer submitted, waiting for the server). */
  frozen: boolean;
}

/**
 * Linear drain (the one legit use of linear easing: progress). Color shifts gold → red under 5s and
 * the bar breathes (ambient layer) to raise urgency without stealing focus from the choices.
 */
export function TimerBar({ secondsLeft, totalSeconds, frozen }: Props) {
  const width = useSharedValue(100);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (frozen) {
      cancelAnimation(width);
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 120 });
      return;
    }
    // Re-targeting every second keeps the visual bar honest with the JS clock that decides time-outs.
    const target = Math.max(0, ((secondsLeft - 1) / totalSeconds) * 100);
    width.value = withTiming(target, { duration: 1000, easing: Easing.linear });
    if (secondsLeft <= 5) {
      pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 250 }), withTiming(1, { duration: 250 })), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [secondsLeft, totalSeconds, frozen, width, pulse]);

  const bar = useAnimatedStyle(() => ({
    width: `${width.value}%`,
    backgroundColor: interpolateColor(width.value, [0, 33, 100], [colors.danger, colors.gold, colors.accent]),
    transform: [{ scaleY: pulse.value }],
  }));

  const urgent = secondsLeft <= 5 && !frozen;
  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
      <Text style={[styles.secs, urgent && { color: colors.danger }]}>{Math.max(0, secondsLeft)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  track: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.cardRaised, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill },
  secs: { ...fonts.heading, color: colors.text, minWidth: 28, textAlign: "right", fontVariant: ["tabular-nums"] },
});
