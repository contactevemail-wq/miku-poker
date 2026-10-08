// 🃏 카드 컴포넌트 — 쪼기(피킹) 인터랙션 포함
import { useRef, useState, useEffect, useCallback } from 'react';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankStr = (r) => RANKS[r] || String(r);
const isRed = (s) => s === 1 || s === 2;
// 미쿠 스킨 문양 컬러 (13-3 스펙): s=0♠ #1f8a99, s=1♥ #ff5f9e, s=2♦ #ff7ab8, s=3♣ #2aa8b3
const MIKU_SUIT_CLS = ['miku-s0', 'miku-s1', 'miku-s2', 'miku-s3'];
function faceClass(card, skin) {
  if (!card) return 'face';
  if (skin === 'miku') return `face miku-face ${MIKU_SUIT_CLS[card.s]}`;
  return `face${isRed(card.s) ? ' red' : ''}`;
}

// 카드 스치는 소리 (WebAudio 합성)
let audioCtx = null;
function peelSound(intensity = 0.5) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const dur = 0.12;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const f = audioCtx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2500 + intensity * 2000; f.Q.value = 1.2;
    const g = audioCtx.createGain();
    g.gain.value = 0.12 * intensity;
    src.connect(f); f.connect(g); g.connect(audioCtx.destination);
    src.start();
  } catch { /* 오디오는 선택사항 */ }
}

function buzz(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}

/**
 * 카드 한 장
 * @param card {r,s} | null (null이면 뒷면 고정)
 * @param peekable 내 카드일 때 쪼기 가능
 * @param faceUp 처음부터 앞면
 * @param skin 'classic' | 'miku' — 카드 스킨 (13-3이 back.png 에셋을 만들면 교체)
 */
export default function Card({ card, peekable = false, faceUp = false, small = false, skin = 'classic' }) {
  const [lift, setLift] = useState(0);       // 0~1 들림 정도
  const [revealed, setRevealed] = useState(faceUp);
  // 카드가 바뀌면(새 핸드) 공개 상태 리셋 — 쪼기 전 노출 방지
  // (useEffect로 이동: 렌더 중 setState 안티패턴 수정)
  const cardKey = card ? `${card.r}${card.s}` : 'null';
  useEffect(() => {
    setRevealed(false);
    setLift(0);
  }, [cardKey, faceUp]);
  const [snapping, setSnapping] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const gesture = useRef(null);
  const buzzed = useRef(new Set());

  const doReveal = useCallback(() => {
    setFlipping(true);
    peelSound(0.9);
    buzz(20);
    setTimeout(() => { setRevealed(true); setLift(0); }, 150);
    setTimeout(() => setFlipping(false), 320);
  }, []);

  const onPointerDown = (e) => {
    if (!peekable || revealed || !card) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, moved: false };
    buzzed.current = new Set();
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) g.moved = true;
    // 위로 드래그할수록 들림 (아래로도 약간 허용)
    const drag = Math.max(0, -dy) + dist * 0.3;
    const l = Math.min(1, drag / 120);
    setLift(l);
    setSnapping(false);
    // 햅틱 틱
    for (const th of [0.25, 0.5, 0.75]) {
      if (l >= th && !buzzed.current.has(th)) {
        buzzed.current.add(th);
        buzz(10);
        peelSound(l);
      }
    }
  };

  const onPointerUp = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    const dt = Date.now() - g.t;
    if (dt < 250 && !g.moved) {
      // 단순 클릭 → 바로 공개
      doReveal();
      return;
    }
    if (lift >= 0.4) {
      doReveal(); // 충분히 들었으면 공개
    } else {
      // 스프링으로 원위치
      setSnapping(true);
      setLift(0);
      setTimeout(() => setSnapping(false), 400);
    }
  };

  const showFace = revealed || faceUp;

  return (
    <div
      className={`playing-card${lift > 0 ? ' squeezing' : ''}${snapping ? ' snapping' : ''}${flipping ? ' flipping' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; setSnapping(true); setLift(0); }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: peekable && !showFace ? 'grab' : 'default' }}
    >
      <div className="inner">
        {/* 앞면 (밑에 깔림) */}
        <div className={faceClass(card, skin)}>
          {card && (
            <>
              <div className="corner tl"><span>{rankStr(card.r)}</span><span>{SUITS[card.s]}</span></div>
              <div className="pip">{SUITS[card.s]}</div>
              <div className="corner br"><span>{rankStr(card.r)}</span><span>{SUITS[card.s]}</span></div>
            </>
          )}
        </div>
        {/* 뒷면 (들리는 레이어) */}
        {!showFace && (
          <div
            className={`back-layer${skin === 'miku' ? ' miku-back' : ''}`}
            style={{
              transform: `perspective(500px) rotateX(${-lift * 55}deg) translateY(${-lift * 14}px)`,
              transformOrigin: '50% 100%',
              clipPath: `inset(0 0 ${lift * 100}% 0)`,
              boxShadow: `0 ${lift * 22}px ${lift * 32}px rgba(0,0,0,${0.35 + lift * 0.45})`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/** 뒷면 고정 카드 (상대 패·커뮤니티 대기용) */
export function CardBack({ skin = 'classic' }) {
  return (
    <div className="playing-card">
      <div className="inner"><div className={`back-layer${skin === 'miku' ? ' miku-back' : ''}`} /></div>
    </div>
  );
}
