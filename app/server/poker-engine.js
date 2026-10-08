// 🃏 포커 엔진 — 순수 로직 (입출력 없음)
// 카드: { r: 2~14 (11=J,12=Q,13=K,14=A), s: 0=♠ 1=♥ 2=♦ 3=♣ }

/* ---------- 덱 ---------- */

export function makeDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++)
    for (let r = 2; r <= 14; r++) deck.push({ r, s });
  return deck;
}

// Fisher-Yates 셔플
export function shuffle(deck, rand = Math.random) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/* ---------- 핸드 평가 ---------- */

// 족보 카테고리 (높을수록 강함)
export const HAND_NAMES = [
  '하이카드', '원페어', '투페어', '트리플',
  '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시',
];

/**
 * 5장 핸드 평가 → { cat: 0~8, tb: [비교값...] }
 * tb는 카테고리 내 서열 비교용 내림차순 값 배열
 */
export function eval5(cards) {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const flush = suits.every((s) => s === suits[0]);

  // 스트레이트 판정 (A-5-4-3-2 백스트레이트 포함)
  let straightHigh = 0;
  const uniq = [...new Set(ranks)];
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5; // A5432
  }

  // 랭크별 개수
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, n]) => ({ r: +r, n }))
    .sort((a, b) => b.n - a.n || b.r - a.r);

  if (flush && straightHigh) return { cat: 8, tb: [straightHigh] };
  if (groups[0].n === 4) return { cat: 7, tb: [groups[0].r, groups[1].r] };
  if (groups[0].n === 3 && groups[1].n === 2)
    return { cat: 6, tb: [groups[0].r, groups[1].r] };
  if (flush) return { cat: 5, tb: ranks };
  if (straightHigh) return { cat: 4, tb: [straightHigh] };
  if (groups[0].n === 3) {
    const kick = groups.slice(1).map((g) => g.r);
    return { cat: 3, tb: [groups[0].r, ...kick] };
  }
  if (groups[0].n === 2 && groups[1].n === 2) {
    const pairs = [groups[0].r, groups[1].r].sort((a, b) => b - a);
    return { cat: 2, tb: [...pairs, groups[2].r] };
  }
  if (groups[0].n === 2) {
    const kick = groups.slice(1).map((g) => g.r);
    return { cat: 1, tb: [groups[0].r, ...kick] };
  }
  return { cat: 0, tb: ranks };
}

/** 7장 중 최상의 5장 조합 평가 */
export function eval7(cards7) {
  let best = null;
  for (let a = 0; a < 5; a++)
    for (let b = a + 1; b < 6; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++) {
            const h = eval5([cards7[a], cards7[b], cards7[c], cards7[d], cards7[e]]);
            if (!best || compareHands(h, best) > 0) best = h;
          }
  return best;
}

/** 핸드 비교: 1 (a 승) / -1 (b 승) / 0 (무승부) */
export function compareHands(a, b) {
  if (a.cat !== b.cat) return a.cat > b.cat ? 1 : -1;
  const n = Math.max(a.tb.length, b.tb.length);
  for (let i = 0; i < n; i++) {
    const x = a.tb[i] || 0, y = b.tb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export const cardStr = (c) => {
  const R = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const S = ['♠', '♥', '♦', '♣'];
  return (R[c.r] || c.r) + S[c.s];
};

/* ---------- 블랙잭 (13-1) ---------- */

/**
 * 블랙잭 핸드 가치 → { total, soft }
 * A는 11, 21 초과 시 1로 조정. soft=true면 A를 11로 쓴 상태
 */
export function bjValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.r === 14) { aces++; total += 11; }
    else if (c.r >= 10) total += 10;
    else total += c.r;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

/** 내추럴 블랙잭: 첫 2장이 21 */
export function isBlackjack(hand) {
  return hand.length === 2 && bjValue(hand).total === 21;
}

/* ---------- 베팅 액션 ---------- */

export const ACTION = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  RAISE: 'raise', // amount = 올릴 총액 (to-amount)
  ALLIN: 'allin',
};

/**
 * 플레이어가 특정 액션을 할 수 있는지 + 필요 칩 계산
 * state: { toCall, minRaiseTo, players... }
 */
export function legalActions(player, toCall, minRaiseTo) {
  const acts = [ACTION.FOLD];
  const stack = player.stack; // 남은 칩 (베팅액 제외)
  if (toCall === 0) acts.push(ACTION.CHECK);
  if (toCall > 0 && stack > 0) acts.push(ACTION.CALL);
  // 레이즈: 최소 minRaiseTo까지 올릴 수 있어야 (스택+이번라운드베팅 기준)
  if (stack > toCall) acts.push(ACTION.RAISE);
  if (stack > 0) acts.push(ACTION.ALLIN);
  return acts;
}
