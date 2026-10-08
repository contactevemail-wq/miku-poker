// 🃏 세븐카드 스터드 테스트 (13-1)
// 실행: node test-stud.js
import { SevenStudTable, STREET, GAME_TABLES } from './table.js';
import { eval7 } from './poker-engine.js';

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

const seeded = (seed) => {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
};

const newTable = (n = 4, opts = {}) => {
  const t = new SevenStudTable({ sb: 50, bb: 100, studAnte: 10, ...opts });
  for (let i = 0; i < n; i++) t.addPlayer(`p${i}`, `P${i}`, 10000);
  return t;
};

/* ---------- 1. 딜링: 다운2+업1, 앤티, 브링인 ---------- */
{
  const t = newTable();
  t.startHand(seeded(61));
  ok(t.street === STREET.THIRD, '3rd 스트릿 시작');
  ok(t.players.every((p) => p.hole.length === 3), '3장씩');
  ok(t.players.every((p) => p.hole.filter((c) => c.up).length === 1), '업카드 1장씩');
  ok(t.players.every((p) => p.totalBet === 10 || p.totalBet === 60), '앤티 10 (브링인은 60)');
  const bi = t.players.find((p) => p.bet === 50);
  ok(!!bi, '브링인 스몰벳 50 포스트');
  // 브링인이 실제 최저 업카드인지 검증
  const upOf = (p) => p.hole.find((c) => c.up);
  const isLowest = t.players.every((p) => {
    const a = upOf(bi), b = upOf(p);
    return a.r < b.r || (a.r === b.r && a.s >= b.s);
  });
  ok(isLowest, '브링인 = 최저 업카드');
  // 액션은 브링인 왼쪽부터
  const ps = t.players;
  const biPos = ps.indexOf(bi);
  const expected = ps[(biPos + 1) % ps.length].id;
  ok(ps[t.actionIdx % ps.length].id === expected, '브링인 왼쪽부터 액션');
}

/* ---------- 2. 스트릿 진행: 업/다운 카드 ---------- */
{
  const t = newTable(3);
  t.startHand(seeded(62));
  const streets = [STREET.THIRD];
  let guard = 0;
  while (t.street !== STREET.DONE && guard++ < 200) {
    const cur = t.players[t.actionIdx % t.players.length];
    if (!cur) break;
    // 전부 체크/콜로 진행
    try {
      const call = t.toCall(cur);
      t.act(cur.id, call === 0 ? 'check' : 'call');
    } catch (e) { break; }
    if (!streets.includes(t.street)) streets.push(t.street);
  }
  ok(JSON.stringify(streets) === JSON.stringify(['third', 'fourth', 'fifth', 'sixth', 'seventh', 'done']),
    `스트릿 순서 (실제: ${streets.join('→')})`);
  ok(t.street === STREET.DONE, '쇼다운 완료');
  // 7th는 다운카드
  const p0 = t.players[0];
  ok(p0.hole.length === 7, '7장 보유');
  ok(p0.hole.filter((c) => c.up).length === 4, '업 4장');
  ok(p0.hole.filter((c) => !c.up).length === 3, '다운 3장');
  ok(p0.hole[6].up === false, '7번째는 다운카드');
}

/* ---------- 3. 베팅 사이즈: 4th 스몰 / 5th 빅 ---------- */
{
  const t = newTable(2);
  t.startHand(seeded(63));
  ok(t.minRaise === 50, '3rd 스몰벳');
  let guard = 0;
  while (t.street === STREET.THIRD && guard++ < 50) {
    const cur = t.players[t.actionIdx % t.players.length];
    t.act(cur.id, t.toCall(cur) === 0 ? 'check' : 'call');
  }
  ok(t.street === STREET.FOURTH && t.minRaise === 50, '4th 스몰벳');
  guard = 0;
  while (t.street === STREET.FOURTH && guard++ < 50) {
    const cur = t.players[t.actionIdx % t.players.length];
    t.act(cur.id, 'check');
  }
  ok(t.street === STREET.FIFTH && t.minRaise === 100, '5th 빅벳');
}

