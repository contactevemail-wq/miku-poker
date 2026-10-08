// 🤖 포커 봇 테스트 (13-1)
// 실행: node test-bot.js (단위) — E2E는 test-bot-e2e.js
import { decideBotAction, chooseDiscardIndex, handScore, potOf } from './bot.js';
import { Table } from './table.js';

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

const C = (r, s) => ({ r, s }); // 카드: r=랭크(2-14), s=수트(0-3)

/** 목 테이블 */
function mockTable(gameType = 'holdem', community = []) {
  const t = {
    gameType, community, dealerIdx: 0, currentBet: 100, minRaise: 50,
    players: [],
    toCall(p) { return this.currentBet - p.bet; },
  };
  return t;
}
function mockPlayer(id, hole, bet = 0, stack = 10000) {
  return { id, hole, bet, stack, folded: false, allin: false };
}

/* ---------- 1. handScore ---------- */
{
  const t = mockTable('holdem', [C(14, 0), C(13, 0), C(12, 0), C(2, 1), C(3, 2)]);
  // A하이 플러시
  const s1 = handScore(t, mockPlayer('b', [C(5, 0), C(9, 0)]));
  ok(s1 > 0.75, `플러시 고득점 (${s1.toFixed(2)})`);
  // 원페어
  const t2 = mockTable('holdem', [C(14, 0), C(13, 1), C(12, 2), C(2, 0), C(3, 1)]);
  const s2 = handScore(t2, mockPlayer('b', [C(14, 1), C(7, 0)]));
  ok(s2 > 0.4 && s2 < 0.65, `원페어 중간 (${s2.toFixed(2)})`);
  // 프리플랍 포켓 에이스
  const t3 = mockTable('holdem', []);
  const s3 = handScore(t3, mockPlayer('b', [C(14, 0), C(14, 1)]));
  ok(s3 > 0.7, `포켓A 강함 (${s3.toFixed(2)})`);
  // 프리플랍 쓰레기
  const s4 = handScore(t3, mockPlayer('b', [C(7, 0), C(2, 1)]));
  ok(s4 < 0.4, `쓰레기 약함 (${s4.toFixed(2)})`);
}

/* ---------- 2. easy 분포 (핸드 무시) ---------- */
{
  const t = mockTable();
  const p = mockPlayer('bot1', [C(14, 0), C(14, 1)], 0); // 강한 핸드지만 무시해야
  t.players = [p];
  const cnt = { call: 0, fold: 0, raise: 0, check: 0 };
  for (let i = 0; i < 1000; i++) {
    const d = decideBotAction(t, 'bot1', 'easy');
    cnt[d.action] = (cnt[d.action] || 0) + 1;
  }
  // toCall=100 > 0: 70% 콜 / 20% 폴드 / 10% 레이즈 (오차 ±7%)
  ok(Math.abs(cnt.call / 1000 - 0.7) < 0.07, `easy 콜 분포 (${(cnt.call / 10).toFixed(1)}%)`);
  ok(Math.abs(cnt.fold / 1000 - 0.2) < 0.07, `easy 폴드 분포 (${(cnt.fold / 10).toFixed(1)}%)`);
  ok(Math.abs(cnt.raise / 1000 - 0.1) < 0.05, `easy 레이즈 분포 (${(cnt.raise / 10).toFixed(1)}%)`);
}

/* ---------- 3. normal: 핸드 기반 ---------- */
{
  // 강한 핸드 (플러시) + 콜 필요 → 레이즈
  const t = mockTable('holdem', [C(14, 0), C(13, 0), C(12, 0), C(2, 1), C(3, 2)]);
  const p = mockPlayer('bot1', [C(5, 0), C(9, 0)], 0);
  t.players = [p];
  let raises = 0;
  for (let i = 0; i < 100; i++) {
    if (decideBotAction(t, 'bot1', 'normal').action === 'raise') raises++;
  }
  ok(raises === 100, `normal 강핸드 항상 레이즈 (${raises}/100)`);

  // 약한 핸드 (하이카드) + 콜 필요 → 대체로 폴드
  const t2 = mockTable('holdem', [C(14, 0), C(13, 1), C(12, 2), C(4, 0), C(6, 1)]);
  const p2 = mockPlayer('bot1', [C(7, 0), C(2, 1)], 0);
  t2.players = [p2];
  let folds = 0;
  for (let i = 0; i < 100; i++) {
    if (decideBotAction(t2, 'bot1', 'normal').action === 'fold') folds++;
  }
  ok(folds >= 80, `normal 약핸드 대체로 폴드 (${folds}/100)`);

  // 무료면 체크
  const t3 = mockTable('holdem', []);
  t3.currentBet = 0;
  const p3 = mockPlayer('bot1', [C(7, 0), C(2, 1)], 0);
  t3.players = [p3];
  const d = decideBotAction(t3, 'bot1', 'normal');
  ok(d.action === 'check' || d.action === 'raise', '무료면 체크/레이즈 (폴드 금지)');
}

/* ---------- 4. hard: 팟 오즈 ---------- */
{
  // 강한 핸드 → 레이즈
  const t = mockTable('holdem', [C(14, 0), C(14, 1), C(14, 2), C(2, 0), C(3, 1)]);
  const p = mockPlayer('bot1', [C(14, 3), C(9, 0)], 0);
  t.players = [p, mockPlayer('x', [], 100)]; // pot에 100
  p.totalBet = 0;
  t.players[1].totalBet = 100;
  const d = decideBotAction(t, 'bot1', 'hard');
  ok(d.action === 'raise', `hard 강핸드 레이즈 (실제 ${d.action})`);
}

/* ---------- 5. 블랙잭 봇 ---------- */
{
  const t = { gameType: 'blackjack', players: [] };
  const p = { id: 'bot1', hand: [C(10, 0), C(6, 1)], doubled: false };
  t.players = [p];
  t.toCall = () => 0;
  ok(decideBotAction(t, 'bot1', 'easy').action === 'hit', '16 히트');
  p.hand = [C(10, 0), C(10, 1)];
  ok(decideBotAction(t, 'bot1', 'hard').action === 'stand', '20 스탠드');
  p.hand = [C(6, 0), C(5, 1)]; // 11
  ok(decideBotAction(t, 'bot1', 'normal').action === 'double', '11 더블');
}

/* ---------- 6. 디스카드 선택 ---------- */
{
  // 페어 있으면 페어 아닌 가장 낮은 카드 버림
  const idx = chooseDiscardIndex([C(14, 0), C(14, 1), C(5, 2)]);
  ok(idx === 2, `페어 유지하고 5 버림 (idx ${idx})`);
  // 페어 없으면 가장 낮은 카드
  const idx2 = chooseDiscardIndex([C(13, 0), C(9, 1), C(4, 2)]);
  ok(idx2 === 2, `가장 낮은 4 버림 (idx ${idx2})`);
}

/* ---------- 7. 실제 테이블 연동 ---------- */
{
  const t = new Table({ sb: 50, bb: 100 });
  t.addPlayer('h', 'H', 10000);
  t.addPlayer('bot1', '🤖 봇1', 10000, { isBot: true });
  const bp = t.players.find((p) => p.id === 'bot1');
  ok(bp.isBot === true, 'isBot 플래그');
  const st = t.publicState('h');
  ok(st.players.find((p) => p.id === 'bot1').isBot === true, 'publicState isBot');
}

/* ---------- 8. potOf ---------- */
{
  const t = mockTable();
  t.players = [{ totalBet: 100 }, { totalBet: 200 }, { totalBet: 0 }];
  ok(potOf(t) === 300, 'pot 계산');
}

console.log(`\n봇 단위 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
