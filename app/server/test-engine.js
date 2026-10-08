// 엔진 검증 테스트
import { eval7, compareHands, HAND_NAMES, cardStr } from './poker-engine.js';
import { Table, STREET } from './table.js';

const C = (r, s) => ({ r, s }); // s: 0♠ 1♥ 2♦ 3♣
let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : (fail++, console.log('FAIL:', name)); };

// --- 핸드 평가 테스트 ---
const t = (cards, cat, name) => {
  const h = eval7(cards);
  ok(h.cat === cat, `${name}: 기대 ${HAND_NAMES[cat]}, 실제 ${HAND_NAMES[h.cat]}`);
};
t([C(14,0),C(13,0),C(12,0),C(11,0),C(10,0),C(2,1),C(3,2)], 8, '로열플러시');
t([C(9,1),C(8,1),C(7,1),C(6,1),C(5,1),C(14,0),C(2,2)], 8, '스트레이트플러시');
t([C(14,1),C(5,1),C(4,1),C(3,1),C(2,1),C(9,0),C(9,2)], 8, '백스트레이트플러시(A5432)');
t([C(9,0),C(9,1),C(9,2),C(9,3),C(14,0),C(2,1),C(3,2)], 7, '포카드');
t([C(13,0),C(13,1),C(13,2),C(5,0),C(5,1),C(2,1),C(3,2)], 6, '풀하우스');
t([C(14,1),C(11,1),C(9,1),C(6,1),C(3,1),C(9,0),C(9,2)], 5, '플러시');
t([C(14,0),C(5,1),C(4,2),C(3,3),C(2,0),C(9,0),C(9,2)], 4, '백스트레이트');
t([C(10,0),C(9,1),C(8,2),C(7,3),C(6,0),C(2,0),C(3,2)], 4, '스트레이트');
t([C(7,0),C(7,1),C(7,2),C(14,0),C(9,1),C(2,1),C(3,2)], 3, '트리플');
t([C(14,0),C(14,1),C(9,0),C(9,1),C(5,2),C(2,1),C(3,2)], 2, '투페어');
t([C(12,0),C(12,1),C(14,0),C(9,1),C(5,2),C(2,1),C(3,2)], 1, '원페어');
t([C(14,0),C(11,1),C(9,2),C(6,3),C(3,0),C(2,1),C(7,2)], 0, '하이카드');

// 동점/우열
const h1 = eval7([C(14,0),C(14,1),C(9,0),C(9,1),C(5,2),C(2,1),C(3,2)]); // A투페어
const h2 = eval7([C(13,0),C(13,1),C(9,0),C(9,1),C(5,2),C(2,1),C(3,2)]); // K투페어
ok(compareHands(h1, h2) === 1, '투페어 A > K');
const h3 = eval7([C(14,0),C(13,0),C(12,0),C(11,0),C(9,0),C(2,1),C(3,2)]);
const h4 = eval7([C(14,1),C(13,1),C(12,1),C(11,1),C(9,1),C(2,0),C(3,3)]);
ok(compareHands(h3, h4) === 0, '같은 플러시 무승부');

console.log(`핸드 평가: ${pass} 통과, ${fail} 실패`);

// --- 풀 핸드 시뮬레이션 (칩 보존 불변식) ---
let simFail = 0;
const HANDS = 300;
for (let g = 0; g < HANDS; g++) {
  try {
    const n = 2 + Math.floor(Math.random() * 8);
    const table = new Table({ sb: 50, bb: 100 });
    for (let i = 0; i < n; i++) table.addPlayer(`p${i}`, `P${i}`, 10000);
    const before = table.totalChips();
    table.startHand();
    let guard = 0;
    while (table.street !== STREET.DONE && guard++ < 2000) {
      const st = table.publicState('p0');
      const pid = st.actionPlayerId;
      if (!pid) break;
      const me = table.players.find((p) => p.id === pid);
      const call = table.toCall(me);
      const r = Math.random();
      const minTo = st.minRaiseTo;
      const canRaise = me.stack + me.bet >= minTo && me.stack > call;
      if (call === 0) {
        if (r < 0.6) table.act(pid, 'check');
        else if (r < 0.85 && canRaise) table.act(pid, 'raise', minTo + Math.floor(Math.random() * 500));
        else if (r < 0.85) table.act(pid, 'check');
        else table.act(pid, 'allin');
      } else {
        if (r < 0.25) table.act(pid, 'fold');
        else if (r < 0.7) table.act(pid, 'call');
        else if (r < 0.9 && canRaise) table.act(pid, 'raise', minTo + Math.floor(Math.random() * 800));
        else if (r < 0.9) table.act(pid, 'call');
        else table.act(pid, 'allin');
      }
    }
    if (table.street !== STREET.DONE) throw new Error('hand did not finish');
    const after = table.totalChips();
    if (before !== after) throw new Error(`chip leak: ${before} -> ${after}`);
  } catch (e) {
    simFail++;
    if (simFail <= 3) console.log('SIM FAIL:', e.message);
  }
}
console.log(`시뮬레이션 ${HANDS}핸드: ${HANDS - simFail} 성공, ${simFail} 실패`);
process.exit(fail + simFail > 0 ? 1 : 0);
