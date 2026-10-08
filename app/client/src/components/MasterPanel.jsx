// 🃏 마스터 관리 패널 — 가입 승인 · 유저/칩 관리 · 전체 기록 (13-2 작성)
import { useState, useEffect, useCallback } from 'react';
import { emitAsync } from '../socket';

function PendingTab() {
  const [list, setList] = useState([]);
  const load = useCallback(async () => {
    const r = await emitAsync('master_pending');
    if (!r.error) setList(r.users || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (userId, ok) => {
    const r = await emitAsync('master_approve', { userId, ok });
    if (!r.error) load();
  };

  if (!list.length) return <p className="sub">승인 대기 중인 가입 신청이 없어요 🎉</p>;
  return (
    <div className="lobby-list">
      {list.map((u) => (
        <div key={u.id} className="lobby-player">
          <div className="dot" style={{ background: '#d97706' }}>{u.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{u.name}</div>
            <div className="hint">신청: {u.created_at}</div>
          </div>
          <button className="primary" onClick={() => decide(u.id, true)}>승인</button>
          <button className="danger" onClick={() => decide(u.id, false)}>거부</button>
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const [list, setList] = useState([]);
  const [amounts, setAmounts] = useState({});
  const load = useCallback(async () => {
    const r = await emitAsync('master_users');
    if (!r.error) setList(r.users || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const give = async (userId, delta) => {
    const r = await emitAsync('master_give_chips', { userId, amount: delta });
    if (!r.error) load();
  };
  const setChips = async (userId) => {
    const v = Number(amounts[userId]);
    if (!Number.isFinite(v) || v < 0) return;
    const r = await emitAsync('master_set_chips', { userId, chips: v });
    if (!r.error) { load(); setAmounts((a) => ({ ...a, [userId]: '' })); }
  };

  return (
    <table className="master-table">
      <thead>
        <tr><th>이름</th><th>칩</th><th>지급/회수</th><th>설정</th></tr>
      </thead>
      <tbody>
        {list.map((u) => (
          <tr key={u.id}>
            <td>
              <b style={{ color: u.color }}>{u.name}</b>
              {u.is_master ? ' 👑' : ''}{u.approved ? '' : ' (미승인)'}
            </td>
            <td style={{ color: 'var(--gold)', fontWeight: 800 }}>{u.chips?.toLocaleString()}</td>
            <td>
              <div className="row">
                <button onClick={() => give(u.id, 10000)}>+1만</button>
                <button onClick={() => give(u.id, -10000)}>-1만</button>
              </div>
            </td>
            <td>
              <div className="row">
                <input placeholder="칩 직접 입력" type="number"
                  value={amounts[u.id] ?? ''}
                  onChange={(e) => setAmounts((a) => ({ ...a, [u.id]: e.target.value }))}
                  style={{ maxWidth: 120 }} />
                <button onClick={() => setChips(u.id)}>설정</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecordsTab() {
  const [records, setRecords] = useState([]);
  useEffect(() => {
    fetch('/api/records').then((r) => r.json()).then(setRecords).catch(() => {});
  }, []);
  if (!records.length) return <p className="sub">아직 기록된 게임이 없어요</p>;
  return (
    <>
      {records.map((r) => {
        let results = [];
        try { results = JSON.parse(r.results || '[]'); } catch { /* ignore */ }
        return (
          <div key={r.id} className="history-item">
            <div style={{ fontWeight: 800 }}>
              🏆 {r.winner_name} <span className="hint">{r.game_type} · {r.mode} · {r.player_count}명 · {r.played_at}</span>
            </div>
            <div className="hint">
              {results.map((x) => `${x.rank}등 ${x.name}(${x.profit > 0 ? '+' : ''}${x.profit})`).join(' · ')}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function MasterPanel({ onBack }) {
  const [tab, setTab] = useState('pending');
  return (
    <>
      <div className="topbar" style={{ background: 'none', padding: '0 0 12px' }}>
        <h1 style={{ margin: 0 }}>👑 마스터 패널</h1>
        <button onClick={onBack}>돌아가기</button>
      </div>
      <div className="tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>가입 승인</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>유저 · 칩 관리</button>
        <button className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}>전체 기록</button>
      </div>
      {tab === 'pending' && <PendingTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'records' && <RecordsTab />}
    </>
  );
}
