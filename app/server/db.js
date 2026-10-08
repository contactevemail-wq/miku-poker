// 🃏 DB 레이어 — better-sqlite3
import Database from 'better-sqlite3';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DB_PATH 환경변수로 테스트용 DB 분리 가능 (없으면 기본 poker.db)
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'poker.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  is_master INTEGER NOT NULL DEFAULT 0,
  chips INTEGER NOT NULL DEFAULT 10000,
  avatar TEXT NOT NULL DEFAULT 'miku1',
  color TEXT NOT NULL DEFAULT '#22d3ee',
  title TEXT NOT NULL DEFAULT '',
  skin TEXT NOT NULL DEFAULT 'classic',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS game_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at TEXT NOT NULL DEFAULT (datetime('now')),
  game_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  results TEXT NOT NULL,   -- JSON: [{name, profit, rank}]
  winner_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skins (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function hashPin(pin, salt) {
  return scryptSync(pin, salt, 32).toString('hex');
}

export function createUser(name, pin) {
  name = name.trim().slice(0, 20);
  if (!name) throw new Error('이름을 입력해주세요');
  if (!/^\d{4}$/.test(pin)) throw new Error('숫자 4자리를 입력해주세요');
  const exists = db.prepare('SELECT id FROM users WHERE name = ?').get(name);
  if (exists) throw new Error('이미 사용 중인 이름이에요');
  const salt = randomBytes(16).toString('hex');
  // 첫 가입자가 마스터
  const masterCount = db.prepare('SELECT COUNT(*) c FROM users WHERE is_master = 1').get().c;
  const isMaster = masterCount === 0 ? 1 : 0;
  const approved = isMaster; // 마스터는 자동 승인
  const info = db.prepare(
    'INSERT INTO users (name, pin_salt, pin_hash, approved, is_master) VALUES (?,?,?,?,?)'
  ).run(name, salt, hashPin(pin, salt), approved, isMaster);
  return getUser(info.lastInsertRowid);
}

export function verifyUser(name, pin) {
  const u = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  if (!u) throw new Error('가입되지 않은 이름이에요');
  const ok = timingSafeEqual(
    Buffer.from(u.pin_hash, 'hex'),
    Buffer.from(hashPin(pin, u.pin_salt), 'hex')
  );
  if (!ok) throw new Error('숫자 4자리가 틀렸어요');
  if (!u.approved) throw new Error('마스터 승인 대기 중이에요');
  return sanitize(u);
}

export function getUser(id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return u ? sanitize(u) : null;
}

export function sanitize(u) {
  const { pin_salt, pin_hash, ...rest } = u;
  return rest;
}

export function pendingUsers() {
  return db.prepare('SELECT id, name, created_at FROM users WHERE approved = 0 ORDER BY id').all();
}

export function approveUser(id, approved = true) {
  db.prepare('UPDATE users SET approved = ? WHERE id = ?').run(approved ? 1 : 0, id);
  return getUser(id);
}

export function allUsers() {
  return db.prepare('SELECT id, name, approved, is_master, chips, avatar, color FROM users ORDER BY id').all();
}

/** 칩 증감 (마스터 지급/회수, 게임 정산). 음수 방지 */
export function deltaChips(id, delta) {
  const u = getUser(id);
  if (!u) throw new Error('no user');
  const next = u.chips + delta;
  if (next < 0) throw new Error('칩이 부족해요');
  db.prepare('UPDATE users SET chips = ? WHERE id = ?').run(next, id);
  return next;
}

export function setChips(id, chips) {
  if (chips < 0) throw new Error('0 이상이어야 해요');
  db.prepare('UPDATE users SET chips = ? WHERE id = ?').run(chips, id);
  return getUser(id);
}

export function updateProfile(id, { avatar, color, title, skin }) {
  const sets = [];
  const vals = [];
  if (avatar !== undefined) { sets.push('avatar = ?'); vals.push(String(avatar).slice(0, 40)); }
  if (color !== undefined) { sets.push('color = ?'); vals.push(String(color).slice(0, 20)); }
  if (title !== undefined) { sets.push('title = ?'); vals.push(String(title).slice(0, 20)); }
  if (skin !== undefined) { sets.push('skin = ?'); vals.push(String(skin).slice(0, 40)); }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id = ?`).run(...vals, id);
  return getUser(id);
}

export function addRecord({ game_type, mode, player_count, results, winner_name }) {
  db.prepare(
    'INSERT INTO game_records (game_type, mode, player_count, results, winner_name) VALUES (?,?,?,?,?)'
  ).run(game_type, mode, player_count, JSON.stringify(results), winner_name);
}

export function getRecords(limit = 30) {
  return db.prepare('SELECT * FROM game_records ORDER BY id DESC LIMIT ?').all(limit)
    .map((r) => ({ ...r, results: JSON.parse(r.results) }));
}

export function myRecords(userId) {
  const u = getUser(userId);
  if (!u) return [];
  return getRecords(200).filter((r) => r.results.some((p) => p.name === u.name)).slice(0, 30);
}

/* ============================================================
 * 아바타 상점 (2026-10-08, 13-1 / 13호 스펙 정렬)
 * 마이그레이션: avatar_parts / user_parts 테이블,
 * users.equipped 컬럼 (장착 JSON)
 * 기획: plan.md §14 — 메이플식 6부위 파츠 + 칩 구매
 * ----
 * 변경 이력:
 *  - v1: avatar_parts(image) / user_avatar_parts / users.avatar_loadout
 *  - v2(13호 스펙): avatar_parts(file, rarity) / user_parts / users.equipped
 * ============================================================ */

export const AVATAR_SLOTS = ['hair', 'face', 'top', 'bottom', 'hat', 'shoes'];

db.exec(`
CREATE TABLE IF NOT EXISTS avatar_parts (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  file TEXT NOT NULL DEFAULT '',
  rarity TEXT NOT NULL DEFAULT 'common',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_parts (
  user_id INTEGER NOT NULL,
  part_id TEXT NOT NULL,
  PRIMARY KEY (user_id, part_id)
);
`);

{
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  if (!cols.includes('avatar_loadout')) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar_loadout TEXT NOT NULL DEFAULT '{}'`);
  }
}

