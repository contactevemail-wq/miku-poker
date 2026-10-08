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
import * as db from './db.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKINS_DIR = path.join(__dirname, '..', 'skins');
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

app.use(express.json({ limit: '2mb' }));

/* ---------- REST: 인증 ---------- */
app.post('/api/signup', (req, res) => {
  try {
    const u = db.createUser(req.body.name, req.body.pin);
    res.json({ user: u, pending: !u.approved });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/login', (req, res) => {
  try {
    res.json({ user: db.verifyUser(req.body.name, req.body.pin) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/records', (req, res) => {
  res.json(db.getRecords(30));
});
app.get('/api/skins', (req, res) => {
  // 내장 2종(클래식=SVG 드로잉, MIKU=아트워크) + 스캔 등록된 유효 스킨
  const builtinKeys = new Set(['classic', 'miku']);
  const custom = db.listSkins()
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
        u = db.verifyUser(String(req.query.name || ''), String(req.query.pin || ''));
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
        db.upsertSkin(key, v.meta.name);
        res.json({ ok: true, key, name: v.meta.name });
      } finally {
        rmSync(tmpZip, { force: true });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);
app.get('/api/avatar-shop', (req, res) => {
  res.json({ slots: db.AVATAR_SLOTS, parts: db.listAvatarParts() });
});

/* ---------- 정적 파일 ---------- */
app.use('/skins', express.static(path.join(__dirname, '..', 'skins')));
app.use('/avatar-assets', express.static(path.join(__dirname, '..', 'avatar-assets')));
const distDir = path.join(__dirname, '..', 'client', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api|\/skins).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
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
    players: room.players.map((p) => ({ userId: p.userId, name: p.name, ready: p.ready })),
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('room_update', lobbyState(room));
}

function broadcastTable(room) {
  // 핸드는 본인에게만 → 소켓별 개별 전송
  for (const p of room.players) {
    const sock = userSockets.get(p.userId);
    if (!sock || !room.table) continue;
    sock.emit('table_update', room.table.publicState(p.userId));
  }
}

/** 게임 중 프로필(아바타/색상/장착) 변경 시 테이블 스냅샷 동기화 (13-1) */
function syncTableProfile(room, userId) {
  if (!room?.table) return;
  const tp = room.table.players.find((p) => p.id === userId);
  if (!tp) return;
  const u = db.getUser(userId);
  if (!u) return;
  tp.avatar = u.avatar; tp.color = u.color; tp.title = u.title; tp.equipped = u.equipped;
  broadcastTable(room);
}

function clearTimers(room) {
  if (room.actionTimer) clearTimeout(room.actionTimer);
  if (room.blindTimer) clearInterval(room.blindTimer);
  room.actionTimer = null; room.blindTimer = null;
}

/* ---------- 게임 진행 ---------- */

function startHand(room) {
  const t = room.table;
  t.startHand();
  room.handStartAt = Date.now();
  broadcastTable(room);
  armTimer(room);
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

function afterAct(room) {
  const t = room.table;
  broadcastTable(room);
  if (t.street === STREET.DONE) {
    clearTimeout(room.actionTimer);
    onHandEnd(room);
  } else {
    armTimer(room);
  }
}

function settleStacksToAccounts(room) {
  // 테이블 스택 → 계정 칩으로 복귀. profit 계산용 반환
  const profits = [];
  for (const p of room.table.players) {
    const u = db.getUser(p.id);
    if (!u) continue;
    const profit = p.stack - room.buyinPaid.get(p.id);
    db.deltaChips(p.id, p.stack);
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
    setTimeout(() => endGame(room), 8000);
  }
}

function endGame(room) {
  const profits = settleStacksToAccounts(room);
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
  db.addRecord({
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

  socket.on('auth', ({ userId: id }) => {
    const u = db.getUser(id);
    if (!u || !u.approved) return socket.emit('auth_error', '승인되지 않은 계정이에요');
    userId = id;
    userSockets.set(id, socket);
    socket.emit('auth_ok', db.sanitize(u));
  });

  const me = () => (userId ? db.getUser(userId) : null);

  socket.on('create_room', ({ name, gameType, settings }, cb) => {
    const u = me();
    if (!u) return cb({ error: '로그인이 필요해요' });
    const code = genCode();
    const room = {
      code, name: (name || `${u.name}의 방`).slice(0, 30),
      gameType: GAME_TABLES[gameType] ? gameType : 'holdem', hostId: userId,
      settings: {
        buyin: 10000, sb: 50, bb: 100, blindIntervalMin: 15, blindMult: 2,
        rebuyAllowed: true, rebuyMax: 3, mode: 'single', seriesCount: 5,
        finalScoring: 'chips', coinTable: [3, 2, 1],
        pineappleVariant: 'classic', blackjackBet: 100, studAnte: 10,
        ...(settings || {}),
      },
      players: [], table: null, state: 'lobby',
      series: null, buyinPaid: new Map(),
    };
    // 방 비밀번호 (13-1): settings.password(선택) → 별도 보관, settings에는 노출 안 함
    const pw = String(settings?.password || '').slice(0, 20);
    room.password = pw || null;
    delete room.settings.password;
    rooms.set(code, room);
    socket.join(code);
    room.players.push({ userId, name: u.name, socketId: socket.id, ready: true });
    broadcastRoom(room);
    cb({ code });
  });

  socket.on('join_room', ({ code, password }, cb) => {
    const u = me();
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

  socket.on('leave_room', () => {
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

  socket.on('start_game', (cb) => {
    const room = getRoomBySocket(socket);
    if (!room || room.hostId !== userId) return cb?.({ error: '호스트만 시작할 수 있어요' });
    if (room.players.length < 2) return cb?.({ error: '2명 이상 필요해요' });
    const s = room.settings;
    // gameType → 테이블 클래스 (미등록 게임은 홀덤으로 폴백)
    const Tbl = GAME_TABLES[room.gameType] || GAME_TABLES.holdem;
    const table = new Tbl({ sb: s.sb, bb: s.bb, pineappleVariant: s.pineappleVariant, blackjackBet: s.blackjackBet, studAnte: s.studAnte });
    room.buyinPaid = new Map();
    for (const p of room.players) {
      const u = db.getUser(p.userId);
      if (!u || u.chips < s.buyin) {
        socket.emit('notice', `${p.name}님 칩 부족으로 제외돼요`);
        continue;
      }
      db.deltaChips(p.userId, -s.buyin);
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

  socket.on('act', ({ action, amount }) => {
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
  socket.on('discard', ({ cardIndex }, cb) => {
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

  socket.on('rebuy', (cb) => {
    const room = getRoomBySocket(socket);
    if (!room || !room.table) return cb?.({ error: '게임 중이 아니에요' });
    const s = room.settings;
    if (!s.rebuyAllowed) return cb?.({ error: '리바이가 허용되지 않은 방이에요' });
    const tp = room.table.players.find((p) => p.id === userId);
    if (!tp || tp.stack > 0) return cb?.({ error: '리바이 대상이 아니에요' });
    const u = db.getUser(userId);
    if (u.chips < s.buyin) return cb?.({ error: '계정 칩이 부족해요. 마스터에게 요청하세요!' });
    db.deltaChips(userId, -s.buyin);
    tp.stack = s.buyin;
    tp.allin = false; tp.folded = false; tp.sittingOut = false;
    room.buyinPaid.set(userId, (room.buyinPaid.get(userId) || 0) + s.buyin);
    io.to(room.code).emit('notice', `${u.name} 리바이!`);
    broadcastTable(room);
    cb?.({ ok: true });
  });

  socket.on('chat', ({ text }) => {
    const room = getRoomBySocket(socket);
    const u = me();
    if (!room || !u || !text) return;
    io.to(room.code).emit('chat', {
      name: u.name, color: u.color, text: String(text).slice(0, 200), at: Date.now(),
    });
  });

  /* --- 마스터 --- */
  socket.on('master_pending', (cb) => {
    const u = me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    cb({ users: db.pendingUsers() });
  });
  socket.on('master_approve', ({ userId: target, ok }, cb) => {
    const u = me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    const t = db.approveUser(target, ok);
    const sock = userSockets.get(target);
    if (sock && ok) sock.emit('notice', '마스터가 승인했어요! 다시 로그인해주세요 🎉');
    cb({ user: t });
  });
  socket.on('master_users', (cb) => {
    const u = me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    cb({ users: db.allUsers() });
  });
  socket.on('master_give_chips', ({ userId: target, amount }, cb) => {
    const u = me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    try {
      const chips = db.deltaChips(target, Number(amount));
      cb({ chips });
    } catch (e) { cb({ error: e.message }); }
  });
  socket.on('master_set_chips', ({ userId: target, chips }, cb) => {
    const u = me();
    if (!u?.is_master) return cb({ error: '마스터만 가능해요' });
    try {
      const updated = db.setChips(target, Number(chips));
      cb({ user: updated });
    } catch (e) { cb({ error: e.message }); }
  });

  /* --- 카드 스킨 관리 (마스터 전용, 13-1) --- */
  // skins/ 폴더를 스캔 → 검증 통과한 것만 DB 등록
  socket.on('master_skin_refresh', (cb) => {
    const u = me();
    if (!u?.is_master) return cb?.({ error: '마스터만 가능해요' });
    const scanned = scanSkins(SKINS_DIR);
    const valid = [];
    const invalid = [];
    for (const s of scanned) {
      if (s.valid) { db.upsertSkin(s.key, s.name); valid.push({ key: s.key, name: s.name }); }
      else invalid.push({ key: s.key, errors: s.errors });
    }
    cb?.({ ok: true, valid, invalid });
  });
  // 등록된 스킨 목록 + 스캔 상태 (마스터 패널용)
  socket.on('master_skin_list', (cb) => {
    const u = me();
    if (!u?.is_master) return cb?.({ error: '마스터만 가능해요' });
    cb?.({ registered: db.listSkins(), scanned: scanSkins(SKINS_DIR) });
  });
  // 스킨 활성화/비활성화 (유저에게 보이는 것만)
  socket.on('master_skin_toggle', ({ key, enabled }, cb) => {
    const u = me();
    if (!u?.is_master) return cb?.({ error: '마스터만 가능해요' });
    try {
      db.setSkinEnabled(key, !!enabled);
      cb?.({ ok: true });
    } catch (e) { cb?.({ error: e.message }); }
  });

  /* --- 프로필/기록 --- */
  socket.on('update_profile', (profile, cb) => {
    if (!me()) return cb?.({ error: '로그인이 필요해요' });
    const updated = db.updateProfile(userId, profile);
    syncTableProfile(getRoomBySocket(socket), userId);
    cb({ user: updated });
  });
  socket.on('my_records', (cb) => cb({ records: db.myRecords(userId) }));

  /* --- 아바타 상점 (13-1) --- */
  socket.on('shop_list', (cb) => {
    if (!me()) return cb?.({ error: '로그인이 필요해요' });
    cb?.({
      slots: db.AVATAR_SLOTS,
      parts: db.listAvatarParts(),
      owned: db.myAvatarParts(userId),
      loadout: db.getLoadout(userId),
      chips: me().chips,
    });
  });
  socket.on('shop_buy', ({ partId }, cb) => {
    if (!me()) return cb?.({ error: '로그인이 필요해요' });
    try {
      const r = db.buyAvatarPart(userId, partId);
      cb?.({ ok: true, part: r.part, chips: r.chips, owned: db.myAvatarParts(userId) });
    } catch (e) { cb?.({ error: e.message }); }
  });
  socket.on('equip_avatar', ({ partId }, cb) => {
    if (!me()) return cb?.({ error: '로그인이 필요해요' });
    try {
      const loadout = db.equipAvatarPart(userId, partId);
      syncTableProfile(getRoomBySocket(socket), userId);
      cb?.({ ok: true, loadout });
    } catch (e) { cb?.({ error: e.message }); }
  });

  socket.on('disconnect', () => {
    if (userId && userSockets.get(userId) === socket) userSockets.delete(userId);
    // 재접속을 위해 방에서는 유지 (액션 타이머가 자동 폴드 처리)
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🃏 포커 서버 가동: http://localhost:${PORT}`));
