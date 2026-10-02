import type { Difficulty } from "./coins.ts";

export const SESSION_SIZE = 10;
export const DIFFICULTY_TARGETS: Record<Difficulty, number> = { 1: 3, 2: 4, 3: 3 };

export interface PickOptions {
  total?: number;
  /** Returns a float in [0, 1). Defaults to Math.random. Injectable for tests. */
  rng?: () => number;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Picks up to `total` questions aiming for the 3/4/3 difficulty split.
 * Buckets that are short are topped up from whatever remains, shuffled.
 */
export function pickQuestions<T extends { id: string; difficulty: Difficulty }>(
  candidates: T[],
  opts: PickOptions = {},
): T[] {
  const total = opts.total ?? SESSION_SIZE;
  const rng = opts.rng ?? Math.random;
  if (total <= 0 || candidates.length === 0) return [];

  const scale = total / SESSION_SIZE;
  const picked: T[] = [];
  const pickedIds = new Set<string>();

  for (const d of [1, 2, 3] as Difficulty[]) {
    const want = Math.round(DIFFICULTY_TARGETS[d] * scale);
    const bucket = shuffle(candidates.filter((q) => q.difficulty === d), rng);
    for (const q of bucket.slice(0, want)) {
      picked.push(q);
      pickedIds.add(q.id);
    }
  }

  if (picked.length < total) {
    const leftovers = shuffle(candidates.filter((q) => !pickedIds.has(q.id)), rng);
    for (const q of leftovers) {
      if (picked.length >= total) break;
      picked.push(q);
      pickedIds.add(q.id);
    }
  }

  return shuffle(picked.slice(0, total), rng);
}