/* ---- 13호 스펙 정렬 마이그레이션 (v1 → v2,冪等) ---- */
{
  // avatar_parts: image → file, rarity 추가
  const cols = db.prepare('PRAGMA table_info(avatar_parts)').all().map((c) => c.name);
  if (!cols.includes('file')) {
    db.exec(`ALTER TABLE avatar_parts ADD COLUMN file TEXT NOT NULL DEFAULT ''`);
    if (cols.includes('image')) db.exec(`UPDATE avatar_parts SET file = image WHERE file = ''`);
  }
  if (!cols.includes('rarity')) {
    db.exec(`ALTER TABLE avatar_parts ADD COLUMN rarity TEXT NOT NULL DEFAULT 'common'`);
  }
  // 구테이블 user_avatar_parts → user_parts로 합병 후 삭제 (v1 잔재 정리)
  const tables = () => db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  if (tables().includes('user_avatar_parts')) {
    if (!tables().includes('user_parts')) {
      db.exec('ALTER TABLE user_avatar_parts RENAME TO user_parts');
    } else {
      db.exec('INSERT OR IGNORE INTO user_parts SELECT user_id, part_id FROM user_avatar_parts');
      db.exec('DROP TABLE user_avatar_parts');
    }
  }
  // users.equipped (v1 avatar_loadout에서 이관)
  const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!ucols.includes('equipped')) {
    db.exec(`ALTER TABLE users ADD COLUMN equipped TEXT NOT NULL DEFAULT '{}'`);
    if (ucols.includes('avatar_loadout')) db.exec('UPDATE users SET equipped = avatar_loadout');
  }
}

