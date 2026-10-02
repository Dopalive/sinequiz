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

const DIFFICULTIES: Difficulty[] = [1, 2, 3];

/**
 * Splits `total` across difficulties in proportion to DIFFICULTY_TARGETS using
 * the largest-remainder (Hamilton) method, so quotas always sum to `total`.
 * Ties on the remainder go to the lower difficulty.
 */
function quotas(total: number): Record<Difficulty, number> {
  const weightSum = DIFFICULTIES.reduce((s, d) => s + DIFFICULTY_TARGETS[d], 0);
  const out = { 1: 0, 2: 0, 3: 0 } as Record<Difficulty, number>;
  const remainders: { d: Difficulty; r: number }[] = [];
  let assigned = 0;
  for (const d of DIFFICULTIES) {
    const exact = (total * DIFFICULTY_TARGETS[d]) / weightSum;
    out[d] = Math.floor(exact);
    assigned += out[d];
    remainders.push({ d, r: exact - out[d] });
  }
  remainders.sort((a, b) => b.r - a.r || a.d - b.d);
  for (let i = 0; i < total - assigned; i++) out[remainders[i]!.d] += 1;
  return out;
}

/**
 * Picks up to `total` questions aiming for the 3/4/3 difficulty split.
 * Buckets that are short are topped up from whatever remains, shuffled.
 * A question id is never returned twice, even if the candidates repeat it.
 */
export function pickQuestions<T extends { id: string; difficulty: Difficulty }>(
  candidates: T[],
  opts: PickOptions = {},
): T[] {
  const total = opts.total ?? SESSION_SIZE;
  const rng = opts.rng ?? Math.random;
  if (total <= 0 || candidates.length === 0) return [];

  const want = quotas(total);
  const picked: T[] = [];
  const pickedIds = new Set<string>();

  for (const d of DIFFICULTIES) {
    const bucket = shuffle(candidates.filter((q) => q.difficulty === d), rng);
    let taken = 0;
    for (const q of bucket) {
      if (taken >= want[d]) break;
      if (pickedIds.has(q.id)) continue;
      picked.push(q);
      pickedIds.add(q.id);
      taken++;
    }
  }

  if (picked.length < total) {
    const leftovers = shuffle(candidates.filter((q) => !pickedIds.has(q.id)), rng);
    for (const q of leftovers) {
      if (picked.length >= total) break;
      if (pickedIds.has(q.id)) continue;
      picked.push(q);
      pickedIds.add(q.id);
    }
  }

  return shuffle(picked, rng);
}
