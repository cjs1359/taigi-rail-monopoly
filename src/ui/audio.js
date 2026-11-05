/**
 * Classroom-friendly SFX via Web Audio API (no external audio files).
 * Unlock on first user gesture. Mute + volume persist in localStorage.
 * Hook: playPronunciation() reserved for future 台語 TTS / recordings.
 */

const STORAGE_KEY = 'taigi-rail-monopoly.audio.v1';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { muted: false, volume: 0.45 };
    const p = JSON.parse(raw);
    return {
      muted: Boolean(p.muted),
      volume: Math.min(1, Math.max(0, Number(p.volume) ?? 0.45)),
    };
  } catch {
    return { muted: false, volume: 0.45 };
  }
}

function savePrefs(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

let prefs = loadPrefs();
let ctx = null;
let master = null;
let unlocked = false;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = prefs.muted ? 0 : prefs.volume;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  unlocked = true;
}

export function isMuted() { return prefs.muted; }
export function getVolume() { return prefs.volume; }
export function isUnlocked() { return unlocked; }

export function setMuted(muted) {
  prefs = { ...prefs, muted: Boolean(muted) };
  savePrefs(prefs);
  if (master) master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.volume, ctx?.currentTime || 0, 0.02);
}

export function setVolume(volume) {
  prefs = { ...prefs, volume: Math.min(1, Math.max(0, volume)) };
  savePrefs(prefs);
  if (master && !prefs.muted) {
    master.gain.setTargetAtTime(prefs.volume, ctx.currentTime, 0.02);
  }
}

function envGain(t0, peak, attack, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0001, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  return g;
}

function tone(freq, dur, type = 'sine', peak = 0.2, detune = 0) {
  if (!unlocked || !ensureCtx() || prefs.muted) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (detune) osc.detune.setValueAtTime(detune, t0);
  const g = envGain(t0, peak * prefs.volume, 0.01, Math.max(0.01, dur * 0.45), dur * 0.55);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

function noiseBurst(dur, peak = 0.15, bandHz = 1200, q = 0.8) {
  if (!unlocked || !ensureCtx() || prefs.muted) return;
  const t0 = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = bandHz;
  filt.Q.value = q;
  const g = envGain(t0, peak * prefs.volume, 0.005, dur * 0.2, dur * 0.7);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

/** Dice rattle */
export function sfxDice() {
  if (!unlocked || !ensureCtx() || prefs.muted) return;
  for (let i = 0; i < 6; i++) {
    setTimeout(() => noiseBurst(0.045, 0.12 + Math.random() * 0.05, 1800 + Math.random() * 800, 0.6), i * 40);
  }
}

/** Soft train ka-tang step */
export function sfxStep() {
  tone(180, 0.06, 'triangle', 0.12);
  setTimeout(() => tone(140, 0.05, 'triangle', 0.08), 35);
}

/** Arrive at station — short bell */
export function sfxArrive() {
  tone(660, 0.18, 'sine', 0.18);
  setTimeout(() => tone(880, 0.22, 'sine', 0.14), 70);
}

/** Correct — bright ding */
export function sfxCorrect() {
  tone(784, 0.12, 'sine', 0.2);
  setTimeout(() => tone(1046, 0.2, 'sine', 0.18), 80);
}

/** Wrong — gentle low buzz */
export function sfxWrong() {
  tone(160, 0.28, 'triangle', 0.12);
  setTimeout(() => tone(140, 0.2, 'sine', 0.08), 60);
}

/** Buy — coin */
export function sfxBuy() {
  tone(980, 0.08, 'square', 0.08);
  setTimeout(() => tone(1310, 0.14, 'sine', 0.14), 50);
}

/** Rent paid — coins out */
export function sfxRent() {
  tone(520, 0.08, 'triangle', 0.1);
  setTimeout(() => tone(390, 0.12, 'triangle', 0.1), 70);
  setTimeout(() => tone(330, 0.1, 'sine', 0.08), 140);
}

/** Pass start — horn + coins */
export function sfxPassStart() {
  tone(300, 0.2, 'sawtooth', 0.07);
  setTimeout(() => tone(240, 0.25, 'sawtooth', 0.06), 90);
  setTimeout(() => sfxBuy(), 220);
}

/** Lore card flip */
export function sfxLore() {
  noiseBurst(0.08, 0.1, 2400, 1.2);
  setTimeout(() => tone(520, 0.12, 'sine', 0.1), 40);
}

/** Branch whistle */
export function sfxBranch() {
  tone(620, 0.15, 'sine', 0.12);
  setTimeout(() => tone(740, 0.2, 'sine', 0.12), 100);
}

/** Rest soft tone */
export function sfxRest() {
  tone(392, 0.35, 'sine', 0.1);
}

/** Turn change */
export function sfxTurn() {
  tone(523, 0.1, 'sine', 0.12);
  setTimeout(() => tone(659, 0.14, 'sine', 0.12), 90);
}

/** Game end fanfare */
export function sfxEnd() {
  const notes = [523, 659, 784, 1046];
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.14), i * 120));
}

/** Reserved hook for future 台語 pronunciation audio. */
export function playPronunciation(_stationId, _opts = {}) {
  // no-op in v1.3 — wire TTS / recorded clips here later
}

/** Build mute button + volume slider UI fragment. */
export function renderAudioControls({ compact = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'audio-controls' + (compact ? ' compact' : '');

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'ghost audio-mute';
  muteBtn.setAttribute('aria-label', prefs.muted ? '取消靜音' : '靜音');
  const refreshMute = () => {
    muteBtn.textContent = prefs.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(prefs.muted));
  };
  refreshMute();
  muteBtn.onclick = () => {
    unlockAudio();
    setMuted(!prefs.muted);
    refreshMute();
  };

  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0'; vol.max = '100'; vol.step = '1';
  vol.value = String(Math.round(prefs.volume * 100));
  vol.className = 'audio-volume';
  vol.setAttribute('aria-label', '音量');
  vol.oninput = () => {
    unlockAudio();
    const v = Number(vol.value) / 100;
    setVolume(v);
    if (v > 0 && prefs.muted) {
      setMuted(false);
      refreshMute();
    }
  };

  if (!compact) {
    const label = document.createElement('label');
    label.className = 'hint';
    label.textContent = '音效';
    wrap.append(label);
  }
  wrap.append(muteBtn, vol);
  return wrap;
}

/** Install one-time unlock on first pointer/key in the document. */
export function installAudioUnlock() {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once, true);
    window.removeEventListener('keydown', once, true);
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}
