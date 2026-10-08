// 🤖 포커 봇 의사결정 엔진 (13-1)
// table.act() 호출용 {action, amount} 반환. 순수 함수 (Math.random만 사용).
import { eval5, eval7, compareHands, bjValue } from './poker-engine.js';

/* ---------- 핸드 평가 ---------- */

/** 5장 중 최상 (5~6장용) */
function bestOf5(cards) {
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const h = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareHands(h, best) > 0) best = h;
          }
  return best;
}

/** 카테고리 → 0~1 점수 */
function catToScore(cat, tb) {
  const base = [0.15, 0.45, 0.62, 0.72, 0.78, 0.82, 0.9, 0.95, 1.0][cat] ?? 0.1;
  if (cat === 1 && tb[0]) return 0.35 + (tb[0] / 14) * 0.2; // 페어 랭크 반영
  if (cat === 0 && tb[0]) return 0.1 + (tb[0] / 14) * 0.15; // 하이카드 반영
  return base;
}

/** 2장 프리플랍 휴리스틱 (홀덤/파인애플) */
function preflopScore(hole) {
  if (hole.length < 2) return 0.2;
  const [a, b] = hole;
  if (a.r === b.r) return 0.7 + (a.r / 14) * 0.15; // 페어
  let s = ((a.r + b.r) / 28) * 0.5;
  if (a.s === b.s) s += 0.08; // 수딧
  if (Math.abs(a.r - b.r) === 1) s += 0.05; // 커넥터
  return Math.min(0.65, Math.max(0.12, s));
}

/** 3~4장 휴리스틱 (스터드 초반 등) */
function shortScore(cards) {
  const rs = cards.map((c) => c.r);
  const counts = {};
  for (const r of rs) counts[r] = (counts[r] || 0) + 1;
  const maxN = Math.max(...Object.values(counts));
  const high = Math.max(...rs);
  if (maxN >= 3) return 0.72;
  if (maxN === 2) {
    const pr = +Object.keys(counts).find((k) => counts[k] === 2);
    return 0.4 + (pr / 14) * 0.2;
  }
  return 0.12 + (high / 14) * 0.15;
}

/** 드로우 보너스 (플러시/스트레이트 드로우) */
function drawBonus(cards) {
  if (cards.length < 4) return 0;
  const suits = {};
  for (const c of cards) suits[c.s] = (suits[c.s] || 0) + 1;
  let bonus = 0;
  if (Object.values(suits).some((n) => n === 4)) bonus += 0.12; // 플러시 드로우
  const rs = [...new Set(cards.map((c) => c.r))].sort((a, b) => a - b);
  for (let i = 0; i + 3 < rs.length; i++) {
    if (rs[i + 3] - rs[i] <= 4) { bonus += 0.1; break; } // 양방 스트레이트 드로우
  }
  return bonus;
}

/**
 * 핸드 강도 0~1
 * holdem/pineapple: hole + community / sevenstud: hole 전체
 */
export function handScore(table, p) {
  const gt = table.gameType;
  let cards;
  if (gt === 'sevenstud') {
    cards = (p.hole || []).filter(Boolean);
  } else {
    cards = [...(p.hole || []), ...(table.community || [])].filter(Boolean);
  }
  if (cards.length >= 7) {
    const ev = eval7(cards.slice(0, 7));
    return Math.min(1, catToScore(ev.cat, ev.tb) + drawBonus(cards) * 0.5);
  }
  if (cards.length >= 5) {
    const ev = bestOf5(cards);
    return Math.min(1, catToScore(ev.cat, ev.tb) + drawBonus(cards));
  }
  if (cards.length >= 3) return shortScore(cards);
  return preflopScore(cards);
}

/** 팟 = 전원 totalBet 합 */
export function potOf(table) {
  return table.players.reduce((s, p) => s + (p.totalBet || 0), 0);
}

/** 포지션: 늦을수록 1에 가까움 (딜러=1) */
function latePosition(table, p) {
  const n = table.players.length;
  if (n < 2) return 0.5;
  const idx = table.players.indexOf(p);
  const d = ((idx - (table.dealerIdx ?? -1)) % n + n) % n;
  return d === 0 || d === n - 1 ? 1 : 0.3;
}

/** 레이즈 금액 (미니멈 레이즈, 스택 고려) */
function raiseAmount(table, p) {
  const to = table.currentBet + table.minRaise;
  const maxPut = p.bet + p.stack;
  if (to >= maxPut) return -1; // 풀 레이즈 불가 → 콜로 대체
  return to;
}

