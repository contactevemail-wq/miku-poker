// 🃏 로딩 화면 — 마술사 미쿠 아트 (마스터 제공, 13호 지시로 13-2 작성)
// public/loading-miku.png (1122×1600) → /loading-miku.png 로 서빙
import { useEffect, useState } from 'react';

let preloaded = false;
/** 이미지 프리로딩 (깜빡임 방지) — 앱 부팅 시 1회 호출 */
export function preloadLoadingArt() {
  if (preloaded) return;
  preloaded = true;
  const img = new Image();
  img.src = '/loading-miku.png';
}

export default function LoadingScreen({ message = '입장 중...' }) {
  const [ready, setReady] = useState(preloaded);
  useEffect(() => {
    if (preloaded) return;
    const img = new Image();
    img.onload = () => { preloaded = true; setReady(true); };
    img.onerror = () => setReady(true); // 로드 실패해도 스피너는 보여주기
    img.src = '/loading-miku.png';
  }, []);

  return (
    <div className="loading-screen">
      {ready && <img className="loading-bg" src="/loading-miku.png" alt="" />}
      <div className="loading-shade" />
      <div className="loading-content">
        <h1>🃏 <span className="suit">프라이빗 포커</span></h1>
        <div className="spinner" />
        <p>{message}</p>
      </div>
    </div>
  );
}
