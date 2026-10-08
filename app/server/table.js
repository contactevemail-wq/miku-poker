// 🃏 테이블 상태머신 — 한 테이블의 핸드 진행 관리
// 구조 (13-1 리팩터링): 베팅/팟/정산 공통 머신 + 게임별 훅 오버라이드
//  - Hold'em (기본 Table): 아래 훅 그대로 사용
//  - 파인애플: dealHoleCards(3장) + 디스카드 단계 추가
//  - 7포커(스터드): startHand(앤티/브링인)·streetOrder·showdownValue 오버라이드, 커뮤니티 없음
//  - 블랙잭: 플레이어 vs 딜러 흐름이라 베팅 머신과 달라 독립 클래스로 구현 예정
import { shuffle, makeDeck, eval7, compareHands, bjValue, isBlackjack } from './poker-engine.js';

export const STREET = {
  WAITING: 'waiting',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
  DONE: 'done',
  DISCARD: 'discard', // 파인애플 디스카드 페이즈
  // 세븐카드 스터드 스트릿
  THIRD: 'third',   // 3장 (다운2+업1) + 브링인
  FOURTH: 'fourth', // 4번째 업카드, 스몰벳
  FIFTH: 'fifth',   // 5번째 업카드, 빅벳
  SIXTH: 'sixth',   // 6번째 업카드, 빅벳
  SEVENTH: 'seventh', // 7번째 다운카드, 빅벳 → 쇼다운
};

let tableSeq = 0;

export class Table {
  constructor(opts = {}) {
    this.id = `T${++tableSeq}`;
    this.players = []; // {id,name,stack,bet,totalBet,folded,allin,hole,acted,sittingOut}
    this.dealerIdx = -1;
    this.street = STREET.WAITING;
    this.community = [];
    this.deck = [];
    this.currentBet = 0; // 이번 스트릿 최고 베팅액
    this.minRaise = 0; // 최소 레이즈 단위
    this.actionIdx = -1;
    this.sb = opts.sb ?? 50;
    this.bb = opts.bb ?? 100;
    this.ante = opts.ante ?? 0;
    this.anteAuto = !!opts.anteAuto;
    this.log = [];
    this.winners = [];
  }

  addPlayer(id, name, stack, profile = {}) {
    if (this.players.some((p) => p.id === id)) return;
    this.players.push({
      id, name, stack, bet: 0, totalBet: 0,
      folded: false, allin: false, hole: [], acted: false, sittingOut: false,
      isBot: !!profile.isBot,
      // 프로필 스냅샷 (13-1: publicState 아바타 표시용 — index.js start_game에서 전달)
      avatar: profile.avatar || 'miku1',
      color: profile.color || '#22d3ee',
      title: profile.title || '',
      equipped: profile.equipped || '{}',
    });
  }

  removePlayer(id) {
    this.players = this.players.filter((p) => p.id !== id);
  }

  activePlayers() {
    return this.players.filter((p) => !p.sittingOut && p.stack > 0);
  }

  /** 핸드 시작 — 블라인드, 딜링 */
  startHand(rand) {
    const ps = this.activePlayers();
    if (ps.length < 2) throw new Error('need at least 2 players');
    this.dealerIdx = (this.dealerIdx + 1) % this.players.length;
    // 딜러가 sittingOut이면 다음 active로 (단순화: activePlayers 기준 회전)
    this.deck = shuffle(makeDeck(), rand);
    this.community = [];
    this.winners = [];
    for (const p of this.players) {
      p.bet = 0; p.totalBet = 0; p.folded = false; p.allin = false;
      p.hole = []; p.acted = false;
    }
    const n = ps.length;
    const dIdx = ps.indexOf(this.players[this.dealerIdx] && !this.players[this.dealerIdx].sittingOut
      ? this.players[this.dealerIdx] : ps[0]);
    const dealer = ps[dIdx < 0 ? 0 : dIdx];
    const sbP = ps[(ps.indexOf(dealer) + 1) % n];
    const bbP = ps[(ps.indexOf(dealer) + 2) % n] ?? sbP;

    // 앤티: 전원 강제 베팅 (팟 직행)
    // anteAuto 모드: BB ÷ 인원수로 자동 계산 (마스터 아이디어!)
    // 예: BB 100, 6명 → 각자 16씩, 총 96 (≒1 BB)
    let anteAmt = this.ante;
    if (this.anteAuto && this.bb > 0) {
      anteAmt = Math.floor(this.bb / ps.length);
    }
    if (anteAmt > 0) {
      for (const p of ps) this.postAnte(p, anteAmt);
    }

    this.postBlind(n === 2 ? dealer : sbP, this.sb);
    this.postBlind(n === 2 ? sbP : bbP, this.bb);

    for (const p of ps) p.hole = this.dealHoleCards();

    this.onHandDealt(ps, { dealer, sbP, bbP, n });
    this.log.push(`hand start: dealer=${dealer.name} sb=${sbP.name} bb=${bbP.name}`);
  }

