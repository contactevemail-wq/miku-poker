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

/** 팟 크기에 따른 칩 더미 개수 */
function potChipCount(pot) {
  if (pot <= 0) return 0;
  if (pot < 500) return 1;
  if (pot < 2000) return 2;
  if (pot < 5000) return 3;
  if (pot < 15000) return 4;
  if (pot < 50000) return 5;
  return 6;
}

const TURN_SECONDS = 30;

/** ⏱️ 액션 타이머 — 원형 프로그레스 + 숫자 카운트다운 */
function TurnTimer({ actionPlayerId, players, isMyTurn }) {
  const [left, setLeft] = useState(TURN_SECONDS);
  // 차례가 바뀌면 리셋
  useEffect(() => {
    setLeft(TURN_SECONDS);
    const t = setInterval(() => {
      setLeft((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [actionPlayerId]);
  const actor = players.find((p) => String(p.id) === String(actionPlayerId));
  const frac = left / TURN_SECONDS;
  const R = 16;
  const C = 2 * Math.PI * R;
  const urgent = left <= 10;
  return (
    <div className={`turn-timer${urgent ? ' urgent' : ''}`} style={{ textAlign: 'center' }}>
      <svg width="44" height="44" viewBox="0 0 44 44" className="timer-ring">
        <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="4" />
        <circle cx="22" cy="22" r={R} fill="none"
          stroke={urgent ? '#ef4444' : '#f5c542'} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s' }} />
        <text x="22" y="27" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800">{left}</text>
      </svg>
      <div className="timer-label">
        {isMyTurn ? '⏰ 당신의 차례예요!' : `⏳ ${actor?.name || ''} 차례`}
      </div>
    </div>
  );
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
  // 쪼기 완료 후 앞면으로 계속 표시 (컴팩트)
  const [peeked, setPeeked] = useState(false);
  const prevStreet = useRef(null);
  // 🪙 칩 이펙트 (날아가는 칩)
  const [chipFx, setChipFx] = useState([]);
  const fxSeq = useRef(0);
  const prevBets = useRef({});
  const tableRef = useRef(null);
  const [dealing, setDealing] = useState(false);
  // ✨ 애니메이션 ON/OFF (마스터 요청, localStorage 저장)
  const [fxOn, setFxOn] = useState(() => {
    try { return localStorage.getItem('poker-fx') !== 'off'; } catch { return true; }
  });
  const fxOnRef = useRef(fxOn);
  const fxTimers = useRef(new Set());
  const toggleFx = useCallback(() => {
    const next = !fxOnRef.current;
    fxOnRef.current = next;
    setFxOn(next);
    try { localStorage.setItem('poker-fx', next ? 'on' : 'off'); } catch {}
    if (!next) setChipFx([]);
    document.body.classList.toggle('no-fx', !next);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('no-fx', !fxOnRef.current);
  }, []);

  const spawnFx = useCallback((fx) => {
    if (!fxOnRef.current) return; // 꺼져 있으면 아무 작업도 안 함
    const id = ++fxSeq.current;
    const delay = fx.delay || 0;
    if (delay > 0) {
      const tid = setTimeout(() => spawnFx({ ...fx, delay: 0 }), delay);
      fxTimers.current.add(tid);
      return;
    }
    setChipFx((list) => [...list.slice(-11), { ...fx, id }]);
    const tid = setTimeout(() => {
      fxTimers.current.delete(tid);
      setChipFx((list) => list.filter((c) => c.id !== id));
    }, 900);
    fxTimers.current.add(tid);
  }, []);
  // 언마운트 시 타이머 정리
  useEffect(() => () => { fxTimers.current.forEach(clearTimeout); fxTimers.current.clear(); }, []);

  useEffect(() => {
    if (!table) return;
    const s = table.street;
    if ((prevStreet.current === 'done' || prevStreet.current === null) && s === 'preflop') {
      setHandKey((k) => k + 1);
      setPeeked(false);
      // 🃏 새 핸드 딜링 애니메이션
      prevBets.current = {};
      if (fxOnRef.current) {
        setDealing(true);
        const tid = setTimeout(() => {
          fxTimers.current.delete(tid);
          setDealing(false);
        }, 1300);
        fxTimers.current.add(tid);
      }
    }
    prevStreet.current = s;
  }, [table]);

  useEffect(() => {
    const onTable = (t) => {
      // 🪙 베팅 감지 → 칩이 좌석에서 팟으로 날아감
      const n = t.players.length;
      const isNewHand = t.street === 'preflop' && tableRef.current?.street !== 'preflop';
      if (isNewHand) prevBets.current = {};
      t.players.forEach((p, i) => {
        const prev = prevBets.current[p.id] || 0;
        if (p.bet > prev) {
          const pos = seatPos(i, n);
          spawnFx({ fx: `${pos.left}%`, fy: `${pos.top}%`, tx: '50%', ty: '32%', kind: 'bet' });
        }
        prevBets.current[p.id] = p.bet;
      });
      tableRef.current = t;
      setTable(t); setHandEnd(null);
    };
    const onHandEnd = (h) => {
      // 🏆 승리 → 칩이 팟에서 승자에게 날아감
      const t = tableRef.current;
      if (t) {
        const n = t.players.length;
        h.winners.forEach((w) => {
          const idx = t.players.findIndex((p) => String(p.id) === String(w.id) || p.name === w.name);
          if (idx >= 0) {
            const pos = seatPos(idx, n);
            for (let k = 0; k < 3; k++) {
              spawnFx({ fx: '50%', fy: '32%', tx: `${pos.left}%`, ty: `${pos.top}%`, kind: 'win', delay: k * 140 });
            }
          }
        });
      }
      setHandEnd(h); setBannerTimer(8);
    };
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
  }, [spawnFx]);

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
    () => table?.players.find((p) => String(p.id) === String(user.id)),
    [table, user.id]
  );
  const isMyTurn = table && String(table.actionPlayerId) === String(user.id);
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
        <div className="row" style={{ flex: '0 0 auto', gap: 8 }}>
          <button onClick={toggleFx} title={fxOn ? '애니메이션 끄기' : '애니메이션 켜기'}
            style={{ padding: '10px 12px', opacity: fxOn ? 1 : 0.55 }}>
            {fxOn ? '✨' : '🚫'}
          </button>
          <button onClick={onLeave}>나가기</button>
        </div>
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
      <div className={`poker-table${n >= 7 ? ' crowded' : ''}`}>
        <div className="pot">
          {potChipCount(pot) > 0 && (
            <span className="pot-stack" aria-hidden>
              {Array.from({ length: potChipCount(pot) }).map((_, i) => (
                <span key={i} className="pot-chip" style={{ bottom: 2 + i * 7 }} />
              ))}
            </span>
          )}
          🍯 {pot.toLocaleString()}
        </div>
        {/* 🪙 날아가는 칩 이펙트 레이어 */}
        {chipFx.map((c) => (
          <div
            key={c.id}
            className={`chip-fly chip-${c.kind}`}
            style={{ '--fx': c.fx, '--fy': c.fy, '--tx': c.tx, '--ty': c.ty }}
          >
            🪙
          </div>
        ))}
        <div className="community">
          {table.community.length === 0 && table.street !== 'done'
            ? [0, 1, 2, 3, 4].map((i) => <CardBack key={i} skin={skin} />)
            : table.community.map((c, i) => <Card key={i} card={c} faceUp skin={skin} />)}
        </div>
        {table.players.map((p, i) => {
          const pos = seatPos(i, n);
          const isMe = String(p.id) === String(user.id);
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
                {p.name}{isMe ? ' (나)' : ''}{p.isBot && !p.name.startsWith('🤖') ? ' 🤖' : ''}{p.allin ? ' 🔥올인' : ''}
              </div>
              <div className="stack">🪙 {p.stack.toLocaleString()}</div>
              {p.bet > 0 && <div className="bet">+{p.bet.toLocaleString()}</div>}
              <div className="hole">
                {holeCards.map((c, j) => (
                  // 내 카드는 하단 쪼기 영역에서 확인 → 좌석에서는 뒷면만 표시
                  // (마스터 버그: 쪼기 전에 좌석에 앞면으로 노출됨)
                  <span key={j} className={dealing && fxOn ? 'card-deal' : ''}
                    style={(dealing && fxOn) ? { animationDelay: `${(i * 60 + j * 90) % 600}ms` } : undefined}>
                    {isMe ? <CardBack skin={skin} />
                    : c ? <Card card={c} faceUp skin={skin} />
                       : <CardBack skin={skin} />}
                  </span>
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
            {handEnd.showdown && handEnd.showdown.length > 0 && (
              <div className="showdown-list">
                <div className="showdown-title">🃏 쇼다운</div>
                {handEnd.showdown.map((s, i) => (
                  <div key={i} className="showdown-row">
                    <span className="showdown-name">{s.name}</span>
                    <span className="showdown-cards">
                      {(s.hole || []).map((c, j) => (
                        <Card key={j} card={c} small faceUp skin={skin} />
                      ))}
                    </span>
                    <span className="showdown-hand">{s.handName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 내 핸드 쪼기 영역 — 쪼기 전: 인터랙티브 / 쪼기 후: 앞면 컴팩트 표시 */}
      {me && me.hole && me.hole[0] && !peeked && (
        <div style={{ background: 'rgba(0,0,0,.4)', padding: '8px' }}>
          <div className="my-hand">
            {me.hole.map((c, i) => (
              <span key={`${handKey}-${i}`} className={dealing && fxOn ? 'card-deal' : ''}
                style={(dealing && fxOn) ? { animationDelay: `${i * 110}ms` } : undefined}>
                <Card card={c} peekable skin={skin} onReveal={() => setPeeked(true)} />
              </span>
            ))}
          </div>
          <div className="spectate-note">👆 내 카드를 눌러 바로 확인 / 꾹 눌러 드래그하면 쪼아보기!</div>
        </div>
      )}
      {me && me.hole && me.hole[0] && peeked && (
        <div className="my-hand-done">
          <div className="my-hand-compact">
            {me.hole.map((c, i) => (
              <Card key={`done-${handKey}-${i}`} card={c} faceUp small skin={skin} />
            ))}
          </div>
          <button className="repeek-btn" onClick={() => setPeeked(false)} title="다시 쪼기">
            🔍
          </button>
        </div>
      )}

      {table.actionPlayerId && (
        <TurnTimer
          actionPlayerId={table.actionPlayerId}
          players={table.players}
          isMyTurn={isMyTurn}
        />
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
