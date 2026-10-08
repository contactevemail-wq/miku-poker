# 🍁 메이플 아바타 리서치 (13-3, 2026-10-08)

마스터 결정 "걍 우리끼리만 쓰는거라서 ㄱㅊ음" → 메이플스토리 스타일 에셋 사용 확정.
자작 파츠 v2는 `~/workspace/poker/avatar-archive/v2-selfmade/`에 아카이빙 (삭제 없음).

## 1. maplestory.design 구조 파악

- `crrio/maplestory.design` = 웹 캐릭터 시뮬레이터 (React, MIT 라이선스)
- **실제 렌더링은 내부적으로 maplestory.io API를 호출** — 자체 에셋을 들고 있지 않음
- 레이어링(z-order)은 API 서버가 WZ 데이터를 기준으로 자동 합성 → 클라이언트는 아이템 ID 목록만 전달

### 렌더 API (동작 확인済)

```
https://maplestory.io/api/character/{PAYLOAD}/stand1/0?resize=3
```

- `{PAYLOAD}` = JSON 배열을 URL 인코딩한 것 (양 끝 `[` `]` 제거):
  `[{"itemId":2000,"region":"GMS","version":"214"},{"itemId":12000,...},...]`
- 필수 엔트리: 스킨 2개 (`skin` + `skin+10000`, 기본 스킨=2000)
- 선택 엔트리: 얼굴·헤어·모자·상의·하의·신발 등 아이템 ID
- 쿼리 파라미터: `resize` (배율), `flipX`, `showears`, `name`, `bgColor` 등
- 액션: `stand1` (서 있기), 프레임 `0`
- ⚠️ **버전은 반드시 명시** (`"version":"214"`) — `"latest"`는 404
- ⚠️ 얼굴 아이템(20000~29999)은 표정 애니메이션 포함

### 아이템 ID 체계 (GMS 214 기준, 실측)

| 부위 | ID 범위 | 예시 (확인済) |
|---|---|---|
| 스킨 | 2000 (+10000) | 2000 (기본) |
| 얼굴 | 20000~29999 | 20021 Overjoyed Smile |
| 헤어 | 30000~39999 | 31310 Black Carla |
| 모자 | 1000000~ | 1002140 Wizet Invincible Hat |
| 상의 | 1040000~ | 1042004 Pink Hooded Vest |
| 하의 | 1060000~ | 1062000 Ice Jeans |
| 신발 | 1070000~ | 1072006 Brown Basic Boots |

- 아이템 정보 조회: `GET https://maplestory.io/api/GMS/214/item/{id}`
  → `description.name` (이름), `frameBooks` (base64 PNG 포함)

## 2. 에셋 획득 방법 비교

### Option A. 직접 렌더 API 활용 (권장 ⭐)

- 클라이언트에서 `<img src="https://maplestory.io/api/character/...">` 로 바로 표시
- 장점: 에셋 호스팅 불필요, 카탈로그 무한대(전 메이플 아이템), 레이어링 서버가 처리
- 단점: 외부 의존성 (API 장애 시 아바타 표시 불가), 전신 렌더라 좌석용으론 CSS 크롭 필요
- 완화책: 우리 서버에서 프록시+캐싱하면 장애·속도 문제 대부분 해결

### Option B. 에셋 PNG 다운로드 후 로컬 호스팅

- `/api/GMS/214/item/{id}` 의 `frameBooks`에서 base64 PNG 추출 → 우리 서버에 저장
- 장점: 완전 오프라인, 우리 parts.json 구조 그대로 사용 가능
- 단점: 메이플 z-레이어링을 직접 구현해야 함 (부위별·프레임별 z-index가 복잡),
  파츠 수백 종 수집·정리 공수가 큼

**결론: Option A (렌더 API + 서버 캐싱) 권장.**
상점 파츠 = 아이템 ID 목록, 로드아웃 = ID 조합 → 렌더 URL 생성. 기존 parts.json는
`maple_item_id` 필드 추가로 그대로 활용 가능.

## 3. 적용 방안 (우리 시스템에 맞게)

### parts.json v3 스키마 제안

```json
{
  "id": "hair_carla_black",
  "slot": "hair",
  "name": "블랙 칼라 헤어",
  "rarity": "rare",
  "price": 5000,
  "maple_item_id": 31310
}
```

- `file` 필드 → `maple_item_id` 로 교체 (PNG 합성 불필요)
- 클라이언트: 장착 중인 파츠들의 `maple_item_id` 수집 → 렌더 URL 조립 → `<img>` 표시
- URL 조립 헬퍼 (JS):

```js
function mapleAvatarUrl(itemIds, resize = 3) {
  const V = "214";
  const entries = [2000, 12000, ...itemIds]
    .map(id => ({ itemId: id, region: "GMS", version: V }));
  const payload = encodeURIComponent(JSON.stringify(entries).slice(1, -1));
  return `https://maplestory.io/api/character/${payload}/stand1/0?resize=${resize}`;
}
```

### 좌석 표시

- 렌더 결과는 전신(약 86×140 @resize=3) → 포커 좌석엔 CSS로 상반신 크롭하거나 작게 표시
- 상점 미리보기는 전신 그대로 사용

## 4. 프로토타입

- `prototype_avatar.png` — 렌더 성공 ✅ (직접 육안 확인)
- 구성: 스킨 2000 + Overjoyed Smile(20021) + Black Carla(31310)
  + Pink Hooded Vest(1042004) + Ice Jeans(1062000) + Brown Basic Boots(1072006)
- `stand1/0`, `resize=3`

## 5. 주의사항

- 저작권: 넥슨 에셋. 마스터가 프라이빗(친구 전용) 사용으로 리스크 감수 결정済
- API 버전 핀: 214 고정 (메이플 패치 시 신규 버전으로 갱신 검토)
- API 상태: 2026-10-08 기준 정상 (`/api/health/alive` alive)
