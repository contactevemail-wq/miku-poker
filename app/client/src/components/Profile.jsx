// 🃏 프로필 — 아바타 조합 · 아바타 상점 · 스타일 (13-2 작성)
// 아바타: 13-1 서버 API 연동 (shop_list / shop_buy / equip_avatar)
// 스타일(닉네임 색상·칭호·카드 스킨): update_profile
import { useState, useEffect, useCallback } from 'react';
import { emitAsync } from '../socket';
import Avatar, { PART_SLOTS, PartThumb, resolveLoadout } from './Avatar';
import Card, { CardBack } from './Card';

const COLORS = ['#22d3ee', '#f472b6', '#f5c542', '#6ee7b7', '#a78bfa', '#f87171', '#60a5fa', '#e5e7eb'];
const TITLES = ['', '♠ 올인왕', '🍀 러키가이', '🦈 샤크', '🐟 피쉬', '👑 챔프', '🎩 매지션'];

const PREVIEW_CARDS = [
  { r: 14, s: 0 }, { r: 13, s: 1 }, { r: 12, s: 2 }, { r: 11, s: 3 }, { r: 10, s: 0 },
];

function SkinPreview({ skin }) {
  return (
    <div className="skin-preview">
      <CardBack skin={skin} />
      {PREVIEW_CARDS.map((c, i) => <Card key={i} card={c} faceUp skin={skin} />)}
    </div>
  );
}

