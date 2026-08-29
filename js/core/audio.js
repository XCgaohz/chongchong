// WebAudio 程序化合成音效（零素材依赖）
import { createAudioContext } from '../platform.js';

export class Sfx {
  constructor() {
    this.ctx = createAudioContext();
    this.master = null;
    this.volume = 1;
    if (this.ctx) {
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  unlock() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (_) {}
    }
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  noise(dur, { vol = 0.3, filter = 1200, delay = 0, q = 0.8 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filter; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'fire':
        this.noise(0.28, { vol: 0.35, filter: 2400 });
        this.tone(320, 0.25, { type: 'square', vol: 0.12, slide: -260 });
        break;
      case 'boom':
        this.noise(0.5, { vol: 0.55, filter: 900 });
        this.tone(90, 0.4, { type: 'sine', vol: 0.5, slide: -60 });
        this.noise(0.25, { vol: 0.3, filter: 3000, delay: 0.02 });
        break;
      case 'bigboom':
        this.noise(0.8, { vol: 0.7, filter: 700 });
        this.tone(60, 0.7, { type: 'sine', vol: 0.6, slide: -35 });
        this.tone(48, 0.5, { type: 'triangle', vol: 0.4, delay: 0.08 });
        break;
      case 'jump':
        this.tone(300, 0.14, { type: 'square', vol: 0.12, slide: 220 });
        break;
      case 'hurt':
        this.tone(340, 0.16, { type: 'sawtooth', vol: 0.16, slide: -180 });
        break;
      case 'die':
        this.tone(400, 0.5, { type: 'sawtooth', vol: 0.2, slide: -340 });
        break;
      case 'pickup':
        this.tone(523, 0.09, { type: 'square', vol: 0.14 });
        this.tone(659, 0.09, { type: 'square', vol: 0.14, delay: 0.08 });
        this.tone(784, 0.12, { type: 'square', vol: 0.14, delay: 0.16 });
        break;
      case 'shootgun':
        this.noise(0.14, { vol: 0.4, filter: 3200 });
        this.tone(180, 0.1, { type: 'square', vol: 0.2, slide: -120 });
        break;
      case 'drill':
        this.noise(0.12, { vol: 0.16, filter: 5000, q: 2 });
        break;
      case 'turn':
        this.tone(440, 0.1, { type: 'sine', vol: 0.16 });
        this.tone(554, 0.14, { type: 'sine', vol: 0.16, delay: 0.1 });
        break;
      case 'charge':
        this.tone(200, 0.1, { type: 'sine', vol: 0.05, slide: 30 });
        break;
      case 'skill':
        this.tone(600, 0.12, { type: 'triangle', vol: 0.2, slide: 300 });
        this.tone(900, 0.14, { type: 'triangle', vol: 0.16, delay: 0.1 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.16, delay: i * 0.14 }));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.18, delay: i * 0.18 }));
        break;
      case 'click':
        this.tone(700, 0.05, { type: 'sine', vol: 0.12 });
        break;
    }
  }
}
