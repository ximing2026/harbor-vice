// WebAudio synth: engine hum, siren, gunshots, crashes, jingles, bass loop.
// Every call is safe before any user gesture; the context is created lazily
// and everything is a no-op while muted or in a non-browser environment.
let ctx = null;
let master = null;
let muted = false;
let engineOsc = null;
let engineGain = null;
let bassTimer = null;
let bassStep = 0;

const BASS_NOTES = [55, 0, 65.41, 0, 49, 0, 58.27, 0, 55, 0, 65.41, 0, 73.42, 0, 65.41, 0];

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function ensure() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(c, seconds) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function unlockAudio() {
  ensure();
}

export function engineStart() {
  const c = ensure();
  if (!c || engineOsc) return;
  engineOsc = c.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  engineGain = c.createGain();
  engineGain.gain.value = 0.0;
  engineOsc.connect(filter);
  filter.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();
}

export function engineSet(running, speedNorm) {
  if (!engineOsc || !engineGain || !ctx) return;
  const target = running ? 0.05 + speedNorm * 0.06 : 0.0;
  engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
  engineOsc.frequency.setTargetAtTime(52 + speedNorm * 90, ctx.currentTime, 0.1);
}

function tone(freq, dur, type, vol, when) {
  const c = ensure();
  if (!c) return;
  const t0 = when || c.currentTime;
  const o = c.createOscillator();
  o.type = type || 'sine';
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function playGunshot() {
  const c = ensure();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 900;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start();
  tone(160, 0.08, 'square', 0.15);
}

export function playCrash() {
  const c = ensure();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.3);
  const g = c.createGain();
  g.gain.setValueAtTime(0.55, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 500;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start();
  tone(70, 0.25, 'sine', 0.4);
}

export function playSiren(on) {
  const c = ensure();
  if (!c) return;
  if (on && !playSiren.osc) {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 660;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.9;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const g = c.createGain();
    g.gain.value = 0.045;
    o.connect(g);
    g.connect(master);
    o.start();
    lfo.start();
    playSiren.osc = o;
    playSiren.lfo = lfo;
    playSiren.gain = g;
  } else if (!on && playSiren.osc) {
    try {
      playSiren.osc.stop();
      playSiren.lfo.stop();
    } catch (e) { /* already stopped */ }
    playSiren.osc = null;
    playSiren.lfo = null;
    playSiren.gain = null;
  }
}

export function playJingle(kind) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  if (kind === 'mission') {
    tone(523.25, 0.16, 'triangle', 0.25, t0);
    tone(659.25, 0.16, 'triangle', 0.25, t0 + 0.14);
    tone(783.99, 0.3, 'triangle', 0.28, t0 + 0.28);
  } else if (kind === 'complete') {
    tone(523.25, 0.18, 'triangle', 0.25, t0);
    tone(659.25, 0.18, 'triangle', 0.25, t0 + 0.16);
    tone(783.99, 0.18, 'triangle', 0.25, t0 + 0.32);
    tone(1046.5, 0.4, 'triangle', 0.28, t0 + 0.48);
  } else if (kind === 'bad') {
    tone(220, 0.22, 'sawtooth', 0.18, t0);
    tone(174, 0.34, 'sawtooth', 0.18, t0 + 0.2);
  } else if (kind === 'pickup') {
    tone(880, 0.1, 'sine', 0.2, t0);
    tone(1318.5, 0.14, 'sine', 0.18, t0 + 0.08);
  }
}

export function bassStart() {
  const c = ensure();
  if (!c || bassTimer) return;
  bassTimer = setInterval(() => {
    if (muted || !ctx) return;
    const n = BASS_NOTES[bassStep % BASS_NOTES.length];
    bassStep += 1;
    if (n > 0) tone(n, 0.22, 'triangle', 0.12);
  }, 240);
}

export function audioStopAll() {
  if (bassTimer) {
    clearInterval(bassTimer);
    bassTimer = null;
  }
  playSiren(false);
  if (engineGain && ctx) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}
