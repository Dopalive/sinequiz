import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { PressableScale } from "./PressableScale";
import { colors, fonts, radius, spacing } from "@/theme";

type Variant = "primary" | "gold" | "ghost" | "danger";

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, fg: "#0B0B12" },
  gold: { bg: colors.gold, fg: "#1A1300" },
  ghost: { bg: "transparent", fg: colors.text, border: colors.border },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.danger },
};

export function Button({ label, onPress, variant = "primary", disabled, loading, style, testID }: Props) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      onPress={onPress}
      disabled={inactive}
      style={[
        styles.base,
        { backgroundColor: p.bg, borderColor: p.border ?? p.bg, opacity: inactive ? 0.55 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : <Text style={[styles.label, { color: p.fg }]}>{label}</Text>}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { ...fonts.bodyStrong, letterSpacing: 0.2 },
});
