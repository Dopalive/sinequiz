export const COINS = {
  CORRECT_EASY: 10,
  CORRECT_HARD: 15,
  SESSION_FINISH: 20,
  PERFECT_BONUS: 50,
  WELCOME: 100,
  JOKER_FIFTY_FIFTY: 30,
  JOKER_EXTRA_TIME: 20,
  JOKER_SKIP: 40,
} as const;

export type Difficulty = 1 | 2 | 3;
export type JokerKind = "fifty_fifty" | "extra_time" | "skip";
export const JOKER_KINDS: readonly JokerKind[] = ["fifty_fifty", "extra_time", "skip"];

export function coinsForAnswer(difficulty: Difficulty, isCorrect: boolean): number {
  if (!isCorrect) return 0;
  return difficulty === 3 ? COINS.CORRECT_HARD : COINS.CORRECT_EASY;
}

export function jokerCost(kind: JokerKind): number {
  switch (kind) {
    case "fifty_fifty": return COINS.JOKER_FIFTY_FIFTY;
    case "extra_time": return COINS.JOKER_EXTRA_TIME;
    case "skip": return COINS.JOKER_SKIP;
  }
}

/** Coins granted when a session is finished: finish bonus plus perfect bonus if every question was correct. */
export function sessionBonus(score: number, total: number): number {
  const perfect = total > 0 && score === total;
  return COINS.SESSION_FINISH + (perfect ? COINS.PERFECT_BONUS : 0);
}
