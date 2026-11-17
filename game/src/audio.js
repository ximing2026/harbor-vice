// Procedural sound for HARBOR VICE: every effect is synthesised with WebAudio,
// so the game ships no audio files and still answers every action with a sound.
// A low bass line loops under play; M mutes; the first user gesture unlocks audio.
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.step = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopMusic();
      this.setEngine(0);
      this.setSiren(false);
    }
    return this.muted;
  }

  tone(freq, freqEnd, ms, type, gain, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + ms / 1000);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
  }

  noise(ms, gain, lowpass) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * (ms / 1000)));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    src.connect(filter).connect(amp).connect(this.ctx.destination);
    src.start(t0);
  }

  click() { this.tone(700, 500, 60, 'square', 0.08); }
  pickup() { this.tone(880, 1320, 120, 'sine', 0.14); this.tone(1320, 1760, 120, 'sine', 0.1, 0.08); }
  punch() { this.noise(90, 0.25, 900); this.tone(140, 70, 110, 'sine', 0.22); }
  shot() { this.noise(130, 0.4, 3200); this.tone(220, 60, 90, 'square', 0.16); }
  crash() { this.noise(260, 0.45, 700); this.tone(110, 45, 240, 'sine', 0.3); }
  explosion() { this.noise(700, 0.6, 500); this.tone(90, 28, 600, 'sine', 0.4); }
  sirenBlip() { this.tone(900, 700, 180, 'triangle', 0.1); }
  busted() { this.tone(392, 392, 220, 'square', 0.14); this.tone(311, 311, 220, 'square', 0.14, 0.22); this.tone(233, 233, 420, 'square', 0.14, 0.44); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 180, 'triangle', 0.16, i * 0.11));
  }
  missionStart() { this.tone(440, 440, 140, 'triangle', 0.14); this.tone(587, 587, 200, 'triangle', 0.14, 0.13); }

  /** A continuous engine hum whose pitch follows the car's speed (0 = off). */
  setEngine(speed01) {
    if (!this.ctx || this.muted) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
    }
    const target = speed01 <= 0 ? 0 : 0.035 + speed01 * 0.03;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 95, this.ctx.currentTime, 0.08);
  }

  /** A two-tone police siren while wanted; off otherwise. */
  setSiren(on) {
    if (!this.ctx || this.muted) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
      this.sirenOsc.start();
      this.sirenOsc.frequency.setValueAtTime(750, this.ctx.currentTime);
    }
    if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  sirenStep(time) {
    if (this.sirenOsc && this.ctx) {
      this.sirenOsc.frequency.setTargetAtTime(time % 1 < 0.5 ? 750 : 1000, this.ctx.currentTime, 0.05);
    }
  }

  startMusic() {
    if (!this.ctx || this.musicTimer || this.muted) return;
    // A slow sunset bass line: A minor walk, one note a beat, soft triangle.
    const line = [110, 110, 130.8, 98, 110, 110, 146.8, 164.8];
    this.musicTimer = window.setInterval(() => {
      if (this.muted) return;
      const f = line[this.step % line.length];
      this.step += 1;
      this.tone(f, f, 420, 'triangle', 0.05);
      if (this.step % 4 === 0) this.tone(f * 2, f * 2, 200, 'sine', 0.03);
    }, 460);
  }

  stopMusic() {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
