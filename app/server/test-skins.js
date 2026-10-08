// 🃏 카드 스킨 스캔/검증 테스트 (13-1)
// 실행: node test-skins.js (스캔은 /tmp 가짜 skins 폴더 사용, DB는 임시 DB)
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DB_PATH = '/tmp/test-skins.db';
try { rmSync('/tmp/test-skins.db'); } catch {}
try { rmSync('/tmp/fake-skins', { recursive: true }); } catch {}

const sm = await import('./skin-manager.js');
const db = await import('./db.js');
await db.initPromise;

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

/** 최소 PNG 버퍼 (IHDR까지만 — 검증기가 읽는 범위) */
function miniPng(w, h) {
  const buf = Buffer.alloc(33);
  buf.writeUInt32BE(0x89504e47, 0); buf.writeUInt32BE(0x0d0a1a0a, 4); // 시그니처
  buf.writeUInt32BE(13, 8); buf.write('IHDR', 12);
  buf.writeUInt32BE(w, 16); buf.writeUInt32BE(h, 20);
  buf[24] = 8; buf[25] = 2; // bit depth / color type
  return buf;
}

/** 가짜 스킨 폴더 1개 생성. opts: {ratioOk, missing:[...], badJson} */
function makeSkin(dir, opts = {}) {
  mkdirSync(dir, { recursive: true });
  const meta = opts.badJson ? '{broken' : JSON.stringify({ name: '테스트 스킨' });
  writeFileSync(path.join(dir, 'skin.json'), meta);
  const [w, h] = opts.ratioOk === false ? [800, 600] : [750, 1050];
  if (!opts.missing?.includes('back.png')) {
    writeFileSync(path.join(dir, 'back.png'), miniPng(w, h));
  }
  for (const f of sm.faceFileNames()) {
    if (opts.missing?.includes(f)) continue;
    writeFileSync(path.join(dir, f), miniPng(w, h));
  }
}

// 1. pngSize: 정상 PNG / 일반 파일 / 없는 파일
const tmpPng = '/tmp/fake-skins-probe.png';
writeFileSync(tmpPng, miniPng(750, 1050));
const sz = sm.pngSize(tmpPng);
ok(sz?.width === 750 && sz?.height === 1050, 'pngSize 정상 파싱');
writeFileSync('/tmp/fake-skins-probe.txt', 'hello');
ok(sm.pngSize('/tmp/fake-skins-probe.txt') === null, 'PNG 아님 → null');
ok(sm.pngSize('/tmp/no-such-file.png') === null, '없는 파일 → null');

// 2. 비율 판정
ok(sm.isFiveToSeven(750, 1050), '750x1050 = 5:7');
ok(!sm.isFiveToSeven(800, 600), '800x600 ≠ 5:7');

// 3. 파일명 규칙: 52장
const faces = sm.faceFileNames();
ok(faces.length === 52, '앞면 52장');
ok(faces.includes('AS.png') && faces.includes('10H.png') && faces.includes('KD.png'), '작명 규칙');

// 4. 정상 스킨 → valid
const goodDir = '/tmp/fake-skins/goodskin';
makeSkin(goodDir);
let v = sm.validateSkin(goodDir);
ok(v.valid, `정상 스킨 valid (에러: ${v.errors.join('; ')})`);

// 5. 파일 누락 → 에러 목록에 표시
const missDir = '/tmp/fake-skins/badskin';
makeSkin(missDir, { missing: ['AS.png', '10H.png', 'back.png'] });
v = sm.validateSkin(missDir);
ok(!v.valid && v.errors.includes('AS.png 없음') && v.errors.includes('back.png 없음'),
  '누락 파일 에러 목록');

// 6. 비율 불량 → 에러
const ratioDir = '/tmp/fake-skins/ratioskin';
makeSkin(ratioDir, { ratioOk: false });
v = sm.validateSkin(ratioDir);
ok(!v.valid && v.errors.some((e) => e.includes('5:7')), '비율 불량 에러');

// 7. skin.json 깨짐 → 에러
const jsonDir = '/tmp/fake-skins/jsonskin';
makeSkin(jsonDir, { badJson: true });
v = sm.validateSkin(jsonDir);
ok(!v.valid && v.errors.some((e) => e.includes('skin.json')), 'skin.json 파싱 에러');

// 8. scanSkins: _template·숨김폴더 제외, 정렬
mkdirSync('/tmp/fake-skins/_template', { recursive: true });
mkdirSync('/tmp/fake-skins/.hidden', { recursive: true });
const scanned = sm.scanSkins('/tmp/fake-skins');
const keys = scanned.map((s) => s.key);
ok(!keys.includes('_template') && !keys.includes('.hidden'), '_template·숨김 제외');
ok(keys.includes('goodskin') && scanned.find((s) => s.key === 'goodskin').valid, 'goodskin 스캔');
ok(scanned.find((s) => s.key === 'badskin') && !scanned.find((s) => s.key === 'badskin').valid, 'badskin 무효 판정');

// 9. DB upsert/toggle/list
await db.upsertSkin('goodskin', '테스트 스킨');
await db.upsertSkin('goodskin', '개명된 스킨'); // 이름 갱신
let skins = await db.listSkins();
ok(skins.find((s) => s.key === 'goodskin')?.name === '개명된 스킨', 'upsert 이름 갱신');
await db.setSkinEnabled('goodskin', false);
ok((await db.listSkins()).find((s) => s.key === 'goodskin').enabled === 0, '비활성화');
try { await db.setSkinEnabled('nope', true); ok(false, '없는 스킨 토글 차단'); }
catch (e) { ok(e.message.includes('없는 스킨'), '없는 스킨 토글 차단'); }

// 10. 실제 skins/ 폴더 스캔 (_template만 있으면 빈 결과)
const real = sm.scanSkins(path.join(__dirname, '..', 'skins'));
ok(Array.isArray(real) && !real.some((s) => s.key === '_template'), '실제 skins/ 스캔 (_template 제외)');

console.log(`\n스킨 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
