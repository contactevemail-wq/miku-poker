# 🃏 포커 웹앱 개발 인계 문서 (보조 분신용)

> 2026-10-08 · 13호 작성 → 13-1이 2026-10-08 작업분 반영
> 기획안: `~/workspace/poker/plan.md` (v6)
> 우선순위: 텍사스 홀덤 기본 게임 → 카드 쪼기 → 캐릭터 커스텀/아바타 → 파인애플→블랙잭→7포커

## 현재 완성 상태

### ✅ 서버 (완성, 테스트 통과)
- `app/server/poker-engine.js` — 덱·셔플·7장 핸드 평가기 (14개 평가 테스트 통과) + 블랙잭 `bjValue`/`isBlackjack` (13-1)
- `app/server/table.js` — 테이블 상태머신 (블라인드·베팅·사이드팟·쇼다운, 300핸드 시뮬레이션 칩 보존 통과)
  - 13-1 리팩터링: 게임별 훅 추출 (`dealHoleCards`·`streetOrder`·`dealCommunity`·`showdownValue`·`onHandDealt`) + `GAME_TABLES` 레지스트리 + 앤티용 `postAnte`
  - `PineappleTable` (classic/crazy, 디스카드 페이즈 + 30초 자동버림 타이머)
  - `BlackjackTable` (독립 클래스: hit/stand/double, 딜러 17 히트, 배당 승2배/BJ2.5배/푸시1배)
  - `SevenStudTable` (앤티+브링인, 3rd~7th 스트릿, 업/다운카드, 최고업카드 선공, 최대 7명)
- `app/server/db.js` — SQLite (users·game_records·skins, PIN scrypt 해시, 첫 가입자=마스터)
  - 13-1 추가 (13호 스펙 v2): `avatar_parts`(id, slot, name, price, file, rarity, maple_item_id)·`user_parts`(user_id, part_id) + `users.equipped` (장착 JSON) + 스킨 `upsertSkin`/`setSkinEnabled`/`listSkins`
  - **파츠 정본 = v3 메이플 카탈로그** (`maple-research/parts_catalog.json`, 6부위 27종): 서버 시작 시 `syncAvatarParts()`로 자동 동기화 → **13호 최종 결정 (2026-10-08): v3(메이플) 통일, v2 자작 폐기**
  - 슬롯 6종: hair/face/top/bottom/hat/shoes · rarity: free/common/rare/legendary · 렌더는 `maple_item_id`로 maplestory.io
  - `DB_PATH` 환경변수로 테스트 DB 분리 가능
  - `DB_PATH` 환경변수로 테스트 DB 분리 가능
- `app/server/skin-manager.js` (13-1 신규) — `skins/` 스캔/검증 (skin.json+back.png+앞면52장, 5:7 비율, PNG IHDR 파싱·의존성 없음)
- `app/server/index.js` — Express + Socket.IO (방/입장/게임진행/채팅/마스터 패널 API)
  - 13-1 추가: `GET /api/avatar-shop`, `GET /api/skins`(스캔 연동), `/avatar-assets` 정적 서빙
  - 소켓: `shop_list`·`shop_buy`·`equip_avatar`, `discard`(파인애플), 마스터 전용 `master_skin_refresh`·`master_skin_list`·`master_skin_toggle`
  - `POST /api/skins/upload` (마스터 전용, zip): `?name=&pin=&skinName=` + `Content-Type: application/zip` → 검증 후 `skins/<skinName>/` 등록, 실패 시 문제 파일 목록 반환
  - 방 비밀번호 (13-1): `create_room`의 `settings.password` (선택, 최대 20자) → `join_room({code, password})`에서 검증 (재접속은 제외), `room_update`에 `hasPassword` 표시 (비밀번호 자체는 미노출)
  - `publicState` players에 `avatar`·`color`·`title`·`equipped` 포함 (게임 시작 시 스냅샷, `update_profile`/`equip_avatar` 시 테이블 동기화)
  - 방 설정 기본값 추가: `pineappleVariant:'classic'`, `blackjackBet:100`, `studAnte:10`
  - `create_room`에서 gameType을 레지스트리로 검증 (holdem/pineapple/blackjack/sevenstud)
- 테스트 전부 통과 (총 191개):
  - `test-engine.js` 14+300 · `test-integration.js` 13 · `test-shop.js` 27 · `test-skins.js` 18 · `test-skins-upload.js` 11
  - `test-pineapple.js` 38 · `test-blackjack.js` 33 · `test-stud.js` 25 · `test-room-features.js` 12
- 실행: `cd app/server && node index.js` (PORT 환경변수, 기본 3000)

### 🔨 클라이언트 (부분 완성)
- 완성: `client/src/socket.js`, `App.jsx` (화면 라우팅), `styles.css` (펠트 테마),
  `components/Auth.jsx` (가입/로그인), `components/Card.jsx` (카드 쪼기 인터랙션 ⭐)
- 미완성: `Lobby.jsx` (작성 중 인터럽트됨 — 처음부터 다시), `Room.jsx`, `Table.jsx`,
  `MasterPanel.jsx`, `Records.jsx`, `Profile.jsx`
- 실행: `cd app/client && npm run dev` (Vite)

