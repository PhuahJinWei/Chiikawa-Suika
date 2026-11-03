/**
 * Cute sound effects synthesised with the Web Audio API, so no audio files are needed.
 * The context is created on the first user gesture (browsers block autoplay).
 */
interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  attack?: number;
}

interface NoiseOpts {
  dur: number;
  freq: number;
  to?: number;
  q?: number;
  gain?: number;
  delay?: number;
  filter?: BiquadFilterType;
}

const NOTE = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private volume = 0.7;

  /** Call from a user gesture (pointerdown/keydown). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyVolume();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.enabled ? this.volume * 0.6 : 0;
  }

  private get live(): AudioContext | null {
    return this.enabled && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  /** Where other sounds (the music) can play, at the sound settings' volume; null while silent. */
  output(): { ctx: AudioContext; bus: GainNode } | null {
    const ctx = this.live;
    return ctx && this.master ? { ctx, bus: this.master } : null;
  }

  /** Silence everything while the page is hidden (saves battery), and pick up again after. */
  setBackground(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private tone({ freq, to, dur, type = 'sine', gain = 0.3, delay = 0, attack = 0.005 }: ToneOpts): void {
    const ctx = this.live;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise({ dur, freq, to, q = 1, gain = 0.2, delay = 0, filter = 'bandpass' }: NoiseOpts): void {
    const ctx = this.live;
    if (!ctx || !this.master) return;
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  click(): void {
    this.tone({ freq: 880, to: 660, dur: 0.05, gain: 0.12 });
  }

  drop(): void {
    this.tone({ freq: 540, to: 300, dur: 0.12, gain: 0.25 });
  }

  /** Higher tiers sound deeper; quick chains climb in pitch. */
  merge(tier: number, chain: number): void {
    const base = 980 * 0.9 ** tier * 2 ** (Math.min(chain - 1, 8) / 12);
    this.tone({ freq: base * 0.7, to: base * 1.25, dur: 0.1, gain: 0.3 });
    this.tone({ freq: base * 2, dur: 0.16, type: 'triangle', gain: 0.12, delay: 0.035 });
  }

  vanish(): void {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ freq: NOTE(15 + s), dur: 0.35, type: 'triangle', gain: 0.18, delay: i * 0.07 }));
    this.noise({ dur: 0.6, freq: 6000, filter: 'highpass', gain: 0.06, delay: 0.1 });
  }

  shake(): void {
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.12, freq: 700 + i * 120, q: 4, gain: 0.25, delay: i * 0.13 });
    this.tone({ freq: 160, to: 120, dur: 0.5, type: 'triangle', gain: 0.12 });
  }

  flip(): void {
    this.noise({ dur: 1.3, freq: 300, to: 2200, q: 2, gain: 0.16, delay: 0.2 });
    this.tone({ freq: 300, to: 600, dur: 0.6, type: 'triangle', gain: 0.14, delay: 0.2 });
    this.tone({ freq: 600, to: 300, dur: 0.6, type: 'triangle', gain: 0.12, delay: 0.85 });
  }

  remove(): void {
    this.noise({ dur: 0.3, freq: 1800, to: 200, filter: 'lowpass', gain: 0.3 });
    this.tone({ freq: 700, to: 180, dur: 0.22, gain: 0.18 });
  }

  pick(): void {
    this.tone({ freq: NOTE(14), dur: 0.12, type: 'triangle', gain: 0.18 });
    this.tone({ freq: NOTE(21), dur: 0.18, type: 'triangle', gain: 0.18, delay: 0.09 });
  }

  ready(): void {
    this.tone({ freq: NOTE(10), dur: 0.12, type: 'triangle', gain: 0.12 });
    this.tone({ freq: NOTE(15), dur: 0.2, type: 'triangle', gain: 0.12, delay: 0.08 });
  }

  fanfare(): void {
    [0, 5, 9].forEach((s, i) => this.tone({ freq: NOTE(12 + s), dur: 0.2, type: 'triangle', gain: 0.14, delay: i * 0.08 }));
  }

  danger(): void {
    this.tone({ freq: 330, to: 300, dur: 0.18, type: 'square', gain: 0.05 });
  }

  gameOver(): void {
    [7, 3, 0, -5].forEach((s, i) => this.tone({ freq: NOTE(s), dur: 0.4, type: 'triangle', gain: 0.2, delay: i * 0.18 }));
  }

  newBest(): void {
    [0, 4, 7, 12, 7, 12].forEach((s, i) => this.tone({ freq: NOTE(12 + s), dur: 0.22, type: 'triangle', gain: 0.16, delay: i * 0.09 }));
  }
}
