// 🂡 블랙잭 테스트 (13-1)
// 실행: node test-blackjack.js
import { BlackjackTable, STREET, GAME_TABLES } from './table.js';
import { bjValue, isBlackjack, makeDeck, shuffle } from './poker-engine.js';

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

const seeded = (seed) => {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
};
const C = (r, s) => ({ r, s });

/* ---------- 1. bjValue ---------- */
{
  ok(bjValue([C(14, 0), C(13, 0)]).total === 21, 'A+K=21');
  ok(bjValue([C(14, 0), C(9, 0), C(5, 0)]).total === 15, 'A+9+5=15 (A=1)');
  ok(bjValue([C(14, 0), C(6, 0)]).soft === true, 'A+6 소프트');
  ok(bjValue([C(10, 0), C(7, 0)]).total === 17, '10+7=17');
  ok(bjValue([C(14, 0), C(14, 1), C(9, 0)]).total === 21, 'A+A+9=21');
  ok(bjValue([C(14, 0), C(14, 1), C(9, 0), C(5, 0)]).total === 16, 'A+A+9+5=16');
  ok(isBlackjack([C(14, 0), C(11, 0)]), 'A+J 블랙잭');
  ok(!isBlackjack([C(10, 0), C(5, 0), C(6, 0)]), '3장 21은 블랙잭 아님');
}

/* ---------- 2. 딜링 + 공개 상태 ---------- */
{
  const t = new BlackjackTable({ blackjackBet: 100 });
  t.addPlayer('p0', 'P0', 1000); t.addPlayer('p1', 'P1', 1000);
  t.startHand(seeded(11));
  ok(t.players.every((p) => p.hand.length === 2), '2장씩 딜링');
  ok(t.players.every((p) => p.bet === 100 && p.stack === 900), '베팅 차감');
  const st = t.publicState('p0');
  ok(st.gameType === 'blackjack', 'gameType 표기');
  ok(st.dealer.handCount === 2 && st.dealer.holeHidden === true, '딜러 홀카드 히든');
  ok(st.dealer.hand[0] !== null && st.dealer.hand[1] === null, '딜러 첫 장만 공개');
  ok(st.players[1].hand.every((c) => c !== null), '플레이어 핸드는 전부 오픈');
  ok(st.actionPlayerId !== null, '액션 플레이어 지정');
}

/* ---------- 3. hit/stand/double ---------- */
{
  const t = new BlackjackTable({ blackjackBet: 100 });
  t.addPlayer('p0', 'P0', 1000);
  t.startHand(seeded(21));
  // 강제 세팅: p0 = 10+6 (16), 딜러는 약한 패
  t.players[0].hand = [C(10, 0), C(6, 1)];
  t.dealer.hand = [C(5, 0), C(9, 1)]; // 14 → 히트
  const pid = t.turnPlayer().id;
  t.act(pid, 'hit');
  ok(t.players[0].hand.length === 3, '히트 후 3장');
  // double: 2인으로 해야 정산 전 bet 확인 가능 (1인이면 즉시 정산)
  const t2 = new BlackjackTable({ blackjackBet: 100 });
  t2.addPlayer('p0', 'P0', 1000); t2.addPlayer('p1', 'P1', 1000);
  t2.startHand(seeded(22));
  for (const p of t2.players) { p.done = false; p.blackjack = false; }
  t2.players[0].hand = [C(5, 0), C(6, 1)]; // 11
  t2.players[1].hand = [C(2, 0), C(3, 1)]; // 5
  t2.dealer.hand = [C(10, 0), C(7, 1)];
  t2.actionIdx = 0;
  t2.act('p0', 'double');
  const p = t2.players[0];
  ok(p.bet === 200 && p.stack === 800 && p.doubled, '더블 베팅 2배');
  ok(p.hand.length === 3 && p.done, '더블 후 1장 받고 종료');
  // double은 첫 액션만
  const t3 = new BlackjackTable({ blackjackBet: 100 });
  t3.addPlayer('p0', 'P0', 1000);
  t3.startHand(seeded(23));
  t3.players[0].hand = [C(2, 0), C(3, 1)];
  t3.dealer.hand = [C(10, 0), C(7, 1)];
  t3.act('p0', 'hit');
  try { t3.act('p0', 'double'); ok(false, '히트 후 더블 차단'); }
  catch (e) { ok(e.message.includes('첫 액션'), '히트 후 더블 차단'); }
}

