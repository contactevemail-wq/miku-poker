import React from 'react';
import manifest from './avatar-manifest.json';
import { mapleAvatarUrl } from './maple.js';

// ============================================================
// 아바타 렌더러 — 메이플 렌더 (v3 통일, 13호 결정)
// ============================================================
//
// - v3 카탈로그 27종 (6슬롯: hair/face/top/bottom/shoes/hat)
// - 장착 상태 {slot: v3partId} → maple_item_id 수집 → maplestory.io 렌더
// - 13-1 서버 정리 전 구 ID는 COMPAT으로 v3에 매핑

const BY_ID = {};
manifest.parts.forEach((p) => { BY_ID[p.id] = p; });

const DEFAULTS = manifest.default_loadout;
const RENDER_SLOTS = ['hair', 'face', 'top', 'bottom', 'shoes', 'hat'];

// DB ID = v3 ID (13-1 동기화済) — 모르는 ID는 슬롯 기본값으로 폴백

// 구 avatar 문자열 파서 ('c:id|id|...' — 6슬롯 구형)
const LEGACY_ORDER = ['hair', 'face', 'top', 'bottom', 'hat', 'acc'];
const LEGACY = {
  h1: 'hair_carla_black', h2: 'hair_carla_red', h3: 'hair_carla_blue', h4: 'hair_carla_blonde',
  f1: 'face_smile', f2: 'face_demure', f3: 'face_dramatic',
  t1: 'top_hoodie_orange', t2: 'top_hoodie_pink', t3: 'top_hoodie_black',
  b1: 'bottom_jeans_ice', b2: 'bottom_jeans_sand', b3: 'bottom_hiphop_red',
  ht1: 'hat_none', ht2: 'hat_kitty', ht3: 'hat_winter',
};

function parseLegacyAvatar(str) {
  const out = {};
  if (str && str.startsWith('c:')) {
    const ids = str.slice(2).split('|');
    LEGACY_ORDER.forEach((slot, i) => {
      const mapped = LEGACY[ids[i]];
      if (mapped && RENDER_SLOTS.includes(slot)) out[slot] = mapped;
    });
  }
  return out;
}

/** loadout이 JSON 문자열이면 파싱 (publicState equipped 등) */
function asObject(loadout) {
  if (typeof loadout === 'string') {
    try { return JSON.parse(loadout); } catch { return {}; }
  }
  return loadout;
}

function toV3Id(rawId, slot) {
  if (rawId && BY_ID[rawId]) return rawId;
  return DEFAULTS[slot] || null;
}

/**
 * loadout({slot: partId}) → v3 기준 {slot: v3partId}
 * 우선순위: 서버 loadout → 구 avatar 문자열 → 매니페스트 기본값
 */
export function resolveLoadout(loadout, avatar) {
  const out = {};
  const lo = asObject(loadout);
  // 서버는 'acc', v3는 해당 슬롯 없음 — 무시
  const src = (lo && Object.keys(lo).length) ? lo : parseLegacyAvatar(avatar);
  for (const slot of RENDER_SLOTS) {
    const vid = toV3Id(src[slot], slot);
    if (vid) out[slot] = vid;
  }
  return out;
}

/** v3 loadout → maple_item_id 목록 (hat_none 등 null은 제외) */
export function loadoutToItemIds(resolved) {
  return RENDER_SLOTS
    .map((slot) => BY_ID[resolved[slot]]?.maple_item_id)
    .filter((id) => Number.isInteger(id));
}

/** 장착 상태 → 메이플 렌더 URL (expression: 표정 API명) */
export function avatarMapleUrl(loadout, avatar, opts) {
  const resolved = resolveLoadout(loadout, avatar);
  const faceItemId = BY_ID[resolved.face]?.maple_item_id || null;
  return mapleAvatarUrl(loadoutToItemIds(resolved), { ...opts, faceItemId });
}

/** 파츠 단품 미리보기 URL (기본 장착 + 해당 파츠만 교체) */
export function partPreviewUrl(partId) {
  const part = BY_ID[partId];
  if (!part) return null;
  const resolved = { ...resolveLoadout(null, null), [part.slot]: part.id };
  const ids = loadoutToItemIds(resolved);
  if (!ids.length) return null;
  return mapleAvatarUrl(ids, { resize: 2 });
}

/** 슬롯 목록 (UI 표시용) */
export const PART_SLOTS = [
  { key: 'hair', name: '헤어' }, { key: 'face', name: '얼굴' },
  { key: 'top', name: '상의' }, { key: 'bottom', name: '하의' },
  { key: 'shoes', name: '신발' }, { key: 'hat', name: '모자' },
];

/** 상점용 파츠 썸네일 (메이플 미리보기) */
export function PartThumb({ partId, size = 40 }) {
  const url = partPreviewUrl(partId);
  if (!url) {
    return (
      <div className="part-thumb empty" style={{ width: size, height: size }}>
        —
      </div>
    );
  }
  return (
    <img
      className="part-thumb"
      src={url}
      alt=""
      draggable={false}
      style={{
        width: size, height: size, objectFit: 'cover', objectPosition: 'top',
        background: '#0b1626', borderRadius: 8,
      }}
    />
  );
}

/** 아바타 — 원형, 얼굴 크롭 (expression: 표정 API명, 예: 'cheers') */
export default function Avatar({ loadout, avatar, color = '#22d3ee', size = 44, title, expression = null }) {
  const url = avatarMapleUrl(loadout, avatar, { resize: 2, expression });
  return (
    <div
      className="avatar"
      title={title}
      style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden',
        border: `2px solid ${color}`, background: '#0b1626', flexShrink: 0,
      }}
    >
      <img
        src={url}
        alt=""
        draggable={false}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          objectPosition: 'top', pointerEvents: 'none',
        }}
      />
    </div>
  );
}
