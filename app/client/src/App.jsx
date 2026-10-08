// 🃏 메인 앱 — 화면 라우팅
import { useState, useEffect, useCallback } from 'react';
import { socket, connectSocket } from './socket';
import Auth from './components/Auth';
import Lobby from './components/Lobby';
import Room from './components/Room';
import LoadingScreen, { preloadLoadingArt } from './components/LoadingScreen';
import './styles.css';

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('poker_user')); } catch { return null; }
  });
  const [screen, setScreen] = useState(user ? 'lobby' : 'auth');
  const [roomCode, setRoomCode] = useState(null);
  const [notice, setNotice] = useState('');
  // 저장된 로그인 정보가 있으면 auth_ok까지 로딩 화면 표시
  const [booting, setBooting] = useState(!!user);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  }, []);

  const handleLogout = useCallback(() => {
    socket.disconnect();
    localStorage.removeItem('poker_user');
    setUser(null);
    setRoomCode(null);
    setScreen('auth');
  }, []);

  useEffect(() => {
    preloadLoadingArt();
  }, []);

  useEffect(() => {
    if (!user) return;
    connectSocket(user.id);
    const onOk = (u) => {
      setUser(u);
      localStorage.setItem('poker_user', JSON.stringify(u));
      setBooting(false);
    };
    const onErr = (msg) => { setBooting(false); showNotice(msg); handleLogout(); };
    const onNotice = (msg) => showNotice(msg);
    socket.on('auth_ok', onOk);
    socket.on('auth_error', onErr);
    socket.on('notice', onNotice);
    return () => {
      socket.off('auth_ok', onOk);
      socket.off('auth_error', onErr);
      socket.off('notice', onNotice);
    };
  }, [user?.id]); // eslint-disable-line

  const handleLogin = (u) => {
    setUser(u);
    localStorage.setItem('poker_user', JSON.stringify(u));
    setScreen('lobby');
  };

  const enterRoom = (code) => {
    setRoomCode(code);
    setScreen('room');
  };

  if (booting) return <LoadingScreen message="서버에 연결 중..." />;

  return (
    <>
      {notice && <div className="notice-toast">{notice}</div>}
      {screen === 'auth' && <Auth onLogin={handleLogin} />}
      {screen === 'lobby' && user && (
        <Lobby user={user} onLogout={handleLogout} onEnterRoom={enterRoom} onUserUpdate={setUser} />
      )}
      {screen === 'room' && user && (
        <Room user={user} code={roomCode} onLeave={() => setScreen('lobby')} onUserUpdate={setUser} />
      )}
    </>
  );
}
