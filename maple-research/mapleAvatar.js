// 🍁 메이플 아바타 URL 빌더 (13-3 제작, 2026-10-08)
// parts.v3.json과 함께 사용. 클라이언트에 그대로 붙여넣으면 돼요.

const MAPLE_API = "https://maplestory.io/api/character";
const MAPLE_REGION = "GMS";
const MAPLE_VERSION = "214"; // ⚠️ "latest" 불가 — 명시적 버전 핀
const MAPLE_SKIN = [2000, 12000]; // 스킨 2종 (skin, skin+10000)

/**
 * 장착 파츠의 maple_item_id 배열 → 렌더 URL
 * @param {number[]} itemIds - 장착 중인 파츠의 maple_item_id (hat_none처럼 null인 건 제외)
 * @param {number} resize - 배율 (기본 3, 좌석용 2)
 * @returns {string} 렌더된 PNG URL
 */
export function mapleAvatarUrl(itemIds, resize = 3) {
  const entries = [...MAPLE_SKIN, ...itemIds.filter(Boolean)].map((id) => ({
    itemId: id,
    region: MAPLE_REGION,
    version: MAPLE_VERSION,
  }));
  const payload = encodeURIComponent(JSON.stringify(entries).slice(1, -1));
  return `${MAPLE_API}/${payload}/stand1/0?resize=${resize}`;
}

/**
 * parts.v3.json 로드아웃 객체 → 렌더 URL
 * @param {object} partsById - parts.v3.json의 parts를 id로 인덱싱한 맵
 * @param {object} loadout - { hair: "hair_carla_black", face: "face_smile", ... }
 */
export function loadoutUrl(partsById, loadout, resize = 3) {
  const ids = Object.values(loadout)
    .map((pid) => partsById[pid]?.maple_item_id)
    .filter((v) => v != null);
  return mapleAvatarUrl(ids, resize);
}

// 사용 예:
// import parts from "./parts.v3.json";
// const byId = Object.fromEntries(parts.parts.map(p => [p.id, p]));
// const url = loadoutUrl(byId, parts.default_loadout, 3);
// <img src={url} alt="avatar" />
