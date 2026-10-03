#!/usr/bin/env node
// Synthesizes SineQuiz's sound effects + ambient loop into assets/sfx/*.wav (16-bit PCM, mono, 22050 Hz).
// No dependencies, deterministic output (seeded noise), so re-running produces byte-identical files.
//
// Sound identity mirrors src/lib/motion.ts (Energetic/Playful): short, bright, arcade-ish, soft attacks,
// nothing harsh. Levels are baked into the files (iOS Safari ignores programmatic volume), so the app plays
// every SFX at volume 1 and only the ambient loop is attenuated at runtime.
//
//   pnpm --filter @sinequiz/mobile gen:sfx
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "sfx");
const TAU = Math.PI * 2;

// ---------- primitives ----------

/** Mulberry32: tiny seeded PRNG so noise-based sounds are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buf = (seconds) => new Float32Array(Math.round(seconds * SR));
const note = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI note -> Hz
const N = { A2: 45, C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, E6: 88, G6: 91, B6: 95, C7: 96, E7: 100, G7: 103, C8: 108 };

/**
 * Adds a tone into `out` starting at `start` seconds. `partials` = [[harmonicRatio, gain], ...].
 * Envelope: linear attack, exponential decay with time constant `decay`, short linear release at the end so
 * every voice lands on exactly zero (no clicks). `glide` bends the pitch by that many semitones over the note.
 * `wrap` adds circularly (index mod length) so tails cross a loop boundary seamlessly.
 */
function tone(out, { start = 0, freq, dur, gain = 0.5, attack = 0.004, decay = Infinity, release = 0.012, partials = [[1, 1]], glide = 0, vibrato = 0, wrap = false }) {
  const s0 = Math.round(start * SR);
  const len = Math.round(dur * SR);
  const rel = Math.max(1, Math.round(release * SR));
  const phase = partials.map(() => 0);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let env = Math.min(1, t / attack) * (Number.isFinite(decay) ? Math.exp(-t / decay) : 1);
    if (i > len - rel) env *= (len - i) / rel;
    const f = freq * 2 ** ((glide * (i / len)) / 12) * (1 + vibrato * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.25));
    let v = 0;
    for (let p = 0; p < partials.length; p++) {
      const [ratio, g] = partials[p];
      phase[p] += (TAU * f * ratio) / SR;
      v += Math.sin(phase[p]) * g;
    }
    let idx = s0 + i;
    if (wrap) idx = ((idx % out.length) + out.length) % out.length;
    else if (idx >= out.length) break;
    out[idx] += v * env * gain;
  }
}

/** Filtered noise burst; `center` sweeps from `from` to `to` Hz through a 2-pole resonant bandpass. */
function noise(out, { start = 0, dur, gain = 0.2, attack = 0.002, decay = Infinity, from = 2000, to = 2000, q = 1.2, seed = 1 }) {
  const rand = rng(seed);
  const s0 = Math.round(start * SR);
  const len = Math.round(dur * SR);
  const rel = Math.max(1, Math.round(0.01 * SR));
  let lp = 0;
  let bp = 0;
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    const t = i / SR;
    const fc = from * (to / from) ** (i / len);
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 4)) / SR);
    const x = rand() * 2 - 1;
    // Chamberlin state-variable filter, bandpass output.
    lp += f * bp;
    const hp = x - lp - bp / q;
    bp += f * hp;
    let env = Math.min(1, t / attack) * (Number.isFinite(decay) ? Math.exp(-t / decay) : 1);
    if (i > len - rel) env *= (len - i) / rel;
    out[s0 + i] += bp * env * gain;
  }
}

/**
 * One-pole lowpass in place (softens buzzy waveforms). `circular` runs a silent warm-up lap first so the
 * filter state at sample 0 equals its state at the end: required for a seamless loop.
 */
function lowpass(x, cutoff, circular = false) {
  const a = 1 - Math.exp((-TAU * cutoff) / SR);
  let y = 0;
  if (circular) for (let i = 0; i < x.length; i++) y += a * ((x[i] ?? 0) - y);
  for (let i = 0; i < x.length; i++) x[i] = y += a * (x[i] - y);
  return x;
}

/** Scales to a target peak, then a gentle tanh safety knee; guarantees no hard clipping. */
function master(x, peak) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  const k = m > 0 ? peak / m : 1;
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * k * 1.05) / Math.tanh(1.05);
  // Hard guarantee that the file starts and ends on silence.
  const edge = Math.min(32, x.length >> 2);
  for (let i = 0; i < edge; i++) x[x.length - 1 - i] *= i / edge;
  return x;
}

function wav(name, x) {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); // PCM chunk size
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); // byte rate
  h.writeUInt16LE(2, 32); // block align
  h.writeUInt16LE(16, 34); // bits
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  const file = join(OUT, `${name}.wav`);
  writeFileSync(file, Buffer.concat([h, data]));
  return { name, bytes: 44 + data.length, seconds: x.length / SR };
}