  postBlind(p, amount) {
    const a = Math.min(amount, p.stack);
    p.stack -= a; p.bet += a; p.totalBet += a;
    if (p.stack === 0) p.allin = true;
  }

  /** 앤티 — 팟 직행 (베팅 라운드의 bet에는 합산하지 않음) */
  postAnte(p, amount) {
    const a = Math.min(amount, p.stack);
    p.stack -= a; p.totalBet += a;
    if (p.stack === 0) p.allin = true;
  }

  /* ---------- 게임별 훅 (서브클래스에서 오버라이드) ---------- */

  /** 홀 카드 딜링 — 홀덤: 2장 */
  dealHoleCards() {
    return [this.deck.pop(), this.deck.pop()];
  }

  /** 베팅 스트릿 순서 — 홀덤: 프리플랍→플랍→턴→리버 */
  streetOrder() {
    return [STREET.PREFLOP, STREET.FLOP, STREET.TURN, STREET.RIVER];
  }

  /** 스트릿별 커뮤니티 카드 딜링 — 홀덤: 플랍 3장, 턴/리버 1장 */
  dealCommunity(street) {
    const n = street === STREET.FLOP ? 3 : 1;
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.deck.pop());
    return out;
  }

  /** 쇼다운 핸드 평가 — 홀덤: 홀카드 + 커뮤니티 7장 중 최상 */
  showdownValue(p) {
    return eval7([...p.hole, ...this.community]);
  }

  /**
   * 딜링 완료 후 훅 — 홀덤: 프리플랍 베팅 개시
   * (파인애플 classic은 디스카드 페이즈를 먼저 거침)
   */
  onHandDealt(ps, { sbP, bbP, n }) {
    this.street = STREET.PREFLOP;
    this.currentBet = this.bb;
    this.minRaise = this.bb;
    // 액션 시작: BB 다음 플레이어 (헤즈업은 딜러=SB부터)
    const bbPos = ps.indexOf(bbP);
    this.actionIdx = (bbPos + 1) % n;
    this.resetActed();
    // 블라인드 낸 플레이어는 acted=false (액션 기회 있음)
    this.skipDone();
  }

  resetActed() {
    for (const p of this.players) p.acted = false;
  }

  /** 액션 가능한 다음 플레이어로 이동. 베팅 라운드 종료면 true */
  skipDone() {
    // 이미 라운드 종료 조건이면 정리
    if (this.bettingComplete()) { this.endStreet(); return; }
    // allin/fold가 아닌 다음 플레이어 찾기
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[this.actionIdx % ps.length];
      // 스택 0 = 탈락 → 턴 스킵 (마스터 버그: "돈 없어서 죽은 사람 차례는 왜 돌아가")
      if (p.stack === 0) { this.actionIdx++; continue; }
      if (!p.folded && !p.allin && !p.sittingOut) {
        if (p.bet === this.currentBet && p.stack === 0) { this.actionIdx++; continue; }
        return;
      }
      this.actionIdx++;
    }
  }

  canAct(p) {
    // 스택 0이면 액션 불가 (탈락)
    if (p.stack === 0) return false;
    return !p.folded && !p.allin && !p.sittingOut;
  }

  bettingComplete() {
    const contenders = this.players.filter((p) => !p.folded && !p.sittingOut);
    if (contenders.length <= 1) return true;
    const active = contenders.filter((p) => !p.allin);
    if (active.length <= 1) {
      // 남은 1명이 매치할 것만 남았거나 모두 올인
      return active.every((p) => p.acted && p.bet === this.currentBet);
    }
    return active.every((p) => p.acted && p.bet === this.currentBet);
  }

  toCall(p) { return this.currentBet - p.bet; }

  act(playerId, action, amount = 0) {
    const p = this.players[this.actionIdx % this.players.length];
    if (!p || p.id !== playerId) throw new Error('not your turn');
    if (!this.canAct(p)) throw new Error('cannot act');

    const call = this.toCall(p);
    switch (action) {
      case 'fold':
        p.folded = true; p.acted = true; break;
      case 'check':
        if (call !== 0) throw new Error('cannot check');
        p.acted = true; break;
      case 'call': {
        if (call <= 0) throw new Error('nothing to call');
        const a = Math.min(call, p.stack);
        p.stack -= a; p.bet += a; p.totalBet += a;
        if (p.stack === 0) p.allin = true;
        p.acted = true; break;
      }
      case 'raise': {
        // amount = 올릴 총액 (to-amount)
        const minTo = this.currentBet + this.minRaise;
        if (amount < minTo && p.stack + p.bet > minTo)
          throw new Error(`min raise to ${minTo}`);
        const target = Math.min(amount, p.bet + p.stack); // 올인이면 cap
        const diff = target - p.bet;
        if (diff <= call) throw new Error('raise must exceed call');
        p.stack -= diff; p.bet = target; p.totalBet += diff;
        if (p.stack === 0) p.allin = true;
        const raiseInc = target - this.currentBet;
        if (raiseInc >= this.minRaise) {
          this.minRaise = raiseInc;
          this.currentBet = target;
          for (const q of this.players) if (q !== p) q.acted = false;
        } else {
          // 최소 미만 올인 레이즈는 currentBet 안 올림 (올인 콜扱)
          if (target > this.currentBet) this.currentBet = target;
        }
        p.acted = true; break;
      }
      case 'allin': {
        const diff = p.stack;
        p.bet += diff; p.totalBet += diff; p.stack = 0; p.allin = true;
        const raiseInc = p.bet - this.currentBet;
        if (raiseInc >= this.minRaise) {
          this.minRaise = raiseInc;
          this.currentBet = p.bet;
          for (const q of this.players) if (q !== p) q.acted = false;
        } else if (p.bet > this.currentBet) {
          this.currentBet = p.bet;
        }
        p.acted = true; break;
      }
      default: throw new Error('unknown action');
    }
    this.log.push(`${p.name} ${action}${action === 'raise' ? ' to ' + p.bet : ''}`);

    // 전원 폴드?
    const remaining = this.players.filter((q) => !q.folded && !q.sittingOut);
    if (remaining.length === 1) { this.winByDefault(remaining[0]); return; }

    this.actionIdx++;
    if (this.bettingComplete()) this.endStreet();
    else this.skipDone();
  }

  endStreet() {
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;
    this.minRaise = this.bb;
    const order = this.streetOrder();
    const next = order[order.indexOf(this.street) + 1];
    if (!next) { this.showdown(); return; }
    this.street = next;
    for (const c of this.dealCommunity(next)) this.community.push(c);
    // 액션: 딜러 다음 active 플레이어부터
    const ps = this.players;
    let idx = (ps.indexOf(ps.find((p) => p.id === this.dealerId())) + 1) % ps.length;
    // dealerId 기준 단순화: activePlayers 순서로
    const act = this.activePlayers();
    const dPos = act.findIndex((p) => p.id === this.dealerId());
    const first = act[(dPos + 1) % act.length];
    this.actionIdx = ps.indexOf(first);
    this.resetActed();
    this.log.push(`street: ${next} ${this.community.map((c) => `${c.r}/${c.s}`).join(' ')}`);
    if (this.bettingComplete()) this.endStreet();
    else this.skipDone();
  }

  dealerId() {
    const p = this.players[this.dealerIdx];
    return p ? p.id : null;
  }

  winByDefault(winner) {
    const pot = this.players.reduce((s, p) => s + p.totalBet, 0);
    winner.stack += pot;
    this.winners = [{ id: winner.id, name: winner.name, amount: pot, hand: null }];
    this.street = STREET.DONE;
    for (const p of this.players) { p.bet = 0; p.totalBet = 0; }
    this.log.push(`${winner.name} wins ${pot} (everyone folded)`);
  }

  /** 쇼다운 — 사이드팟 포함 정산 */
  showdown() {
    this.street = STREET.SHOWDOWN;
    const contenders = this.players.filter((p) => !p.folded && !p.sittingOut && p.totalBet > 0);
    // totalBet 기준 오름차순 → 팟 레벨 구성
    const levels = [...new Set(contenders.map((p) => p.totalBet))].sort((a, b) => a - b);
    let prev = 0;
    const results = [];
    for (const lvl of levels) {
      const width = lvl - prev;
      const eligible = contenders.filter((p) => p.totalBet >= lvl);
      const inPot = this.players.filter((p) => p.totalBet > prev && !p.sittingOut);
      const potAmount = inPot.reduce((s, p) => s + Math.min(p.totalBet - prev, width), 0);
      // eligible 중 최고 핸드
      let best = null, winners = [];
      for (const p of eligible) {
        const h = this.showdownValue(p);
        p._hand = h;
        if (!best || compareHands(h, best) > 0) { best = h; winners = [p]; }
        else if (compareHands(h, best) === 0) winners.push(p);
      }
      const share = Math.floor(potAmount / winners.length);
      let rem = potAmount - share * winners.length;
      for (const w of winners) {
        let amt = share;
        if (rem > 0) { amt++; rem--; } // 홀수 칩은 앞자리부터
        w.stack += amt;
        results.push({ id: w.id, name: w.name, amount: amt, hand: best });
      }
      prev = lvl;
    }
    this.winners = results;
    this.street = STREET.DONE;
    for (const p of this.players) { p.bet = 0; p.totalBet = 0; }
    this.log.push(`showdown: ${results.map((r) => `${r.name}+${r.amount}`).join(', ')}`);
  }

  /** 공개 상태 (클라이언트용). viewerId에게는 자기 핸드만 */
  publicState(viewerId) {
    return {
      street: this.street,
      community: this.street === STREET.PREFLOP ? [] : this.community,
      dealerId: this.dealerId(),
      currentBet: this.currentBet,
      minRaiseTo: this.currentBet + this.minRaise,
      actionPlayerId: (this.street === STREET.DONE || this.street === STREET.WAITING || this.street === STREET.DISCARD)
        ? null : this.players[this.actionIdx % this.players.length]?.id ?? null,
      isDiscardPhase: this.street === STREET.DISCARD,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, stack: p.stack, bet: p.bet,
        avatar: p.avatar, color: p.color, title: p.title, equipped: p.equipped,
        isBot: !!p.isBot,
        folded: p.folded, allin: p.allin, sittingOut: p.sittingOut,
        hole: p.id === viewerId ? p.hole : p.hole.map(() => null),
        holeCount: p.hole.length,
        toCall: this.toCall(p),
      })),
      winners: this.winners.map((w) => ({
        ...w, hand: w.hand ? { name: ['하이카드','원페어','투페어','트리플','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시'][w.hand.cat] } : null,
      })),
    };
  }

  /** 칩 총량 (불변식 검증용) */
  totalChips() {
    return this.players.reduce((s, p) => s + p.stack + p.totalBet, 0);
  }
}