/* ---------- 4. 버스트 ---------- */
{
  const t = new BlackjackTable({ blackjackBet: 100 });
  t.addPlayer('p0', 'P0', 1000);
  t.startHand(seeded(31));
  t.players[0].hand = [C(10, 0), C(6, 1)]; // 16
  t.dealer.hand = [C(10, 2), C(7, 3)];
  // 덱 조작: 다음 카드가 10 → 버스트
  t.deck.push(C(10, 1));
  // 주의: pop()이라 맨 뒤가 다음 카드. push로 강제
  t.act('p0', 'hit');
  const p = t.players[0];
  // 16+10=26 버스트 (시드 덱이 아니라 강제 카드)
  ok(p.hand.length === 3, '히트 3장');
  // 버스트 여부는 강제 카드에 따라 다름 — 직접 검증:
  const t4 = new BlackjackTable({ blackjackBet: 100 });
  t4.addPlayer('p0', 'P0', 1000); t4.addPlayer('p1', 'P1', 1000);
  t4.startHand(seeded(32));
  t4.players[0].hand = [C(10, 0), C(9, 1)]; // 19
  t4.players[1].hand = [C(10, 2), C(6, 3)]; // 15
  t4.dealer.hand = [C(10, 0), C(7, 1)]; // 17 스탠드
  t4.deck = [C(10, 3)]; // p1 히트 → 25 버스트
  t4.act('p0', 'stand');
  t4.act('p1', 'hit');
  ok(t4.players[1].busted, '25 버스트');
  ok(t4.street === STREET.DONE, '전원 종료 후 정산');
  const w1 = t4.winners.find((w) => w.id === 'p1');
  ok(w1.profit === -100 && w1.result === 'bust', '버스트 패배');
}

/* ---------- 5. 플레이어 블랙잭 즉시 종료 ---------- */
{
  const t = new BlackjackTable({ blackjackBet: 100 });
  t.addPlayer('p0', 'P0', 1000); t.addPlayer('p1', 'P1', 1000);
  t.startHand(seeded(41));
  t.players[0].hand = [C(14, 0), C(13, 0)]; // BJ
  t.players[0].blackjack = true; t.players[0].done = true;
  t.players[1].hand = [C(10, 0), C(7, 1)];
  t.dealer.hand = [C(9, 0), C(7, 1)]; // 16 → 히트
  t.actionIdx = t.players.indexOf(t.players[1]);
  t.skipDone();
  t.act('p1', 'stand');
  ok(t.street === STREET.DONE, '정산 완료');
  const w = t.winners.find((x) => x.id === 'p0');
  ok(w.result === 'blackjack' && w.profit === 150, `블랙잭 3:2 배당 (profit ${w.profit})`);
}

/* ---------- 6. 딜러 블랙잭 즉시 정산 ---------- */
{
  const t = new BlackjackTable({ blackjackBet: 100 });
  t.addPlayer('p0', 'P0', 1000); t.addPlayer('p1', 'P1', 1000);
  // 덱 조작: 딜러가 A+K를 받도록 — startHand는 deck.pop() 순서라 직접 세팅이 간단
  t.startHand(seeded(42));
  // startHand 후 강제: 딜러 BJ, p0도 BJ(푸시), p1은 일반
  t.dealer.hand = [C(14, 0), C(13, 1)];
  t.players[0].hand = [C(14, 2), C(12, 3)];
  t.players[0].blackjack = true; t.players[0].done = true;
  t.players[1].hand = [C(10, 0), C(9, 1)];
  t.players[1].done = true;
  t.settle();
  const w0 = t.winners.find((x) => x.id === 'p0');
  const w1 = t.winners.find((x) => x.id === 'p1');
  ok(w0.result === 'push' && w0.profit === 0, '딜러 BJ vs 플레이어 BJ = 푸시');
  ok(w1.result === 'lose' && w1.profit === -100, '딜러 BJ vs 일반 = 패배');
}

