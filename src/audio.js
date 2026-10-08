// Audio : effets synthétisés (WebAudio, aucun fichier requis) + musiques optionnelles dans public/music/.
const MUSIC = {
  menu: 'music/menu.mp3',
  battle: 'music/battle.mp3',
  future: 'music/future.mp3',
  victory: 'music/victory.mp3',
  defeat: 'music/defeat.mp3',
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.sfxVol = load('sfxVol', 0.7);
    this.musicVol = load('musicVol', 0.5);
    this.listenerX = 0;
    this.last = new Map();
    this.music = {};
    this.current = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.sfxVol;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.pendingMusic) this.playMusic(this.pendingMusic);
  }

  setSfxVolume(v) { this.sfxVol = v; save('sfxVol', v); if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) {
    this.musicVol = v; save('musicVol', v);
    if (this.current) this.current.volume = v;
  }

  // ---------- Musique ----------
  playMusic(name) {
    if (!this.ctx) { this.pendingMusic = name; return; }
    this.pendingMusic = null;
    if (this.currentName === name) return;
    this.currentName = name;
    const next = this.music[name] ?? (this.music[name] = Object.assign(new window.Audio(MUSIC[name]), { loop: !['victory', 'defeat'].includes(name), preload: 'auto' }));
    const prev = this.current;
    this.current = next;
    next.volume = 0;
    next.currentTime = 0;
    next.play().catch(() => {}); // fichier absent : silence
    fade(next, this.musicVol, 1.5);
    if (prev && prev !== next) fade(prev, 0, 1.2, () => prev.pause());
  }

  // ---------- Effets ----------
  play(name, x = this.listenerX, vol = 1) {
    if (!this.ctx || this.sfxVol <= 0) return;
    const now = this.ctx.currentTime;
    const key = name;
    const lastT = this.last.get(key) ?? 0;
    if (now - lastT < 0.045) return; // anti-mitraillage
    this.last.set(key, now);
    const dx = x - this.listenerX;
    const att = Math.max(0.15, 1 - Math.abs(dx) / 55);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.9, Math.min(0.9, dx / 30));
    const out = this.ctx.createGain();
    out.gain.value = vol * att;
    out.connect(pan).connect(this.master);
    const S = SOUNDS[name] ?? SOUNDS[name.split('_')[0]] ?? null;
    if (S) S(this, out, now);
  }

  osc(out, t, type, f0, f1, dur, vol = 0.3, attack = 0.005) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(out, t, dur, vol, type = 'lowpass', f0 = 2000, f1 = f0, q = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
}