/* ============================================================
 * 파인애플 포커 테이블 (13-1)
 * 홀덤 변형: 3장 받고 1장 버림.
 *  - classic: 프리플랍 베팅 전 디스카드
 *  - crazy: 플랍 베팅 종료 후(턴 전) 디스카드
 * 베팅/팟/쇼다운은 홀덤과 동일 (훅 오버라이드만으로 구현)
 * ============================================================ */
export class PineappleTable extends Table {
  constructor(opts = {}) {
    super(opts);
    this.variant = opts.pineappleVariant === 'crazy' ? 'crazy' : 'classic';
    this._discardDone = false;
    this._discardResume = null;
    this._preDiscardStreet = null;
  }

  /** 3장 딜링 */
  dealHoleCards() {
    return [this.deck.pop(), this.deck.pop(), this.deck.pop()];
  }

  startHand(rand) {
    this._discardDone = false;
    this._discardResume = null;
    this._preDiscardStreet = null;
    super.startHand(rand);
  }

  /** classic: 딜링 직후 디스카드 페이즈 → 프리플랍 베팅 */
  onHandDealt(ps, ctx) {
    if (this.variant === 'classic' && !this._discardDone) {
      this._discardDone = true;
      this.beginDiscardPhase(() => super.onHandDealt(ps, ctx));
    } else {
      super.onHandDealt(ps, ctx);
    }
  }

