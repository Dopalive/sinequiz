import { LinearGradient } from "expo-linear-gradient";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { PressableScale } from "./PressableScale";
import { SPRING, stagger } from "@/lib/motion";
import type { TitleSummary } from "@/lib/titles";
import { colors, fonts, radius, spacing } from "@/theme";

interface Props {
  title: TitleSummary;
  index: number;
  onPress: () => void;
}

// Deterministic gradient per title so posterless cards still feel distinct.
const PALETTES: [string, string][] = [
  ["#5B3FD9", "#1B1040"],
  ["#D94A6A", "#3A1020"],
  ["#1E8A7A", "#0B2E2A"],
  ["#D98A2B", "#3A2208"],
  ["#2E6FD9", "#0C1C40"],
  ["#8A2ED9", "#240C40"],
];
function paletteFor(slug: string): [string, string] {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length]!;
}

export function TitleCard({ title, index, onPress }: Props) {
  const { t } = useTranslation();
  const [c1, c2] = paletteFor(title.slug);
  const initials = title.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <Animated.View
      style={styles.wrap}
      entering={FadeInUp.delay(stagger(index)).springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)}
    >
      <PressableScale
        onPress={onPress}
        pressScale={0.975}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={title.name}
        testID={`title-${title.slug}`}
      >
        <View style={styles.poster}>
          {title.poster_url ? (
            <Image source={{ uri: title.poster_url }} style={styles.posterImg} resizeMode="cover" />
          ) : (
            <LinearGradient colors={[c1, c2]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.posterImg}>
              <Text style={styles.initials}>{initials}</Text>
              <View style={styles.filmStrip}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={styles.hole} />
                ))}
              </View>
            </LinearGradient>
          )}
          <View style={styles.kindChip}>
            <Text style={styles.kindText}>{title.kind === "series" ? t("home.series") : t("home.movie")}</Text>
          </View>
        </View>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {title.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {title.release_year ? `${title.release_year} · ` : ""}
            {t("home.questions", { count: title.active_questions })}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  poster: { aspectRatio: 2 / 3, width: "100%" },
  posterImg: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  initials: { ...fonts.display, fontSize: 44, color: "rgba(255,255,255,0.92)" },
  filmStrip: {
    position: "absolute",
    left: 8,
    top: 10,
    bottom: 10,
    width: 10,
    justifyContent: "space-between",
  },
  hole: { width: 10, height: 14, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.35)" },
  kindChip: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(11,11,18,0.72)",
  },
  kindText: { ...fonts.caption, color: colors.text, fontSize: 11 },
  meta: { padding: spacing.md, gap: 2 },
  name: { ...fonts.bodyStrong, color: colors.text },
  sub: { ...fonts.caption, color: colors.textMuted },
});
