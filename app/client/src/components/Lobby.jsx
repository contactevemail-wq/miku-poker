// 🃏 로비 — 방 만들기 / 초대 코드 입장 / 프로필 / 기록 / 마스터 패널 (13-2 작성)
import { useState, useEffect } from 'react';
import { socket, emitAsync } from '../socket';
import Avatar from './Avatar';
import Profile from './Profile';
import Records from './Records';
import MasterPanel from './MasterPanel';

const GAME_TYPES = [
  { key: 'holdem', name: '텍사스 홀덤', ready: true },
  { key: 'pineapple', name: '파인애플', ready: false },
  { key: 'blackjack', name: '블랙잭', ready: false },
  { key: 'seven', name: '7포커', ready: false },
];

const PRESETS = {
  light: {
    label: '가볍게 한 판', buyin: 10000, sb: 50, bb: 100, ante: 100,
    blindIntervalMin: 15, blindMult: 2, rebuyAllowed: true, rebuyMax: 3,
    mode: 'single', seriesCount: 5, finalScoring: 'chips', coinTable: [3, 2, 1],
  },
  serious: {
    label: '진지하게 시리즈', buyin: 10000, sb: 25, bb: 50, ante: 50,
    blindIntervalMin: 10, blindMult: 2, rebuyAllowed: true, rebuyMax: 2,
    mode: 'series', seriesCount: 5, finalScoring: 'coins', coinTable: [3, 2, 1],
  },
};

const DEFAULT_SETTINGS = { ...PRESETS.light };

function NumField({ label, value, onChange, min = 0, step = 1 }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" min={min} step={step} value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} />
    </div>
  );
}