/* ---------- 7. 딜러 17 히트 규칙 ---------- */
{
  const t = new BlackjackTable({ blackjackBet: 100 });
  t.addPlayer('p0', 'P0', 1000);
  t.startHand(seeded(43));
  t.players[0].hand = [C(10, 0), C(7, 1)]; // 17 스탠드
  t.dealer.hand = [C(6, 0), C(10, 1)]; // 16 → 히트
  t.deck = [C(5, 2), C(10, 3)]; // pop 순서: 10 먼저 → 26 버스트
  t.act('p0', 'stand');
  ok(bjValue(t.dealer.hand).total > 21, '딜러 16 히트 → 버스트');
  const w = t.winners.find((x) => x.id === 'p0');
  ok(w.result === 'win' && w.profit === 100, '딜러 버스트 → 승리');
}

/* ---------- 8. timeoutAction ---------- */
{
  const t = new BlackjackTable({ blackjackBet: 100 });
  t.addPlayer('p0', 'P0', 1000);
  t.startHand(seeded(44));
  const pid = t.turnPlayer().id;
  const label = t.timeoutAction(pid);
  ok(label === '스탠드', '타임아웃 자동 스탠드');
  ok(t.players.find((p) => p.id === pid).stood, '스탠드 처리됨');
}

/* ---------- 9. 레지스트리 ---------- */
{
  ok(GAME_TABLES.blackjack === BlackjackTable, '레지스트리에 blackjack 등록');
}

/* ---------- 10. 시뮬레이션: 정산 일치성 × 200핸드 ---------- */
// 블랙잭은 플레이어 vs 하우스라 총량 보존이 아니라,
// "각 플레이어의 스택 변동 == 정산 profit" + "profit이 배당 규칙과 일치"를 검증
let simFail = 0;
for (let g = 0; g < 200; g++) {
  try {
    const n = 1 + Math.floor(Math.random() * 8);
    const bet = 100;
    const t = new BlackjackTable({ blackjackBet: bet });
    for (let i = 0; i < n; i++) t.addPlayer(`p${i}`, `P${i}`, 10000);
    const before = new Map(t.players.map((p) => [p.id, p.stack]));
    t.startHand();
    let guard = 0;
    while (t.street !== STREET.DONE && guard++ < 500) {
      const p = t.turnPlayer();
      if (!p) break;
      const v = bjValue(p.hand).total;
      const r = Math.random();
      if (p.hand.length === 2 && v >= 9 && v <= 11 && p.stack >= p.bet && r < 0.4) {
        t.act(p.id, 'double');
      } else if (v <= 11 || (v < 17 && r < 0.7)) {
        t.act(p.id, 'hit');
      } else {
        t.act(p.id, 'stand');
      }
    }
    if (t.street !== STREET.DONE) throw new Error('미완료: ' + t.street);
    for (const w of t.winners) {
      const p = t.players.find((x) => x.id === w.id);
      if (p.stack - before.get(w.id) !== w.profit) {
        throw new Error(`정산 불일치 ${w.id}: 스택변동 ${p.stack - before.get(w.id)} vs profit ${w.profit}`);
      }
      const expected = { win: w.bet, blackjack: Math.floor(w.bet * 1.5), push: 0, lose: -w.bet, bust: -w.bet }[w.result];
      if (w.profit !== expected) {
        throw new Error(`배당 오류 ${w.id}: ${w.result}인데 profit ${w.profit} (기대 ${expected})`);
      }
    }
  } catch (e) {
    simFail++;
    if (simFail <= 3) console.log('SIM FAIL:', e.message);
  }
}
ok(simFail === 0, `시뮬레이션 200핸드 (실패 ${simFail})`);

console.log(`\n블랙잭 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
