// 🃏 방 비밀번호 + publicState 아바타 테스트 (13-1)
// 실행: node test-room-features.js (서버를 직접 띄워서 E2E)
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import { io } from 'socket.io-client';

const PORT = 3198;
const DB = '/tmp/test-room-features.db';
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
  const f = await api('/api/signup', { name: '친구1', pin: '5678' });
  const ms = io(URL), fs = io(URL);
  const auth = (s, uid) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('auth timeout')), 5000);
    s.emit('auth', { userId: uid });
    s.on('auth_ok', () => { clearTimeout(t); res(); });
    s.on('auth_error', (e) => { clearTimeout(t); rej(new Error(e)); });
  });
  await auth(ms, m.user.id);
  await new Promise((r) => ms.emit('master_approve', { userId: f.user.id, ok: true }, r));
  await auth(fs, f.user.id);

  // 마스터 프로필 설정
  await new Promise((r) => ms.emit('update_profile', { avatar: 'star1', color: '#ff0000', title: '챔피언' }, r));

  /* ---- 1. 비밀번호 방 ---- */
  let lobby = null;
  ms.on('room_update', (st) => { lobby = st; });
  const created = await new Promise((r) => ms.emit('create_room', {
    name: '비번방', gameType: 'holdem', settings: { buyin: 5000, password: '1234' },
  }, r));
  ok(created.code, '비번방 생성');
  await new Promise((r) => setTimeout(r, 300));
  ok(lobby.hasPassword === true, 'hasPassword 표시');
  ok(!('password' in (lobby.settings || {})), 'settings에 비밀번호 미노출');

  // 비밀번호 없이 → 거부
  let jr = await new Promise((r) => fs.emit('join_room', { code: created.code }, r));
  ok(jr.error === '비밀번호가 틀렸어요', '비밀번호 없이 입장 거부');
  // 틀린 비밀번호 → 거부
  jr = await new Promise((r) => fs.emit('join_room', { code: created.code, password: '0000' }, r));
  ok(jr.error === '비밀번호가 틀렸어요', '틀린 비밀번호 거부');
  // 맞는 비밀번호 → 입장
  jr = await new Promise((r) => fs.emit('join_room', { code: created.code, password: '1234' }, r));
  ok(jr.ok === true, '맞는 비밀번호로 입장');

  /* ---- 2. 일반 방 (비밀번호 없음) ---- */
  const created2 = await new Promise((r) => ms.emit('create_room', {
    name: '일반방', gameType: 'holdem', settings: { buyin: 5000 },
  }, r));
  // 다른 소켓으로 새 방 — 기존 방에서 나가기
  ms.emit('leave_room');
  await new Promise((r) => setTimeout(r, 200));
  const f2 = io(URL);
  await auth(f2, f.user.id);
  jr = await new Promise((r) => f2.emit('join_room', { code: created2.code }, r));
  ok(jr.ok === true, '비밀번호 없는 방은 바로 입장');
  f2.close();

  /* ---- 3. publicState 아바타/색상 ---- */
  // 비번방으로 돌아가서 게임 시작 (마스터+친구1)
  ms.emit('leave_room');
  await new Promise((r) => setTimeout(r, 200));
  let table = null;
  ms.on('table_update', (st) => { table = st; });
  const rc = await new Promise((r) => ms.emit('create_room', {
    name: '아바타방', gameType: 'holdem', settings: { buyin: 5000 },
  }, r));
  await new Promise((r) => fs.emit('join_room', { code: rc.code }, r));
  await new Promise((r) => ms.emit('start_game', r));
  await new Promise((r) => setTimeout(r, 800));
  const me = table.players.find((p) => p.id === m.user.id);
  ok(me.avatar === 'star1', `publicState avatar (${me.avatar})`);
  ok(me.color === '#ff0000', `publicState color (${me.color})`);
  ok(me.title === '챔피언', 'publicState title');
  ok(typeof me.equipped === 'string', 'publicState equipped');

  /* ---- 4. 게임 중 프로필 변경 동기화 ---- */
  await new Promise((r) => ms.emit('update_profile', { color: '#00ff00' }, r));
  await new Promise((r) => setTimeout(r, 500));
  const me2 = table.players.find((p) => p.id === m.user.id);
  ok(me2.color === '#00ff00', '게임 중 색상 변경 동기화');

  ms.close(); fs.close();
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\n방 기능 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
