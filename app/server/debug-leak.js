// 디버그: 칩 누수 재현 추적
import { Table, STREET } from './table.js';

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (let seed = 1; seed <= 40; seed++) {
  const rand = mulberry(seed);
  try {
    const n = 2 + Math.floor(rand() * 8);
    const table = new Table({ sb: 50, bb: 100 });
    for (let i = 0; i < n; i++) table.addPlayer(`p${i}`, `P${i}`, 10000);
    const before = table.totalChips();
    table.startHand(rand);
    let guard = 0;
    while (table.street !== STREET.DONE && guard++ < 2000) {
      const st = table.publicState('p0');
      const pid = st.actionPlayerId;
      if (!pid) break;
      const me = table.players.find((p) => p.id === pid);
      const call = table.toCall(me);
      const r = rand();
      const minTo = st.minRaiseTo;
      const canRaise = me.stack + me.bet >= minTo && me.stack > call;
      if (call === 0) {
        if (r < 0.6) table.act(pid, 'check');
        else if (r < 0.85 && canRaise) table.act(pid, 'raise', minTo + Math.floor(rand() * 500));
        else if (r < 0.85) table.act(pid, 'check');
        else table.act(pid, 'allin');
      } else {
        if (r < 0.25) table.act(pid, 'fold');
        else if (r < 0.7) table.act(pid, 'call');
        else if (r < 0.9 && canRaise) table.act(pid, 'raise', minTo + Math.floor(rand() * 800));
        else if (r < 0.9) table.act(pid, 'call');
        else table.act(pid, 'allin');
      }
    }
    const after = table.totalChips();
    if (before !== after) {
      console.log(`\n=== SEED ${seed}: LEAK ${before} -> ${after} (n=${n}) ===`);
      console.log(table.log.join('\n'));
      console.log('players:', table.players.map((p) => `${p.name}: stack=${p.stack} totalBet=${p.totalBet} folded=${p.folded} allin=${p.allin}`).join(' | '));
      console.log('winners:', JSON.stringify(table.winners.map((w) => ({ n: w.name, a: w.amount }))));
      break;
    }
  } catch (e) {
    console.log(`SEED ${seed}: ERROR ${e.message}`);
  }
}
