import type { JokerKind } from "@sinequiz/shared";
import { JOKER_KINDS, jokerCost } from "@sinequiz/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutUp } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/Button";
import { ChoiceButton, type ChoiceState } from "@/components/ChoiceButton";
import { CoinBadge } from "@/components/CoinBadge";
import { Confetti } from "@/components/Confetti";
import { Notice } from "@/components/Notice";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { TimerBar } from "@/components/TimerBar";
import { api, ApiCallError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DUR, SPRING } from "@/lib/motion";
import { clearActiveSession, loadActiveSession, nextOpenIndex, saveActiveSession, type ActiveSession, type AnsweredQuestion } from "@/lib/session";
import { colors, difficultyColor, fonts, radius, spacing } from "@/theme";

const QUESTION_SECONDS = 15;

type Phase = "answering" | "submitting" | "feedback" | "finishing";

export default function QuizScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { profile, setBalance } = useAuth();

  const [session, setSession] = useState<ActiveSession | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  const [chosen, setChosen] = useState<number | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const [jokerUsed, setJokerUsed] = useState<JokerKind | null>(null);
  const [jokerBusy, setJokerBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confetti, setConfetti] = useState(0);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const submittingRef = useRef(false);

  // Load the mirrored session; a missing or foreign id sends the user home.
  useEffect(() => {
    void (async () => {
      const s = await loadActiveSession();
      if (!s || s.session_id !== sessionId) {
        setSession(null);
        return;
      }
      setSession(s);
      setIndex(nextOpenIndex(s));
    })();
  }, [sessionId]);

  const question = session && index < session.questions.length ? session.questions[index] : undefined;
  const result: AnsweredQuestion | undefined = question ? session?.answers[question.id] : undefined;

  const persist = useCallback(async (next: ActiveSession) => {
    setSession(next);
    await saveActiveSession(next);
  }, []);

  const submit = useCallback(
    async (choice: number | null) => {
      if (!session || !question || submittingRef.current) return;
      submittingRef.current = true;
      setChosen(choice);
      setPhase("submitting");
      setError(null);
      try {
        const res = await api.submitAnswer({ session_id: session.session_id, question_id: question.id, chosen_index: choice });
        const answered: AnsweredQuestion = {
          chosen_index: choice,
          correct_index: res.correct_index,
          is_correct: res.is_correct,
          coins_earned: res.coins_earned,
          skipped: false,
        };
        setBalance(res.coin_balance);
        await persist({ ...session, answers: { ...session.answers, [question.id]: answered } });
        if (res.is_correct) setConfetti((c) => c + 1);
        setPhase("feedback");
      } catch (err) {
        if (err instanceof ApiCallError && err.code === "already_answered") {
          // Replay after a crash: the server has the truth; we only know this question is closed.
          await persist({
            ...session,
            answers: { ...session.answers, [question.id]: { chosen_index: choice, correct_index: -1, is_correct: false, coins_earned: 0, skipped: true } },
          });
          setPhase("feedback");
        } else {
          setError(err);
          setPhase("answering");
          setChosen(null);
        }
      } finally {
        submittingRef.current = false;
      }
    },
    [session, question, persist, setBalance],
  );

  // Clock: ticks only while answering; 0 submits a time-out (chosen_index = null).
  useEffect(() => {
    if (phase !== "answering" || !question) return;
    const expired = secondsLeft <= 0;
    const id = setTimeout(
      () => {
        if (expired) void submit(null);
        else setSecondsLeft((s) => s - 1);
      },
      expired ? 0 : 1000,
    );
    return () => clearTimeout(id);
  }, [phase, secondsLeft, question, submit]);

  const next = async () => {
    if (!session) return;
    const nextIndex = index + 1;
    if (nextIndex < session.questions.length) {
      setIndex(nextIndex);
      setPhase("answering");
      setSecondsLeft(QUESTION_SECONDS);
      setChosen(null);
      setRemoved([]);
      setJokerUsed(null);
      setError(null);
      return;
    }
    setPhase("finishing");
    try {
      const res = await api.finishSession({ session_id: session.session_id });
      setBalance(res.coin_balance);
      await clearActiveSession();
      // Round total = every per-answer award the server reported + the finish bonus it just paid.
      const answerCoins = Object.values(session.answers).reduce((sum, a) => sum + a.coins_earned, 0);
      router.replace({
        pathname: "/result/[sessionId]",
        params: { sessionId: session.session_id, score: res.score, total: res.total, coins: answerCoins + res.coins_earned, balance: res.coin_balance, titleId: session.title_id },
      });
    } catch (err) {
      if (err instanceof ApiCallError && (err.code === "session_finished" || err.code === "session_not_found")) {
        await clearActiveSession();
        router.replace("/");
        return;
      }
      setError(err);
      setPhase("feedback");
    }
  };

  const playJoker = async (kind: JokerKind) => {
    if (!session || !question || phase !== "answering" || jokerUsed || jokerBusy) return;
    setJokerBusy(true);
    setError(null);
    try {
      const res = await api.useJoker({ session_id: session.session_id, question_id: question.id, kind });
      setBalance(res.coin_balance);
      setJokerUsed(kind);
      if (res.kind === "fifty_fifty") setRemoved(res.remove_indices);
      if (res.kind === "extra_time") setSecondsLeft((s) => s + res.extra_seconds);
      if (res.kind === "skip") {
        await persist({
          ...session,
          answers: { ...session.answers, [question.id]: { chosen_index: null, correct_index: -1, is_correct: false, coins_earned: 0, skipped: true } },
        });
        setPhase("feedback");
      }
    } catch (err) {
      setError(err);
    } finally {
      setJokerBusy(false);
    }
  };

  if (session === undefined) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (session === null) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <Notice error={new ApiCallError("session_not_found", 404)} />
        <Button label={t("profile.home")} variant="ghost" onPress={() => router.replace("/")} />
      </Screen>
    );
  }
  if (!question) {
    // Every question is closed but the session was never finished (crash between last answer and finish).
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        {error ? <Notice error={error} /> : null}
        <Button label={t("quiz.finish")} variant="gold" onPress={() => void next()} loading={phase === "finishing"} />
      </Screen>
    );
  }

  const total = session.questions.length;
  const balance = profile?.coin_balance ?? 0;
  const isLast = index === total - 1;

  const choiceState = (i: number): ChoiceState => {
    if (result) {
      if (result.skipped) return "locked";
      if (i === result.correct_index) return result.is_correct ? "correct" : "revealed";
      if (i === result.chosen_index) return "wrong";
      return "locked";
    }
    if (removed.includes(i)) return "removed";
    if (phase === "submitting") return i === chosen ? "pending" : "locked";
    return "idle";
  };

  return (
    <Screen scroll={false}>
      <Confetti key={confetti} trigger={confetti} count={confetti > 0 ? 28 : 0} />

      <View style={styles.top}>
        <PressableScale onPress={() => setConfirmQuit(true)} style={styles.quit} haptic={false} testID="quit">
          <Text style={styles.quitText}>✕</Text>
        </PressableScale>
        <Text style={styles.progress}>{t("quiz.question", { n: index + 1, total })}</Text>
        <CoinBadge balance={balance} />
      </View>

      <TimerBar secondsLeft={secondsLeft} totalSeconds={QUESTION_SECONDS} frozen={phase !== "answering"} />

      <Animated.View key={question.id} entering={FadeInDown.springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.card}>
        <View style={[styles.diff, { borderColor: difficultyColor(question.difficulty) }]}>
          <Text style={[styles.diffText, { color: difficultyColor(question.difficulty) }]}>{t(`quiz.difficulty.${question.difficulty}`)}</Text>
        </View>
        <Text style={styles.prompt}>{question.prompt}</Text>
      </Animated.View>

      <View style={styles.choices} key={`choices-${question.id}`}>
        {question.choices.map((label, i) => (
          <ChoiceButton key={`${question.id}-${i}`} index={i} label={label} state={choiceState(i)} onPress={() => void submit(i)} />
        ))}
      </View>

      {error ? <Notice error={error} /> : null}

      <View style={styles.bottom}>
        {result ? (
          <Animated.View entering={FadeInUp.springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.feedbackRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.feedback, { color: result.skipped ? colors.textMuted : result.is_correct ? colors.success : colors.danger }]}>
                {result.skipped ? t("quiz.skipped") : result.is_correct ? t("quiz.correct") : result.chosen_index === null ? t("quiz.timeUp") : t("quiz.wrong")}
              </Text>
              {result.coins_earned > 0 ? <Text style={styles.earned}>+{result.coins_earned} ¢</Text> : null}
            </View>
            <Button label={isLast ? t("quiz.finish") : t("quiz.next")} onPress={() => void next()} loading={phase === "finishing"} variant={isLast ? "gold" : "primary"} testID="next" />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(DUR.standard)} exiting={FadeOutUp.duration(DUR.quick)} style={styles.jokers}>
            {JOKER_KINDS.map((kind) => {
              const cost = jokerCost(kind);
              const disabled = phase !== "answering" || jokerUsed !== null || jokerBusy || balance < cost;
              return (
                <PressableScale
                  key={kind}
                  onPress={() => void playJoker(kind)}
                  disabled={disabled}
                  style={[styles.joker, disabled && styles.jokerDisabled]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled }}
                  testID={`joker-${kind}`}
                >
                  <Text style={styles.jokerLabel}>{t(`quiz.joker.${kind}`)}</Text>
                  <Text style={styles.jokerCost}>−{cost} ¢</Text>
                </PressableScale>
              );
            })}
          </Animated.View>
        )}
      </View>

      {confirmQuit ? (
        <Animated.View entering={FadeIn.duration(DUR.standard)} exiting={FadeOut.duration(DUR.quick)} style={styles.overlay}>
          <Animated.View entering={FadeInUp.springify().stiffness(SPRING.pop.stiffness).damping(SPRING.pop.damping)} style={styles.dialog}>
            <Text style={styles.dialogText}>{t("quiz.quitConfirm")}</Text>
            <View style={styles.dialogRow}>
              <Button label={t("quiz.stay")} variant="ghost" onPress={() => setConfirmQuit(false)} style={{ flex: 1 }} />
              <Button label={t("quiz.leave")} variant="danger" onPress={() => router.replace("/")} style={{ flex: 1 }} testID="confirm-quit" />
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: spacing.lg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  quit: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  quitText: { color: colors.textMuted, fontSize: 16, fontWeight: "700" },
  progress: { ...fonts.caption, color: colors.textMuted },
  card: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    minHeight: 150,
    justifyContent: "center",
  },
  diff: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
  diffText: { ...fonts.caption, fontSize: 11, letterSpacing: 0.8 },
  prompt: { ...fonts.title, color: colors.text, lineHeight: 30 },
  choices: { marginTop: spacing.xl, gap: spacing.sm },
  bottom: { marginTop: "auto", paddingTop: spacing.lg, minHeight: 84, justifyContent: "flex-end" },
  jokers: { flexDirection: "row", gap: spacing.sm },
  joker: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  jokerDisabled: { opacity: 0.4 },
  jokerLabel: { ...fonts.bodyStrong, color: colors.text },
  jokerCost: { ...fonts.caption, color: colors.gold },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  feedback: { ...fonts.title },
  earned: { ...fonts.bodyStrong, color: colors.gold, marginTop: 2 },
  overlay: { position: "absolute", inset: 0, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.xl, zIndex: 100 },
  dialog: { width: "100%", maxWidth: 420, padding: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.cardRaised, borderWidth: 1, borderColor: colors.border, gap: spacing.xl },
  dialogText: { ...fonts.body, color: colors.text, textAlign: "center", lineHeight: 24 },
  dialogRow: { flexDirection: "row", gap: spacing.md },
});
