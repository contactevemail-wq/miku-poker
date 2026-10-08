// 🃏 포커 테이블 — 좌석 배치 · 액션바 · 채팅 · 시리즈 HUD (13-2 작성)
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { socket, emitAsync } from '../socket';
import Card, { CardBack } from './Card';
import Avatar from './Avatar';
import { ChatBox } from './Room';

const HAND_NAMES = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];

function seatPos(i, n) {
  const rad = ((360 / n) * i - 90) * (Math.PI / 180);
  return { left: 50 + 44 * Math.cos(rad), top: 50 + 44 * Math.sin(rad) };
}

function ActionBar({ me, table, onAct }) {
  const [raiseTo, setRaiseTo] = useState(table.minRaiseTo);
  useEffect(() => setRaiseTo(table.minRaiseTo), [table.minRaiseTo, table.actionPlayerId]);
  if (!me || me.folded || me.sittingOut) return null;
  const toCall = me.toCall;
  const maxTo = me.bet + me.stack;
  const minTo = Math.min(table.minRaiseTo, maxTo);
  return (
    <div className="action-bar">
      <span className="to-call">{toCall > 0 ? `콜 ${toCall.toLocaleString()}` : '체크 가능'}</span>
      <button className="danger" onClick={() => onAct('fold')}>폴드</button>
      {toCall === 0 ? (
        <button className="primary" onClick={() => onAct('check')}>체크</button>
      ) : (
        <button className="primary" onClick={() => onAct('call')}>콜 {Math.min(toCall, me.stack).toLocaleString()}</button>
      )}
      {maxTo > minTo && (
        <div className="raise-ctl">
          <input type="range" min={minTo} max={maxTo} step={10} value={Math.min(Math.max(raiseTo, minTo), maxTo)}
            onChange={(e) => setRaiseTo(Number(e.target.value))} />
          <button className="gold" onClick={() => onAct('raise', Math.min(Math.max(raiseTo, minTo), maxTo))}>
            레이즈 {Math.min(Math.max(raiseTo, minTo), maxTo).toLocaleString()}
          </button>
        </div>
      )}
      <button onClick={() => onAct('allin')}>올인!</button>
    </div>
  );
}

