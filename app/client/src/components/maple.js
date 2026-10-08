// 🍁 메이플 아바타 URL 조립 (13-2 준비, 13-3 리서치 기반)
// 방식: maplestory.io 렌더 API + 서버 캐싱 (Option A)
//   https://maplestory.io/api/character/{PAYLOAD}/stand1/0?resize=3
// PAYLOAD = [{itemId, region:"GMS", version:"214"}, ...] 에서 양 끝 [] 제거 후 URL 인코딩
//
// parts.json v3 스키마 제안 (13-3 협의용):
//   { "id": "hair_carla_black", "slot": "hair", "name": "블랙 칼라 헤어",
//     "rarity": "rare", "price": 5000, "maple_item_id": 31310 }
//   - 기존 `files` 필드 → `maple_item_id` 로 교체 (PNG 합성 불필요)
//   - 클라이언트는 장착 파츠들의 maple_item_id 수집 → 아래 헬퍼로 URL 조립
//   - 서버 슬롯명 'acc' vs 매니페스트 'accessory' → 클라이언트에서 normalize (Avatar.jsx 참고)
//
// 13-1 서버 캐싱 프록시가 생기면 proxy: true 로 전환:
//   직접: https://maplestory.io/api/character/...
//   프록시: /maple/api/character/... (13-1 구현 예정)

export const MAPLE_REGION = 'GMS';
export const MAPLE_VERSION = '214'; // ⚠️ "latest"는 404, 반드시 버전 핀
const SKIN_IDS = [2000, 12000]; // 스킨 2개 필수 (skin + skin+10000)

/**
 * 메이플 아바타 렌더 URL 조립
 * @param mapleItemIds number[] — 장착 파츠의 maple_item_id 목록 (스킨 제외)
 * @param opts { resize, action, frame, proxy }
 */
export function mapleAvatarUrl(mapleItemIds = [], { resize = 3, action = 'stand1', frame = 0, proxy = false } = {}) {
  const entries = [...SKIN_IDS, ...mapleItemIds]
    .map((itemId) => ({ itemId, region: MAPLE_REGION, version: MAPLE_VERSION }));
  const payload = encodeURIComponent(JSON.stringify(entries).slice(1, -1));
  const path = `/api/character/${payload}/${action}/${frame}?resize=${resize}`;
  return proxy ? `/maple${path}` : `https://maplestory.io${path}`;
}

/**
 * loadout({slot: partId}) + v3 매니페스트 파츠 목록 → 렌더 URL
 * @param loadout { hair, face, top, bottom, hat, acc }
 * @param parts [{ id, maple_item_id }] — parts.json v3
 */
export function mapleUrlFromLoadout(loadout, parts = [], opts) {
  const byId = {};
  parts.forEach((p) => { byId[p.id] = p.maple_item_id; });
  const ids = ['hair', 'face', 'top', 'bottom', 'hat', 'acc', 'accessory']
    .map((slot) => byId[loadout?.[slot]])
    .filter((id) => Number.isInteger(id));
  return mapleAvatarUrl(ids, opts);
}

// 부위별 테스트용 아이템 ID (GMS 214, 리서치 실측)
// 카탈로그용 파츠 ID 리스트는 13-3님과 협의 확정 예정
export const MAPLE_SAMPLE_IDS = {
  face: 20021,   // Overjoyed Smile
  hair: 31310,   // Black Carla
  hat: 1002140,  // Wizet Invincible Hat
  top: 1042004,  // Pink Hooded Vest
  bottom: 1062000, // Ice Jeans
  shoes: 1072006, // Brown Basic Boots
};
