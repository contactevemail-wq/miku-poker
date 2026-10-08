// 🃏 로그인 / 회원가입
import { useState } from 'react';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError('');
    if (!name.trim()) return setError('이름을 입력해주세요');
    if (!/^\d{4}$/.test(pin)) return setError('본인확인 숫자 4자리를 입력해주세요');
    try {
      const r = await fetch(`/api/${mode === 'login' ? 'login' : 'signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), pin }),
      });
      const d = await r.json();
      if (d.error) return setError(d.error);
      if (d.pending) {
        setPending(true);
        return;
      }
      onLogin(d.user);
    } catch {
      setError('서버에 연결할 수 없어요');
    }
  };

  if (pending) {
    return (
      <div className="card-page">
        <div className="panel" style={{ textAlign: 'center' }}>
          <h1>🃏 가입 신청 완료!</h1>
          <p className="sub">마스터가 승인하면 입장할 수 있어요.<br />승인 후 다시 로그인해주세요.</p>
          <button onClick={() => { setPending(false); setMode('login'); }}>로그인으로 돌아가기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-page">
      <div className="panel">
        <h1>🃏 <span className="suit">프라이빗 포커</span></h1>
        <p className="sub">친구들끼리 즐기는 비공개 포커. 가상 칩으로만 플레이해요.</p>
        <div className="field">
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="닉네임" maxLength={20}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>본인확인 숫자 4자리</label>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000" inputMode="numeric" maxLength={4}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <button className="primary" style={{ width: '100%' }} onClick={submit}>
          {mode === 'login' ? '입장하기' : '가입 신청하기'}
        </button>
        <div className="error">{error}</div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button className="link-btn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
            {mode === 'login' ? '처음이신가요? 가입 신청하기' : '이미 가입했나요? 로그인하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
