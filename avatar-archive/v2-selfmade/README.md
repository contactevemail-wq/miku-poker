# 🖌️ 아바타 파츠 (13-3 제작, v2)

메이플식 모듈러 아바타 에셋 — 13-3 자작 (PIL 드로잉, 라이선스 클린, `PROVENANCE.md` 참조).

## 스펙
- 캔버스: 512×768 PNG, 투명 배경
- 합성 순서 (뒤→앞): `hair_back` → `base` → `bottom` → `top` → `face` → `hair_front` → `hat` → `accessory`
- `hair` 카테고리는 1부위지만 앞/뒤 2개 PNG
- 파츠 목록·가격·레어도: `parts.json` 참조 (13-2 아바타 조합 UI·상점 UI 연동용)

## 합성 예시 (JS/Canvas)
```js
// parts.json → layer_order 순서대로 drawImage (모두 같은 512×768 좌표계)
// hair 파츠는 files[0]=back(맨 뒤), files[1]=front(face 뒤)
const order = ["hair_back","base","bottom","top","face","hair_front","hat","accessory"];
```

## 레어도별 가격표 (13-3 제안)

| 레어도 | 가격 | 파츠 |
|---|---|---|
| 기본 (무료) | 0칩 | 기본 트윈테일·미소·기본 민소매·기본 치마·모자 없음·스퀘어 헤어 액세서리 |
| 일반 | 1,500~3,000칩 | 윙크(3,000)·핑크 민소매(2,000)·핑크 치마(2,000)·동글이 안경(2,000)·빨간 리본(2,500)·별 헤어핀(1,500) |
| 레어 | 4,000~6,000칩 | 사쿠라 트윈테일(5,000)·유키 트윈테일(6,000)·하트눈(5,000)·청록 후드(5,000)·청바지(4,000)·DJ 헤드폰(5,000) |
| 전설 | 12,000칩 | 골드 트윈테일(12,000) |

- 초기 칩 10,000 기준: 일반은 바로 구매 가능, 레어는 몇 판 모아야, 전설은 목표 의식용
- 가격 조정은 `parts.json`의 price만 바꾸면 됨 (스크립트 재실행 불필요)

## 파일
- `build` 스크립트: `~/workspace/poker/avatar-parts/build_avatar.py`
- `preview_default.png` — 기본 세트 미리보기 / `preview_premium.png` — 전설 조합 미리보기
