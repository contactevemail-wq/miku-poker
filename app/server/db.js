// 🃏 DB 레이어 — @libsql/client (Turso / 로컬 SQLite)
// TURSO_URL 환경변수 있으면 Turso 원격, 없으면 로컬 파일 (poker.db)
// 2026-10-08 13호: better-sqlite3 → @libsql/client 마이그레이션 (Render DB 영속화)
import { createClient } from '@libsql/client';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

export const client = createClient(
  TURSO_URL
    ? { url: TURSO_URL, authToken: TURSO_TOKEN }
    : { url: 'file:' + (process.env.DB_PATH || path.join(__dirname, 'poker.db')) }
);

console.log('[db] ' + (TURSO_URL ? 'Turso 원격 DB 사용' : '로컬 SQLite 사용'));

/** 단일 행 조회 */
async function get(sql, ...args) {
  const r = await client.execute({ sql, args });
  return r.rows[0] || null;
}
/** 여러 행 조회 */
async function all(sql, ...args) {
  const r = await client.execute({ sql, args });
  return r.rows;
}
/** 쓰기 */
async function run(sql, ...args) {
  const r = await client.execute({ sql, args });
  return { changes: Number(r.rowsAffected), lastInsertRowid: Number(r.lastInsertRowid) };
}
/** 배치 실행 (트랜잭션 대체) */
async function batch(stmts) {
  return client.batch(stmts.map(([sql, ...args]) => ({ sql, args })));
}