function AvatarTabs({ user, onUserUpdate }) {
  const [shop, setShop] = useState(null);
  const [slot, setSlot] = useState('hair');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('combo');

  const load = useCallback(async () => {
    try {
      const r = await emitAsync('shop_list');
      if (r.error) setMsg(r.error);
      else setShop(r);
    } catch {
      setMsg('서버에 연결할 수 없어요');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const say = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const refreshUser = useCallback(async () => {
    try {
      const r = await emitAsync('update_profile', {});
      if (r.user) onUserUpdate(r.user);
    } catch { /* ignore */ }
  }, [onUserUpdate]);

  const equip = async (partId) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await emitAsync('equip_avatar', { partId });
      if (r.error) say(r.error);
      else setShop((s) => ({ ...s, loadout: r.loadout }));
    } catch { say('서버에 연결할 수 없어요'); }
    setBusy(false);
  };

  const buy = async (part) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await emitAsync('shop_buy', { partId: part.id });
      if (r.error) { say(r.error); }
      else {
        setShop((s) => ({ ...s, owned: r.owned, chips: r.chips }));
        say(`'${part.name}' 구매 완료! 🎉`);
        await refreshUser();
        // 구매 후 바로 장착
        const e = await emitAsync('equip_avatar', { partId: part.id });
        if (!e.error) setShop((s) => ({ ...s, loadout: e.loadout }));
      }
    } catch { say('서버에 연결할 수 없어요'); }
    setBusy(false);
  };

  if (!shop) return <p className="sub">아바타 정보를 불러오는 중...</p>;

  const owned = new Set(shop.owned || []);
  const loadout = resolveLoadout(shop.loadout, user.avatar);
  const slots = shop.slots?.length ? shop.slots : PART_SLOTS.map((s) => s.key);
  const slotName = (k) => PART_SLOTS.find((s) => s.key === k)?.name || k;
  const partsOf = (k) => (shop.parts || []).filter((p) => p.slot === k);

  return (
    <>
      <div className="avatar-stage">
        <Avatar loadout={loadout} color={user.color} size={120} />
      </div>
      <p className="sub" style={{ textAlign: 'center' }}>
        <b style={{ color: user.color }}>{user.name}</b>
        {user.title && ` ${user.title}`} · 🪙 {(shop.chips ?? user.chips)?.toLocaleString()}칩
      </p>
      <div className="tabs">
        <button className={tab === 'combo' ? 'active' : ''} onClick={() => setTab('combo')}>아바타 조합</button>
        <button className={tab === 'shop' ? 'active' : ''} onClick={() => setTab('shop')}>아바타 상점</button>
      </div>

      {tab === 'combo' && (
        <>
          <div className="field">
            <label>부위 선택</label>
            <div className="segment" style={{ flexWrap: 'wrap' }}>
              {slots.map((k) => (
                <button key={k} className={slot === k ? 'on' : ''} onClick={() => setSlot(k)}>
                  {slotName(k)}
                </button>
              ))}
            </div>
          </div>
          <div className="part-grid">
            {partsOf(slot).map((p) => {
              const isOwned = owned.has(p.id) || p.price === 0;
              const equipped = loadout[p.slot] === p.id;
              return (
                <button key={p.id}
                  className={`part-btn${equipped ? ' selected' : ''}${!isOwned ? ' locked' : ''}`}
                  disabled={busy}
                  onClick={() => (isOwned ? equip(p.id) : (say('상점에서 먼저 구매해주세요!'), setTab('shop')))}>
                  <PartThumb partId={p.id} slot={p.slot} />
                  <span className="pname">{p.name}{equipped ? ' ✓' : ''}</span>
                  {!isOwned && <span className="pprice">🪙{p.price.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === 'shop' && (
        <>
          {slots.map((k) => {
            const list = partsOf(k).filter((p) => p.price > 0);
            if (!list.length) return null;
            return (
              <div key={k} style={{ marginBottom: 12 }}>
                <div className="field"><label>🛍️ {slotName(k)}</label></div>
                <div className="part-grid">
                  {list.map((p) => {
                    const isOwned = owned.has(p.id);
                    const equipped = loadout[p.slot] === p.id;
                    return (
                      <button key={p.id}
                        className={`part-btn${equipped ? ' selected' : ''}`}
                        disabled={busy || isOwned}
                        onClick={() => buy(p)}>
                        <PartThumb partId={p.id} slot={p.slot} />
                        <span className="pname">{p.name}{equipped ? ' ✓' : ''}</span>
                        <span className="pprice">{isOwned ? '보유 중' : `🪙${p.price.toLocaleString()}`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="hint">게임에서 모은 칩으로 파츠를 사서 나만의 아바타를 꾸며보세요!</div>
        </>
      )}
      <div className="error" style={{ minHeight: 20 }}>{msg}</div>
    </>
  );
}

function StyleTab({ user, onUserUpdate }) {
  const [color, setColor] = useState(user.color || '#22d3ee');
  const [title, setTitle] = useState(user.title || '');
  const [skin, setSkin] = useState(user.skin || 'classic');
  const [skins, setSkins] = useState([{ key: 'classic', name: '클래식' }, { key: 'miku', name: 'MIKU' }]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/skins').then((r) => r.json()).then((d) => {
      if (Array.isArray(d) && d.length) setSkins(d);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await emitAsync('update_profile', {
        color, title: title.slice(0, 20), skin,
      });
      if (r.error) setMsg(r.error);
      else { onUserUpdate(r.user); setMsg('저장됐어요! ✨'); }
    } catch {
      setMsg('서버에 연결할 수 없어요');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <>
      <div className="field">
        <label>닉네임 색상</label>
        <div className="color-row">
          {COLORS.map((c) => (
            <button key={c} className={`color-dot${color === c ? ' selected' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      <div className="field">
        <label>칭호</label>
        <div className="title-chips">
          {TITLES.map((t) => (
            <button key={t} className={`title-chip${title === t ? ' selected' : ''}`}
              onClick={() => setTitle(t)}>
              {t || '(없음)'}
            </button>
          ))}
        </div>
        <input value={title} maxLength={20} placeholder="직접 입력 (최대 20자)"
          onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>카드 스킨</label>
        <div className="segment">
          {skins.map((s) => (
            <button key={s.key} className={skin === s.key ? 'on' : ''}
              onClick={() => setSkin(s.key)}>
              {s.name}
            </button>
          ))}
        </div>
        <SkinPreview skin={skin} />
        <div className="hint">선택한 스킨이 모든 테이블에 적용돼요</div>
      </div>
      <div className="error" style={{ minHeight: 20 }}>{msg}</div>
      <button className="primary" style={{ width: '100%' }} disabled={saving} onClick={save}>
        {saving ? '저장 중...' : '💾 저장하기'}
      </button>
    </>
  );
}

export default function Profile({ user, onUserUpdate, onBack }) {
  const [tab, setTab] = useState('avatar');
  return (
    <>
      <div className="topbar" style={{ background: 'none', padding: '0 0 12px' }}>
        <h1 style={{ margin: 0 }}>🎨 프로필</h1>
        <button onClick={onBack}>돌아가기</button>
      </div>
      <div className="tabs">
        <button className={tab === 'avatar' ? 'active' : ''} onClick={() => setTab('avatar')}>아바타</button>
        <button className={tab === 'style' ? 'active' : ''} onClick={() => setTab('style')}>스타일</button>
      </div>
      {tab === 'avatar'
        ? <AvatarTabs user={user} onUserUpdate={onUserUpdate} />
        : <StyleTab user={user} onUserUpdate={onUserUpdate} />}
    </>
  );
}
