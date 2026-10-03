/** Synthesized combat sounds (WebAudio). Small, file-free, and varied per play so repeats don't grate. */
export type Sfx = 'whoosh' | 'heavy' | 'hit' | 'crit' | 'block' | 'wood' | 'clay' | 'bones' | 'shoot' | 'hurt' | 'spawn' | 'level';

export class ArenaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<Sfx, number>();
  volume = .6;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const c = new AudioContext(); this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(c.destination);
    const len = c.sampleRate; this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private burst(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number): void {
    const c = this.ctx!, s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = .8 + Math.random() * .4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(.01, dur * .2)); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f).connect(g).connect(this.master!); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  }
  private tone(t: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number): void {
    const c = this.ctx!, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(this.master!); o.start(t); o.stop(t + dur + .05);
  }

  play(kind: Sfx, gain = 1): void {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    // Rate-limit identical sounds so a 20-hit whirlwind doesn't clip.
    if (now - (this.last.get(kind) ?? -1) < .035) return; this.last.set(kind, now);
    const r = () => .85 + Math.random() * .3, t = now;
    switch (kind) {
      case 'whoosh': this.burst(t, .22, 'bandpass', 500 * r(), 2600 * r(), 1.4, .35 * gain); break;
      case 'heavy': this.burst(t, .34, 'bandpass', 300 * r(), 1500 * r(), 1.1, .45 * gain); break;
      case 'hit': this.tone(t, .14, 'sine', 160 * r(), 50, .7 * gain); this.burst(t, .09, 'lowpass', 2400, 400, .7, .55 * gain); break;
      case 'crit': this.tone(t, .2, 'sine', 120 * r(), 40, .9 * gain); this.burst(t, .14, 'lowpass', 4000, 300, .7, .7 * gain); this.tone(t, .25, 'triangle', 900 * r(), 500, .12 * gain); break;
      case 'block': for (const f of [1250, 1980, 2870]) this.tone(t, .38, 'sine', f * r(), f * .97, .13 * gain); this.burst(t, .05, 'highpass', 3000, 6000, .7, .3 * gain); break;
      case 'wood': this.burst(t, .07, 'highpass', 1800, 900, .8, .6 * gain); this.burst(t + .02, .25, 'bandpass', 700 * r(), 250, 2.2, .5 * gain); this.tone(t, .12, 'triangle', 220 * r(), 90, .3 * gain); break;
      case 'clay': this.burst(t, .05, 'highpass', 2500, 2000, .7, .55 * gain); for (let i = 0; i < 5; i++) this.tone(t + .02 + Math.random() * .16, .08, 'sine', 2600 + Math.random() * 2600, 2000, .07 * gain); this.burst(t + .01, .3, 'bandpass', 1800, 700, 1.2, .3 * gain); break;
      case 'bones': for (let i = 0; i < 6; i++) this.burst(t + Math.random() * .25, .05, 'bandpass', 1500 + Math.random() * 1800, 900, 3, .25 * gain); break;
      case 'shoot': this.tone(t, .12, 'triangle', 420 * r(), 140, .3 * gain); this.burst(t, .1, 'bandpass', 2400, 900, 2, .3 * gain); break;
      case 'hurt': this.tone(t, .22, 'sawtooth', 140, 60, .25 * gain); this.burst(t, .12, 'lowpass', 1200, 200, .7, .5 * gain); break;
      case 'spawn': this.burst(t, .6, 'lowpass', 300, 80, .7, .35 * gain); break;
      case 'level': [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * .08, .4, 'triangle', f, f, .18 * gain)); break;
    }
  }
}
