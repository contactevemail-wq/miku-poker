// 통합 테스트: 가입→승인→방→게임→정산 (서버 실구동)
import { io } from 'socket.io-client';

const URL = 'http://localhost:3100';
const api = async (path, body) => {
  const r = await fetch(URL + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

async function main() {
  // 1. 첫 가입자 = 마스터
  const m = await api('/api/signup', { name: '마스터', pin: '1234' });
  ok(m.user?.is_master === 1 && m.user?.approved === 1, '첫 가입자 마스터 자동 승인');

  // 2. 친구 가입 → 승인 대기
  const f = await api('/api/signup', { name: '친구1', pin: '5678' });
  ok(f.pending === true, '친구 가입 승인 대기');
  const fLogin = await api('/api/login', { name: '친구1', pin: '5678' });
  ok(fLogin.error?.includes('승인'), '미승인 로그인 차단');

  // 3. 마스터 승인
  const ms = io(URL); const fs = io(URL);
  await new Promise((res) => {
    ms.emit('auth', { userId: m.user.id });
    ms.on('auth_ok', res);
  });
  const appr = await new Promise((res) => ms.emit('master_approve', { userId: f.user.id, ok: true }, res));
  ok(appr.user?.approved === 1, '마스터 승인');
  const f2 = await api('/api/login', { name: '친구1', pin: '5678' });
  ok(f2.user?.chips === 10000, '승인 후 로그인 + 초기 칩');

  // 4. 칩 지급
  const give = await new Promise((res) => ms.emit('master_give_chips', { userId: f.user.id, amount: 5000 }, res));
  ok(give.chips === 15000, '마스터 칩 지급');

  // 5. 방 생성 + 입장
  await new Promise((res) => { fs.emit('auth', { userId: f.user.id }); fs.on('auth_ok', res); });
  const created = await new Promise((res) =>
    ms.emit('create_room', { name: '테스트방', gameType: 'holdem', settings: { buyin: 1000, sb: 10, bb: 20 } }, res));
  ok(created.code?.length === 6, '방 생성 + 초대코드');
  const joined = await new Promise((res) => fs.emit('join_room', { code: created.code }, res));
  ok(joined.ok === true, '방 입장');

  // 6. 게임 시작 → 자동 플레이 (둘 다 랜덤 액션)
  let gameOver = null;
  const autoPlay = (sock, uid) => {
    sock.on('table_update', (st) => {
      if (st.actionPlayerId !== uid || st.street === 'done') return;
      const meP = st.players.find((p) => p.id === uid);
      const call = meP.toCall;
      const r = Math.random();
      setTimeout(() => {
        if (call === 0) {
          if (r < 0.7) sock.emit('act', { action: 'check' });
          else sock.emit('act', { action: 'raise', amount: st.minRaiseTo });
        } else {
          if (r < 0.3) sock.emit('act', { action: 'fold' });
          else sock.emit('act', { action: 'call' });
        }
      }, 50);
    });
    sock.on('game_over', (d) => { gameOver = d; });
  };
  autoPlay(ms, m.user.id); autoPlay(fs, f.user.id);
  const started = await new Promise((res) => ms.emit('start_game', res));
  ok(started.ok === true, '게임 시작');

  // 게임 종료 대기 (최대 120초)
  for (let i = 0; i < 240 && !gameOver; i++) await sleep(500);
  ok(!!gameOver, '게임 종료');
  if (gameOver) {
    ok(gameOver.ranked.length === 2, '정산 2명');
    const total = gameOver.ranked.reduce((s, r) => s + r.profit, 0);
    ok(total === 0, `칩 제로섬 (합=${total})`);
    console.log('  결과:', gameOver.ranked.map((r) => `${r.name} ${r.profit > 0 ? '+' : ''}${r.profit}`).join(', '));
  }

  // 7. 기록 저장 확인
  const recs = await (await fetch(URL + '/api/records')).json();
  ok(recs.length >= 1 && recs[0].winner_name, '게임 기록 저장');

  ms.close(); fs.close();
  console.log(`\n통합 테스트: ${pass} 통과, ${fail} 실패`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
