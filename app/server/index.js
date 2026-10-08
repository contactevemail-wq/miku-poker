// 🃏 포커 웹앱 서버 — Express + Socket.IO
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, readdirSync, rmSync, cpSync } from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GAME_TABLES, STREET } from './table.js';
import { scanSkins, validateSkin } from './skin-manager.js';
import { decideBotAction, chooseDiscardIndex } from './bot.js';
import * as db from './db.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKINS_DIR = path.join(__dirname, '..', 'skins');
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

app.use(express.json({ limit: '2mb' }));

/* ---------- REST: 인증 ---------- */
app.post('/api/signup', async (req, res) => {
  try {
    const u = await db.createUser(req.body.name, req.body.pin);
    res.json({ user: u, pending: !u.approved });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/login', async (req, res) => {
  try {
    res.json({ user: await db.verifyUser(req.body.name, req.body.pin) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/records', async (req, res) => {
  res.json(await db.getRecords(30));
});
app.get('/api/skins', async (req, res) => {
  // 내장 2종(클래식=SVG 드로잉, MIKU=아트워크) + 스캔 등록된 유효 스킨
  const builtinKeys = new Set(['classic', 'miku']);
  const custom = (await db.listSkins())
    .filter((s) => s.enabled && !builtinKeys.has(s.key))
    .map((s) => ({ key: s.key, name: s.name }));
  res.json([
    { key: 'classic', name: '클래식' },
    { key: 'miku', name: 'MIKU' },
    ...custom,
  ]);
});

/* ---------- 카드 스킨 zip 업로드 (마스터 전용, 13-1) ---------- */
// POST /api/skins/upload?name=마스터&pin=1234&skinName=myskin
// Content-Type: application/zip, body = zip 바이너리
// 검증: 53개 파일(back.png+52장) 존재·5:7 비율·파일명 규칙 → skins/<skinName>/ 등록
const PY_UNZIP = `
import sys, zipfile, os
zp, dest = sys.argv[1], sys.argv[2]
os.makedirs(dest, exist_ok=True)
with zipfile.ZipFile(zp) as z:
    for info in z.infolist():
        name = info.filename
        if name.startswith('__MACOSX/') or name.endswith('.DS_Store'):
            continue
        if info.is_dir():
            continue
        safe = os.path.normpath(name).replace('\\\\', '/')
        if safe.startswith('..') or safe.startswith('/'):
            continue
        target = os.path.join(dest, safe)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with z.open(info) as src, open(target, 'wb') as out:
            out.write(src.read())
print('ok')
`;

app.post('/api/skins/upload',
  express.raw({ type: 'application/zip', limit: '50mb' }),
  async (req, res) => {
    try {
      // 마스터 인증 (이름+4자리)
      let u;
      try {
        u = await db.verifyUser(String(req.query.name || ''), String(req.query.pin || ''));
      } catch (e) {
        return res.status(403).json({ error: e.message });
      }
      if (!u.is_master) return res.status(403).json({ error: '마스터만 가능해요' });

      const key = String(req.query.skinName || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!key) return res.status(400).json({ error: 'skinName이 필요해요 (영문/숫자/-/_)' });
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ error: 'zip 파일이 없어요 (Content-Type: application/zip)' });
      }

      const stamp = Date.now();
      const tmpZip = path.join(os.tmpdir(), `skin-upload-${stamp}.zip`);
      const tmpDir = path.join(os.tmpdir(), `skin-upload-${stamp}`);
      try {
        writeFileSync(tmpZip, req.body);
        try {
          await execFileAsync('python3', ['-c', PY_UNZIP, tmpZip, tmpDir]);
        } catch {
          return res.status(400).json({ error: 'zip 파일을 열 수 없어요' });
        }

        // 폴더째 압축한 경우 최상위 폴더 1개 벗겨냄
        let skinDir = tmpDir;
        const entries = readdirSync(tmpDir, { withFileTypes: true });
        const subdirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '__MACOSX');
        const files = entries.filter((e) => e.isFile());
        if (files.length === 0 && subdirs.length === 1) {
          skinDir = path.join(tmpDir, subdirs[0].name);
        }

        const v = validateSkin(skinDir);
        if (!v.valid) {
          return res.status(400).json({ error: '스킨 검증 실패', errors: v.errors.slice(0, 20) });
        }

        const dest = path.join(SKINS_DIR, key);
        rmSync(dest, { recursive: true, force: true });
        // /tmp와 workspace가 다른 디바이스일 수 있어 rename 대신 copy
        cpSync(skinDir, dest, { recursive: true });
        rmSync(tmpDir, { recursive: true, force: true });
        await db.upsertSkin(key, v.meta.name);
        res.json({ ok: true, key, name: v.meta.name });
      } finally {
        rmSync(tmpZip, { force: true });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);
app.get('/api/avatar-shop', async (req, res) => {
  res.json({ slots: db.AVATAR_SLOTS, parts: await db.listAvatarParts() });
});

/* ---------- 정적 파일 ---------- */
app.use('/skins', express.static(path.join(__dirname, '..', 'skins')));
app.use('/avatar-assets', express.static(path.join(__dirname, '..', 'avatar-assets')));
const distDir = path.join(__dirname, '..', 'client', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api|\/skins).*/, async (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

/* ---------- 방 관리 (인메모리) ---------- */
const rooms = new Map(); // code -> room
const userSockets = new Map(); // userId -> socket

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getRoomBySocket(socket) {
  for (const room of rooms.values())
    if (room.players.some((p) => p.socketId === socket.id)) return room;
  return null;
}

function lobbyState(room) {
  return {
    code: room.code, name: room.name, gameType: room.gameType,
    hostId: room.hostId, settings: room.settings,
    state: room.state, hasPassword: !!room.password,
    players: room.players.map((p) => ({ userId: p.userId, name: p.name, ready: p.ready, isBot: !!p.isBot })),
  };
}

async function broadcastRoom(room) {
  io.to(room.code).emit('room_update', await lobbyState(room));
}

async function broadcastTable(room) {
  // 핸드는 본인에게만 → 소켓별 개별 전송
  for (const p of room.players) {
    const sock = userSockets.get(p.userId);
    if (!sock || !room.table) continue;
    sock.emit('table_update', room.table.publicState(p.userId));
  }
}

/** 게임 중 프로필(아바타/색상/장착) 변경 시 테이블 스냅샷 동기화 (13-1) */
async function syncTableProfile(room, userId) {
  if (!room?.table) return;
  const tp = room.table.players.find((p) => p.id === userId);
  if (!tp) return;
  const u = await db.getUser(userId);
  if (!u) return;
  tp.avatar = u.avatar; tp.color = u.color; tp.title = u.title; tp.equipped = u.equipped;
  broadcastTable(room);
}

async function clearTimers(room) {
  if (room.actionTimer) clearTimeout(room.actionTimer);
  if (room.blindTimer) clearInterval(room.blindTimer);
  if (room.botTimer) clearTimeout(room.botTimer);
  room.actionTimer = null; room.blindTimer = null; room.botTimer = null;
}

/* ---------- 게임 진행 ---------- */

function startHand(room) {
  const t = room.table;
  t.startHand();
  room.handStartAt = Date.now();
  broadcastTable(room);
  armTimer(room);
  scheduleBotMove(room); // 첫 액션이 봇일 수 있음
  // 블라인드 상승 타이머
  clearInterval(room.blindTimer);
  const mins = room.settings.blindIntervalMin;
  if (mins > 0) {
    room.blindTimer = setInterval(() => {
      if (room.state !== 'playing' || !room.table) return;
      room.table.sb = Math.round(room.table.sb * room.settings.blindMult);
      room.table.bb = Math.round(room.table.bb * room.settings.blindMult);
      room.table.minRaise = room.table.bb;
      io.to(room.code).emit('notice', `블라인드 상승! ${room.table.sb}/${room.table.bb}`);
      broadcastTable(room);
    }, mins * 60 * 1000);
  }
}

function armActionTimer(room) {
  clearTimeout(room.actionTimer);
  room.actionTimer = setTimeout(() => {
    const t = room.table;
    if (!t || t.street === STREET.DONE || t.street === STREET.WAITING) return;
    const pid = t.players[t.actionIdx % t.players.length]?.id;
    const p = t.players.find((x) => x.id === pid);
    if (!p) return;
    try {
      let label;
      if (typeof t.timeoutAction === 'function') {
        label = t.timeoutAction(pid); // 블랙잭 등 게임별 타임아웃 처리
      } else if (t.toCall(p) === 0) {
        t.act(pid, 'check'); label = '체크';
      } else {
        t.act(pid, 'fold'); label = '폴드';
      }
      io.to(room.code).emit('notice', `${p.name} 시간 초과로 자동 ${label}`);
    } catch { /* ignore */ }
    afterAct(room);
  }, 30 * 1000);
}

/* 파인애플 디스카드 타이머: 30초 내 못 버리면 남은 인원 자동 버림 */
function armDiscardTimer(room) {
  clearTimeout(room.actionTimer);
  room.actionTimer = setTimeout(() => {
    const t = room.table;
    if (!t || t.street !== STREET.DISCARD) return;
    try { t.finishDiscardPhase(); } catch { /* ignore */ }
    io.to(room.code).emit('notice', '디스카드 시간 초과 — 남은 카드는 자동 버림 처리');
    afterAct(room);
  }, 30 * 1000);
}

/* 스트릿에 맞는 타이머 선택 */
function armTimer(room) {
  const t = room.table;
  if (!t || t.street === STREET.DONE || t.street === STREET.WAITING) {
    clearTimeout(room.actionTimer);
    return;
  }
  if (t.street === STREET.DISCARD) return armDiscardTimer(room);
  return armActionTimer(room);
}

/* ---------- 포커 봇 턴 스케줄링 (13-1) ---------- */
function scheduleBotMove(room) {
  clearTimeout(room.botTimer);
  const t = room.table;
  if (!t || room.state !== 'playing') return;
  if (t.street === STREET.DONE || t.street === STREET.WAITING) return;

  // 파인애플 디스카드: 봇 자동 버림
  if (t.street === STREET.DISCARD) {
    const needDiscard = t.players.filter(
      (p) => p.isBot && !p.folded && !p.sittingOut && !p.allin && p.hole.length === 3
    );
    if (!needDiscard.length) return;
    room.botTimer = setTimeout(() => {
      try {
        for (const p of needDiscard) {
          if (room.table !== t || t.street !== STREET.DISCARD) break;
          const cur = t.players.find((x) => x.id === p.id);
          if (!cur || cur.hole.length !== 3) continue;
          t.discard(p.id, chooseDiscardIndex(cur.hole));
        }
      } catch { /* ignore */ }
      afterAct(room);
    }, 800 + Math.random() * 800);
    return;
  }

  const pid = t.players[t.actionIdx % t.players.length]?.id;
  const tp = t.players.find((p) => p.id === pid);
  if (!tp || !tp.isBot) return;
  if (tp.folded || tp.allin || tp.sittingOut) return;
  if (t.gameType === 'blackjack' && (tp.done || tp.busted || tp.out)) return;

  // 인간처럼 보이게 1~2초 딜레이
  room.botTimer = setTimeout(() => {
    if (room.table !== t || room.state !== 'playing') return;
    try {
      const d = decideBotAction(t, pid, room.botDifficulty || 'normal');
      t.act(pid, d.action, d.amount);
    } catch (e) {
      try {
        const p2 = t.players.find((x) => x.id === pid);
        t.act(pid, t.toCall(p2) === 0 ? 'check' : 'fold');
      } catch { /* ignore */ }
    }
    afterAct(room);
  }, 1000 + Math.random() * 1000);
}

async function afterAct(room) {
  const t = room.table;
  broadcastTable(room);
  if (t.street === STREET.DONE) {
    clearTimeout(room.actionTimer);
    clearTimeout(room.botTimer);
    onHandEnd(room);
  } else {
    armTimer(room);
    scheduleBotMove(room);
  }
}

async function settleStacksToAccounts(room) {
  // 테이블 스택 → 계정 칩으로 복귀. profit 계산용 반환
  const profits = [];
  for (const p of room.table.players) {
    const u = await db.getUser(p.id);
    if (!u) continue;
    const profit = p.stack - room.buyinPaid.get(p.id);
    await db.deltaChips(p.id, p.stack);
    profits.push({ userId: p.id, name: p.name, stack: p.stack, profit });
  }
  return profits;
}

function onHandEnd(room) {
  const t = room.table;
  const winners = t.winners;
  io.to(room.code).emit('hand_end', { winners, community: t.community });

  if (room.settings.mode === 'series') {
    // 시리즈 순위: 스택 순 (탈락자는 낮은 순위)
    const ranked = [...t.players].sort((a, b) => b.stack - a.stack);
    const coins = room.settings.coinTable ?? [3, 2, 1];
    ranked.forEach((p, i) => {
      if (room.settings.finalScoring === 'coins' && i < coins.length) {
        room.series.coins[p.id] = (room.series.coins[p.id] || 0) + coins[i];
      }
    });
    room.series.current++;
    io.to(room.code).emit('series_update', {
      current: room.series.current, total: room.series.total, coins: room.series.coins,
    });
    if (room.series.current >= room.series.total) {
      endGame(room);
    } else {
      // 다음 핸드: 스택 0이면 탈락 (리바이 가능하면 rebuy 이벤트로 복귀)
      setTimeout(() => {
        if (room.state !== 'playing') return;
        try { startHand(room); }
        catch (e) { io.to(room.code).emit('notice', e.message); }
      }, 8000);
    }
  } else {
    // 단판 모드: 칩이 남은 플레이어가 1명만 남을 때까지 핸드 반복
    // (마스터 스펙: "우승자 한 번만 나오면 끝" = 칩을 다 딸 때까지)
    const alive = t.players.filter((p) => p.stack > 0);
    if (alive.length <= 1) {
      setTimeout(() => endGame(room), 8000);
    } else {
      // 다음 핸드 시작 (8초 후)
      io.to(room.code).emit('notice', `다음 핸드 시작까지 8초... (남은 플레이어 ${alive.length}명)`);
      setTimeout(() => {
        if (room.state !== 'playing') return;
        try { startHand(room); }
        catch (e) { io.to(room.code).emit('notice', e.message); }
      }, 8000);
    }
  }
}

async function endGame(room) {
  const profits = await settleStacksToAccounts(room);
  // 봇 결과 추가 (13-1): DB 정산 없이 profit만 계산, 이름에 🤖 포함
  for (const p of room.table.players) {
    if (!p.isBot) continue;
    const paid = room.buyinPaid.get(p.id) ?? room.settings.buyin;
    profits.push({ userId: p.id, name: p.name, stack: p.stack, profit: p.stack - paid, isBot: true });
  }
  let ranked;
  if (room.settings.mode === 'series' && room.settings.finalScoring === 'coins') {
    ranked = profits
      .map((p) => ({ ...p, coins: room.series.coins[p.userId] || 0 }))
      .sort((a, b) => b.coins - a.coins || b.profit - a.profit)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  } else {
    ranked = [...profits].sort((a, b) => b.profit - a.profit)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }
  const winner = ranked[0];
  await db.addRecord({
    game_type: room.gameType,
    mode: room.settings.mode,
    player_count: ranked.length,
    results: ranked.map((r) => ({ name: r.name, profit: r.profit, rank: r.rank })),
    winner_name: winner.name,
  });
  io.to(room.code).emit('game_over', { ranked, winner });
  room.state = 'lobby';
  room.table = null;
  room.series = null;
  clearTimers(room);
  broadcastRoom(room);
}

/* ---------- Socket.IO ---------- */

io.on('connection', (socket) => {
  let userId = null;

  socket.on('auth', async ({ userId: id }) => {
    id = Number(id);
    const u = await db.getUser(id);
    if (!u || !u.approved) return socket.emit('auth_error', '승인되지 않은 계정이에요');
    userId = id;
    userSockets.set(id, socket);
    // 재연결 시 방 플레이어의 socketId 갱신 (호스트 판정 등 정상 동작용)
    for (const room of rooms.values()) {
      const p = room.players.find((p) => p.userId === id);
      if (p) {
        p.socketId = socket.id;
        socket.join(room.code);
      }
    }
    socket.emit('auth_ok', db.sanitize(u));
  });

  const me = async () => (userId ? await db.getUser(userId) : null);

  socket.on('create_room', async ({ name, gameType, settings }, cb) => {
    const u = await me();
    if (!u) return cb({ error: '로그인이 필요해요' });
    const code = genCode();
    const room = {
      code, name: (name || `${u.name}의 방`).slice(0, 30),
      gameType: GAME_TABLES[gameType] ? gameType : 'holdem', hostId: userId,
      settings: {
        buyin: 10000, sb: 50, bb: 100, blindIntervalMin: 15, blindMult: 2,
        rebuyAllowed: true, rebuyMax: 3, mode: 'single', seriesCount: 5,
        finalScoring: 'chips', coinTable: [3, 2, 1],
        pineappleVariant: 'classic', blackjackBet: 100, studAnte: 10, ante: 0, anteAuto: false,
        ...(settings || {}),
      },
      players: [], table: null, state: 'lobby',
      series: null, buyinPaid: new Map(),
    };
    // 방 비밀번호 (13-1): settings.password(선택) → 별도 보관, settings에는 노출 안 함
    const pw = String(settings?.password || '').slice(0, 20);
    room.password = pw || null;
    delete room.settings.password;
    // 포커 봇 (13-1): botCount 0~8, botDifficulty easy/normal/hard
    const botCount = Math.max(0, Math.min(8, parseInt(settings?.botCount) || 0));
    const botDifficulty = ['easy', 'normal', 'hard'].includes(settings?.botDifficulty)
      ? settings.botDifficulty : 'normal';
    room.botDifficulty = botDifficulty;
    room.settings.botCount = Math.min(botCount, 8); // 표시용
    room.settings.botDifficulty = botDifficulty;
    rooms.set(code, room);
    socket.join(code);
    room.players.push({ userId, name: u.name, socketId: socket.id, ready: true });
    for (let i = 0; i < room.settings.botCount && room.players.length < 9; i++) {
      room.players.push({
        userId: `bot${i + 1}`, name: `🤖 봇${i + 1}`, socketId: null,
        ready: true, isBot: true,
      });
    }
    broadcastRoom(room);
    cb({ code });
  });

  socket.on('get_room', async ({ code }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ error: '방을 찾을 수 없어요' });
    cb({ room: await lobbyState(room) });
  });

  socket.on('list_rooms', async (cb) => {
    const list = [];
    for (const room of rooms.values()) {
      list.push({
        code: room.code,
        name: room.name,
        gameType: room.gameType,
        playerCount: room.players.length,
        maxPlayers: 9,
        state: room.state, // 'lobby' | 'playing'
        hasPassword: !!room.password,
        botCount: room.settings.botCount || 0,
      });
    }
    cb({ rooms: list });
  });

  socket.on('join_room', async ({ code, password }, cb) => {
    const u = await me();
    if (!u) return cb({ error: '로그인이 필요해요' });
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ error: '방을 찾을 수 없어요' });
    if (room.state !== 'lobby') return cb({ error: '이미 게임 중인 방이에요' });
    if (!room.players.some((p) => p.userId === userId)) {
      if (room.players.length >= 9) return cb({ error: '방이 가득 찼어요' });
      // 방 비밀번호 검증 (13-1): 신규 입장만, 재접속은 제외
      if (room.password && password !== room.password) return cb({ error: '비밀번호가 틀렸어요' });
      room.players.push({ userId, name: u.name, socketId: socket.id, ready: false });
    } else {
      room.players.find((p) => p.userId === userId).socketId = socket.id;
    }
    socket.join(room.code);
    broadcastRoom(room);
    cb({ ok: true });
  });

  socket.on('leave_room', async () => {
    const room = getRoomBySocket(socket);
    if (!room) return;
    room.players = room.players.filter((p) => p.socketId !== socket.id);
    socket.leave(room.code);
    if (room.players.length === 0) {
      clearTimers(room);
      rooms.delete(room.code);
    } else {
      if (room.hostId === userId) room.hostId = room.players[0].userId;
      // 게임 중 나가면 폴드 처리
      if (room.table && room.state === 'playing') {
        const tp = room.table.players.find((p) => p.id === userId);
        if (tp && !tp.folded) {
          tp.sittingOut = true;
          try { room.table.act(userId, 'fold'); } catch { /* not their turn */ }
          afterAct(room);
        }
      }
      broadcastRoom(room);
    }
  });

  socket.on('start_game', async (cb) => {
    const room = getRoomBySocket(socket);
    if (!room || room.hostId !== userId) return cb?.({ error: '호스트만 시작할 수 있어요' });
    if (room.players.length < 2) {
      console.log(`[start_game] 인원 부족: room=${room.code} players=${room.players.length} (${room.players.map(p => p.name).join(',')})`);
      return cb?.({ error: `2명 이상 필요해요 (현재 ${room.players.length}명)` });
    }
    const s = room.settings;
    // gameType → 테이블 클래스 (미등록 게임은 홀덤으로 폴백)
    const Tbl = GAME_TABLES[room.gameType] || GAME_TABLES.holdem;
    const table = new Tbl({ sb: s.sb, bb: s.bb, pineappleVariant: s.pineappleVariant, blackjackBet: s.blackjackBet, studAnte: s.studAnte, ante: s.ante || 0, anteAuto: !!s.anteAuto });
    room.buyinPaid = new Map();
    for (const p of room.players) {
      if (p.isBot) {
        // 봇: DB 없이 바이인만큼 스택 (인간과 동일, 무한 칩 아님)
        room.buyinPaid.set(p.userId, s.buyin);
        table.addPlayer(p.userId, p.name, s.buyin, {
          isBot: true, avatar: 'miku1', color: '#22d3ee', title: '', equipped: '{}',
        });
        continue;
      }
      const u = await db.getUser(p.userId);
      if (!u || u.chips < s.buyin) {
        socket.emit('notice', `${p.name}님 칩 부족으로 제외돼요`);
        continue;
      }
      await db.deltaChips(p.userId, -s.buyin);
      room.buyinPaid.set(p.userId, s.buyin);
      // 프로필 스냅샷 전달 (13-1: publicState 아바타/색상 표시용)
      table.addPlayer(p.userId, p.name, s.buyin, u);
    }
    if (table.players.length < 2) return cb?.({ error: '바이인 가능한 인원이 2명 미만이에요' });
    room.table = table;
    room.state = 'playing';
    room.dealerIdx = -1;
    if (s.mode === 'series') room.series = { current: 0, total: s.seriesCount, coins: {} };
    broadcastRoom(room);
    try {
      startHand(room);
      cb?.({ ok: true });
    } catch (e) { cb?.({ error: e.message }); }
  });

  socket.on('act', async ({ action, amount }) => {
    const room = getRoomBySocket(socket);
    if (!room || !room.table || room.state !== 'playing') return;
    const t = room.table;
    const cur = t.players[t.actionIdx % t.players.length];
    if (!cur || cur.id !== userId) return socket.emit('notice', '당신 차례가 아니에요');
    try {
      t.act(userId, action, amount);
    } catch (e) { return socket.emit('notice', e.message); }
    afterAct(room);
  });

  /* 파인애플 디스카드: 3장 중 1장 버림 */
  socket.on('discard', async ({ cardIndex }, cb) => {
    const room = getRoomBySocket(socket);
    if (!room || !room.table || room.state !== 'playing') return cb?.({ error: '게임 중이 아니에요' });
    const t = room.table;
    if (typeof t.discard !== 'function') return cb?.({ error: '이 게임은 디스카드가 없어요' });
    try {
      const phaseComplete = t.discard(userId, cardIndex);
      cb?.({ ok: true, phaseComplete });
    } catch (e) { return cb?.({ error: e.message }); }
    afterAct(room);
  });

  socket.on('rebuy', async (cb) => {
    const room = getRoomBySocket(socket);
    if (!room || !room.table) return cb?.({ error: '게임 중이 아니에요' });
    const s = room.settings;
    if (!s.rebuyAllowed) return cb?.({ error: '리바이가 허용되지 않은 방이에요' });
    const tp = room.table.players.find((p) => p.id === userId);
    if (!tp || tp.stack > 0) return cb?.({ error: '리바이 대상이 아니에요' });
    const u = await db.getUser(userId);
    if (u.chips < s.buyin) return cb?.({ error: '계정 칩이 부족해요. 마스터에게 요청하세요!' });
    await db.deltaChips(userId, -s.buyin);
    tp.stack = s.buyin;
    tp.allin = false; tp.folded = false; tp.sittingOut = false;
    room.buyinPaid.set(userId, (room.buyinPaid.get(userId) || 0) + s.buyin);
    io.to(room.code).emit('notice', `${u.name} 리바이!`);
    broadcastTable(room);
    cb?.({ ok: true });
  });

  socket.on('chat', async ({ text }) => {
    const room = getRoomBySocket(socket);
    const u = await me();
    if (!room || !u || !text) return;
    io.to(room.code).emit('chat', {
      name: u.name, color: u.color, text: String(text).slice(0, 200), at: Date.now(),
    });
  });

  /* --- 마스터 --- */
  socket.on('master_pending', async (cb) => {
    const u = await me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    cb({ users: await db.pendingUsers() });
  });
  socket.on('master_approve', async ({ userId: target, ok }, cb) => {
    const u = await me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    const t = await db.approveUser(target, ok);
    const sock = userSockets.get(target);
    if (sock && ok) sock.emit('notice', '마스터가 승인했어요! 다시 로그인해주세요 🎉');
    cb({ user: t });
  });
  socket.on('master_users', async (cb) => {
    const u = await me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    cb({ users: await db.allUsers() });
  });
  socket.on('master_give_chips', async ({ userId: target, amount }, cb) => {
    const u = await me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    try {
      const chips = await db.deltaChips(target, Number(amount));
      cb({ chips });
    } catch (e) { cb({ error: e.message }); }
  });
  socket.on('master_set_chips', async ({ userId: target, chips }, cb) => {
    const u = await me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    try {
      const updated = await db.setChips(target, Number(chips));
      cb({ user: updated });
    } catch (e) { cb({ error: e.message }); }
  });

  /* --- 카드 스킨 관리 (마스터 전용, 13-1) --- */
  // skins/ 폴더를 스캔 → 검증 통과한 것만 DB 등록
  socket.on('master_skin_refresh', async (cb) => {
    const u = await me();
    if (!u?.is_master) return cb?.({ error: '마스터만 가능해요' });
    const scanned = scanSkins(SKINS_DIR);
    const valid = [];
    const invalid = [];
    for (const s of scanned) {
      if (s.valid) { await db.upsertSkin(s.key, s.name); valid.push({ key: s.key, name: s.name }); }
      else invalid.push({ key: s.key, errors: s.errors });
    }
    cb?.({ ok: true, valid, invalid });
  });
  // 등록된 스킨 목록 + 스캔 상태 (마스터 패널용)
  socket.on('master_skin_list', async (cb) => {
    const u = await me();
    if (!u?.is_master) return cb?.({ error: '마스터만 가능해요' });
    cb?.({ registered: await db.listSkins(), scanned: scanSkins(SKINS_DIR) });
  });
  // 스킨 활성화/비활성화 (유저에게 보이는 것만)
  socket.on('master_skin_toggle', async ({ key, enabled }, cb) => {
    const u = await me();
    if (!u?.is_master) return cb?.({ error: '마스터만 가능해요' });
    try {
      await db.setSkinEnabled(key, !!enabled);
      cb?.({ ok: true });
    } catch (e) { cb?.({ error: e.message }); }
  });

  /* --- 프로필/기록 --- */
  socket.on('update_profile', async (profile, cb) => {
    if (!await me()) return cb?.({ error: '로그인이 필요해요' });
    const updated = await db.updateProfile(userId, profile);
    await syncTableProfile(getRoomBySocket(socket), userId);
    cb({ user: updated });
  });
  socket.on('my_records', async (cb) => cb({ records: await db.myRecords(userId) }));

  /* --- 아바타 상점 (13-1) --- */
  socket.on('shop_list', async (cb) => {
    if (!await me()) return cb?.({ error: '로그인이 필요해요' });
    cb?.({
      slots: db.AVATAR_SLOTS,
      parts: await db.listAvatarParts(),
      owned: await db.myAvatarParts(userId),
      loadout: await db.getLoadout(userId),
      chips: await me().chips,
    });
  });
  socket.on('shop_buy', async ({ partId }, cb) => {
    if (!await me()) return cb?.({ error: '로그인이 필요해요' });
    try {
      const r = await db.buyAvatarPart(userId, partId);
      cb?.({ ok: true, part: r.part, chips: r.chips, owned: await db.myAvatarParts(userId) });
    } catch (e) { cb?.({ error: e.message }); }
  });
  socket.on('equip_avatar', async ({ partId }, cb) => {
    if (!await me()) return cb?.({ error: '로그인이 필요해요' });
    try {
      const loadout = await db.equipAvatarPart(userId, partId);
      await syncTableProfile(getRoomBySocket(socket), userId);
      cb?.({ ok: true, loadout });
    } catch (e) { cb?.({ error: e.message }); }
  });

  socket.on('disconnect', async () => {
    if (userId && userSockets.get(userId) === socket) userSockets.delete(userId);
    // 재접속을 위해 방에서는 유지 (액션 타이머가 자동 폴드 처리)
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🃏 포커 서버 가동: http://localhost:${PORT}`));
