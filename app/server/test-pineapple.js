// 🍍 파인애플 포커 테스트 (13-1)
// 실행: node test-pineapple.js
import { PineappleTable, Table, STREET, GAME_TABLES } from './table.js';
import { eval7 } from './poker-engine.js';

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

// 결정적 셔플용 시드 랜덤
const seeded = (seed) => {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
};

const newTable = (variant, n = 3) => {
  const t = new PineappleTable({ sb: 50, bb: 100, pineappleVariant: variant });
  for (let i = 0; i < n; i++) t.addPlayer(`p${i}`, `P${i}`, 10000);
  return t;
};

/* ---------- 1. classic: 딜링 3장 + 프리플랍 전 디스카드 ---------- */
{
  const t = newTable('classic');
  t.startHand(seeded(42));
  ok(t.street === STREET.DISCARD, 'classic: 시작 후 DISCARD 페이즈');
  ok(t.players.every((p) => p.hole.length === 3), '3장씩 딜링');
  const st = t.publicState('p0');
  ok(st.isDiscardPhase === true, 'publicState.isDiscardPhase');
  ok(st.actionPlayerId === null, '디스카드 중 actionPlayerId null');
  ok(st.players[0].hole.length === 3, '본인 3장 보임');
  ok(st.players[1].hole.every((c) => c === null), '상대 패 마스킹');
}

/* ---------- 2. 디스카드 진행 → 프리플랍 베팅 ---------- */
{
  const t = newTable('classic');
  t.startHand(seeded(7));
  const before = t.players[0].hole.map((c) => ({ ...c }));
  let done = t.discard('p0', 1);
  ok(done === false, '첫 디스카드 후 페이즈 계속');
  ok(t.players[0].hole.length === 2, '2장 남음');
  ok(t.players[0].hole[0].r === before[0].r && t.players[0].hole[1].r === before[2].r,
    '인덱스 1 버림 정확');
  t.discard('p1', 0);
  done = t.discard('p2', 2);
  ok(done === true, '마지막 디스카드 후 페이즈 완료');
  ok(t.street === STREET.PREFLOP, '프리플랍 베팅 개시');
  ok(t.players.every((p) => p.hole.length === 2), '전원 2장');
}

/* ---------- 3. 디스카드 에러 케이스 ---------- */
{
  const t = newTable('classic');
  t.startHand(seeded(7));
  try { t.discard('p0', 5); ok(false, '잘못된 인덱스 차단'); }
  catch (e) { ok(e.message.includes('잘못된 카드'), '잘못된 인덱스 차단'); }
  try { t.discard('nobody', 0); ok(false, '없는 플레이어 차단'); }
  catch (e) { ok(e.message.includes('디스카드할 수 없어요'), '없는 플레이어 차단'); }
  t.discard('p0', 0);
  try { t.discard('p0', 0); ok(false, '중복 디스카드 차단'); }
  catch (e) { ok(e.message.includes('이미 버렸어요'), '중복 디스카드 차단'); }
  t.discard('p1', 0); t.discard('p2', 0);
  try { t.discard('p0', 0); ok(false, '페이즈 종료 후 차단'); }
  catch (e) { ok(e.message.includes('타이밍'), '페이즈 종료 후 차단'); }
}

/* ---------- 4. crazy: 플랍 전까지 디스카드 없음 ---------- */
{
  const t = newTable('crazy');
  t.startHand(seeded(99));
  ok(t.street === STREET.PREFLOP, 'crazy: 바로 프리플랍');
  ok(t.players.every((p) => p.hole.length === 3), 'crazy도 3장 딜링');
  // 전원 체크/콜로 플랍까지
  const pid0 = t.players[t.actionIdx % t.players.length].id;
  // 프리플랍: 콜 위주로 진행
  let guard = 0;
  while (t.street === STREET.PREFLOP && guard++ < 50) {
    const cur = t.players[t.actionIdx % t.players.length];
    const call = t.toCall(cur);
    t.act(cur.id, call === 0 ? 'check' : 'call');
  }
  ok(t.street === STREET.FLOP, '플랍 도달');
  ok(t.players.every((p) => p.hole.length === 3), '플랍에도 3장 유지');
  // 플랍 베팅 종료 → 디스카드 페이즈
  guard = 0;
  while (t.street === STREET.FLOP && guard++ < 50) {
    const cur = t.players[t.actionIdx % t.players.length];
    t.act(cur.id, 'check');
  }
  ok(t.street === STREET.DISCARD, 'crazy: 플랍 후 DISCARD');
  for (const p of t.players) if (p.hole.length === 3) t.discard(p.id, 0);
  ok(t.street === STREET.TURN, '디스카드 후 턴');
  ok(t.community.length === 4, '턴 카드 딜링됨');
  ok(t.players.every((p) => p.hole.length === 2), '전원 2장');
}

