// 🃏 카드 스킨 스캔/검증 (13-1)
// skins/<스킨명>/ 구조: skin.json + back.png + 앞면 52장 (750×1050, 5:7)
// plan.md §14 카드 스킨 확장 시스템
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import path from 'path';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['S', 'H', 'D', 'C']; // ♠ ♥ ♦ ♣

/** 앞면 52장 파일명: AS.png, 10H.png, KD.png ... */
export function faceFileNames() {
  const names = [];
  for (const s of SUITS) for (const r of RANKS) names.push(`${r}${s}.png`);
  return names;
}

/** PNG IHDR에서 (width, height) 읽기. PNG가 아니면 null (의존성 없음) */
export function pngSize(filePath) {
  try {
    const buf = readFileSync(filePath);
    if (buf.length < 24) return null;
    // PNG 시그니처: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (!width || !height) return null;
    return { width, height };
  } catch { return null; }
}

/** 5:7 비율 허용 오차 1% */
export function isFiveToSeven(w, h) {
  if (!w || !h) return false;
  return Math.abs(w / h - 5 / 7) < 0.01;
}

/**
 * 스킨 폴더 1개 검증 → { valid, errors[], meta }
 * - skin.json 존재 + name 필드
 * - back.png + 앞면 52장 존재
 * - back.png와 앞면 샘플 4장의 PNG 여부 + 5:7 비율
 */
export function validateSkin(dir) {
  const errors = [];
  const q = (f) => path.join(dir, f);
  let meta = null;

  if (!existsSync(q('skin.json'))) {
    errors.push('skin.json 없음');
  } else {
    try {
      meta = JSON.parse(readFileSync(q('skin.json'), 'utf8'));
      if (!meta.name || !String(meta.name).trim()) errors.push('skin.json에 name 없음');
    } catch { errors.push('skin.json 파싱 실패'); }
  }

  const checkPng = (f) => {
    if (!existsSync(q(f))) { errors.push(`${f} 없음`); return; }
    const size = pngSize(q(f));
    if (!size) { errors.push(`${f}: PNG가 아니에요`); return; }
    if (!isFiveToSeven(size.width, size.height)) {
      errors.push(`${f}: 비율이 5:7이 아니에요 (${size.width}x${size.height})`);
    }
  };

  checkPng('back.png');
  const faces = faceFileNames();
  const missing = faces.filter((f) => !existsSync(q(f)));
  for (const f of missing) errors.push(`${f} 없음`);
  // 앞면은 샘플 4장만 비율 체크 (53장 전부 읽으면 느려서)
  if (missing.length === 0) {
    for (const f of ['AS.png', '10H.png', 'KD.png', 'QC.png']) checkPng(f);
  }

  return { valid: errors.length === 0, errors, meta };
}

/**
 * skins/ 전체 스캔 → [{ key, name, valid, errors }]
 * _template, 숨김 폴더는 제외
 */
export function scanSkins(skinsDir) {
  const out = [];
  if (!existsSync(skinsDir)) return out;
  for (const name of readdirSync(skinsDir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const dir = path.join(skinsDir, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch { continue; }
    const v = validateSkin(dir);
    out.push({ key: name, name: v.meta?.name || name, valid: v.valid, errors: v.errors });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
