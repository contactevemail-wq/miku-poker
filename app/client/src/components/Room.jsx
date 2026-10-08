// 🃏 방 — 대기실 + 게임 중 Table 분기 + 결과 화면 (13-2 작성)
import { useState, useEffect, useCallback, useRef } from 'react';
import { socket, emitAsync } from '../socket';
import Table from './Table';
import LoadingScreen from './LoadingScreen';

export function ChatBox({ messages, onSend }) {
  const [text, setText] = useState('');
  const boxRef = useRef(null);
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };
  return (
    <div className="chat-box">
      <div className="chat-msgs" ref={boxRef}>
        {messages.map((m, i) => (
          <div key={i}>
            <b style={{ color: m.color || '#6ee7b7' }}>{m.name}</b>: {m.text}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input value={text} placeholder="채팅..."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()} maxLength={200} />
        <button onClick={send}>전송</button>
      </div>
    </div>
  );
}

const GAME_NAMES = { holdem: '텍사스 홀덤', pineapple: '파인애플', blackjack: '블랙잭', seven: '7포커' };

function settingsSummary(s) {
  if (!s) return '';
  const parts = [
    `바이인 ${s.buyin?.toLocaleString()}칩`,
    `블라인드 ${s.sb}/${s.bb}`,
    s.blindIntervalMin > 0 ? `${s.blindIntervalMin}분마다 ${s.blindMult}배 상승` : '블라인드 고정',
    s.rebuyAllowed ? `리바이 허용(최대 ${s.rebuyMax}회)` : '리바이 불가',
    s.mode === 'series'
      ? `시리즈 ${s.seriesCount}판 · ${s.finalScoring === 'coins' ? '승리코인제' : '칩 총합제'}`
      : '단판',
  ];
  if (s.botCount > 0) {
    const diffName = { easy: '쉬움', normal: '보통', hard: '어려움' }[s.botDifficulty] || '보통';
    parts.push(`🤖 봇 ${s.botCount}명(${diffName})`);
  }
  return parts.join(' · ');
}

function ResultsScreen({ result, onClose }) {
  const { ranked, winner } = result;
  return (
    <div className="results-screen">
      <div className="panel" style={{ maxWidth: 480 }}>
        <h1>🏆 게임 종료!</h1>
        <p className="sub">우승: <b style={{ color: 'var(--gold)' }}>{winner?.name}</b> 🎉</p>
        {ranked.map((r) => (
          <div key={r.userId} className={`rank-row${r.rank === 1 ? ' first' : ''}`}>
            <div className="r">{r.rank}</div>
            <div className="n">{r.name}{r.coins != null && ` · 🪙${r.coins}`}</div>
            <div className={`p${r.profit > 0 ? ' plus' : r.profit < 0 ? ' minus' : ''}`}>
              {r.profit > 0 ? '+' : ''}{r.profit?.toLocaleString()}
            </div>
          </div>
        ))}
        <button className="primary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          대기실로 돌아가기
        </button>
      </div>
    </div>
  );
}

export default function Room({ user, code, onLeave, onUserUpdate }) {
  const [room, setRoom] = useState(null);
  const [chats, setChats] = useState([]);
  const [result, setResult] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState('');
  const [stuck, setStuck] = useState(false);
  // 방 정보가 8초 넘게 안 오면 돌아가기 버튼 표시
  useEffect(() => {
    if (room) return;
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, [room]);

  useEffect(() => {
    const onRoom = (r) => { if (r.code === code) setRoom(r); };
    const onChat = (m) => setChats((c) => [...c.slice(-99), m]);
    const onGameOver = (res) => {
      setResult(res);
      // 칩 정산 반영: 유저 정보 새로고침
      emitAsync('update_profile', {}).then((r) => {
        if (r.user && onUserUpdate) onUserUpdate(r.user);
      }).catch(() => {});
    };
    socket.on('room_update', onRoom);
    socket.on('chat', onChat);
    socket.on('game_over', onGameOver);
    // 레이스 컨디션 방지: 마운트 시 현재 방 상태 직접 조회
    // (create_room/join_room의 broadcast가 컴포넌트 마운트보다 먼저 올 수 있음)
    emitAsync('get_room', { code }).then((r) => {
      if (r.room && r.room.code === code) setRoom(r.room);
    }).catch(() => {});
    return () => {
      socket.off('room_update', onRoom);
      socket.off('chat', onChat);
      socket.off('game_over', onGameOver);
    };
  }, [code]); // eslint-disable-line

  const leave = useCallback(() => {
    socket.emit('leave_room');
    onLeave();
  }, [onLeave]);

  const sendChat = useCallback((text) => socket.emit('chat', { text }), []);

  const startGame = async () => {
    setStartErr('');
    setStarting(true);
    try {
      const r = await emitAsync('start_game');
      if (r.error) setStartErr(r.error);
    } catch {
      setStartErr('서버에 연결할 수 없어요');
    }
    setStarting(false);
  };

  if (result) return <ResultsScreen result={result} onClose={() => setResult(null)} />;

  if (!room) {
    return (
      <>
        <LoadingScreen message="방에 입장하는 중..." />
        {stuck && (
          <button
            onClick={leave}
            style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 201 }}
          >
            로비로 돌아가기
          </button>
        )}
      </>
    );
  }

  if (room.state === 'playing') {
    return <Table user={user} room={room} onLeave={leave} onUserUpdate={onUserUpdate} />;
  }

  const isHost = room.hostId === user.id;

  return (
    <div className="card-page">
      <div className="panel" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', maxHeight: '94vh' }}>
        <h1>🃏 {room.name}</h1>
        <p className="sub">{GAME_NAMES[room.gameType] || room.gameType}</p>
        <div className="room-code-share">
          <div className="code-big">{room.code}</div>
          <div className="hint">
            친구에게 이 코드를 공유하세요!
            {room.hasPassword && ' 🔒 비밀번호가 설정된 방이에요'}
          </div>
        </div>
        <div className="setting-summary">⚙️ {settingsSummary(room.settings)}</div>
        <div className="lobby-list" style={{ overflowY: 'auto' }}>
          {room.players.map((p) => (
            <div key={p.userId} className="lobby-player">
              <div className="dot" style={{ background: '#059669' }}>
                {p.name[0]}
              </div>
              <div style={{ fontWeight: 700 }}>
                {p.name}
                {p.isBot && <span className="bot-badge">🤖 봇</span>}
                {p.userId === room.hostId && <span className="host-badge">HOST</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={leave}>나가기</button>
          {isHost ? (
            <button className="primary" disabled={starting || room.players.length < 2} onClick={startGame}>
              {starting ? '시작 중...' : `게임 시작 (${room.players.length}명)`}
            </button>
          ) : (
            <button disabled>호스트가 시작하기를 기다리는 중...</button>
          )}
        </div>
        {room.players.length < 2 && <div className="hint">2명 이상 모여야 시작할 수 있어요</div>}
        <div className="error">{startErr}</div>
        <div style={{ marginTop: 12 }}>
          <ChatBox messages={chats} onSend={sendChat} />
        </div>
      </div>
    </div>
  );
}