async function init() {
  await client.execute(`
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
)`);
  await client.execute(`
CREATE TABLE IF NOT EXISTS game_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at TEXT NOT NULL DEFAULT (datetime('now')),
  game_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  results TEXT NOT NULL,
  winner_name TEXT NOT NULL
)`);
  await client.execute(`
CREATE TABLE IF NOT EXISTS skins (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
  await client.execute(`
CREATE TABLE IF NOT EXISTS avatar_parts (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  file TEXT NOT NULL DEFAULT '',
  rarity TEXT NOT NULL DEFAULT 'common',
  maple_item_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
  await client.execute(`
CREATE TABLE IF NOT EXISTS user_parts (
  user_id INTEGER NOT NULL,
  part_id TEXT NOT NULL,
  PRIMARY KEY (user_id, part_id)
)`);

  // 마이그레이션: users.equipped / avatar_loadout 컬럼
  const ucols = (await all(`PRAGMA table_info(users)`)).map((c) => c.name);
  if (!ucols.includes('avatar_loadout')) {
    await client.execute(`ALTER TABLE users ADD COLUMN avatar_loadout TEXT NOT NULL DEFAULT '{}'`);
  }
  if (!ucols.includes('equipped')) {
    await client.execute(`ALTER TABLE users ADD COLUMN equipped TEXT NOT NULL DEFAULT '{}'`);
    // v1 avatar_loadout에서 이관 (컬럼이 있을 때만)
    const ucols2 = (await all(`PRAGMA table_info(users)`)).map((c) => c.name);
    if (ucols2.includes('avatar_loadout')) {
      await client.execute(`UPDATE users SET equipped = avatar_loadout`);
    }
  }
  // avatar_parts 마이그레이션
  const pcols = (await all(`PRAGMA table_info(avatar_parts)`)).map((c) => c.name);
  if (!pcols.includes('file')) {
    await client.execute(`ALTER TABLE avatar_parts ADD COLUMN file TEXT NOT NULL DEFAULT ''`);
    if (pcols.includes('image')) {
      await client.execute(`UPDATE avatar_parts SET file = image WHERE file = ''`);
    }
  }
  if (!pcols.includes('rarity')) {
    await client.execute(`ALTER TABLE avatar_parts ADD COLUMN rarity TEXT NOT NULL DEFAULT 'common'`);
  }
  if (!pcols.includes('maple_item_id')) {
    await client.execute(`ALTER TABLE avatar_parts ADD COLUMN maple_item_id INTEGER`);
  }
  // 구테이블 user_avatar_parts → user_parts
  const tables = (await all(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((r) => r.name);
  if (tables.includes('user_avatar_parts')) {
    if (!tables.includes('user_parts')) {
      await client.execute('ALTER TABLE user_avatar_parts RENAME TO user_parts');
    } else {
      await client.execute('INSERT OR IGNORE INTO user_parts SELECT user_id, part_id FROM user_avatar_parts');
      await client.execute('DROP TABLE user_avatar_parts');
    }
  }
}

// 초기화는 모듈 로드 시 1회 (await 필요하므로 initPromise export)
export const initPromise = init().then(() => syncAvatarParts()).catch((e) => {
  console.error('[db] 초기화 실패:', e.message);
  throw e;
});

function hashPin(pin, salt) {
  return scryptSync(pin, salt, 32).toString('hex');
}

export async function createUser(name, pin) {
  name = name.trim().slice(0, 20);
  if (!name) throw new Error('이름을 입력해주세요');
  if (!/^\d{4}$/.test(pin)) throw new Error('숫자 4자리를 입력해주세요');
  const exists = await get('SELECT id FROM users WHERE name = ?', name);
  if (exists) throw new Error('이미 사용 중인 이름이에요');
  const salt = randomBytes(16).toString('hex');
  const masterCount = (await get('SELECT COUNT(*) c FROM users WHERE is_master = 1')).c;
  const isMaster = masterCount === 0 ? 1 : 0;
  const approved = isMaster;
  const info = await run(
    'INSERT INTO users (name, pin_salt, pin_hash, approved, is_master) VALUES (?,?,?,?,?)',
    name, salt, hashPin(pin, salt), approved, isMaster
  );
  return getUser(info.lastInsertRowid);
}

export async function verifyUser(name, pin) {
  const u = await get('SELECT * FROM users WHERE name = ?', name);
  if (!u) throw new Error('가입되지 않은 이름이에요');
  const ok = timingSafeEqual(
    Buffer.from(u.pin_hash, 'hex'),
    Buffer.from(hashPin(pin, u.pin_salt), 'hex')
  );
  if (!ok) throw new Error('숫자 4자리가 틀렸어요');
  if (!u.approved) throw new Error('마스터 승인 대기 중이에요');
  return sanitize(u);
}

export async function getUser(id) {
  const u = await get('SELECT * FROM users WHERE id = ?', id);
  return u ? sanitize(u) : null;
}

export function sanitize(u) {
  const { pin_salt, pin_hash, ...rest } = u;
  return rest;
}

export async function pendingUsers() {
  return all('SELECT id, name, created_at FROM users WHERE approved = 0 ORDER BY id');
}

export async function approveUser(id, approved = true) {
  await run('UPDATE users SET approved = ? WHERE id = ?', approved ? 1 : 0, id);
  return getUser(id);
}

export async function allUsers() {
  return all('SELECT id, name, approved, is_master, chips, avatar, color FROM users ORDER BY id');
}

export async function deltaChips(id, delta) {
  const u = await getUser(id);
  if (!u) throw new Error('no user');
  const next = u.chips + delta;
  if (next < 0) throw new Error('칩이 부족해요');
  await run('UPDATE users SET chips = ? WHERE id = ?', next, id);
  return next;
}

export async function setChips(id, chips) {
  if (chips < 0) throw new Error('0 이상이어야 해요');
  await run('UPDATE users SET chips = ? WHERE id = ?', chips, id);
  return getUser(id);
}

export async function updateProfile(id, { avatar, color, title, skin }) {
  const sets = [];
  const vals = [];
  if (avatar !== undefined) { sets.push('avatar = ?'); vals.push(String(avatar).slice(0, 40)); }
  if (color !== undefined) { sets.push('color = ?'); vals.push(String(color).slice(0, 20)); }
  if (title !== undefined) { sets.push('title = ?'); vals.push(String(title).slice(0, 20)); }
  if (skin !== undefined) { sets.push('skin = ?'); vals.push(String(skin).slice(0, 40)); }
  if (sets.length) await run(`UPDATE users SET ${sets.join(',')} WHERE id = ?`, ...vals, id);
  return getUser(id);
}

export async function addRecord({ game_type, mode, player_count, results, winner_name }) {
  await run(
    'INSERT INTO game_records (game_type, mode, player_count, results, winner_name) VALUES (?,?,?,?,?)',
    game_type, mode, player_count, JSON.stringify(results), winner_name
  );
}

export async function getRecords(limit = 30) {
  const rows = await all('SELECT * FROM game_records ORDER BY id DESC LIMIT ?', limit);
  return rows.map((r) => ({ ...r, results: JSON.parse(r.results) }));
}

export async function myRecords(userId) {
  const u = await getUser(userId);
  if (!u) return [];
  const rows = await getRecords(200);
  return rows.filter((r) => r.results.some((p) => p.name === u.name)).slice(0, 30);
}

export const AVATAR_SLOTS = ['hair', 'face', 'top', 'bottom', 'hat', 'shoes'];

const AVATAR_CATALOG = path.join(__dirname, '..', '..', 'maple-research', 'parts_catalog.json');

export async function syncAvatarParts() {
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

  const ids = [];
  const stmts = [];
  for (const p of catalog.parts || []) {
    if (!p.slot || !AVATAR_SLOTS.includes(p.slot)) continue;
    stmts.push({
      sql: `INSERT INTO avatar_parts (id, slot, name, price, file, rarity, maple_item_id)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET slot=excluded.slot, name=excluded.name,
          price=excluded.price, file=excluded.file, rarity=excluded.rarity,
          maple_item_id=excluded.maple_item_id`,
      args: [p.id, p.slot, p.name, p.price | 0, '[]', p.rarity || 'common', p.maple_item_id | 0],
    });
    ids.push(p.id);
  }
  if (stmts.length) await client.batch(stmts);
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    await run(`DELETE FROM user_parts WHERE part_id NOT IN (${ph})`, ...ids);
    await run(`DELETE FROM avatar_parts WHERE id NOT IN (${ph})`, ...ids);
  }
  // equipped 보정
  const defaults = { ...(catalog.default_loadout || {}) };
  const valid = new Set(ids);
  const users = await all('SELECT id, equipped FROM users');
  for (const u of users) {
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
    if (changed) await run('UPDATE users SET equipped = ? WHERE id = ?', JSON.stringify(lo), u.id);
  }
  return { synced: ids.length, skipped: false };
}

export async function listAvatarParts() {
  return all('SELECT id, slot, name, price, file, rarity, maple_item_id FROM avatar_parts ORDER BY slot, price, id');
}

export async function myAvatarParts(userId) {
  const rows = await all('SELECT part_id FROM user_parts WHERE user_id = ? ORDER BY part_id', userId);
  return rows.map((r) => r.part_id);
}

export async function getLoadout(userId) {
  const u = await get('SELECT equipped FROM users WHERE id = ?', userId);
  try {
    const o = JSON.parse(u?.equipped || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

export async function buyAvatarPart(userId, partId) {
  const part = await get('SELECT * FROM avatar_parts WHERE id = ?', partId);
  if (!part) throw new Error('없는 파츠예요');
  const owned = await get('SELECT 1 FROM user_parts WHERE user_id = ? AND part_id = ?', userId, partId);
  if (owned) throw new Error('이미 가지고 있는 파츠예요');
  if (part.price > 0) {
    const u = await get('SELECT chips FROM users WHERE id = ?', userId);
    if (!u) throw new Error('no user');
    if (u.chips < part.price) throw new Error('칩이 부족해요');
    await batch([
      ['UPDATE users SET chips = chips - ? WHERE id = ?', part.price, userId],
      ['INSERT INTO user_parts (user_id, part_id) VALUES (?,?)', userId, partId],
    ]);
  } else {
    await run('INSERT OR IGNORE INTO user_parts (user_id, part_id) VALUES (?,?)', userId, partId);
  }
  const u2 = await getUser(userId);
  return { part, chips: u2.chips };
}

export async function equipAvatarPart(userId, partId) {
  const part = await get('SELECT * FROM avatar_parts WHERE id = ?', partId);
  if (!part) throw new Error('없는 파츠예요');
  const owned = part.price === 0 ||
    await get('SELECT 1 FROM user_parts WHERE user_id = ? AND part_id = ?', userId, partId);
  if (!owned) throw new Error('먼저 상점에서 구매해주세요');
  const loadout = await getLoadout(userId);
  loadout[part.slot] = part.id;
  await run('UPDATE users SET equipped = ? WHERE id = ?', JSON.stringify(loadout), userId);
  return loadout;
}

export async function upsertSkin(key, name) {
  await run(
    `INSERT INTO skins (key, name, enabled) VALUES (?,?,1)
     ON CONFLICT(key) DO UPDATE SET name = excluded.name`,
    key, String(name).slice(0, 40)
  );
}

export async function setSkinEnabled(key, enabled) {
  const r = await run('UPDATE skins SET enabled = ? WHERE key = ?', enabled ? 1 : 0, key);
  if (r.changes === 0) throw new Error('없는 스킨이에요');
}

export async function listSkins() {
  return all('SELECT key, name, enabled FROM skins ORDER BY key');
}
