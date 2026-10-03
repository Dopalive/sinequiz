import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { SPRING } from "@/lib/motion";
import { colors, fonts, radius, spacing } from "@/theme";

/**
 * Home hero. Primary: the tagline drops in on the signature spring. Secondary: a gold glint sweeps
 * across the wordmark once. Ambient: two soft orbs drift on a slow sine loop so the card never sits
 * perfectly still (motion-design "three layers" rule).
 */
export function Hero() {
  const { t } = useTranslation();
  return (
    <Animated.View
      entering={FadeInDown.springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)}
      style={styles.wrap}
    >
      <LinearGradient colors={["#3B2BA6", "#1A1340", "#0F0F1D"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Orb size={220} color="rgba(139,124,255,0.35)" x={-70} y={-90} period={9000} />
        <Orb size={160} color="rgba(245,196,81,0.22)" x={230} y={60} period={12000} reverse />
        <View style={styles.strip}>
          {Array.from({ length: 14 }).map((_, i) => (
            <View key={i} style={styles.hole} />
          ))}
        </View>
        <Text style={styles.kicker}>{t("app.heroCta").toUpperCase()}</Text>
        <Text style={styles.tagline}>{t("app.tagline")}</Text>
        <View style={styles.rulesRow}>
          <Pill text="10" sub="Q" />
          <Pill text="15s" sub="⏱" />
          <Pill text="+10" sub="¢" gold />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function Pill({ text, sub, gold }: { text: string; sub: string; gold?: boolean }) {
  return (
    <View style={[styles.pill, gold && { backgroundColor: "rgba(245,196,81,0.18)", borderColor: "rgba(245,196,81,0.5)" }]}>
      <Text style={[styles.pillText, gold && { color: colors.gold }]}>{text}</Text>
      <Text style={[styles.pillSub, gold && { color: colors.gold }]}>{sub}</Text>
    </View>
  );
}

function Orb({ size, color, x, y, period, reverse }: { size: number; color: string; x: number; y: number; period: number; reverse?: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: period, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [period, t]);
  const style = useAnimatedStyle(() => {
    const dir = reverse ? -1 : 1;
    return {
      transform: [{ translateX: x + dir * t.value * 26 }, { translateY: y - t.value * 18 }, { scale: 1 + t.value * 0.08 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.orb, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.xl, overflow: "hidden" },
  card: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md, overflow: "hidden", minHeight: 200 },
  orb: { position: "absolute", left: 0, top: 0 },
  strip: { position: "absolute", top: 10, left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between" },
  hole: { width: 10, height: 7, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.14)" },
  kicker: { ...fonts.caption, color: "rgba(255,255,255,0.65)", letterSpacing: 1.6 },
  tagline: { ...fonts.display, color: colors.text, lineHeight: 38, maxWidth: 360 },
  rulesRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  pill: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  pillText: { ...fonts.bodyStrong, color: colors.text },
  pillSub: { ...fonts.caption, color: "rgba(255,255,255,0.7)" },
});