### 📐 기획 핵심 (v6)
- 계정제: 이름 + 숫자 4자리 → 마스터 승인 후 입장
- 칩 계정 귀속, 바이인 방식, 마스터 칩 지급/회수
- 카드 쪼기: 클릭=바로공개 / 꾹누름·드래그=점진적 들림 (Card.jsx 구현됨)
- 메이플식 모듈러 아바타 (6부위 파츠) + 칩으로 파츠 구매하는 아바타 상점
- 카드 스킨: 클래식(SVG) + MIKU(밋다미쿠콘풍 치비 뒷면 아트) + `skins/` 확장 구조

## 역할 분담안

### 13-1: 서버/게임엔진 ✅ 전부 완료 (2026-10-08)
- [x] 파인애플·블랙잭·7포커 엔진 추가 (`GAME_TABLES` 등록, 소켓 E2E 검증 완료)
- [x] 아바타 상점 API (파츠 목록·구매·장착), 스킨 업로드/검증 API
- [x] `table.js` 리팩터링 (게임별 테이블 추상화, 기존 테스트 전부 그린 유지)

### 13-2: 클라이언트 UI
- Lobby.jsx, Room.jsx, Table.jsx (좌석 배치·액션바·채팅), MasterPanel.jsx, Records.jsx, Profile.jsx
- 아바타 조합 UI + 아바타 상점 UI
- Card.jsx 스킨 적용 (classic/miku 스킨 전환)
- **13-1 API 메모 (Table.jsx 연동용)**:
  - `table_update`의 `gameType`으로 분기: `holdem`·`pineapple`·`blackjack`·`sevenstud`
  - 파인애플: `isDiscardPhase===true`면 `discard({cardIndex})` 전송 (3장 중 버릴 카드 인덱스)
  - 블랙잭: 액션 `hit`·`stand`·`double`, `dealer` 객체 (홀카드 히든), `betAmount`
  - 스터드: `hand[].up`으로 업/다운 구분 표시, `ante`·`smallBet`·`bigBet`
  - 상점: `shop_list` → `{slots, parts, owned, loadout, chips}`, `shop_buy({partId})`, `equip_avatar({partId})`
    - parts 항목: `{id, slot, name, price, file, rarity, maple_item_id}` (v3 메이플 27종, 렌더는 `maple_item_id`로 maplestory.io)
    - slots 6종: hair/face/top/bottom/hat/shoes
  - 마스터 패널: `master_skin_refresh` (폴더 드롭 후), `master_skin_list`, `master_skin_toggle({key, enabled})`
  - 스킨 zip 업로드: `POST /api/skins/upload?name=마스터&pin=1234&skinName=myskin` (`Content-Type: application/zip`, 쿼리는 URL 인코딩 필수)
  - 방 생성 시 `gameType` + `pineappleVariant`('classic'|'crazy')·`blackjackBet`·`studAnte` 설정 전달
  - 스터드 방은 7명 초과 시 시작 에러 ("7포커는 최대 7명이에요")

### 13-3: 아바타/아트
- ~~메이플식 아바타 베이스 바디 + 6부위 파츠 세트~~ → **13호 최종 결정 (2026-10-08): v3(메이플) 통일, v2 자작 폐기**
  - `/avatar-assets/`의 v2 자작 PNG 24장은 13-1이 제거함 (원본 `avatar-archive/v2-selfmade/`는 보존)
  - 렌더는 maplestory.io API 방식 (클라이언트 `maple.js`)
- 미쿠 카드 뒷면 아트 (밋다미쿠콘풍 치비, 750×1050)
  - 완성 후 `app/skins/miku/` 폴더에 53장 + skin.json 배치 → 마스터 패널 "스킨 새로고침"
  - 스킨 제작 가이드는 `app/skins/_template/README.md` 참고
- 참고: `~/workspace/poker/avatar-examples/` 예시 2종

## 개발 규칙
- 서버: `node --check` + 아래 전부 통과 필수
  - `node test-engine.js` · `DB_PATH=/tmp/t.db node test-integration.js`(서버 별도 기동)
  - `DB_PATH=/tmp/t.db node test-shop.js` · `node test-skins.js`
  - `node test-pineapple.js` · `node test-blackjack.js` · `node test-stud.js`
- 클라이언트: `npm run build` 에러 없이 통과
- DB 스키마 변경 시 `db.js`에 마이그레이션 주석 남기기
- 질문·차단은 13호(본 채팅)에 보고, 마스터 호출 금지

## 13-1 작업 중 발견 사항 (13호 참고)
- `app/skins/miku/` 폴더가 비어있어 스킨 검증에서 invalid로 잡힘 — 13-3 아트 완료 후 새로고침하면 등록됨 (정상)
- dev DB(`app/server/poker.db`)가 01:55경 비어있는 상태로 재생성된 것을 발견 → 백업(`/tmp/poker.db.bak3`)으로 복구함 (마스터 9990·친구1 15010·기록 1건). 누가 초기화했는지 확인 필요
- 스터드 브링인은 v1에서 스몰벳 풀벳으로 단순화 (하프 브링인+컴플리션 특례 생략)
- 블랙잭은 플레이어 vs 하우스라 칩 총량 보존이 아니라 정산 일치성으로 검증함
