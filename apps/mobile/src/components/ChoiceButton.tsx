import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { PressableScale } from "./PressableScale";
import { DUR, SPRING, stagger, timing } from "@/lib/motion";
import { colors, fonts, radius, spacing } from "@/theme";

export type ChoiceState = "idle" | "pending" | "correct" | "wrong" | "revealed" | "removed" | "locked";

interface Props {
  index: number;
  label: string;
  state: ChoiceState;
  onPress: () => void;
}

const LETTERS = ["A", "B", "C", "D"] as const;

/**
 * One answer. Correct → pop (scale 1.04, overshoot) + green fill. Wrong → firm horizontal shake, no
 * overshoot, red fill. `revealed` is the correct answer shown after a wrong/timed-out pick (calm green
 * outline, no pop: the celebration belongs to the user's own hit). `removed` is a 50/50 casualty.
 */
export function ChoiceButton({ index, label, state, onPress }: Props) {
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);
  const removedOpacity = useSharedValue(1);

  useEffect(() => {
    if (state === "correct") {
      scale.value = withSequence(withSpring(1.05, SPRING.snap), withSpring(1, SPRING.pop));
    } else if (state === "wrong") {
      shake.value = withSequence(
        withTiming(-12, timing(50)),
        withTiming(10, timing(60)),
        withTiming(-6, timing(60)),
        withTiming(3, timing(60)),
        withTiming(0, timing(60)),
      );
    } else if (state === "removed") {
      removedOpacity.value = withTiming(0.28, timing(DUR.standard));
      scale.value = withTiming(0.97, timing(DUR.standard));
    } else if (state === "idle") {
      removedOpacity.value = 1;
      scale.value = 1;
    }
  }, [state, scale, shake, removedOpacity]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shake.value }],
    opacity: removedOpacity.value,
  }));

  const look = LOOK[state];
  const disabled = state !== "idle";

  return (
    <Animated.View entering={FadeInUp.delay(stagger(index, 45)).springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)}>
      <Animated.View style={animated}>
        <PressableScale
          onPress={onPress}
          disabled={disabled}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          testID={`choice-${index}`}
          style={[styles.btn, { backgroundColor: look.bg, borderColor: look.border }]}
        >
          <View style={[styles.letter, { backgroundColor: look.letterBg }]}>
            <Text style={[styles.letterText, { color: look.letterFg }]}>{LETTERS[index] ?? "?"}</Text>
          </View>
          <Text style={[styles.label, { color: look.fg }, state === "removed" && styles.strike]} numberOfLines={3}>
            {label}
          </Text>
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
}

const LOOK: Record<ChoiceState, { bg: string; border: string; fg: string; letterBg: string; letterFg: string }> = {
  idle: { bg: colors.card, border: colors.border, fg: colors.text, letterBg: colors.accentSoft, letterFg: colors.accent },
  pending: { bg: colors.accentSoft, border: colors.accent, fg: colors.text, letterBg: colors.accent, letterFg: "#0B0B12" },
  correct: { bg: colors.successSoft, border: colors.success, fg: colors.text, letterBg: colors.success, letterFg: "#06241A" },
  wrong: { bg: colors.dangerSoft, border: colors.danger, fg: colors.text, letterBg: colors.danger, letterFg: "#2A0810" },
  revealed: { bg: colors.card, border: colors.success, fg: colors.success, letterBg: colors.successSoft, letterFg: colors.success },
  removed: { bg: colors.card, border: colors.border, fg: colors.textMuted, letterBg: colors.cardRaised, letterFg: colors.textMuted },
  locked: { bg: colors.card, border: colors.border, fg: colors.textMuted, letterBg: colors.cardRaised, letterFg: colors.textMuted },
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  letter: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  letterText: { ...fonts.bodyStrong },
  label: { ...fonts.body, flex: 1 },
  strike: { textDecorationLine: "line-through" },
});
