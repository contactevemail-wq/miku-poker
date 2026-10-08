// 🃏 기록 조회 — 내 기록 / 전체 최근 게임 (13-2 작성)
import { useState, useEffect } from 'react';
import { emitAsync } from '../socket';

function RecordList({ records }) {
  if (!records.length) return <p className="sub">아직 기록된 게임이 없어요</p>;
  return (
    <>
      {records.map((r) => {
        let results = [];
        try { results = JSON.parse(r.results || '[]'); } catch { /* ignore */ }
        return (
          <div key={r.id} className="history-item">
            <div style={{ fontWeight: 800 }}>
              🏆 {r.winner_name} <span className="hint">{r.game_type} · {r.mode} · {r.player_count}명</span>
            </div>
            <div className="hint">{r.played_at}</div>
            <div style={{ marginTop: 4, fontSize: 13 }}>
              {results.map((x) => `${x.rank}등 ${x.name}(${x.profit > 0 ? '+' : ''}${x.profit})`).join(' · ')}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function Records({ onBack }) {
  const [tab, setTab] = useState('mine');
  const [mine, setMine] = useState([]);
  const [all, setAll] = useState([]);

  useEffect(() => {
    emitAsync('my_records').then((r) => { if (!r.error) setMine(r.records || []); }).catch(() => {});
    fetch('/api/records').then((r) => r.json()).then(setAll).catch(() => {});
  }, []);

  return (
    <>
      <div className="topbar" style={{ background: 'none', padding: '0 0 12px' }}>
        <h1 style={{ margin: 0 }}>📜 게임 기록</h1>
        <button onClick={onBack}>돌아가기</button>
      </div>
      <div className="tabs">
        <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
          내 기록 ({mine.length})
        </button>
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>전체 최근 게임</button>
      </div>
      {tab === 'mine' ? <RecordList records={mine} /> : <RecordList records={all} />}
    </>
  );
}
