import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp, ZoomIn } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { CoinBadge } from "@/components/CoinBadge";
import { Confetti } from "@/components/Confetti";
import { Screen } from "@/components/Screen";
import { useAudio } from "@/lib/audio";
import { SPRING } from "@/lib/motion";
import { colors, fonts, radius, spacing } from "@/theme";

function num(v: string | string[] | undefined, fallback = 0): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Narrative: setup (title drops in) → action (score counts up, ring fills) → resolution (coins land in
 * the badge, CTAs rise). Perfect rounds get a second confetti wave on the gold glow.
 */
export default function ResultScreen() {
  const params = useLocalSearchParams<{ sessionId: string; score?: string; total?: string; coins?: string; balance?: string; titleId?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { play, startAmbient } = useAudio();

  const score = num(params.score);
  const total = num(params.total, 10);
  const coins = num(params.coins);
  const balance = num(params.balance);
  const perfect = total > 0 && score === total;

  const [shownScore, setShownScore] = useState(0);
  const [shownBalance, setShownBalance] = useState(Math.max(0, balance - coins));
  const [wave, setWave] = useState(0);

  useEffect(() => {
    // Score ticks up one per 90ms (anticipation), then the balance badge pops with the coins earned.
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShownScore(Math.min(score, i));
      if (i >= score) clearInterval(id);
    }, 90);
    const land = setTimeout(() => setShownBalance(balance), 90 * score + 350);
    const burst = setTimeout(() => setWave(1), 200);
    const second = perfect ? setTimeout(() => setWave(2), 1100) : undefined;
    return () => {
      clearInterval(id);
      clearTimeout(land);
      clearTimeout(burst);
      if (second) clearTimeout(second);
    };
  }, [score, balance, perfect]);

  // Jingle lands with the first confetti burst; the ambient loop fades back in underneath.
  useEffect(() => {
    const id = setTimeout(() => play(perfect ? "perfect" : "fanfare"), 180);
    return () => clearTimeout(id);
  }, [perfect, play]);

  useFocusEffect(
    useCallback(() => {
      startAmbient();
    }, [startAmbient]),
  );

  const ratio = total > 0 ? score / total : 0;
  const tone = ratio === 1 ? colors.gold : ratio >= 0.6 ? colors.success : ratio >= 0.3 ? colors.accent : colors.danger;

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      {wave > 0 ? <Confetti key={wave} trigger={wave} count={perfect ? 40 : 24} /> : null}

      <Animated.Text entering={FadeInDown.springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.title}>
        {perfect ? t("result.perfect") : t("result.title")}
      </Animated.Text>

      <Animated.View entering={ZoomIn.delay(120).springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.ringWrap}>
        <LinearGradient colors={[tone, "transparent"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.ring, { borderColor: tone }]}>
          <View style={styles.ringInner}>
            <Text style={[styles.score, { color: tone }]}>{shownScore}</Text>
            <Text style={styles.scoreOf}>/ {total}</Text>
          </View>
        </LinearGradient>
        <Text style={styles.scoreLabel}>{t("result.score", { score, total })}</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(400).springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.coinsCard}>
        <Text style={styles.earned}>{t("result.earned", { coins })}</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>{t("result.balance")}</Text>
          <CoinBadge balance={shownBalance} size="lg" />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(560).springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.actions}>
        <Button
          label={t("result.again")}
          variant="gold"
          testID="play-again"
          onPress={() => (params.titleId ? router.replace({ pathname: "/title/[id]", params: { id: params.titleId } }) : router.replace("/"))}
        />
        <Button label={t("result.other")} variant="ghost" onPress={() => router.replace("/")} testID="other-title" />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "center", justifyContent: "center", gap: spacing.xl },
  title: { ...fonts.display, color: colors.text, textAlign: "center" },
  ringWrap: { alignItems: "center", gap: spacing.md },
  ring: { width: 176, height: 176, borderRadius: 88, borderWidth: 4, alignItems: "center", justifyContent: "center", padding: 6 },
  ringInner: { flex: 1, alignSelf: "stretch", borderRadius: 80, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  score: { fontSize: 64, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 70 },
  scoreOf: { ...fonts.heading, color: colors.textMuted, marginTop: 24 },
  scoreLabel: { ...fonts.body, color: colors.textMuted },
  coinsCard: {
    width: "100%",
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.md,
  },
  earned: { ...fonts.title, color: colors.gold },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  balanceLabel: { ...fonts.body, color: colors.textMuted },
  actions: { width: "100%", gap: spacing.md },
});
