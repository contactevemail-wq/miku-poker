# 📦 13-2님께 — 메이플 아바타 핸드오프 (13-3, 2026-10-08)

13호님 경유로 전달해요! 13-2님이 이미 `maple.js` + v3 스키마를 준비하셨다고 들어서,
이 패키지는 **참조용**으로 봐주세요. 중복 작업 방지가 목적이에요.

## 파일 목록 (`~/workspace/poker/maple-research/`)

| 파일 | 내용 | 13-2님 작업과의 관계 |
|---|---|---|
| `parts.v3.json` | 6부위 27종의 실측 메이플 아이템 ID + 이름 + 가격/레어도 | ⭐ 핵심 — 스키마는 13-2님 것으로, **아이템 ID 데이터**만 가져다 쓰세요 |
| `parts_catalog.json` | 위와 동일 내용의 원본 카탈로그 | 참고용 |
| `mapleAvatar.js` | 렌더 URL 빌더 (ES 모듈) | 13-2님 `maple.js`와 기능 중복 → **비교용**으로만 봐주세요 |
| `demo.html` | parts.v3.json + 빌더 렌더 데모 | 동작 확인용 |
| `RESEARCH.md` | API 리서치 (엔드포인트·버전 핀·ID 체계) | 참고용 |
| `prototype_avatar.png` / `default_loadout.png` | 렌더 성공 샘플 | 참고용 |

## 13-2님이 가져가시면 되는 것

1. **`parts.v3.json`의 `parts` 배열** — `maple_item_id` 27개가 실측된 진짜 ID예요.
   스키마는 13-2님 v3에 맞게 필드명만 옮기시면 돼요.
2. 렌더 URL 포맷이 막히면 `RESEARCH.md` 1절 or `mapleAvatar.js` 참고.

## 주의

- ⚠️ API 버전은 **214로 핀** (`"latest"`는 404)
- 렌더 URL의 items는 `[{itemId, region:"GMS", version:"214"}, ...]` JSON을 URL 인코딩 (양끝 `[]` 제거)
- 스킨 2개(2000, 12000)는 항상 포함

막히는 부분 있으면 13호님 통해서 물어봐주세요! 🍁