  /** crazy: 플랍 베팅 종료 후 턴 카드 전에 디스카드 페이즈 */
  endStreet() {
    const order = this.streetOrder();
    const next = order[order.indexOf(this.street) + 1];
    if (
      this.variant === 'crazy' && !this._discardDone &&
      this.street === STREET.FLOP && next === STREET.TURN
    ) {
      this._discardDone = true;
      this.beginDiscardPhase(() => super.endStreet());
      return;
    }
    super.endStreet();
  }

  beginDiscardPhase(resume) {
    this._preDiscardStreet = this.street;
    this._discardResume = resume;
    this.street = STREET.DISCARD;
    this.log.push('discard phase begin');
    // 전원 올인 등으로 버릴 사람이 없으면 즉시 종료
    if (this.discardRoundComplete()) this.finishDiscardPhase();
  }

  /** 버려야 할 사람이 다 버렸는지 (폴드/싯아웃/올인은 제외) */
  discardRoundComplete() {
    return this.players
      .filter((p) => !p.folded && !p.sittingOut && !p.allin)
      .every((p) => p.hole.length === 2);
  }

  /**
   * 디스카드: 3장 중 1장 버림
   * @returns 페이즈 완료 시 true (호출자가 afterAct 등으로 이어가야 함)
   */
  discard(playerId, cardIndex) {
    if (this.street !== STREET.DISCARD) throw new Error('디스카드 타이밍이 아니에요');
    const p = this.players.find((x) => x.id === playerId);
    if (!p || p.folded || p.sittingOut || p.allin) throw new Error('디스카드할 수 없어요');
    if (p.hole.length !== 3) throw new Error('이미 버렸어요');
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 2) {
      throw new Error('잘못된 카드예요');
    }
    const [card] = p.hole.splice(cardIndex, 1);
    this.log.push(`${p.name} discards`);
    if (this.discardRoundComplete()) {
      this.finishDiscardPhase();
      return true;
    }
    return false;
  }

  /** 디스카드 페이즈 종료: 미응답자는 랜덤 1장 자동 버림 후 게임 재개 */
  finishDiscardPhase() {
    for (const p of this.players) {
      if (!p.folded && !p.sittingOut && p.hole.length === 3) {
        p.hole.splice(Math.floor(Math.random() * p.hole.length), 1);
        this.log.push(`${p.name} auto-discard`);
      }
    }
    this.street = this._preDiscardStreet;
    const resume = this._discardResume;
    this._discardResume = null;
    this._preDiscardStreet = null;
    resume();
  }
}