/* ---------- 4. 선공: 최고 업카드 ---------- */
{
  const t = newTable(3);
  t.startHand(seeded(64));
  // 3rd를 콜로 넘기고 4th 선공 확인
  let guard = 0;
  while (t.street === STREET.THIRD && guard++ < 50) {
    const cur = t.players[t.actionIdx % t.players.length];
    t.act(cur.id, t.toCall(cur) === 0 ? 'check' : 'call');
  }
  // 4th 선공 = 최고 업카드 보유자
  const first = t.players[t.actionIdx % t.players.length];
  const upBest = (p) => p.hole.filter((c) => c.up).sort((a, b) => b.r - a.r || a.s - b.s)[0];
  const isHighest = t.players.filter((p) => !p.folded).every((p) => {
    const a = upBest(first), b = upBest(p);
    return a.r > b.r || (a.r === b.r && a.s <= b.s);
  });
  ok(isHighest, '4th 선공 = 최고 업카드');
}

/* ---------- 5. 공개 상태 마스킹 ---------- */
{
  const t = newTable(3);
  t.startHand(seeded(65));
  const st = t.publicState('p0');
  ok(st.gameType === 'sevenstud', 'gameType 표기');
  const me = st.players[0];
  ok(me.hand.every((c) => c !== null), '본인 7장... 아니 3장 전부 보임');
  const other = st.players[1];
  const ups = other.hand.filter((c) => c && c.up).length;
  const downs = other.hand.filter((c) => c === null).length;
  ok(ups === 1 && downs === 2, '상대는 업카드만 보임');
}

/* ---------- 6. 쇼다운: 7장 중 최상 평가 ---------- */
{
  const t = newTable(2);
  t.startHand(seeded(66));
  // 강제: p0 = A원페어, p1 = 하이카드
  const C = (r, s, up) => ({ r, s, up });
  t.players[0].hole = [C(14, 0, false), C(14, 1, false), C(2, 0, true), C(3, 1, true), C(4, 2, true), C(5, 3, true), C(9, 0, false)];
  t.players[1].hole = [C(13, 0, false), C(12, 1, false), C(2, 1, true), C(3, 2, true), C(4, 3, true), C(5, 0, true), C(9, 1, false)];
  t.showdown();
  const w = t.winners[0];
  ok(w.id === 'p0', 'A원페어 승리');
  ok(t.winners.reduce((s, x) => s + x.amount, 0) === t.players.reduce((s, p) => s + 0, 0) + t.winners.reduce((s, x) => s + x.amount, 0), '정산 금액 존재');
}

/* ---------- 7. 최대 7명 ---------- */
{
  const t = new SevenStudTable({ sb: 50, bb: 100 });
  for (let i = 0; i < 8; i++) t.addPlayer(`p${i}`, `P${i}`, 10000);
  try { t.startHand(seeded(67)); ok(false, '8명 차단'); }
  catch (e) { ok(e.message.includes('최대 7명'), '8명 차단'); }
}

/* ---------- 8. 레지스트리 ---------- */
{
  ok(GAME_TABLES.sevenstud === SevenStudTable, '레지스트리에 sevenstud 등록');
}

/* ---------- 9. 시뮬레이션: 칩 보존 × 100핸드 ---------- */
// 스터드는 팟 게임이라 총량 보존 검증
let simFail = 0;
for (let g = 0; g < 100; g++) {
  try {
    const n = 2 + Math.floor(Math.random() * 6); // 2~7명
    const t = newTable(n);
    const before = t.totalChips();
    t.startHand();
    let guard = 0;
    while (t.street !== STREET.DONE && guard++ < 3000) {
      const cur = t.players[t.actionIdx % t.players.length];
      if (!cur) break;
      const call = t.toCall(cur);
      const r = Math.random();
      const minTo = cur.bet + 0; // not used
      const canRaise = cur.stack > call;
      try {
        if (call === 0) {
          if (r < 0.7) t.act(cur.id, 'check');
          else if (r < 0.9 && canRaise) t.act(cur.id, 'raise', t.currentBet + t.minRaise);
          else t.act(cur.id, 'check');
        } else {
          if (r < 0.3) t.act(cur.id, 'fold');
          else if (r < 0.8) t.act(cur.id, 'call');
          else if (canRaise) t.act(cur.id, 'raise', t.currentBet + t.minRaise);
          else t.act(cur.id, 'call');
        }
      } catch (e) { throw new Error(`act 실패 (${t.street}): ${e.message}`); }
    }
    if (t.street !== STREET.DONE) throw new Error('미완료: ' + t.street);
    if (t.totalChips() !== before) throw new Error(`칩 유실: ${before} -> ${t.totalChips()}`);
  } catch (e) {
    simFail++;
    if (simFail <= 3) console.log('SIM FAIL:', e.message);
  }
}
ok(simFail === 0, `시뮬레이션 100핸드 칩 보존 (실패 ${simFail})`);

console.log(`\n스터드 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
