// 🃏 카드 스킨 zip 업로드 테스트 (13-1)
// 실행: node test-skins-upload.js (서버를 직접 띄워서 E2E)
import { spawn, execFile } from 'child_process';
import { createRequire } from 'module';
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3199;
const DB = '/tmp/test-skins-upload.db';
rmSync(DB, { force: true });

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };

const PY_ZIP = `
import sys, zipfile, os
out, srcdir = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w') as z:
    for root, _, files in os.walk(srcdir):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, srcdir))
`;

const miniPng = (w, h) => {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12);
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};

/** 가짜 스킨 폴더 → zip 파일 */
function makeSkinZip(zipPath, { valid = true, missingBack = false } = {}) {
  return new Promise((res, rej) => {
    const dir = '/tmp/fake-upload-skin';
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ name: '업로드 스킨' }));
    if (!missingBack) writeFileSync(path.join(dir, 'back.png'), miniPng(750, 1050));
    const R = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const S = ['S', 'H', 'D', 'C'];
    for (const s of S) for (const r of R) {
      if (!valid && r === 'A' && s === 'S') continue; // 불량이면 AS.png 누락
      writeFileSync(path.join(dir, `${r}${s}.png`), miniPng(750, 1050));
    }
    execFile('python3', ['-c', PY_ZIP, zipPath, dir], (e) => (e ? rej(e) : res()));
  });
}

const server = spawn('node', ['index.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), DB_PATH: DB },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 4000));

try {
  const URL = `http://localhost:${PORT}`;
  const api = async (p, b) => (await fetch(URL + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })).json();

  const m = await api('/api/signup', { name: '마스터', pin: '1234' });
  await api('/api/signup', { name: '친구1', pin: '5678' });
  ok(m.user?.is_master === 1, '마스터 가입');

  const upload = async (zipPath, params, contentType = 'application/zip') => {
    const buf = readFileSync(zipPath);
    // 한글 이름은 반드시 인코딩 (미인코딩 시 서버가 빈 400으로 끊음)
    const qs = new URLSearchParams(params).toString();
    const r = await fetch(`${URL}/api/skins/upload?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: buf,
    });
    return { status: r.status, body: await r.json() };
  };

  const skinsDir = path.join(__dirname, '..', 'skins');

  // 1. 정상 zip 업로드
  await makeSkinZip('/tmp/good-skin.zip', { valid: true });
  let r = await upload('/tmp/good-skin.zip', {name:'마스터',pin:'1234',skinName:'uploadskin'});
  ok(r.status === 200 && r.body.ok && r.body.key === 'uploadskin', `정상 업로드 (status ${r.status})`);
  ok(existsSync(path.join(skinsDir, 'uploadskin', 'back.png')), 'skins/에 등록됨');
  const skins = await (await fetch(`${URL}/api/skins`)).json();
  ok(skins.some((s) => s.key === 'uploadskin'), 'GET /api/skins에 노출');

  // 2. 불량 zip → 400 + errors
  await makeSkinZip('/tmp/bad-skin.zip', { valid: false });
  r = await upload('/tmp/bad-skin.zip', {name:'마스터',pin:'1234',skinName:'badskin'});
  ok(r.status === 400 && Array.isArray(r.body.errors) && r.body.errors.length > 0, '불량 zip 검증 실패 + errors');
  ok(!existsSync(path.join(skinsDir, 'badskin')), '불량은 등록 안 됨');

  // 3. back.png 누락
  await makeSkinZip('/tmp/noback-skin.zip', { valid: true, missingBack: true });
  r = await upload('/tmp/noback-skin.zip', {name:'마스터',pin:'1234',skinName:'noback'});
  ok(r.status === 400 && r.body.errors.some((e) => e.includes('back.png')), 'back.png 누락 검출');

  // 4. 비마스터 차단 (미승인 → 403, 틀린 핀 → 403)
  await makeSkinZip('/tmp/good2-skin.zip', { valid: true });
  r = await upload('/tmp/good2-skin.zip', {name:'친구1',pin:'5678',skinName:'hackskin'});
  ok(r.status === 403, '미승인 차단');
  r = await upload('/tmp/good2-skin.zip', {name:'마스터',pin:'0000',skinName:'hackskin2'});
  ok(r.status === 403, '틀린 핀 차단');

  // 5. zip 아님 → 400
  writeFileSync('/tmp/notzip.bin', Buffer.from('not a zip'));
  r = await upload('/tmp/notzip.bin', {name:'마스터',pin:'1234',skinName:'nozip'});
  ok(r.status === 400, 'zip 아님 차단');

  // 6. Content-Type 불일치 → 400 안내
  r = await upload('/tmp/good2-skin.zip', {name:'마스터',pin:'1234',skinName:'noct'}, 'text/plain');
  ok(r.status === 400, 'Content-Type 검증');

  // 정리: 테스트 스킨 제거
  rmSync(path.join(skinsDir, 'uploadskin'), { recursive: true, force: true });
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\n스킨 업로드 테스트: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