/* ============================================================
 * 블랙잭 테이블 (13-1) — 독립 클래스
 * 플레이어 vs 딜러. 포커 베팅 머신과 흐름이 달라 별도 구현.
 *  - 핸드당 고정 베팅 (betAmount, 방 설정 blackjackBet)
 *  - 액션: hit / stand / double (첫 액션, 칩 여유 있을 때)
 *  - 딜러: 17까지 히트 (소프트 17 스탠드)
 *  - 배당: 승 2배, 블랙잭 2.5배, 푸시 1배
 * room(index.js)이 쓰는 인터페이스: addPlayer/startHand/street/
 *   players/actionIdx/act/publicState/totalChips/timeoutAction
 * ============================================================ */
export class BlackjackTable {
  constructor(opts = {}) {
    this.id = `T${++tableSeq}`;
    this.gameType = 'blackjack';
    this.players = []; // {id,name,stack,bet,hand,stood,busted,blackjack,doubled,done,out,sittingOut}
    this.dealer = { hand: [] };
    this.deck = [];
    this.street = STREET.WAITING;
    this.actionIdx = -1;
    this.winners = [];
    this.betAmount = opts.blackjackBet ?? 100;
    this.log = [];
  }

  addPlayer(id, name, stack, profile = {}) {
    if (this.players.some((p) => p.id === id)) return;
    this.players.push({
      id, name, stack, bet: 0, hand: [],
      stood: false, busted: false, blackjack: false, doubled: false,
      done: false, out: false, sittingOut: false,
      isBot: !!profile.isBot,
      // 프로필 스냅샷 (13-1: publicState 아바타 표시용)
      avatar: profile.avatar || 'miku1',
      color: profile.color || '#22d3ee',
      title: profile.title || '',
      equipped: profile.equipped || '{}',
    });
  }

  removePlayer(id) {
    this.players = this.players.filter((p) => p.id !== id);
  }

  /** 이번 핸드 참가자 */
  playingPlayers() {
    return this.players.filter((p) => !p.out);
  }

  canAct(p) {
    return !!p && !p.out && !p.sittingOut && !p.done && !p.busted && !p.stood;
  }