/* ---------- 난이도별 의사결정 ---------- */

function decideEasy(table, p, toCall) {
  const r = Math.random();
  if (toCall === 0) {
    if (r < 0.9) return { action: 'check' };
    const amt = raiseAmount(table, p);
    return amt > 0 ? { action: 'raise', amount: amt } : { action: 'check' };
  }
  // 70% 콜 / 20% 폴드 / 10% 레이즈
  if (r < 0.7) return { action: 'call' };
  if (r < 0.9) return { action: 'fold' };
  const amt = raiseAmount(table, p);
  return amt > 0 ? { action: 'raise', amount: amt } : { action: 'call' };
}

function decideNormal(table, p, toCall, score) {
  const r = Math.random();
  const tryRaise = () => {
    const amt = raiseAmount(table, p);
    return amt > 0 ? { action: 'raise', amount: amt } : { action: 'call' };
  };
  if (toCall === 0) {
    if (score >= 0.6) return r < 0.7 ? tryRaise() : { action: 'check' };
    return r < 0.9 ? { action: 'check' } : tryRaise(); // 가끔 블러프벳
  }
  if (score >= 0.65) return tryRaise(); // 강한 핸드: 레이즈
  if (score >= 0.4) return { action: 'call' }; // 중간: 콜
  return r < 0.1 ? { action: 'call' } : { action: 'fold' }; // 약함: 폴드 (10% 블러프콜)
}

function decideHard(table, p, toCall, score) {
  const r = Math.random();
  const late = latePosition(table, p);
  const loosen = late === 1 ? 0.05 : 0; // 늦은 포지션은 약간 루즈하게
  const tryRaise = () => {
    const amt = raiseAmount(table, p);
    return amt > 0 ? { action: 'raise', amount: amt } : { action: 'call' };
  };
  if (toCall === 0) {
    if (score >= 0.62 - loosen) return r < 0.75 ? tryRaise() : { action: 'check' };
    return r < 0.92 ? { action: 'check' } : tryRaise();
  }
  // 팟 오즈: 콜 금액 / (팟 + 콜 금액)
  const pot = potOf(table);
  const potOdds = toCall / (pot + toCall || 1);
  const equity = Math.min(0.95, score + 0.03); // 점수를 에쿼티로 근사
  if (score >= 0.7 - loosen) return tryRaise(); // 타이트한 레이즈 레인지
  if (equity > potOdds) return { action: 'call' }; // 팟 오즈 맞으면 콜
  return r < 0.05 ? { action: 'call' } : { action: 'fold' }; // 5% 블러프
}

/** 블랙잭 봇: 기본 전략 (17 스탠드, 11 더블) */
function decideBlackjack(p) {
  const total = bjValue(p.hand).total;
  if (total >= 17) return { action: 'stand' };
  if (p.hand.length === 2 && total === 11 && !p.doubled) return { action: 'double' };
  if (p.hand.length === 2 && total === 10 && !p.doubled && Math.random() < 0.5) {
    return { action: 'double' };
  }
  return { action: 'hit' };
}

/**
 * 봇 액션 결정 → {action, amount?}
 * @param table 게임 테이블
 * @param playerId 봇 ID
 * @param difficulty 'easy' | 'normal' | 'hard'
 */
export function decideBotAction(table, playerId, difficulty = 'normal') {
  const p = table.players.find((x) => x.id === playerId);
  if (!p) throw new Error('no player');
  if (table.gameType === 'blackjack') return decideBlackjack(p);
  const toCall = table.toCall(p);
  if (difficulty === 'easy') return decideEasy(table, p, toCall);
  const score = handScore(table, p);
  if (difficulty === 'hard') return decideHard(table, p, toCall, score);
  return decideNormal(table, p, toCall, score);
}

/**
 * 파인애플 디스카드: 버릴 카드 인덱스
 * 페어가 있으면 페어 아닌 가장 낮은 카드, 없으면 가장 낮은 카드
 */
export function chooseDiscardIndex(hole) {
  if (!hole || hole.length !== 3) return 0;
  const counts = {};
  for (const c of hole) counts[c.r] = (counts[c.r] || 0) + 1;
  const pairRank = Object.keys(counts).find((k) => counts[k] === 2);
  let idx = 0;
  for (let i = 0; i < 3; i++) {
    if (pairRank && hole[i].r === +pairRank) continue;
    if (hole[i].r < hole[idx].r || (pairRank && hole[idx].r === +pairRank)) idx = i;
  }
  return idx;
}