const SOUNDS = {
  click: (a, o, t) => a.osc(o, t, 'triangle', 900, 600, 0.06, 0.15),
  error: (a, o, t) => { a.osc(o, t, 'square', 180, 140, 0.12, 0.08); a.osc(o, t + 0.09, 'square', 150, 110, 0.14, 0.08); },
  spawn: (a, o, t) => a.osc(o, t, 'sine', 300, 600, 0.12, 0.12),
  build: (a, o, t) => { a.noise(o, t, 0.12, 0.3, 'bandpass', 1200, 400, 2); a.osc(o, t + 0.05, 'triangle', 220, 330, 0.18, 0.15); },
  sell: (a, o, t) => { a.osc(o, t, 'sine', 1200, 1200, 0.08, 0.15); a.osc(o, t + 0.07, 'sine', 1600, 1600, 0.12, 0.15); },
  coin: (a, o, t) => { a.osc(o, t, 'sine', 1300, 1300, 0.06, 0.12); a.osc(o, t + 0.06, 'sine', 1800, 1800, 0.1, 0.12); },
  shoot_stone: (a, o, t) => a.noise(o, t, 0.12, 0.25, 'bandpass', 900, 300, 3),
  shoot_dart: (a, o, t) => a.noise(o, t, 0.08, 0.2, 'highpass', 3000, 1500, 1),
  shoot_rock: (a, o, t) => { a.noise(o, t, 0.3, 0.35, 'lowpass', 600, 150, 1); a.osc(o, t, 'sine', 120, 60, 0.25, 0.2); },
  shoot_arrow: (a, o, t) => { a.osc(o, t, 'triangle', 500, 180, 0.09, 0.12); a.noise(o, t, 0.15, 0.12, 'highpass', 4000, 2000); },
  shoot_volley: (a, o, t) => a.noise(o, t, 0.2, 0.12, 'highpass', 4000, 2000),
  shoot_bolt: (a, o, t) => { a.osc(o, t, 'triangle', 300, 90, 0.12, 0.2); a.noise(o, t, 0.1, 0.15, 'highpass', 3000, 1500); },
  shoot_bullet: (a, o, t) => { a.noise(o, t, 0.12, 0.45, 'highpass', 2500, 800, 0.7); a.osc(o, t, 'square', 140, 60, 0.06, 0.08); },
  shoot_ball: (a, o, t) => { a.noise(o, t, 0.5, 0.6, 'lowpass', 1400, 120, 0.7); a.osc(o, t, 'sine', 110, 40, 0.4, 0.4); },
  shoot_shell: (a, o, t) => { a.noise(o, t, 0.45, 0.6, 'lowpass', 1800, 150, 0.7); a.osc(o, t, 'sine', 90, 40, 0.35, 0.4); },
  shoot_rocket: (a, o, t) => a.noise(o, t, 0.6, 0.35, 'bandpass', 600, 2500, 1),
  shoot_laser: (a, o, t) => a.osc(o, t, 'sawtooth', 1800, 300, 0.14, 0.09),
  shoot_plasma: (a, o, t) => { a.osc(o, t, 'sawtooth', 600, 120, 0.25, 0.12); a.osc(o, t, 'sine', 300, 80, 0.3, 0.15); },
  shoot_ion: (a, o, t) => { a.osc(o, t, 'square', 220, 880, 0.2, 0.07); a.osc(o, t + 0.05, 'sine', 120, 60, 0.35, 0.2); },
  shoot_tesla: (a, o, t) => { a.noise(o, t, 0.15, 0.3, 'bandpass', 4000, 6000, 4); a.osc(o, t, 'sawtooth', 90, 70, 0.15, 0.06); },
  impact: (a, o, t) => a.noise(o, t, 0.08, 0.2, 'bandpass', 1800, 600, 1.5),
  boom: (a, o, t) => { a.noise(o, t, 0.7, 0.7, 'lowpass', 1500, 80, 0.8); a.osc(o, t, 'sine', 90, 30, 0.6, 0.5); },
  boom_big: (a, o, t) => { a.noise(o, t, 1.4, 0.9, 'lowpass', 1200, 50, 0.8); a.osc(o, t, 'sine', 70, 22, 1.1, 0.7); },
  melee_wood: (a, o, t) => { a.noise(o, t, 0.08, 0.35, 'bandpass', 700, 300, 2); a.osc(o, t, 'sine', 160, 80, 0.08, 0.2); },
  melee_metal: (a, o, t) => { a.osc(o, t, 'triangle', 2400 + Math.random() * 800, 1800, 0.18, 0.08); a.noise(o, t, 0.06, 0.25, 'highpass', 3000, 3000); },
  die: (a, o, t) => a.noise(o, t, 0.25, 0.2, 'lowpass', 800, 150, 1),
  base_hit: (a, o, t) => { a.noise(o, t, 0.3, 0.45, 'lowpass', 500, 80, 1); a.osc(o, t, 'sine', 70, 40, 0.25, 0.3); },
  special: (a, o, t) => { a.osc(o, t, 'sawtooth', 110, 55, 1.2, 0.12, 0.3); a.osc(o, t, 'sawtooth', 165, 82, 1.2, 0.08, 0.3); a.noise(o, t + 0.2, 1.5, 0.25, 'bandpass', 300, 2000, 1); },
  evolve: (a, o, t) => { [523, 659, 784, 1047].forEach((f, i) => a.osc(o, t + i * 0.11, 'triangle', f, f, 0.5, 0.18)); a.noise(o, t, 1.2, 0.2, 'highpass', 2000, 8000); },
  upgrade: (a, o, t) => { [392, 523, 659].forEach((f, i) => a.osc(o, t + i * 0.08, 'triangle', f, f, 0.3, 0.15)); },
};

function fade(el, to, dur, done) {
  const from = el.volume, t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
    el.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(tick); else done?.();
  };
  tick();
}
function load(k, d) { try { const v = localStorage.getItem('aow3d.' + k); return v == null ? d : +v; } catch { return d; } }
function save(k, v) { try { localStorage.setItem('aow3d.' + k, String(v)); } catch {} }
