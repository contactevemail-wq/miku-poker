// 🤖 포커 봇 E2E 테스트 (13-1)
// 실행: node test-bot-e2e.js (서버를 직접 띄워서 E2E)
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { io } from 'socket.io-client';

const PORT = 3197;
const DB = '/tmp/test-bot-e2e.db';
rmSync(DB, { force: true });

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

const server = spawn('node', ['index.js'], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), DB_PATH: DB },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 4000));

try {
  const URL = `http://localhost:${PORT}`;
  const api = async (p, b) => (await fetch(URL + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })).json();

  const m = await api('/api/signup', { name: '마스터', pin: '1234' });
  const ms = io(URL);
  const auth = (s, uid) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('auth timeout')), 5000);
    s.emit('auth', { userId: uid });
    s.on('auth_ok', () => { clearTimeout(t); res(); });
    s.on('auth_error', (e) => { clearTimeout(t); rej(new Error(e)); });
  });
  await auth(ms, m.user.id);

  /* ---- 1. 봇 2명 방 생성 ---- */
  let lobby = null;
  ms.on('room_update', (st) => { lobby = st; });
  const created = await new Promise((r) => ms.emit('create_room', {
    name: '봇방', gameType: 'holdem',
    settings: { buyin: 5000, botCount: 2, botDifficulty: 'normal' },
  }, r));
  ok(created.code, '봇방 생성');
  await new Promise((r) => setTimeout(r, 300));
  ok(lobby.players.length === 3, `방 인원 3명 (실제 ${lobby.players.length})`);
  const bots = lobby.players.filter((p) => p.isBot);
  ok(bots.length === 2, '봇 2명');
  ok(bots.every((p) => p.name.startsWith('🤖')), '봇 이름 🤖');

  /* ---- 2. 게임 시작 후 봇 자동 플레이 ---- */
  let table = null;
  let done = null;
  ms.on('table_update', (st) => { table = st; });
  ms.on('game_over', (d) => { done = d; });
  // 인간 전략: 무료면 체크, 아니면 폴드 (빠른 진행)
  ms.on('table_update', (st) => {
    if (st.actionPlayerId !== m.user.id || st.street === 'done') return;
    const me = st.players.find((p) => p.id === m.user.id);
    setTimeout(() => {
      ms.emit('act', { action: me.toCall === 0 ? 'check' : 'fold' });
    }, 100);
  });
  const started = await new Promise((r) => ms.emit('start_game', r));
  ok(started.ok, '게임 시작');
  await new Promise((r) => setTimeout(r, 1500));
  // 봇이 테이블에 있는지 + isBot 플래그
  const botInTable = table.players.filter((p) => p.isBot);
  ok(botInTable.length === 2, '테이블에 봇 2명');

  // 게임 종료까지 대기 (봇이 자동으로 플레이)
  for (let i = 0; i < 120 && !done; i++) await new Promise((r) => setTimeout(r, 1000));
  ok(!!done, '봇과 함께 게임 완료');
  if (done) {
    ok(done.ranked.length === 3, `결과 3명 (실제 ${done.ranked.length})`);
    const botResults = done.ranked.filter((r) => r.isBot);
    ok(botResults.length === 2, '결과에 봇 2명 포함');
    // 칩 보존: 인간 profit + 봇 profits = 0 (제로섬)
    const total = done.ranked.reduce((s, r) => s + r.profit, 0);
    ok(total === 0, `제로섬 (합계 ${total})`);
    console.log('  결과:', done.ranked.map((r) => `${r.name}:${r.profit}`).join(', '));
  }

  /* ---- 3. 게임 기록에 봇 포함 ---- */
  const recs = await (await fetch(`${URL}/api/records?userId=${m.user.id}`)).json();
  ok(Array.isArray(recs) && recs.length >= 1, '게임 기록 저장');
  if (recs.length) {
    const results = recs[0].results;
    ok(results.some((r) => r.name.startsWith('🤖')), '기록에 봇 이름 🤖');
  }

  /* ---- 4. 봇 0명 방도 정상 ---- */
  const created2 = await new Promise((r) => ms.emit('create_room', {
    name: '노봇방', gameType: 'holdem', settings: { buyin: 5000, botCount: 0 },
  }, r));
  ok(created2.code, '봇 0명 방 생성');

  ms.close();
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\n봇 E2E 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