  /** 핸드 시작 — 베팅 차감, 2장씩 딜링 */
  startHand(rand) {
    const ps = this.players.filter((p) => !p.sittingOut && p.stack >= this.betAmount);
    if (ps.length < 1) throw new Error('베팅 가능한 인원이 없어요');
    this.deck = shuffle(makeDeck(), rand);
    this.winners = [];
    this.dealer = { hand: [this.deck.pop(), this.deck.pop()] };
    for (const p of this.players) {
      const playing = ps.includes(p);
      p.out = !playing;
      p.hand = []; p.bet = 0;
      p.stood = false; p.busted = false; p.blackjack = false;
      p.doubled = false; p.done = false;
    }
    for (const p of ps) {
      p.hand = [this.deck.pop(), this.deck.pop()];
      p.bet = this.betAmount;
      p.stack -= this.betAmount;
      p.blackjack = isBlackjack(p.hand);
      p.done = p.blackjack; // 내추럴은 바로 종료
    }
    this.log.push(`blackjack start: ${ps.length} players, bet=${this.betAmount}`);
    // 딜러 블랙잭이면 즉시 정산
    if (isBlackjack(this.dealer.hand)) {
      for (const p of ps) p.done = true;
      this.settle();
      return;
    }
    this.street = STREET.PREFLOP; // 플레이어 액션 페이즈
    this.actionIdx = this.players.indexOf(ps[0]);
    this.skipDone();
  }

  turnPlayer() {
    if (this.street === STREET.DONE) return null;
    const p = this.players[this.actionIdx % this.players.length];
    return this.canAct(p) ? p : null;
  }

  skipDone() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      if (this.canAct(ps[this.actionIdx % ps.length])) return;
      this.actionIdx++;
    }
    this.dealerPlay();
  }

  act(playerId, action, amount = 0) {
    const p = this.players[this.actionIdx % this.players.length];
    if (!p || p.id !== playerId) throw new Error('not your turn');
    // leave_room 호환: 나가기 = 스탠드 (차례 검증 후 canAct 전에 처리)
    if (action === 'fold') {
      p.stood = true; p.done = true;
      this.log.push(`${p.name} leaves → stand`);
      this.actionIdx++;
      this.skipDone();
      return;
    }
    if (!this.canAct(p)) throw new Error('cannot act');
    switch (action) {
      case 'hit': {
        p.hand.push(this.deck.pop());
        const v = bjValue(p.hand).total;
        if (v > 21) { p.busted = true; p.done = true; }
        else if (v === 21) { p.stood = true; p.done = true; }
        break;
      }
      case 'stand':
        p.stood = true; p.done = true; break;
      case 'double': {
        if (p.hand.length !== 2) throw new Error('첫 액션에만 더블 가능해요');
        if (p.stack < p.bet) throw new Error('칩이 부족해요');
        p.stack -= p.bet;
        p.bet *= 2;
        p.doubled = true;
        p.hand.push(this.deck.pop());
        if (bjValue(p.hand).total > 21) p.busted = true;
        else p.stood = true;
        p.done = true;
        break;
      }
      default: throw new Error('unknown action');
    }
    this.log.push(`${p.name} ${action} (${bjValue(p.hand).total})`);
    this.actionIdx++;
    this.skipDone();
  }

  /** 액션 타임아웃: 자동 스탠드 (room 타이머용) */
  timeoutAction(pid) {
    const p = this.players.find((x) => x.id === pid);
    if (p && this.canAct(p)) {
      this.act(pid, 'stand');
      return '스탠드';
    }
    // 이미 액션 불가면 다음 차례로 넘김
    this.actionIdx++;
    this.skipDone();
    return '패스';
  }

  /** 딜러 플레이: 17까지 히트 (전원 버스트면 스킵) */
  dealerPlay() {
    const anyLive = this.players.some((p) => !p.out && !p.busted && !p.sittingOut);
    if (anyLive) {
      while (bjValue(this.dealer.hand).total < 17) {
        this.dealer.hand.push(this.deck.pop());
      }
    }
    this.settle();
  }

  /** 정산 — 승 2배 / 블랙잭 2.5배 / 푸시 1배 */
  settle() {
    const dv = bjValue(this.dealer.hand);
    const dealerBust = dv.total > 21;
    const dealerBJ = isBlackjack(this.dealer.hand);
    this.winners = [];
    for (const p of this.players) {
      if (p.out) continue;
      const pv = bjValue(p.hand);
      let returned = 0, result;
      if (p.busted) { returned = 0; result = 'bust'; }
      else if (p.blackjack && dealerBJ) { returned = p.bet; result = 'push'; }
      else if (p.blackjack) { returned = Math.floor(p.bet * 2.5); result = 'blackjack'; }
      else if (dealerBJ) { returned = 0; result = 'lose'; }
      else if (dealerBust || pv.total > dv.total) { returned = p.bet * 2; result = 'win'; }
      else if (pv.total === dv.total) { returned = p.bet; result = 'push'; }
      else { returned = 0; result = 'lose'; }
      p.stack += returned;
      this.winners.push({
        id: p.id, name: p.name, amount: returned, bet: p.bet,
        profit: returned - p.bet, result, total: pv.total,
      });
      p.bet = 0;
    }
    this.street = STREET.DONE;
    this.log.push(`blackjack settle: ${this.winners.map((w) => `${w.name}${w.profit >= 0 ? '+' : ''}${w.profit}`).join(', ')}`);
  }

  /** 공개 상태 — 플레이어 핸드는 전부 오픈, 딜러 홀카드만 히든 */
  publicState(viewerId) {
    const done = this.street === STREET.DONE;
    const dHand = this.dealer.hand;
    return {
      gameType: 'blackjack',
      street: this.street,
      isDiscardPhase: false,
      betAmount: this.betAmount,
      currentBet: 0,
      minRaiseTo: 0,
      dealer: {
        hand: dHand.map((c, i) => (i === 1 && !done ? null : c)),
        handCount: dHand.length,
        total: done ? bjValue(dHand).total
          : (dHand.length ? bjValue([dHand[0]]).total : null),
        holeHidden: !done,
        blackjack: done && isBlackjack(dHand),
      },
      actionPlayerId: done ? null : this.turnPlayer()?.id ?? null,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, stack: p.stack, bet: p.bet,
        avatar: p.avatar, color: p.color, title: p.title, equipped: p.equipped,
        isBot: !!p.isBot,
        folded: false, allin: false, sittingOut: !!p.sittingOut,
        hand: p.hand,
        handCount: p.hand.length,
        total: p.hand.length ? bjValue(p.hand).total : null,
        stood: p.stood, busted: p.busted, blackjack: p.blackjack,
        doubled: p.doubled, out: p.out,
        toCall: 0,
      })),
      winners: this.winners,
    };
  }

  /** 칩 총량 (불변식 검증용) */
  totalChips() {
    return this.players.reduce((s, p) => s + p.stack + p.bet, 0);
  }
}

