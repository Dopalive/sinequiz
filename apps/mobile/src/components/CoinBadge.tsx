import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { DUR, SPRING, timing } from "@/lib/motion";
import { colors, fonts, radius, spacing } from "@/theme";

interface Props {
  balance: number;
  size?: "sm" | "lg";
}

/**
 * Coin pill. When the balance changes the number counts toward the new value while the pill pops
 * (scale 1 → 1.18 → 1) and flashes gold; a drop pulls it down slightly instead of up.
 */
export function CoinBadge({ balance, size = "sm" }: Props) {
  const [shown, setShown] = useState(balance);
  const prev = useRef(balance);
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    const from = prev.current;
    const to = balance;
    prev.current = balance;
    if (from === to) return;
    const gain = to > from;
    scale.value = withSequence(withSpring(gain ? 1.18 : 0.92, SPRING.snap), withSpring(1, SPRING.pop));
    lift.value = withSequence(withSpring(gain ? -6 : 4, SPRING.snap), withSpring(0, SPRING.pop));
    glow.value = withSequence(withTiming(1, timing(DUR.quick)), withTiming(0, timing(DUR.slow)));
    // Count-up: ~500ms, eased by frame count.
    const steps = 18;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const t = 1 - Math.pow(1 - i / steps, 3);
      setShown(Math.round(from + (to - from) * t));
      if (i >= steps) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [balance, scale, lift, glow]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: lift.value }],
    shadowOpacity: 0.25 + glow.value * 0.6,
    borderColor: glow.value > 0.3 ? colors.gold : "#5A4A1A",
  }));

  const big = size === "lg";
  return (
    <Animated.View style={[styles.pill, big && styles.pillLg, style]}>
      <View style={[styles.coin, big && styles.coinLg]}>
        <Text style={[styles.coinGlyph, big && { fontSize: 16 }]}>¢</Text>
      </View>
      <Text style={[styles.amount, big && styles.amountLg]}>{shown.toLocaleString()}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    shadowColor: colors.gold,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  pillLg: { paddingVertical: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.lg },
  coin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  coinLg: { width: 30, height: 30, borderRadius: 15 },
  coinGlyph: { color: "#5A3F00", fontWeight: "900", fontSize: 12, lineHeight: 14 },
  amount: { ...fonts.bodyStrong, color: colors.gold, fontVariant: ["tabular-nums"] },
  amountLg: { ...fonts.title, color: colors.gold },
});