// ============================================================
// 아바타 파츠 동기화 (2026-10-08, 13-1)
// 정본: v3 메이플 카탈로그 ~/workspace/poker/maple-research/parts_catalog.json (6부위 27종)
//   → 13호 최종 결정 (2026-10-08): v3(메이플) 통일, v2 자작은 폐기
// 서버 시작 시 카탈로그를 읽어 avatar_parts에 동기화:
//  - slot: 카탈로그 그대로 (hair/face/top/bottom/hat/shoes)
//  - rarity: free/common/rare/legendary (카탈로그 그대로)
//  - maple_item_id: maplestory.io 렌더용 아이템 ID
//  - file: 로컬 파일 없어 빈 배열 '[]'
//  - 카탈로그에 없는 파츠(구 시드 잔재)는 정리 + equipped 보정
// 카탈로그를 읽을 수 없으면 동기화를 건너뜀 (서버는 정상 시작)
import { readFileSync, existsSync } from 'fs';

const AVATAR_CATALOG = path.join(__dirname, '..', '..', 'maple-research', 'parts_catalog.json');

export function syncAvatarParts() {
  let catalog;
  try {
    if (!existsSync(AVATAR_CATALOG)) {
      console.warn('[shop] 카탈로그 없음, 파츠 동기화 건너뜀:', AVATAR_CATALOG);
      return { synced: 0, skipped: true };
    }
    catalog = JSON.parse(readFileSync(AVATAR_CATALOG, 'utf8'));
  } catch (e) {
    console.warn('[shop] 카탈로그 파싱 실패, 동기화 건너뜀:', e.message);
    return { synced: 0, skipped: true };
  }

  // maple_item_id 컬럼 (구 DB 대응)
  const pcols = db.prepare('PRAGMA table_info(avatar_parts)').all().map((c) => c.name);
  if (!pcols.includes('maple_item_id')) {
    db.exec('ALTER TABLE avatar_parts ADD COLUMN maple_item_id INTEGER');
  }

  const upsert = db.prepare(`INSERT INTO avatar_parts (id, slot, name, price, file, rarity, maple_item_id)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET slot=excluded.slot, name=excluded.name,
      price=excluded.price, file=excluded.file, rarity=excluded.rarity,
      maple_item_id=excluded.maple_item_id`);

  const defaults = { ...(catalog.default_loadout || {}) };

  const ids = [];
  const tx = db.transaction(() => {
    for (const p of catalog.parts || []) {
      if (!p.slot || !AVATAR_SLOTS.includes(p.slot)) continue;
      upsert.run(p.id, p.slot, p.name, p.price | 0, '[]', p.rarity || 'common', p.maple_item_id | 0);
      ids.push(p.id);
    }
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM user_parts WHERE part_id NOT IN (${ph})`).run(...ids);
      db.prepare(`DELETE FROM avatar_parts WHERE id NOT IN (${ph})`).run(...ids);
    }
    // equipped 보정: 삭제된 파츠 참조 → 카탈로그 기본값, 폐지 슬롯(acc 등) 제거
    const valid = new Set(ids);
    const fixUser = db.prepare('UPDATE users SET equipped = ? WHERE id = ?');
    for (const u of db.prepare('SELECT id, equipped FROM users').all()) {
      let lo;
      try { lo = JSON.parse(u.equipped || '{}'); } catch { lo = {}; }
      let changed = false;
      for (const k of Object.keys(lo)) {
        if (!AVATAR_SLOTS.includes(k)) { delete lo[k]; changed = true; }
      }
      for (const slot of AVATAR_SLOTS) {
        if (!lo[slot] || !valid.has(lo[slot])) {
          const d = defaults[slot];
          if (d && valid.has(d)) { lo[slot] = d; changed = true; }
          else if (lo[slot]) { delete lo[slot]; changed = true; }
        }
      }
      if (changed) fixUser.run(JSON.stringify(lo), u.id);
    }
  });
  tx();
  return { synced: ids.length, skipped: false };
}

syncAvatarParts();

export function listAvatarParts() {
  return db.prepare('SELECT id, slot, name, price, file, rarity, maple_item_id FROM avatar_parts ORDER BY slot, price, id').all();
}

export function myAvatarParts(userId) {
  return db.prepare('SELECT part_id FROM user_parts WHERE user_id = ? ORDER BY part_id')
    .all(userId).map((r) => r.part_id);
}

export function getLoadout(userId) {
  const u = db.prepare('SELECT equipped FROM users WHERE id = ?').get(userId);
  try {
    const o = JSON.parse(u?.equipped || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

/**
 * 파츠 구매: 칩 차감 → 소유권 부여 (트랜잭션)
 * 상점 수익 칩은 소멸 (칩 인플레 방지, plan.md §14).
 * 마스터 회수 모드로 바꾸려면 여기서 master 계정에 deltaChips(price).
 */
export function buyAvatarPart(userId, partId) {
  const part = db.prepare('SELECT * FROM avatar_parts WHERE id = ?').get(partId);
  if (!part) throw new Error('없는 파츠예요');
  const owned = db.prepare(
    'SELECT 1 FROM user_parts WHERE user_id = ? AND part_id = ?'
  ).get(userId, partId);
  if (owned) throw new Error('이미 가지고 있는 파츠예요');
  if (part.price > 0) {
    const u = db.prepare('SELECT chips FROM users WHERE id = ?').get(userId);
    if (!u) throw new Error('no user');
    if (u.chips < part.price) throw new Error('칩이 부족해요');
    db.transaction(() => {
      db.prepare('UPDATE users SET chips = chips - ? WHERE id = ?').run(part.price, userId);
      db.prepare('INSERT INTO user_parts (user_id, part_id) VALUES (?,?)').run(userId, partId);
    })();
  } else {
    db.prepare('INSERT OR IGNORE INTO user_parts (user_id, part_id) VALUES (?,?)')
      .run(userId, partId);
  }
  return { part, chips: getUser(userId).chips };
}

/** 파츠 장착: 소유한 파츠(또는 무료 파츠)만 가능 */
export function equipAvatarPart(userId, partId) {
  const part = db.prepare('SELECT * FROM avatar_parts WHERE id = ?').get(partId);
  if (!part) throw new Error('없는 파츠예요');
  const owned = part.price === 0 ||
    db.prepare('SELECT 1 FROM user_parts WHERE user_id = ? AND part_id = ?')
      .get(userId, partId);
  if (!owned) throw new Error('먼저 상점에서 구매해주세요');
  const loadout = getLoadout(userId);
  loadout[part.slot] = part.id;
  db.prepare('UPDATE users SET equipped = ? WHERE id = ?')
    .run(JSON.stringify(loadout), userId);
  return loadout;
}

/* ============================================================
 * 카드 스킨 등록 (2026-10-08, 13-1)
 * skins/ 폴더 스캔 결과를 skins 테이블에 upsert
 * plan.md §14 카드 스킨 확장 시스템
 * ============================================================ */

export function upsertSkin(key, name) {
  db.prepare(
    `INSERT INTO skins (key, name, enabled) VALUES (?,?,1)
     ON CONFLICT(key) DO UPDATE SET name = excluded.name`
  ).run(key, String(name).slice(0, 40));
}

export function setSkinEnabled(key, enabled) {
  const r = db.prepare('UPDATE skins SET enabled = ? WHERE key = ?').run(enabled ? 1 : 0, key);
  if (r.changes === 0) throw new Error('없는 스킨이에요');
}

export function listSkins() {
  return db.prepare('SELECT key, name, enabled FROM skins ORDER BY key').all();
}
