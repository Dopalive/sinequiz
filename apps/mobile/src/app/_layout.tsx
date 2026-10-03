import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Notice } from "@/components/Notice";
import { AudioProvider } from "@/lib/audio";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DUR } from "@/lib/motion";
import { colors, fonts, spacing } from "@/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <AudioProvider>
            <StatusBar style="light" />
            <Gate />
          </AudioProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Holds the router until the anonymous session + profile exist, so every screen can assume a user. */
function Gate() {
  const { loading, error, profile, retry } = useAuth();
  const { t } = useTranslation();

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.wordmark}>{t("app.name")}</Text>
        <Notice error={new Error(error)} onRetry={retry} />
      </View>
    );
  }
  if (loading || !profile) {
    return (
      <View style={styles.center}>
        <Animated.Text entering={FadeIn.duration(DUR.slow)} style={styles.wordmark}>
          {t("app.name")}
        </Animated.Text>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
        animationDuration: DUR.slow,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="title/[id]" />
      <Stack.Screen name="quiz/[sessionId]" options={{ gestureEnabled: false, animation: "fade" }} />
      <Stack.Screen name="result/[sessionId]" options={{ gestureEnabled: false, animation: "fade_from_bottom" }} />
      <Stack.Screen name="profile" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: spacing.xl, padding: spacing.xl },
  wordmark: { ...fonts.display, color: colors.text },
});
