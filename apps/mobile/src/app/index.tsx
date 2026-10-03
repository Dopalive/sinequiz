import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInUp, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { CoinBadge } from "@/components/CoinBadge";
import { Hero } from "@/components/Hero";
import { EmptyState, Notice } from "@/components/Notice";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { TitleCard } from "@/components/TitleCard";
import { useAudio } from "@/lib/audio";
import { useAuth } from "@/lib/auth";
import { DUR, SPRING } from "@/lib/motion";
import { loadActiveSession, nextOpenIndex, type ActiveSession } from "@/lib/session";
import { fetchTitles, type TitleSummary } from "@/lib/titles";
import { colors, fonts, radius, spacing } from "@/theme";

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const { startAmbient } = useAudio();
  const locale = profile?.locale ?? "en";

  const [titles, setTitles] = useState<TitleSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ActiveSession | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, session] = await Promise.all([fetchTitles(locale), loadActiveSession()]);
      setTitles(list);
      setActive(session && nextOpenIndex(session) < session.questions.length ? session : null);
    } catch (err) {
      setError(err);
    }
  }, [locale]);

  // Re-read on every return to Home: balance may have changed, a game may have ended.
  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshProfile();
      // Ambient loop: plays on Home (on web it waits for the first tap/click/key anywhere on the page).
      startAmbient();
    }, [load, refreshProfile, startAmbient]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!titles) return [];
    return q ? titles.filter((x) => x.name.toLocaleLowerCase().includes(q)) : titles;
  }, [titles, query]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.wordmark}>
          Sine<Text style={{ color: colors.gold }}>Quiz</Text>
        </Text>
        <PressableScale onPress={() => router.push("/profile")} accessibilityRole="button" testID="open-profile">
          <CoinBadge balance={profile?.coin_balance ?? 0} />
        </PressableScale>
      </View>

      <Hero />

      {active ? (
        <Animated.View entering={FadeInUp.delay(80).springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} exiting={FadeOut.duration(DUR.quick)}>
          <PressableScale
            onPress={() => router.push({ pathname: "/quiz/[sessionId]", params: { sessionId: active.session_id } })}
            style={styles.resume}
            pressScale={0.98}
            testID="resume-game"
          >
            <View style={styles.resumeDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeTitle}>{t("home.resume")}</Text>
              <Text style={styles.resumeSub}>
                {t("home.resumeHint", { name: active.title_name, n: nextOpenIndex(active) + 1, total: active.questions.length })}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        </Animated.View>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.section}>{t("home.titles")}</Text>
        {titles ? <Text style={styles.count}>{titles.length}</Text> : null}
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("home.search")}
        placeholderTextColor={colors.textMuted}
        style={styles.search}
        autoCorrect={false}
        testID="search"
      />

      {error ? <Notice error={error} onRetry={load} /> : null}
      {!titles && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
      {titles && titles.length === 0 ? <EmptyState text={t("home.empty")} /> : null}
      {titles && titles.length > 0 && filtered.length === 0 ? <EmptyState text={t("home.noMatch", { query })} /> : null}

      <View style={styles.grid}>
        {filtered.map((title, i) => (
          <View key={title.id} style={styles.cell}>
            <TitleCard title={title} index={i} onPress={() => router.push({ pathname: "/title/[id]", params: { id: title.id } })} />
          </View>
        ))}
        {filtered.length % 2 === 1 ? <View style={styles.cell} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  wordmark: { ...fonts.title, color: colors.text, letterSpacing: -0.3 },
  resume: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  resumeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  resumeTitle: { ...fonts.bodyStrong, color: colors.text },
  resumeSub: { ...fonts.caption, color: colors.textMuted, marginTop: 2 },
  chevron: { ...fonts.title, color: colors.accent },
  sectionRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md },
  section: { ...fonts.heading, color: colors.text },
  count: { ...fonts.caption, color: colors.textMuted },
  search: {
    ...fonts.body,
    color: colors.text,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  loading: { paddingVertical: spacing.xxl, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  cell: { width: "48%", flexGrow: 1 },
});
