import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { Notice } from "@/components/Notice";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SPRING, stagger } from "@/lib/motion";
import { loadActiveSession, saveActiveSession } from "@/lib/session";
import { fetchTitle, type TitleDetail } from "@/lib/titles";
import { colors, fonts, radius, spacing } from "@/theme";

export default function TitleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const locale = profile?.locale ?? "en";

  const [title, setTitle] = useState<TitleDetail | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [season, setSeason] = useState<number | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchTitle(id, locale);
      setTitle(next);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [id, locale]);
  // Re-read on focus: question counts and names can change between visits.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const play = async () => {
    if (!title) return;
    setStarting(true);
    setStartError(null);
    try {
      // A half-played game for any title resumes instead of starting a second one; so does a fully
      // answered one that never reached finish-session, or its completion bonus would be lost.
      const existing = await loadActiveSession();
      if (existing) {
        router.replace({ pathname: "/quiz/[sessionId]", params: { sessionId: existing.session_id } });
        return;
      }
      const res = await api.startSession(season === undefined ? { title_id: title.id } : { title_id: title.id, season });
      await saveActiveSession({
        session_id: res.session_id,
        title_id: title.id,
        title_name: title.name,
        ...(season === undefined ? {} : { season }),
        questions: res.questions,
        answers: {},
        started_at: Date.now(),
      });
      router.replace({ pathname: "/quiz/[sessionId]", params: { sessionId: res.session_id } });
    } catch (err) {
      setStartError(err);
    } finally {
      setStarting(false);
    }
  };

  if (title === undefined && !error) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (error || !title) {
    return (
      <Screen>
        <BackLink />
        <Notice error={error ?? new Error("title_not_found")} onRetry={load} />
      </Screen>
    );
  }

  const seasonOptions: (number | undefined)[] = title.kind === "series" && title.seasons.length > 0 ? [undefined, ...title.seasons] : [];

  return (
    <Screen>
      <BackLink />
      <Animated.View entering={FadeInDown.springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.headerCard}>
        <LinearGradient colors={["#2A2552", "#15152A"]} style={styles.headerGradient}>
          <Text style={styles.kind}>
            {(title.kind === "series" ? t("home.series") : t("home.movie")).toUpperCase()}
            {title.release_year ? ` · ${title.release_year}` : ""}
          </Text>
          <Text style={styles.name}>{title.name}</Text>
          {title.synopsis ? <Text style={styles.synopsis}>{title.synopsis}</Text> : null}
        </LinearGradient>
      </Animated.View>

      {seasonOptions.length > 0 ? (
        <View style={styles.seasons}>
          {seasonOptions.map((s, i) => {
            const selected = s === season;
            return (
              <Animated.View key={s ?? "all"} entering={FadeInUp.delay(stagger(i, 30))}>
                <PressableScale
                  onPress={() => setSeason(s)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`season-${s ?? "all"}`}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {s === undefined ? t("title.allSeasons") : t("title.season", { n: s })}
                  </Text>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      ) : null}

      <Animated.View entering={FadeInUp.delay(160).springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.cta}>
        <Text style={styles.rules}>{t("title.rules")}</Text>
        {startError ? <Notice error={startError} /> : null}
        <Button label={starting ? t("title.starting") : t("title.play")} onPress={() => void play()} loading={starting} variant="gold" testID="play" />
      </Animated.View>
    </Screen>
  );
}

function BackLink() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.back} haptic={false} testID="back">
      <Text style={styles.backText}>‹ {t("common.back")}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  back: { alignSelf: "flex-start", paddingVertical: spacing.sm, paddingRight: spacing.md, marginBottom: spacing.sm },
  backText: { ...fonts.bodyStrong, color: colors.accent },
  headerCard: { borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  headerGradient: { padding: spacing.xl, gap: spacing.sm },
  kind: { ...fonts.caption, color: colors.textMuted, letterSpacing: 1.4 },
  name: { ...fonts.display, color: colors.text },
  synopsis: { ...fonts.body, color: colors.textMuted, lineHeight: 23 },
  seasons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xl },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { ...fonts.bodyStrong, color: colors.textMuted },
  chipTextSelected: { color: colors.text },
  cta: { marginTop: spacing.xxl, gap: spacing.md },
  rules: { ...fonts.caption, color: colors.textMuted, textAlign: "center" },
});