/* ============================================================
 * 세븐카드 스터드 테이블 (13-1)
 * 커뮤니티 없음. 3장(다운2+업1) → 7장 중 5장으로 승부.
 *  - 앤티 (전원) + 브링인 (최저 업카드, 스몰벳 풀벳 — v1 단순화)
 *  - 3rd: 브링인 왼쪽부터, 스몰벳 / 4th: 최고 업카드부터, 스몰벳
 *  - 5th~7th: 최고 업카드부터, 빅벳 / 7th는 다운카드
 *  - 핸드 평가: 7장 중 최상 5장 (eval7 재사용)
 *  - v1 제한: 최대 7명 (52장 덱), 4th 페어 빅벳 특례 없음
 * 베팅/팟/쇼다운 머신은 Table(홀덤) 것을 재사용
 * ============================================================ */
export class SevenStudTable extends Table {
  constructor(opts = {}) {
    super(opts);
    this.gameType = 'sevenstud';
    this.ante = opts.studAnte ?? 10;
    this.smallBet = opts.sb ?? 50;
    this.bigBet = opts.bb ?? 100;
  }

  streetOrder() {
    return [STREET.THIRD, STREET.FOURTH, STREET.FIFTH, STREET.SIXTH, STREET.SEVENTH];
  }

  /** p.hole: [{r, s, up}] — 7장 개인 카드 */

  startHand(rand) {
    const ps = this.activePlayers();
    if (ps.length < 2) throw new Error('need at least 2 players');
    if (ps.length > 7) throw new Error('7포커는 최대 7명이에요');
    this.dealerIdx = (this.dealerIdx + 1) % this.players.length;
    this.deck = shuffle(makeDeck(), rand);
    this.community = [];
    this.winners = [];
    for (const p of this.players) {
      p.bet = 0; p.totalBet = 0; p.folded = false; p.allin = false;
      p.hole = []; p.acted = false;
    }
    // 앤티 (팟에 직행)
    for (const p of ps) this.postAnte(p, this.ante);
    // 3장: 다운2 + 업1
    for (const p of ps) {
      p.hole = [
        { ...this.deck.pop(), up: false },
        { ...this.deck.pop(), up: false },
        { ...this.deck.pop(), up: true },
      ];
    }
    // 브링인: 최저 업카드 (스몰벳 풀벳 — v1 단순화)
    const bi = this.bringInPlayer(ps);
    this.postBlind(bi, this.smallBet);
    this.log.push(`stud start: ante=${this.ante} bring-in=${bi.name}`);
    // 3rd 스트릿: 브링인 왼쪽부터 액션
    this.street = STREET.THIRD;
    this.currentBet = bi.bet;
    this.minRaise = this.smallBet;
    const biPos = ps.indexOf(bi);
    this.actionIdx = this.players.indexOf(ps[(biPos + 1) % ps.length]);
    this.resetActed();
    this.skipDone();
  }

