// Brand motion identity (see .claude/skills/motion-design): ONE personality, applied everywhere.
// Personality: Energetic / Playful — a quiz is a game. Entrances overshoot ~10%, exits are quick.
import { Easing, withSpring, withTiming, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";

/** Duration palette: quick / standard / slow. */
export const DUR = { quick: 120, standard: 240, slow: 420 } as const;

/** Signature springs. `pop` is for entrances and success, `snap` for press feedback, `settle` for layout. */
export const SPRING = {
  pop: { stiffness: 260, damping: 16, mass: 0.9 } satisfies WithSpringConfig,
  snap: { stiffness: 420, damping: 26, mass: 0.8 } satisfies WithSpringConfig,
  settle: { stiffness: 220, damping: 22, mass: 1 } satisfies WithSpringConfig,
} as const;

/** MD3 emphasized decelerate for entrances, accelerate for exits. */
export const EASE = {
  enter: Easing.bezier(0.05, 0.7, 0.1, 1),
  exit: Easing.bezier(0.3, 0, 1, 1),
  standard: Easing.bezier(0.2, 0, 0, 1),
  ambient: Easing.inOut(Easing.sin),
} as const;

export const timing = (duration: number, easing = EASE.standard): WithTimingConfig => ({ duration, easing });

export const pop = (to: number) => withSpring(to, SPRING.pop);
export const snap = (to: number) => withSpring(to, SPRING.snap);
export const fade = (to: number, duration: number = DUR.standard) => withTiming(to, timing(duration));

/** Micro-cascade stagger for grids/lists: 20-40ms per item, capped so the whole budget stays < 400ms. */
export const stagger = (index: number, step = 36, cap = 10) => Math.min(index, cap) * step;