export default function Table({ user, room, onLeave }) {
  const [table, setTable] = useState(null);
  const [handEnd, setHandEnd] = useState(null);
  const [series, setSeries] = useState(null);
  const [chats, setChats] = useState([]);
  const [bannerTimer, setBannerTimer] = useState(0);
  // 새 핸드마다 내 카드 쪼기 상태를 초기화하기 위한 키
  const [handKey, setHandKey] = useState(0);
  const prevStreet = useRef(null);
  useEffect(() => {
    if (!table) return;
    const s = table.street;
    if ((prevStreet.current === 'done' || prevStreet.current === null) && s === 'preflop') {
      setHandKey((k) => k + 1);
    }
    prevStreet.current = s;
  }, [table]);

  useEffect(() => {
    const onTable = (t) => { setTable(t); setHandEnd(null); };
    const onHandEnd = (h) => { setHandEnd(h); setBannerTimer(8); };
    const onSeries = (s) => setSeries(s);
    const onChat = (m) => setChats((c) => [...c.slice(-99), m]);
    socket.on('table_update', onTable);
    socket.on('hand_end', onHandEnd);
    socket.on('series_update', onSeries);
    socket.on('chat', onChat);
    return () => {
      socket.off('table_update', onTable);
      socket.off('hand_end', onHandEnd);
      socket.off('series_update', onSeries);
      socket.off('chat', onChat);
    };
  }, []);

  // 승자 배너 카운트다운
  useEffect(() => {
    if (bannerTimer <= 0) return;
    const id = setTimeout(() => setBannerTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [bannerTimer]);
  useEffect(() => {
    if (bannerTimer === 0) setHandEnd(null);
  }, [bannerTimer]);

  const sendChat = useCallback((text) => socket.emit('chat', { text }), []);
  const onAct = useCallback((action, amount) => {
    socket.emit('act', { action, amount });
  }, []);

  const me = useMemo(
    () => table?.players.find((p) => p.id === user.id),
    [table, user.id]
  );
  const isMyTurn = table && table.actionPlayerId === user.id;
  const skin = user.skin || 'classic';

  const doRebuy = async () => {
    const r = await emitAsync('rebuy');
    if (r.error) alert(r.error);
  };

  if (!table) {
    return (
      <div className="table-wrap">
        <div className="topbar">
          <b>🃏 {room.name}</b>
          <button onClick={onLeave}>나가기</button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>게임 준비 중...</p>
        </div>
      </div>
    );
  }

  const n = table.players.length;
  const pot = table.players.reduce((s, p) => s + p.bet, 0);

  return (
    <div className="table-wrap">
      <div className="topbar">
        <b>🃏 {room.name}</b>
        <button onClick={onLeave}>나가기</button>
      </div>
      {series && (
        <div className="series-hud">
          <span>📊 시리즈 {series.current + 1}/{series.total}판</span>
          <span className="coins">
            {Object.entries(series.coins).map(([uid, c]) => {
              const p = table.players.find((x) => String(x.id) === String(uid));
              return p ? `${p.name} 🪙${c}` : null;
            }).filter(Boolean).join(' · ') || '아직 코인 없음'}
          </span>
        </div>
      )}
      <div className="poker-table">
        <div className="pot">🍯 {pot.toLocaleString()}</div>
        <div className="community">
          {table.community.length === 0 && table.street !== 'done'
            ? [0, 1, 2, 3, 4].map((i) => <CardBack key={i} skin={skin} />)
            : table.community.map((c, i) => <Card key={i} card={c} faceUp skin={skin} />)}
        </div>
        {table.players.map((p, i) => {
          const pos = seatPos(i, n);
          const isMe = p.id === user.id;
          const holeCards = p.hole || [];
          return (
            <div key={p.id} className={`seat${table.actionPlayerId === p.id ? ' active' : ''}${p.folded ? ' folded' : ''}`}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}>
              {table.dealerId === p.id && <div className="dealer-btn">D</div>}
              {isMe ? (
                <Avatar loadout={user.equipped || user.avatar_loadout} avatar={user.avatar} color={user.color} size={52} title={user.title} />
              ) : (
                <Avatar loadout={p.equipped} color={p.color || '#22d3ee'} size={52} title={p.title ? `${p.name} ${p.title}` : p.name} />
              )}
              <div className="name" style={{ color: isMe ? user.color : (p.color || '#fff') }}>
                {p.name}{isMe ? ' (나)' : ''}{p.allin ? ' 🔥올인' : ''}
              </div>
              <div className="stack">🪙 {p.stack.toLocaleString()}</div>
              {p.bet > 0 && <div className="bet">+{p.bet.toLocaleString()}</div>}
              <div className="hole">
                {holeCards.map((c, j) => (
                  c ? <Card key={j} card={c} faceUp skin={skin} />
                     : <CardBack key={j} skin={skin} />
                ))}
              </div>
            </div>
          );
        })}
        {handEnd && bannerTimer > 0 && (
          <div className="winner-banner">
            <h2>🎉 승자!</h2>
            {handEnd.winners.map((w, i) => (
              <div key={i} style={{ margin: '4px 0' }}>
                <b>{w.name}</b> +{w.amount.toLocaleString()}칩
                {w.hand && <span style={{ color: '#9ca3af' }}> · {HAND_NAMES[w.hand.cat]}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 내 핸드 쪼기 영역 */}
      {me && me.hole && me.hole[0] && (
        <div style={{ background: 'rgba(0,0,0,.4)', padding: '8px' }}>
          <div className="my-hand">
            {me.hole.map((c, i) => (
              <Card key={`${handKey}-${i}`} card={c} peekable skin={skin} />
            ))}
          </div>
          <div className="spectate-note">👆 내 카드를 눌러 바로 확인 / 꾹 눌러 드래그하면 쪼아보기!</div>
        </div>
      )}

      {isMyTurn && (
        <div className="turn-timer" style={{ textAlign: 'center' }}>⏰ 당신의 차례예요! (30초)</div>
      )}
      {isMyTurn && <ActionBar me={me} table={table} onAct={onAct} />}
      {me && me.stack === 0 && room.settings?.rebuyAllowed && (
        <div className="action-bar">
          <span className="to-call">스택이 0이에요</span>
          <button className="gold" onClick={doRebuy}>
            리바이 ({room.settings.buyin?.toLocaleString()}칩)
          </button>
        </div>
      )}
      <ChatBox messages={chats} onSend={sendChat} />
    </div>
  );
}
