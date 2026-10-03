import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";

interface Props {
  children: ReactNode;
  /** Scrollable body (default) or a fixed flex column for game screens. */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Dark stage with safe-area padding and a max content width so web doesn't stretch to the monitor. */
export function Screen({ children, scroll = true, style, contentStyle }: Props) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg };
  if (!scroll) {
    return (
      <View style={[styles.root, style]}>
        <View style={[styles.content, pad, contentStyle]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView style={[styles.root, style]} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={[styles.content, pad, contentStyle]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1 },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
  },
});
