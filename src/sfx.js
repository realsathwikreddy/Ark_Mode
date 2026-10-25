// Small synthesized sounds (no audio files). Every call is a no-op when sound is off.
let ctx = null;
let enabled = true;
export function setSoundEnabled(v) { enabled = v; }

function ac() {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, start, dur, { type = 'sine', vol = 0.12, slide = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(start, dur, vol = 0.18, cutoff = 900) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  tick() { tone(880, 0, 0.06, { vol: 0.08 }); tone(1320, 0.04, 0.08, { vol: 0.06 }); },
  untick() { tone(520, 0, 0.08, { vol: 0.06, slide: -120 }); },
  coin() { tone(1568, 0, 0.07, { type: 'triangle', vol: 0.06 }); tone(2093, 0.06, 0.12, { type: 'triangle', vol: 0.05 }); },
  bad() { tone(220, 0, 0.18, { type: 'sawtooth', vol: 0.05, slide: -80 }); },
  hit() { noise(0, 0.16, 0.22, 700); tone(110, 0, 0.18, { type: 'square', vol: 0.05, slide: -40 }); },
  level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, { type: 'triangle', vol: 0.08 })); },
  chime() { [784, 988, 1175].forEach((f, i) => tone(f, i * 0.16, 0.5, { vol: 0.09 })); },
  bossDown() { noise(0, 0.5, 0.25, 1400); [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2 + i * 0.08, 0.3, { type: 'triangle', vol: 0.07 })); },
  death() { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.3, { type: 'sawtooth', vol: 0.05 })); noise(0.6, 0.4, 0.15, 400); },
  badge() { tone(1047, 0, 0.12, { type: 'triangle', vol: 0.07 }); tone(1568, 0.1, 0.25, { type: 'triangle', vol: 0.07 }); },
};
