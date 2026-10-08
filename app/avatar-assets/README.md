# 🖌️ 아바타 에셋 (서빙용)

메이플스토리 스타일 아바타 — 렌더는 **maplestory.io API** 방식 (클라이언트 `maple.js`).
정본 매니페스트: `~/workspace/poker/maple-research/parts_catalog.json` (6부위 27종)

이 폴더는 서버가 `/avatar-assets` 로 정적 서빙해요. 현재는 v3 maple 방식이라 로컬 PNG 없이 운영 중이에요.
(구 v2 자작 PNG는 2026-10-08 마스터 폐기 결정으로 제거됨. 원본은 `avatar-archive/v2-selfmade/`에 보존.)

## DB 스키마
- `avatar_parts(id, slot, name, price, file, rarity, maple_item_id)`
- `slot`: hair/face/top/bottom/hat/shoes (6종)
- `rarity`: free/common/rare/legendary
- `file`: 로컬 파일이 없어 빈 배열 `'[]'` (렌더는 `maple_item_id`로 maplestory.io 호출)
- `maple_item_id`: 메이플 아이템 ID (클라이언트 렌더용)

## 파츠 추가/변경 절차

**원칙: `parts_catalog.json`이 정본이에요.** 서버 시작 시 `syncAvatarParts()`가 자동 동기화해요.
