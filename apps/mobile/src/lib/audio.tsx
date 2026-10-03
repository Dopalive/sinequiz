// Sound layer (expo-audio). Same personality as src/lib/motion.ts: short, bright, arcade-ish SFX plus a quiet
// minor-key ambient loop. Assets are synthesized by scripts/gen-sfx.mjs; levels are baked into the files.
//
// Decisions:
// - Ambient STOPS during a quiz (not ducked): the timer, tick and answer sounds need a clean stage. Screens
//   opt in with startAmbient() / stopAmbient() from useFocusEffect; start/stop fade in/out.
// - Silent mode is respected: playsInSilentMode=false (iOS ring/silent switch; Android silent/vibrate) and
//   interruptionMode='mixWithOthers', so the user's own music keeps playing. A game's UI sounds should never
//   override the mute switch.
// - Web autoplay: browsers reject play() before the first user gesture (and expo-audio's web player does
//   not catch that rejection). So on web no player is created and nothing plays until the page has user
//   activation; a capture-phase gesture listener then loads the players and starts any pending ambient.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer, AudioSource } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

export type SoundName = "tap" | "correct" | "wrong" | "tick" | "timeup" | "joker" | "coin" | "fanfare" | "perfect";

const SFX: Record<SoundName, AudioSource> = {
  tap: require("../../assets/sfx/tap.wav"),
  correct: require("../../assets/sfx/correct.wav"),
  wrong: require("../../assets/sfx/wrong.wav"),
  tick: require("../../assets/sfx/tick.wav"),
  timeup: require("../../assets/sfx/timeup.wav"),
  joker: require("../../assets/sfx/joker.wav"),
  coin: require("../../assets/sfx/coin.wav"),
  fanfare: require("../../assets/sfx/fanfare.wav"),
  perfect: require("../../assets/sfx/perfect.wav"),
};
const AMBIENT: AudioSource = require("../../assets/sfx/ambient.wav");

/** Players per sound, used round-robin so rapid repeats (taps) overlap instead of cutting each other off. */
const VOICES: Record<SoundName, number> = { tap: 3, correct: 1, wrong: 1, tick: 1, timeup: 1, joker: 1, coin: 2, fanfare: 1, perfect: 1 };

const AMBIENT_VOLUME = 0.25;
const FADE_IN_MS = 1200;
const FADE_OUT_MS = 350;
const FADE_STEP_MS = 50;
export const MUTED_KEY = "sinequiz.audio.muted.v1";

const isWeb = Platform.OS === "web";
let gestureSeen = false;

/** True once the browser will allow play(); always true on native. */
function canPlay(): boolean {
  if (!isWeb) return true;
  const activation = (globalThis.navigator as (Navigator & { userActivation?: { hasBeenActive: boolean } }) | undefined)?.userActivation;
  return activation ? activation.hasBeenActive : gestureSeen;
}

function devWarn(message: string, err?: unknown) {
  if (__DEV__) console.warn(`[audio] ${message}`, err ?? "");
}

/** Imperative engine outside React: owns the players, the fade timer and the ambient state machine. */
class SoundEngine {
  private pools = new Map<SoundName, { players: AudioPlayer[]; next: number }>();
  private ambient: AudioPlayer | null = null;
  private subs: { remove: () => void }[] = [];
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private loaded = false;
  private prefsReady = false;
  private muted = false;
  private wantAmbient = false;
  private foreground = true;
  private ambientOn = false;

  /** Creates every player once. On web only after user activation. Returns whether players exist. */
  private ensureLoaded(): boolean {
    if (this.loaded) return true;
    if (!canPlay()) return false;
    try {
      for (const name of Object.keys(SFX) as SoundName[]) {
        const players = Array.from({ length: VOICES[name] }, () => this.create(name, SFX[name]));
        this.pools.set(name, { players, next: 0 });
      }
      const ambient = this.create("ambient", AMBIENT);
      ambient.loop = true;
      ambient.volume = 0;
      this.ambient = ambient;
      this.loaded = true;
    } catch (err) {
      devWarn("could not create players", err);
    }
    return this.loaded;
  }

