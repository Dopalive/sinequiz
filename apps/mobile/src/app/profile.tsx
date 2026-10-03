import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { CoinBadge } from "@/components/CoinBadge";
import { Notice } from "@/components/Notice";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { useAudio } from "@/lib/audio";
import { useAuth } from "@/lib/auth";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { SPRING, stagger } from "@/lib/motion";
import { supabase } from "@/lib/supabase";
import { colors, fonts, radius, spacing } from "@/theme";

const LOCALE_LABEL: Record<Locale, string> = { tr: "Türkçe", en: "English" };

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { profile, setLocale } = useAuth();
  const { muted, setMuted } = useAudio();
  const [stats, setStats] = useState<{ games: number; correct: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      // RLS scopes both reads to the signed-in user.
      const [games, correct] = await Promise.all([
        supabase.from("quiz_sessions").select("id", { count: "exact", head: true }).eq("status", "finished"),
        supabase.from("answers").select("id", { count: "exact", head: true }).eq("is_correct", true),
      ]);
      if (games.error || correct.error) {
        setError(games.error ?? correct.error);
        return;
      }
      setStats({ games: games.count ?? 0, correct: correct.count ?? 0 });
    })();
  }, [profile]);

  const changeLocale = async (locale: Locale) => {
    if (!profile || profile.locale === locale || switching) return;
    setSwitching(true);
    setError(null);
    try {
      await setLocale(locale);
    } catch (err) {
      setError(err);
    } finally {
      setSwitching(false);
    }
  };

  const enter = (i: number) => FadeInUp.delay(stagger(i, 70)).springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t("profile.title")}</Text>
        <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.close} haptic={false} testID="close-profile">
          <Text style={styles.closeText}>✕</Text>
        </PressableScale>
      </View>

      <Animated.View entering={enter(0)} style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile?.display_name ?? "?").slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{profile?.display_name ?? t("profile.anonymous")}</Text>
        <Text style={styles.label}>{t("profile.balance")}</Text>
        <CoinBadge balance={profile?.coin_balance ?? 0} size="lg" />
      </Animated.View>

      <Animated.View entering={enter(1)} style={styles.card}>
        <Text style={styles.sectionTitle}>{t("profile.language")}</Text>
        <View style={styles.row}>
          {SUPPORTED_LOCALES.map((loc) => {
            const selected = profile?.locale === loc;
            return (
              <PressableScale
                key={loc}
                onPress={() => void changeLocale(loc)}
                disabled={switching}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`locale-${loc}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{LOCALE_LABEL[loc]}</Text>
              </PressableScale>
            );
          })}
        </View>
      </Animated.View>

      <Animated.View entering={enter(2)} style={styles.card}>
        <Text style={styles.sectionTitle}>{t("profile.sound")}</Text>
        <View style={styles.row}>
          {([false, true] as const).map((off) => {
            const selected = muted === off;
            return (
              <PressableScale
                key={off ? "off" : "on"}
                onPress={() => setMuted(off)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={off ? "sound-off" : "sound-on"}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{off ? t("profile.soundOff") : t("profile.soundOn")}</Text>
              </PressableScale>
            );
          })}
        </View>
      </Animated.View>

      <Animated.View entering={enter(3)} style={styles.card}>
        <Text style={styles.sectionTitle}>{t("profile.stats")}</Text>
        <View style={styles.statsRow}>
          <Stat value={stats?.games} label={t("profile.games")} />
          <Stat value={stats?.correct} label={t("profile.correct")} />
        </View>
      </Animated.View>

      <Animated.View entering={enter(4)} style={[styles.card, styles.protect]}>
        <Text style={styles.sectionTitle}>{t("profile.protect")}</Text>
        <Text style={styles.hint}>{t("profile.protectHint")}</Text>
      </Animated.View>

      {error ? <Notice error={error} /> : null}
      <Button label={t("profile.home")} variant="ghost" onPress={() => router.replace("/")} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value === undefined ? "–" : value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  title: { ...fonts.display, color: colors.text },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  closeText: { color: colors.textMuted, fontSize: 16, fontWeight: "700" },
  card: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarText: { ...fonts.display, color: colors.accent },
  name: { ...fonts.title, color: colors.text },
  label: { ...fonts.caption, color: colors.textMuted },
  sectionTitle: { ...fonts.heading, color: colors.text, alignSelf: "flex-start" },
  row: { flexDirection: "row", gap: spacing.sm, alignSelf: "stretch" },
  chip: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: colors.cardRaised, borderWidth: 1.5, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { ...fonts.bodyStrong, color: colors.textMuted },
  chipTextSelected: { color: colors.text },
  statsRow: { flexDirection: "row", gap: spacing.md, alignSelf: "stretch" },
  stat: { flex: 1, alignItems: "center", padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.cardRaised, gap: 4 },
  statValue: { ...fonts.display, color: colors.text },
  statLabel: { ...fonts.caption, color: colors.textMuted, textAlign: "center" },
  protect: { backgroundColor: colors.goldSoft, borderColor: "#5A4A1A", alignItems: "flex-start" },
  hint: { ...fonts.body, color: colors.text, lineHeight: 23 },
});
