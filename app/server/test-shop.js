// 🃏 아바타 상점 테스트 (13-1)
// 실행: DB_PATH=/tmp/test-shop.db node test-shop.js (임시 DB 사용)
// 파츠 정본: v3 메이플 카탈로그 (maple-research/parts_catalog.json, 6부위 27종)
//   → 13호 최종 결정 (2026-10-08): v3(메이플) 통일
import { unlinkSync, existsSync } from 'fs';

const db = await import('./db.js');

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

// 1. 카탈로그 동기화: 27종, 6슬롯 커버
const parts = db.listAvatarParts();
ok(parts.length === 27, `카탈로그 파츠 27종 (실제 ${parts.length})`);
const slots = new Set(parts.map((p) => p.slot));
ok(db.AVATAR_SLOTS.length === 6 && db.AVATAR_SLOTS.every((s) => slots.has(s)), '6슬롯 전부 커버 (acc 없음)');
ok(!slots.has('acc'), 'acc 슬롯 폐지');
ok(parts.every((p) => typeof p.rarity === 'string' && Number.isInteger(p.maple_item_id)), 'rarity·maple_item_id 컬럼');

// 2. 카탈로그 값 일치
const smile = parts.find((p) => p.id === 'face_smile');
ok(smile && smile.price === 0 && smile.maple_item_id === 20021, 'face_smile = v3(함박웃음) 우선');
const roxy = parts.find((p) => p.id === 'hair_roxy_red');
ok(roxy && roxy.price === 12000 && roxy.rarity === 'legendary', 'hair_roxy_red 전설 12000칩');
const jangoon = parts.find((p) => p.id === 'shoes_jangoon');
ok(jangoon && jangoon.slot === 'shoes' && jangoon.price === 0, 'shoes_jangoon 기본');
ok(!parts.some((p) => p.id === 'acc_headset'), 'v2 잔재 제거 (acc_headset)');
ok(!parts.some((p) => p.id === 'hair_twintail'), 'v2 잔재 제거 (hair_twintail)');

// 3. 유저 생성 (첫 가입자=마스터, 칩 10000)
const u = db.createUser('상점테스터', '9999');
ok(u.chips === 10000, '초기 칩 10000');
const uid = u.id;

// 4. 무료 파츠 구매 → 칩 변동 없음
let r = db.buyAvatarPart(uid, 'face_smile');
ok(r.chips === 10000, '무료 파츠 구매 시 칩 유지');
ok(db.myAvatarParts(uid).includes('face_smile'), '무료 파츠 소유권');

// 5. 유료 파츠 구매 → 칩 차감 (face_pout 3000)
r = db.buyAvatarPart(uid, 'face_pout');
ok(r.chips === 7000, `유료 파츠 구매 후 칩 7000 (실제 ${r.chips})`);
ok(db.myAvatarParts(uid).includes('face_pout'), '유료 파츠 소유권');

// 6. 중복 구매 → 에러
try { db.buyAvatarPart(uid, 'face_pout'); ok(false, '중복 구매 차단'); }
catch (e) { ok(e.message.includes('이미 가지고'), '중복 구매 차단'); }

// 7. 칩 부족 → 에러, 칩 변동 없음 (hair_roxy_red 12000)
db.setChips(uid, 500);
try { db.buyAvatarPart(uid, 'hair_roxy_red'); ok(false, '칩 부족 차단'); }
catch (e) { ok(e.message.includes('칩이 부족'), '칩 부족 차단'); }
ok(db.getUser(uid).chips === 500, '실패 시 칩 변동 없음');
ok(!db.myAvatarParts(uid).includes('hair_roxy_red'), '실패 시 소유권 없음');

// 8. 장착: 소유 파츠 OK
db.setChips(uid, 10000);
let loadout = db.equipAvatarPart(uid, 'face_pout');
ok(loadout.face === 'face_pout', '유료 파츠 장착');
loadout = db.equipAvatarPart(uid, 'hair_carla_black');
ok(loadout.hair === 'hair_carla_black' && loadout.face === 'face_pout', '슬롯별 장착 유지');

// 9. 장착: 미소유 유료 파츠 → 에러
try { db.equipAvatarPart(uid, 'hat_kitty'); ok(false, '미소유 장착 차단'); }
catch (e) { ok(e.message.includes('구매'), '미소유 장착 차단'); }

// 10. 장착: 무료 파츠는 구매 없이도 장착 가능
loadout = db.equipAvatarPart(uid, 'top_hoodie_orange');
ok(loadout.top === 'top_hoodie_orange', '무료 파츠 바로 장착');

// 11. 장착: 없는 파츠 → 에러
try { db.equipAvatarPart(uid, 'nope_xxx'); ok(false, '없는 파츠 차단'); }
catch (e) { ok(e.message.includes('없는 파츠'), '없는 파츠 차단'); }

// 12. loadout 영속성 (getUser에 equipped로 포함)
const u2 = db.getUser(uid);
ok(JSON.parse(u2.equipped).face === 'face_pout', 'loadout DB 영속성');

// 13. 신발 구매·장착
db.setChips(uid, 10000);
r = db.buyAvatarPart(uid, 'shoes_gomushin'); // 1500
ok(r.chips === 8500, `신발 구매 후 칩 8500 (실제 ${r.chips})`);
loadout = db.equipAvatarPart(uid, 'shoes_gomushin');
ok(loadout.shoes === 'shoes_gomushin', '신발 장착');

// 14. 재동기화 멱등성
const before = db.listAvatarParts().length;
const res = db.syncAvatarParts();
ok(res.synced === 27 && db.listAvatarParts().length === before, '재동기화 멱등');

console.log(`\n아바타 상점 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