  private create(label: string, source: AudioSource): AudioPlayer {
    const player = createAudioPlayer(source);
    let warned = false;
    this.subs.push(
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.error && !warned) {
          warned = true;
          devWarn(`${label}.wav failed to load/play: ${status.error}`);
        }
      }),
    );
    return player;
  }

  play(name: SoundName) {
    if (this.muted || !this.prefsReady || !this.foreground || !this.ensureLoaded()) return;
    const pool = this.pools.get(name);
    const player = pool?.players[pool.next % pool.players.length];
    if (!pool || !player) return;
    pool.next += 1;
    try {
      player.seekTo(0).catch(() => undefined);
      player.play();
    } catch (err) {
      devWarn(`play(${name}) failed`, err);
    }
  }

  setPrefs(muted: boolean) {
    this.muted = muted;
    this.prefsReady = true;
    this.reconcile();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.reconcile();
  }

  setWantAmbient(want: boolean) {
    this.wantAmbient = want;
    this.reconcile();
  }

  setForeground(foreground: boolean) {
    this.foreground = foreground;
    // Timers are suspended in the background on native, so leave without a fade.
    this.reconcile(!foreground);
  }

  /** Web gesture hook. Returns true once audio is unlocked (the listener can detach). */
  unlock(): boolean {
    gestureSeen = true;
    if (!this.ensureLoaded()) return false;
    this.reconcile();
    return true;
  }

  private reconcile(immediate = false) {
    const should = this.wantAmbient && !this.muted && this.prefsReady && this.foreground;
    if (should && !this.ambientOn) {
      if (!this.ensureLoaded() || !this.ambient) return; // web before the first gesture: unlock() retries
      this.ambientOn = true;
      try {
        if (!this.ambient.playing) this.ambient.play();
        this.fadeTo(AMBIENT_VOLUME, FADE_IN_MS);
      } catch (err) {
        devWarn("ambient start failed", err);
      }
    } else if (!should && this.ambientOn) {
      this.ambientOn = false;
      this.fadeTo(0, immediate ? 0 : FADE_OUT_MS);
    }
  }

  private fadeTo(target: number, ms: number) {
    const player = this.ambient;
    if (!player) return;
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    const finish = () => {
      try {
        player.volume = target;
        if (target === 0) player.pause();
      } catch {
        // player released mid-fade
      }
    };
    const steps = Math.floor(ms / FADE_STEP_MS);
    if (steps <= 0) return finish();
    const from = player.volume;
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i += 1;
      if (i >= steps) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        finish();
        return;
      }
      try {
        player.volume = from + ((target - from) * i) / steps;
      } catch {
        // ignore
      }
    }, FADE_STEP_MS);
  }

  release() {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    for (const sub of this.subs) sub.remove();
    this.subs = [];
    const all = [...[...this.pools.values()].flatMap((p) => p.players), ...(this.ambient ? [this.ambient] : [])];
    for (const player of all) {
      try {
        player.release();
      } catch {
        // already gone
      }
    }
    this.pools.clear();
    this.ambient = null;
    this.loaded = false;
    this.ambientOn = false;
  }
}

interface AudioApi {
  /** Fire-and-forget SFX. Silently does nothing when muted, before prefs load, or on web before a gesture. */
  play: (name: SoundName) => void;
  /** Ask for the ambient loop (fades in; on web waits for the first gesture). */
  startAmbient: () => void;
  /** Fade the ambient loop out. */
  stopAmbient: () => void;
  muted: boolean;
  /** Persisted under `sinequiz.audio.muted.v1`. Muting stops ambient and suppresses SFX. */
  setMuted: (muted: boolean) => void;
}

const noop = () => undefined;
const SILENT: AudioApi = { play: noop, startAmbient: noop, stopAmbient: noop, muted: true, setMuted: noop };

const AudioCtx = createContext<AudioApi | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new SoundEngine());
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isWeb) {
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }).catch((err: unknown) => devWarn("setAudioModeAsync failed", err));
    }
    AsyncStorage.getItem(MUTED_KEY)
      .then((v) => {
        if (cancelled) return;
        const m = v === "1";
        setMutedState(m);
        engine.setPrefs(m);
      })
      .catch(() => {
        if (!cancelled) engine.setPrefs(false);
      });

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") engine.setForeground(true);
      else if (state === "background") engine.setForeground(false);
    });

    let detach = noop;
    if (isWeb && typeof window !== "undefined") {
      const events = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;
      const onGesture = () => {
        if (engine.unlock()) detach();
      };
      for (const e of events) window.addEventListener(e, onGesture, { capture: true, passive: true });
      detach = () => {
        for (const e of events) window.removeEventListener(e, onGesture, { capture: true });
      };
    }

    return () => {
      cancelled = true;
      appState.remove();
      detach();
      engine.release();
    };
  }, [engine]);

  const play = useCallback((name: SoundName) => engine.play(name), [engine]);
  const startAmbient = useCallback(() => engine.setWantAmbient(true), [engine]);
  const stopAmbient = useCallback(() => engine.setWantAmbient(false), [engine]);
  const setMuted = useCallback(
    (m: boolean) => {
      setMutedState(m);
      engine.setMuted(m);
      AsyncStorage.setItem(MUTED_KEY, m ? "1" : "0").catch((err: unknown) => devWarn("could not persist mute", err));
    },
    [engine],
  );

  const value = useMemo<AudioApi>(() => ({ play, startAmbient, stopAmbient, muted, setMuted }), [play, startAmbient, stopAmbient, muted, setMuted]);
  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

/** Sound API. Outside an AudioProvider it is a silent no-op, so components stay usable in isolation. */
export function useAudio(): AudioApi {
  return useContext(AudioCtx) ?? SILENT;
}
