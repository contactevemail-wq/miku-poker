// 🔊 포커 웹앱 사운드 효과 — Web Audio API (13-2 작성)
let audioCtx = null;
let soundOn = localStorage.getItem('poker-sound') !== 'off';

function ctx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0) {
  if (!soundOn) return;
  try {
    const c = ctx();
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* ignore */ }
}

function noise(dur, vol = 0.1, delay = 0, filterFreq = 2000) {
  if (!soundOn) return;
  try {
    const c = ctx();
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  } catch { /* ignore */ }
}

export const sounds = {
  // 🃏 카드 딜링 (쉬익)
  deal: () => noise(0.15, 0.12, 0, 3000),
  // 🪙 칩 (딸깍)
  chip: () => { tone(2500, 0.06, 'square', 0.06); tone(1800, 0.08, 'square', 0.05, 0.05); },
  // 🏆 승리 (팡파레)
  win: () => { tone(523, 0.15, 'sine', 0.15); tone(659, 0.15, 'sine', 0.15, 0.12); tone(784, 0.3, 'sine', 0.18, 0.24); },
  // 👆 버튼 클릭
  click: () => tone(800, 0.05, 'sine', 0.08),
  // 📥 폴드 (푹)
  fold: () => tone(300, 0.12, 'sine', 0.1),
  // ⏰ 내 차례 알림 (딩동)
  turn: () => { tone(880, 0.15, 'sine', 0.12); tone(1174, 0.2, 'sine', 0.12, 0.15); },
  // ✅ 체크/콜
  check: () => tone(600, 0.08, 'sine', 0.1),
};

export function isSoundOn() { return soundOn; }
export function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem('poker-sound', soundOn ? 'on' : 'off');
  return soundOn;
}
