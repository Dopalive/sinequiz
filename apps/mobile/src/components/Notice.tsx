import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { ApiCallError } from "@/lib/api";
import { DUR } from "@/lib/motion";
import { colors, fonts, radius, spacing } from "@/theme";

interface Props {
  error: unknown;
  onRetry?: () => void;
  tone?: "danger" | "muted";
}

/** Maps any thrown error to a localized sentence. Business errors keep their code; the rest are generic. */
export function errorMessage(t: (k: string) => string, error: unknown): string {
  if (error instanceof ApiCallError) return t(`errors.${error.code}`);
  if (error instanceof Error && /network|fetch/i.test(error.message)) return t("errors.network");
  return t("common.error");
}

export function Notice({ error, onRetry, tone = "danger" }: Props) {
  const { t } = useTranslation();
  const danger = tone === "danger";
  return (
    <Animated.View
      entering={FadeInDown.duration(DUR.standard)}
      exiting={FadeOutUp.duration(DUR.quick)}
      style={[styles.box, danger ? styles.danger : styles.muted]}
    >
      <Text style={[styles.text, { color: danger ? colors.danger : colors.textMuted }]}>{errorMessage(t, error)}</Text>
      {__DEV__ && error instanceof Error ? <Text style={styles.debug}>{error.message}</Text> : null}
      {onRetry ? <Button label={t("common.retry")} variant="ghost" onPress={onRetry} style={styles.btn} /> : null}
    </Animated.View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={[styles.box, styles.muted]}>
      <Text style={[styles.text, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  muted: { backgroundColor: colors.card, borderColor: colors.border },
  text: { ...fonts.body, textAlign: "center" },
  debug: { ...fonts.caption, color: colors.textMuted, textAlign: "center", fontFamily: "monospace" },
  btn: { alignSelf: "center", minHeight: 44, paddingVertical: spacing.sm },
});
