// "Your turn" chime made with Web Audio (no audio files). Mute choice is kept per device.
const MUTED_KEY = 'burgerazo:muted';

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTED_KEY) === '1';
} catch {
  /* blocked storage: start unmuted */
}

function getContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  return ctx;
}

// Browsers only allow audio after a user gesture, so unlock it on the first tap/key.
function unlock() {
  getContext()?.resume?.();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

export const isMuted = () => muted;

export function toggleMuted() {
  muted = !muted;
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (!muted) playTurnSound();
  return muted;
}

/** Two quick rising notes. */
export function playTurnSound() {
  if (muted) return;
  const audio = getContext();
  if (!audio || audio.state !== 'running') return;
  const start = audio.currentTime;
  [660, 880].forEach((freq, i) => {
    const t = start + i * 0.12;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}
