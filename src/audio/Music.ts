import type { Sfx } from './Sfx';

/**
 * Background music, composed here and played with the Web Audio API (no audio files): a
 * gentle music-box tune over a soft bass and pad, 16 bars at 96 bpm, looping (about 40 s).
 * It plays through the sound-effects volume, so おと and おんりょう apply to it too.
 */

/** Eighth notes per bar, and the length of one in seconds. */
const SLOTS = 8;
const EIGHTH = 60 / 96 / 2;
/** Music level relative to the sound effects. */
const LEVEL = 0.5;

const midi = (name: string) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 0;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  return 12 * (Number(m[3]) + 1) + base + (m[2] ? 1 : 0);
};
const freq = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Chord per bar: [bass root, pad notes]. */
const CHORDS: Record<string, [string, string[]]> = {
  C: ['C3', ['C4', 'E4', 'G4']],
  Am: ['A2', ['A3', 'C4', 'E4']],
  F: ['F2', ['A3', 'C4', 'F4']],
  G: ['G2', ['G3', 'B3', 'D4']],
  Em: ['E2', ['G3', 'B3', 'E4']],
};

/** The tune: a chord and eight eighth-note slots per bar ('-' = rest). */
const SONG: [string, string][] = [
  ['C', 'E5 - G5 - C6 - G5 -'],
  ['C', 'A5 G5 E5 - D5 - E5 -'],
  ['Am', 'C5 - E5 - A5 - G5 -'],
  ['Am', 'E5 - D5 - C5 - - -'],
  ['F', 'F5 - A5 - C6 - A5 -'],
  ['F', 'G5 F5 E5 - D5 - C5 -'],
  ['G', 'D5 - G5 - B5 - A5 G5'],
  ['G', 'E5 - D5 - - - - -'],
  ['F', 'A5 - - G5 F5 - E5 -'],
  ['G', 'D5 - - E5 G5 - - -'],
  ['Em', 'G5 - - F5 E5 - D5 -'],
  ['Am', 'C5 - E5 - A5 - - -'],
  ['F', 'F5 - A5 - G5 - F5 -'],
  ['G', 'E5 - D5 - G5 - - -'],
  ['C', 'E5 G5 C6 - G5 - E5 -'],
  ['C', 'C5 - - - - - - -'],
];

const BARS = SONG.map(([chord, line]) => ({
  root: midi(CHORDS[chord][0]),
  pad: CHORDS[chord][1].map(midi),
  melody: line.split(' ').map((n) => (n === '-' ? 0 : midi(n))),
}));

export class Music {
  private gain: GainNode | null = null;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private enabled = true;

  constructor(private readonly sfx: Sfx) {}

  /** Starts the scheduler. Nothing sounds until the audio is unlocked by a first tap. */
  start(): void {
    if (!this.timer) this.timer = window.setInterval(() => this.schedule(), 100);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    const out = this.sfx.output();
    if (this.gain && out) this.gain.gain.setTargetAtTime(on ? LEVEL : 0, out.ctx.currentTime, 0.15);
  }

  /** Books the notes of the next ~0.4 s, a little ahead, so timing stays exact. */
  private schedule(): void {
    const out = this.sfx.output();
    if (!out || !this.enabled) return;
    const { ctx, bus } = out;
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = LEVEL;
      this.gain.connect(bus);
    }
    // After a pause (hidden page, sound off), carry on from now instead of catching up.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.4) {
      this.playStep(ctx, this.gain, this.step, this.nextTime);
      this.step = (this.step + 1) % (BARS.length * SLOTS);
      this.nextTime += EIGHTH;
    }
  }

  private playStep(ctx: AudioContext, out: GainNode, step: number, t: number): void {
    const bar = BARS[Math.floor(step / SLOTS)];
    const slot = step % SLOTS;
    const note = bar.melody[slot];
    if (note) {
      // music box: a bright sine with a faint octave, ringing out
      this.voice(ctx, out, freq(note), t, 1.1, 0.2, 'sine');
      this.voice(ctx, out, freq(note) * 2, t, 0.45, 0.035, 'sine');
    }
    // bass: root, fifth, then a little octave hop
    if (slot === 0) this.voice(ctx, out, freq(bar.root), t, EIGHTH * 3.6, 0.17, 'triangle');
    if (slot === 4) this.voice(ctx, out, freq(bar.root + 7), t, EIGHTH * 1.8, 0.13, 'triangle');
    if (slot === 6) this.voice(ctx, out, freq(bar.root + 12), t, EIGHTH * 1.6, 0.1, 'triangle');
    // pad: the chord, swelling softly under the whole bar
    if (slot === 0) for (const n of bar.pad) this.pad(ctx, out, freq(n), t, EIGHTH * SLOTS);
  }

  private voice(ctx: AudioContext, out: GainNode, f: number, t: number, dur: number, gain: number, type: OscillatorType): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private pad(ctx: AudioContext, out: GainNode, f: number, t: number, dur: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