// Timbres. Bell = sine + soft upper partials; brass-ish = band-limited saw (few harmonics); pluck = sine + 2nd.
const BELL = [[1, 1], [2, 0.32], [3, 0.12], [4.2, 0.05]];
const SQUAREISH = [[1, 1], [3, 0.28], [5, 0.12], [7, 0.05]];
const BRASS = [[1, 1], [2, 0.5], [3, 0.3], [4, 0.18], [5, 0.1]];
const PLUCK = [[1, 1], [2, 0.18]];

// ---------- sounds ----------

const sounds = {
  /** ~40ms UI click: a tiny high blip on a soft transient. */
  tap() {
    const x = buf(0.04);
    tone(x, { freq: 1750, dur: 0.04, gain: 0.6, attack: 0.001, decay: 0.007, release: 0.006 });
    noise(x, { dur: 0.012, gain: 0.5, attack: 0.0005, decay: 0.003, from: 4500, to: 3000, seed: 7 });
    return master(x, 0.32);
  },

  /** Bright two-note rising chime (C6 -> G6), ~350ms. */
  correct() {
    const x = buf(0.35);
    tone(x, { start: 0, freq: note(N.C6), dur: 0.2, gain: 0.55, decay: 0.12, partials: BELL });
    tone(x, { start: 0.085, freq: note(N.G6), dur: 0.265, gain: 0.7, decay: 0.14, partials: BELL });
    tone(x, { start: 0.085, freq: note(N.G6) * 2.001, dur: 0.2, gain: 0.08, decay: 0.06 }); // sparkle
    return master(x, 0.6);
  },

  /** Low muted double buzz, pitch sagging, lowpassed so it reads "nope" without being harsh. ~300ms. */
  wrong() {
    const x = buf(0.3);
    tone(x, { start: 0, freq: 155, dur: 0.13, gain: 0.5, attack: 0.008, release: 0.03, partials: SQUAREISH, glide: -1 });
    tone(x, { start: 0, freq: 157.5, dur: 0.13, gain: 0.35, attack: 0.008, release: 0.03, partials: SQUAREISH, glide: -1 });
    tone(x, { start: 0.15, freq: 123, dur: 0.15, gain: 0.5, attack: 0.008, release: 0.05, partials: SQUAREISH, glide: -2 });
    tone(x, { start: 0.15, freq: 125, dur: 0.15, gain: 0.35, attack: 0.008, release: 0.05, partials: SQUAREISH, glide: -2 });
    lowpass(x, 900);
    lowpass(x, 1400);
    return master(x, 0.5);
  },

  /** Soft clock tick (wood-block-ish), used once per second in the last 5s. */
  tick() {
    const x = buf(0.06);
    tone(x, { freq: 2100, dur: 0.05, gain: 0.5, attack: 0.0008, decay: 0.006, release: 0.01 });
    tone(x, { freq: 780, dur: 0.06, gain: 0.45, attack: 0.001, decay: 0.012, release: 0.015 });
    noise(x, { dur: 0.008, gain: 0.25, attack: 0.0005, decay: 0.002, from: 3500, to: 3500, seed: 3 });
    return master(x, 0.28);
  },

  /** Time's up: two soft falling notes (G5 -> C5) with a little glide on the tail. ~500ms. */
  timeup() {
    const x = buf(0.52);
    tone(x, { start: 0, freq: note(N.G5), dur: 0.16, gain: 0.5, decay: 0.12, partials: SQUAREISH });
    tone(x, { start: 0.17, freq: note(N.C5), dur: 0.35, gain: 0.55, decay: 0.2, partials: SQUAREISH, glide: -1.5, release: 0.08 });
    lowpass(x, 3200);
    return master(x, 0.5);
  },

  /** Joker: airy rising whoosh + a fast four-note sparkle arpeggio. ~550ms. */
  joker() {
    const x = buf(0.55);
    noise(x, { dur: 0.42, gain: 0.35, attack: 0.12, from: 500, to: 3800, q: 1.8, seed: 11 });
    [N.C7, N.E7, N.G7, N.C8].forEach((n, i) => {
      tone(x, { start: 0.12 + i * 0.055, freq: note(n), dur: 0.25, gain: 0.22, attack: 0.002, decay: 0.07, partials: [[1, 1], [2.01, 0.15]] });
    });
    return master(x, 0.5);
  },

  /** Coin collect: the classic B5 -> E6 ping. ~350ms. */
  coin() {
    const x = buf(0.35);
    tone(x, { start: 0, freq: note(N.B5), dur: 0.07, gain: 0.45, attack: 0.002, release: 0.008, partials: SQUAREISH });
    tone(x, { start: 0.07, freq: note(N.E6), dur: 0.28, gain: 0.5, attack: 0.002, decay: 0.11, partials: SQUAREISH });
    lowpass(x, 5000);
    return master(x, 0.45);
  },

  /** Short win jingle: C5 E5 G5 then a held C6 over a C-major bed. ~1.2s. */
  fanfare() {
    const x = buf(1.2);
    const step = 0.11;
    [N.C5, N.E5, N.G5].forEach((n, i) => {
      tone(x, { start: i * step, freq: note(n), dur: step * 1.1, gain: 0.45, attack: 0.006, decay: 0.15, partials: BRASS });
    });
    const t = step * 3;
    tone(x, { start: t, freq: note(N.C6), dur: 1.2 - t, gain: 0.5, attack: 0.01, decay: 0.45, release: 0.2, partials: BRASS, vibrato: 0.004 });
    [N.E5, N.G5].forEach((n) => tone(x, { start: t, freq: note(n), dur: 1.2 - t, gain: 0.22, attack: 0.02, decay: 0.4, release: 0.2, partials: BRASS }));
    tone(x, { start: t, freq: note(N.C6) * 2, dur: 0.5, gain: 0.08, decay: 0.12, partials: BELL });
    lowpass(x, 4200);
    return master(x, 0.6);
  },

  /** Perfect round: fast two-octave arpeggio into a shimmering C-major chord with sparkles. ~2.3s. */
  perfect() {
    const total = 2.3;
    const x = buf(total);
    const run = [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6];
    const step = 0.075;
    run.forEach((n, i) => {
      tone(x, { start: i * step, freq: note(n), dur: 0.22, gain: 0.38, attack: 0.004, decay: 0.12, partials: BRASS });
    });
    const t = run.length * step;
    [N.C4, N.G4, N.C5, N.E5, N.G5, N.C6].forEach((n, i) => {
      tone(x, { start: t, freq: note(n), dur: total - t, gain: i === 5 ? 0.35 : 0.2, attack: 0.02, decay: 0.8, release: 0.35, partials: BRASS, vibrato: 0.003 });
    });
    [N.C7, N.G7, N.E7, N.C8, N.G7, N.E7, N.C8].forEach((n, i) => {
      tone(x, { start: t + 0.08 + i * 0.12, freq: note(n), dur: 0.3, gain: 0.1, attack: 0.002, decay: 0.08, partials: [[1, 1], [2.01, 0.2]] });
    });
    lowpass(x, 4500);
    return master(x, 0.62);
  },

  /**
   * 8s seamless loop in A minor: Am | F | Dm | Em, 2s each. Soft detuned-sine pad with raised-cosine
   * crossfades + a gentle 8th-note pluck arpeggio. Everything is rendered circularly (tails wrap to the
   * start), so the last sample flows into the first with no click and no gap.
   */
  ambient() {
    const L = 8;
    const x = buf(L);
    const chords = [
      [N.A3, N.C4, N.E4, N.A2],
      [N.F3, N.A3, N.C4, N.F3 - 12],
      [N.D3, N.F3, N.A3, N.D3 - 12],
      [N.E3, N.G3, N.B3, N.E3 - 12],
    ];
    const seg = L / chords.length;
    const n = x.length;
    chords.forEach((chord, ci) => {
      // Pad: each chord fades in over 0.6s before its slot and out 0.6s after (circular), detuned pair per note.
      const start = ci * seg - 0.6;
      const dur = seg + 1.2;
      const voices = chord.slice(0, 3);
      for (const m of voices) {
        for (const cents of [-6, 5]) {
          tone(x, { start, freq: note(m) * 2 ** (cents / 1200), dur, gain: 0.09, attack: 0.9, release: 0.9, partials: [[1, 1], [2, 0.12]], wrap: true });
        }
      }
      const bass = chord[3] ?? chord[0];
      tone(x, { start, freq: note(bass), dur, gain: 0.1, attack: 0.9, release: 0.9, wrap: true });
      // Arpeggio: up-down over chord tones an octave up, 8th notes at 120 bpm.
      const tones = voices.map((m) => m + 12);
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      pattern.forEach((p, k) => {
        const m = tones[p] ?? tones[0];
        tone(x, { start: ci * seg + k * (seg / pattern.length), freq: note(m), dur: 0.9, gain: k % 4 === 0 ? 0.09 : 0.065, attack: 0.005, decay: 0.28, release: 0.2, partials: PLUCK, wrap: true });
      });
    });
    lowpass(x, 2600, true);
    // Plain normalize (no master() edge fade): this file loops, so its boundary must stay continuous.
    let m = 0;
    for (const v of x) m = Math.max(m, Math.abs(v));
    for (let i = 0; i < n; i++) x[i] = (x[i] / m) * 0.5;
    return x;
  },
};

mkdirSync(OUT, { recursive: true });
let totalBytes = 0;
for (const [name, make] of Object.entries(sounds)) {
  const { bytes, seconds } = wav(name, make());
  totalBytes += bytes;
  console.log(`${name.padEnd(8)} ${seconds.toFixed(2)}s ${(bytes / 1024).toFixed(1)} KB`);
}
console.log(`total    ${(totalBytes / 1024).toFixed(1)} KB -> ${OUT}`);