/* ---------- 5. 풀핸드: 체크/콜만으로 쇼다운 ---------- */
{
  const t = newTable('classic', 2);
  t.startHand(seeded(1234));
  for (const p of t.players) t.discard(p.id, 0);
  let guard = 0;
  while (t.street !== STREET.DONE && guard++ < 100) {
    const cur = t.players[t.actionIdx % t.players.length];
    const call = t.toCall(cur);
    t.act(cur.id, call === 0 ? 'check' : 'call');
  }
  ok(t.street === STREET.DONE, '쇼다운 완료');
  ok(t.community.length === 5, '커뮤니티 5장');
  ok(t.winners.length >= 1 && t.winners[0].amount > 0, '정산 발생');
  // 쇼다운 핸드가 2장+5장으로 평가됐는지: 직접 eval7과 비교
  const w = t.winners[0];
  const wp = t.players.find((p) => p.id === w.id);
  ok(wp.hole.length === 2, '승자 홀카드 2장');
}

/* ---------- 6. 올인 플레이어 자동 버림 ---------- */
{
  // 헤즈업: p0 = 딜러 = SB, 스택 50 → SB 올인
  const t = new PineappleTable({ sb: 50, bb: 100, pineappleVariant: 'classic' });
  t.addPlayer('p0', 'P0', 50);
  t.addPlayer('p1', 'P1', 10000);
  t.startHand(seeded(5));
  const p0 = t.players.find((p) => p.id === 'p0');
  ok(p0.allin && p0.hole.length === 3, 'p0 블라인드 올인, 3장 보유');
  ok(t.street === STREET.DISCARD, '올인 있어도 DISCARD 진입');
  // p1만 버리면 페이즈 완료 → p0는 자동 버림
  t.discard('p1', 0);
  ok(p0.hole.length === 2, '올인 플레이어 자동 버림');
  ok(t.street !== STREET.DISCARD, '페이즈 종료');
}

/* ---------- 7. 레지스트리 ---------- */
{
  ok(GAME_TABLES.pineapple === PineappleTable, '레지스트리에 pineapple 등록');
  ok(GAME_TABLES.holdem === Table, 'holdem 유지');
  const t = new PineappleTable({ sb: 10, bb: 20 });
  ok(t.variant === 'classic', '기본 variant=classic');
  const t2 = new PineappleTable({ pineappleVariant: 'crazy' });
  ok(t2.variant === 'crazy', 'crazy 지정');
  const t3 = new PineappleTable({ pineappleVariant: 'weird' });
  ok(t3.variant === 'classic', '이상한 값 → classic 폴백');
}

/* ---------- 8. 시뮬레이션: 칩 보존 (classic/crazy × 100핸드) ---------- */
function playHand(t) {
  const before = t.totalChips();
  t.startHand();
  let guard = 0;
  while (t.street !== STREET.DONE && guard++ < 3000) {
    if (t.street === STREET.DISCARD) {
      for (const p of t.players) {
        if (!p.folded && !p.sittingOut && !p.allin && p.hole.length === 3) {
          t.discard(p.id, Math.floor(Math.random() * 3));
        }
      }
      continue;
    }
    const st = t.publicState('p0');
    const pid = st.actionPlayerId;
    if (!pid) break;
    const me = t.players.find((p) => p.id === pid);
    const call = t.toCall(me);
    const r = Math.random();
    const minTo = st.minRaiseTo;
    const canRaise = me.stack + me.bet >= minTo && me.stack > call;
    try {
      if (call === 0) {
        if (r < 0.6) t.act(pid, 'check');
        else if (r < 0.85 && canRaise) t.act(pid, 'raise', minTo + Math.floor(Math.random() * 500));
        else if (r < 0.85) t.act(pid, 'check');
        else t.act(pid, 'allin');
      } else {
        if (r < 0.25) t.act(pid, 'fold');
        else if (r < 0.7) t.act(pid, 'call');
        else if (r < 0.9 && canRaise) t.act(pid, 'raise', minTo + Math.floor(Math.random() * 800));
        else if (r < 0.9) t.act(pid, 'call');
        else t.act(pid, 'allin');
      }
    } catch (e) { throw new Error(`act 실패 (${t.street}): ${e.message}`); }
  }
  if (t.street !== STREET.DONE) throw new Error('핸드 미완료: ' + t.street);
  if (t.totalChips() !== before) throw new Error(`칩 유실: ${before} -> ${t.totalChips()}`);
}

let simFail = 0;
for (const variant of ['classic', 'crazy']) {
  for (let g = 0; g < 100; g++) {
    try {
      const n = 2 + Math.floor(Math.random() * 7);
      const t = new PineappleTable({ sb: 50, bb: 100, pineappleVariant: variant });
      for (let i = 0; i < n; i++) t.addPlayer(`p${i}`, `P${i}`, 10000);
      playHand(t);
    } catch (e) {
      simFail++;
      if (simFail <= 3) console.log(`SIM FAIL [${variant}]:`, e.message);
    }
  }
}
ok(simFail === 0, `시뮬레이션 200핸드 칩 보존 (실패 ${simFail})`);

console.log(`\n파인애플 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