  /** 최저 업카드 (랭크→문양 ♣<♦<♥<♠) */
  bringInPlayer(ps) {
    const up = (p) => p.hole.find((c) => c.up);
    return ps.slice().sort((a, b) => {
      const ua = up(a), ub = up(b);
      if (ua.r !== ub.r) return ua.r - ub.r;
      return ub.s - ua.s; // s: 0♠ 1♥ 2♦ 3♣ → ♣(3)이 최저
    })[0];
  }

  /** 최고 업카드 보유자 (랭크→문양 ♠>♥>♦>♣) — 4th~7th 선공 */
  highBoardPlayer() {
    const cands = this.players.filter((p) => !p.folded && !p.sittingOut);
    let best = null;
    for (const p of cands) {
      const u = p.hole.filter((c) => c.up)
        .slice().sort((a, b) => b.r - a.r || a.s - b.s)[0];
      if (!u) continue;
      if (!best || u.r > best.u.r || (u.r === best.u.r && u.s < best.u.s)) {
        best = { p, u };
      }
    }
    return best ? best.p : cands[0];
  }

  endStreet() {
    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;
    const order = this.streetOrder();
    const next = order[order.indexOf(this.street) + 1];
    if (!next) { this.showdown(); return; }
    this.street = next;
    // 1장씩: 7th만 다운, 나머지 업 (폴드 제외, 올인 포함)
    const down = next === STREET.SEVENTH;
    for (const p of this.players) {
      if (p.folded || p.sittingOut) continue;
      p.hole.push({ ...this.deck.pop(), up: !down });
    }
    // 4th까지 스몰벳, 5th부터 빅벳
    const big = next === STREET.FIFTH || next === STREET.SIXTH || next === STREET.SEVENTH;
    this.minRaise = big ? this.bigBet : this.smallBet;
    // 선공: 최고 업카드
    const first = this.highBoardPlayer();
    this.actionIdx = this.players.indexOf(first);
    this.resetActed();
    this.log.push(`street: ${next}`);
    if (this.bettingComplete()) this.endStreet();
    else this.skipDone();
  }

  /** 7장 개인 카드 중 최상 5장 */
  showdownValue(p) {
    return eval7(p.hole.map((c) => ({ r: c.r, s: c.s })));
  }

  /** 공개 상태 — 업카드는 공개, 다운카드는 본인/쇼다운만 */
  publicState(viewerId) {
    const done = this.street === STREET.DONE;
    const HAND = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];
    return {
      gameType: 'sevenstud',
      street: this.street,
      isDiscardPhase: false,
      currentBet: this.currentBet,
      minRaiseTo: this.currentBet + this.minRaise,
      ante: this.ante, smallBet: this.smallBet, bigBet: this.bigBet,
      actionPlayerId: (this.street === STREET.DONE || this.street === STREET.WAITING)
        ? null : this.players[this.actionIdx % this.players.length]?.id ?? null,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, stack: p.stack, bet: p.bet,
        avatar: p.avatar, color: p.color, title: p.title, equipped: p.equipped,
        isBot: !!p.isBot,
        folded: p.folded, allin: p.allin, sittingOut: p.sittingOut,
        hand: p.hole.map((c) => (c.up || p.id === viewerId || done) ? { r: c.r, s: c.s, up: c.up } : null),
        handCount: p.hole.length,
        upCount: p.hole.filter((c) => c.up).length,
        toCall: this.toCall(p),
      })),
      winners: this.winners.map((w) => ({
        ...w, hand: w.hand ? { name: HAND[w.hand.cat] } : null,
      })),
    };
  }
}

/* ---------- 게임별 테이블 레지스트리 ---------- */
// 방 생성 시 gameType으로 테이블 클래스를 선택 (index.js start_game)
// 새 게임은 Table을 상속해 위 훅을 오버라이드하고 여기에 등록하면 됨
export const GAME_TABLES = {
  holdem: Table,
  pineapple: PineappleTable,
  blackjack: BlackjackTable,
  sevenstud: SevenStudTable,
};