function CreateForm({ onDone, onCancel }) {
  const [name, setName] = useState('');
  const [gameType, setGameType] = useState('holdem');
  const [password, setPassword] = useState('');
  const [botCount, setBotCount] = useState(0);
  const [botDifficulty, setBotDifficulty] = useState('normal');
  const [s, setS] = useState(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const applyPreset = (key) => setS({ ...PRESETS[key] });

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const settings = { ...s };
      if (password.trim()) settings.password = password.trim().slice(0, 20);
      settings.botCount = Math.max(0, Math.min(8, botCount | 0));
      settings.botDifficulty = ['easy', 'normal', 'hard'].includes(botDifficulty) ? botDifficulty : 'normal';
      const r = await emitAsync('create_room', { name: name.trim(), gameType, settings });
      if (r.error) setError(r.error);
      else onDone(r.code);
    } catch {
      setError('서버에 연결할 수 없어요');
    }
    setBusy(false);
  };

  return (
    <div className="card-page">
      <div className="panel" style={{ maxWidth: 560 }}>
        <h1>🃏 방 만들기</h1>
        <p className="sub">친구에게 초대 코드를 공유하세요</p>
        <div className="create-form">
          <div className="field">
            <label>게임 종류</label>
            <div className="segment">
              {GAME_TYPES.map((g) => (
                <button key={g.key} disabled={!g.ready}
                  className={gameType === g.key ? 'on' : ''}
                  onClick={() => g.ready && setGameType(g.key)}>
                  {g.name}{g.ready ? '' : ' (준비 중)'}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>방 이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="비워두면 '내 이름의 방'" maxLength={30} />
          </div>
          <div className="field">
            <label>방 비밀번호 (선택)</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="비워두면 누구나 입장 가능" maxLength={20} />
            <div className="hint">초대 코드와 함께 공유하세요</div>
          </div>
          <div className="field">
            <label>🤖 봇 추가 (0~8명)</label>
            <div className="row">
              <input type="range" min={0} max={8} step={1} value={botCount}
                onChange={(e) => setBotCount(parseInt(e.target.value, 10) || 0)}
                style={{ flex: 1 }} />
              <span style={{ minWidth: 44, textAlign: 'center', fontWeight: 800 }}>{botCount}명</span>
            </div>
            <div className="hint">혼자서도 플레이할 수 있어요!</div>
          </div>
          {botCount > 0 && (
            <div className="field">
              <label>봇 난이도</label>
              <div className="segment">
                <button className={botDifficulty === 'easy' ? 'on' : ''} onClick={() => setBotDifficulty('easy')}>😊 쉬움</button>
                <button className={botDifficulty === 'normal' ? 'on' : ''} onClick={() => setBotDifficulty('normal')}>😐 보통</button>
                <button className={botDifficulty === 'hard' ? 'on' : ''} onClick={() => setBotDifficulty('hard')}>😈 어려움</button>
              </div>
            </div>
          )}
          <div className="field">
            <label>설정 프리셋</label>
            <div className="preset-row">
              <button onClick={() => applyPreset('light')}>☕ {PRESETS.light.label}</button>
              <button onClick={() => applyPreset('serious')}>🔥 {PRESETS.serious.label}</button>
            </div>
          </div>
          <div className="settings-grid">
            <NumField label="바이인 (칩)" value={s.buyin} onChange={(v) => set('buyin', v)} min={100} step={100} />
            <NumField label="시작 SB / BB" value={s.sb} onChange={(v) => set('sb', v)} min={10} step={10} />
          </div>
          <div className="settings-grid">
            <NumField label="BB (빅 블라인드)" value={s.bb} onChange={(v) => { set('bb', v); set('ante', v); }} min={20} step={10} />
            <NumField label="블라인드 상승 간격 (분, 0=없음)" value={s.blindIntervalMin} onChange={(v) => set('blindIntervalMin', v)} />
          </div>
          <div className="settings-grid">
            <NumField label="블라인드 상승 배율" value={s.blindMult} onChange={(v) => set('blindMult', v)} min={1} step={0.5} />
            <NumField label="리바이 최대 횟수" value={s.rebuyMax} onChange={(v) => set('rebuyMax', v)} />
          </div>
          <div className="settings-grid">
            <NumField label="앤티 (0=없음)" value={s.ante || 0} onChange={(v) => set('ante', v)} min={0} step={10} />
            <div className="field">
              <label>
                <input type="checkbox" checked={!!s.anteAuto}
                  onChange={(e) => set('anteAuto', e.target.checked)} />
                {' '}앤티 자동 (BB÷인원)
              </label>
              <div className="hint">체크하면 BB를 인원수로 나눠서 자동 징수</div>
            </div>
          </div>
          <div className="field">
            <label>리바이 허용</label>
            <div className="segment">
              <button className={s.rebuyAllowed ? 'on' : ''} onClick={() => set('rebuyAllowed', true)}>허용</button>
              <button className={!s.rebuyAllowed ? 'on' : ''} onClick={() => set('rebuyAllowed', false)}>금지</button>
            </div>
          </div>
          <div className="field">
            <label>게임 모드</label>
            <div className="segment">
              <button className={s.mode === 'single' ? 'on' : ''} onClick={() => set('mode', 'single')}>단판</button>
              <button className={s.mode === 'series' ? 'on' : ''} onClick={() => set('mode', 'series')}>여러판 시리즈</button>
            </div>
          </div>
          {s.mode === 'series' && (
            <>
              <div className="settings-grid">
                <NumField label="시리즈 판 수" value={s.seriesCount} onChange={(v) => set('seriesCount', v)} min={2} />
                <div className="field">
                  <label>최종 승자 계산</label>
                  <div className="segment">
                    <button className={s.finalScoring === 'chips' ? 'on' : ''} onClick={() => set('finalScoring', 'chips')}>A. 칩 총합</button>
                    <button className={s.finalScoring === 'coins' ? 'on' : ''} onClick={() => set('finalScoring', 'coins')}>B. 승리코인</button>
                  </div>
                </div>
              </div>
              {s.finalScoring === 'coins' && (
                <div className="settings-grid">
                  {[0, 1, 2].map((i) => (
                    <NumField key={i} label={`${i + 1}등 코인`} value={s.coinTable[i]}
                      onChange={(v) => set('coinTable', s.coinTable.map((c, j) => (j === i ? v : c)))} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="error">{error}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={onCancel}>취소</button>
          <button className="primary" disabled={busy} onClick={submit}>
            {busy ? '만드는 중...' : '방 만들기'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Lobby({ user, onLogout, onEnterRoom, onUserUpdate }) {
  const [view, setView] = useState('home'); // home | create | profile | records | master
  const [code, setCode] = useState('');
  const [joinPw, setJoinPw] = useState('');
  const [joinErr, setJoinErr] = useState('');
  const [joining, setJoining] = useState(false);
  const [roomList, setRoomList] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const loadRooms = async () => {
    setLoadingRooms(true);
    try {
      const r = await emitAsync('list_rooms');
      setRoomList(r.rooms || []);
    } catch { /* ignore */ }
    setLoadingRooms(false);
  };

  useEffect(() => { loadRooms(); }, []);

  const joinRoomByCode = async (c) => {
    setJoinErr('');
    setJoining(true);
    try {
      const r = await emitAsync('join_room', { code: c, password: joinPw });
      if (r.error) setJoinErr(r.error);
      else onEnterRoom(c);
    } catch {
      setJoinErr('서버에 연결할 수 없어요');
    }
    setJoining(false);
  };

  const join = async () => {
    setJoinErr('');
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return setJoinErr('초대 코드 6자리를 입력해주세요');
    setJoining(true);
    try {
      const r = await emitAsync('join_room', { code: c, password: joinPw });
      if (r.error) setJoinErr(r.error);
      else onEnterRoom(c);
    } catch {
      setJoinErr('서버에 연결할 수 없어요');
    }
    setJoining(false);
  };

  const refreshUser = async () => {
    try {
      const r = await emitAsync('update_profile', {});
      if (r.user) onUserUpdate(r.user);
    } catch { /* ignore */ }
  };

  if (view === 'create') {
    return <CreateForm onDone={onEnterRoom} onCancel={() => setView('home')} />;
  }
  if (view === 'profile') {
    return (
      <div className="card-page">
        <div className="panel" style={{ maxWidth: 560 }}>
          <Profile user={user} onUserUpdate={(u) => { onUserUpdate(u); }} onBack={() => setView('home')} />
        </div>
      </div>
    );
  }
  if (view === 'records') {
    return (
      <div className="card-page">
        <div className="panel" style={{ maxWidth: 560 }}>
          <Records onBack={() => setView('home')} />
        </div>
      </div>
    );
  }
  if (view === 'master' && user.is_master) {
    return (
      <div className="card-page">
        <div className="panel" style={{ maxWidth: 640 }}>
          <MasterPanel onBack={() => setView('home')} />
        </div>
      </div>
    );
  }

  return (
    <div className="card-page">
      <div className="panel">
        <div className="topbar" style={{ background: 'none', padding: '0 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar loadout={user.equipped || user.avatar_loadout} avatar={user.avatar} color={user.color} size={44} />
            <div>
              <div style={{ fontWeight: 800 }}>{user.name}{user.title && ` ${user.title}`}</div>
              <div className="chips">🪙 {user.chips?.toLocaleString()} 칩</div>
            </div>
          </div>
          <button className="link-btn" onClick={refreshUser} title="새로고침">🔄</button>
        </div>
        <h1>🃏 <span className="suit">프라이빗 포커</span></h1>
        <p className="sub">친구들끼리 즐기는 비공개 포커. 가상 칩으로만 플레이해요.</p>
        <button className="primary" style={{ width: '100%', marginBottom: 10 }}
          onClick={() => setView('create')}>
          ➕ 방 만들기
        </button>
        <div className="field">
          <label>초대 코드로 입장</label>
          <div className="row">
            <input value={code} placeholder="6자리 코드"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              style={{ textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center', fontWeight: 800 }} />
            <button className="gold" disabled={joining} onClick={join}>
              {joining ? '...' : '입장'}
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input value={joinPw} placeholder="비밀번호 (있는 방만)" maxLength={20}
              onChange={(e) => setJoinPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()} />
          </div>
          <div className="error">{joinErr}</div>
        </div>
        {/* 🏠 방 목록 */}
        <div className="field" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ margin: 0 }}>🏠 진행 중인 방</label>
            <button className="link-btn" onClick={loadRooms} title="새로고침">🔄</button>
          </div>
          {loadingRooms ? (
            <div className="sub">불러오는 중...</div>
          ) : roomList.length === 0 ? (
            <div className="sub">진행 중인 방이 없어요. 방을 만들어보세요!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {roomList.map((r) => (
                <div key={r.code} className="room-item"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', background: 'rgba(255,255,255,0.05)',
                    borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {r.hasPassword && '🔒 '}{r.name}
                      {r.botCount > 0 && ` 🤖${r.botCount}`}
                    </div>
                    <div className="sub" style={{ fontSize: 12 }}>
                      {r.gameType === 'holdem' ? '홀덤' : r.gameType} · {r.playerCount}/{r.maxPlayers}명 ·
                      {r.state === 'playing' ? ' 🎮 진행 중' : ' ⏳ 대기 중'}
                    </div>
                  </div>
                  <button className="gold" disabled={joining || r.state === 'playing'}
                    onClick={() => joinRoomByCode(r.code)}>
                    입장
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button onClick={() => setView('profile')}>🎨 프로필</button>
          <button onClick={() => setView('records')}>📜 기록</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {user.is_master && <button onClick={() => setView('master')}>👑 마스터 패널</button>}
          <button className="danger" onClick={() => { socket.emit('leave_room'); onLogout(); }}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
