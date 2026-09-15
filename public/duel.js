/**
 * 결투 — 판 규칙과 진행.
 *
 * 서버(game.js)와 브라우저(혼자 연습 · 한 기기 둘이)가 이 파일 하나를 같이 쓴다.
 * 시간은 hooks.set / hooks.clear 로 받고, 일어난 일은 hooks.emit 으로 내보낸다.
 *
 * 한 판(라운드)
 *   round  → 등장 연출 (입력 무시)
 *   wait   → 신호를 기다린다. 이때 누르면 오발. 가짜 신호(decoy)가 섞인다
 *   signal → 신호. 화면이 받은 순간부터 누른 순간까지를 화면이 재서 ms 로 보낸다
 *   result → 판정
 *
 * 서부: 가장 빠른 사람이 1점(먼저 N점) 또는 서바이벌(오발·꼴찌 탈락, 마지막 1명)
 * 사무라이(1:1): 속공 > 강공 > 방어 > 속공. 같은 기술이면 빠른 쪽. 먼저 N점.
 */
(function (root) {
  'use strict';

  const MODES = ['west', 'samurai'];
  const RULES = ['points', 'survival'];
  const TARGETS = [1, 3, 5];
  const SIGNALS = ['mix', 'screen', 'sound'];
  const LEVELS = ['easy', 'normal', 'hard'];
  const MOVES = ['light', 'guard', 'heavy'];
  const MOVE_NAME = { light: '속공', guard: '방어', heavy: '강공' };
  const BEATS = { light: 'heavy', heavy: 'guard', guard: 'light' };
  const MAX_PLAYERS = { west: 4, samurai: 2 };

  const MIN_MS = 100;                         // 이보다 빠르면 보고 누른 게 아니다 — 부정출발
  const LIMIT = { west: 1500, samurai: 5000 };   // 사무라이는 고르는 시간
  const SLACK = 800;                          // 신호가 늦게 닿는 사람을 기다려 주는 여유

  const T = {
    first: 400,
    introFirst: { west: 5600, samurai: 5200 },   // 회전초(벚꽃) 전환 → 선수 소개 → 전환 → 결투장
    intro: { west: 2000, samurai: 2000 },
    waitMin: 2200, waitMax: 6500,
    stance: 2600,                                // 사무라이 — 발도술 자세를 잡고 어두워진 뒤 고르기가 열린다
    decoyGap: 900,                            // 가짜 신호와 진짜 신호 사이 최소 간격
    result: { west: 7800, samurai: 9400 },    // 사무라이 — 시작 소리 → 교차 · 마주 봄 · 무릎 · 목 감쌈 · 고꾸라짐 · 쓰러짐 → 등 뒤 컷 · 승자       // 총성 → 암전 → 무릎 · 쓰러짐 → 먼지 너머 승자 · 이름 / 시작 소리 → 스쳐 벰 → 무릎 · 쓰러짐 → 勝
    resultNone: { west: 3200, samurai: 7600 },   // 아무도 못 맞혔을 때 / 비겼을 때(엇갈림 → 불똥 → 引分을 충분히 보여 준다)
  };

  const SIG_KINDS = {
    west: { mix: ['word'], screen: ['word'], sound: ['bell'] },
    samurai: { mix: ['word', 'moon', 'gong'], screen: ['word', 'moon'], sound: ['gong'] },
  };
  const DECOY_KINDS = {
    west: { mix: ['weed', 'crow', 'fake', 'weed'], screen: ['weed', 'crow', 'fake', 'weed'], sound: ['caw', 'clunk'] },
    samurai: { mix: ['petal', 'bird', 'fake', 'knock'], screen: ['petal', 'bird', 'fake'], sound: ['chirp', 'knock'] },
  };
  const FAKE_WORDS = {
    west: ['지금?', '아직', '지름!', '지금…'],
    samurai: ['기다려', '벨까?', '아직', '斬?'],
  };

  // 봇 반응 속도(ms)와 가짜 신호에 움찔할 확률
  const BOT = {
    easy: { ms: [340, 560], flinch: 0.15 },
    normal: { ms: [250, 390], flinch: 0.06 },
    hard: { ms: [195, 280], flinch: 0.02 },
  };

  function normCfg(c) {
    c = c || {};
    const mode = MODES.includes(c.mode) ? c.mode : 'west';
    return {
      mode,
      rule: mode === 'samurai' ? 'points' : (RULES.includes(c.rule) ? c.rule : 'points'),
      target: TARGETS.includes(c.target) ? c.target : 1,   // 기본은 단판
      signal: SIGNALS.includes(c.signal) ? c.signal : 'mix',
      decoys: c.decoys !== false,               // 거짓 신호(회전초 · 까마귀 · "지금?")를 섞을지
    };
  }

  /** 입력 하나를 판정용 상태로 — ok · early(신호 전) · jump(너무 빠름) · late(안 누름/늦음) */
  function classify(inp, mode) {
    if (!inp) return { st: 'late', ms: null, move: null };
    if (inp.early) return { st: 'early', ms: null, move: null };
    if (mode !== 'samurai' && inp.ms < MIN_MS) return { st: 'jump', ms: inp.ms, move: inp.move || null };
    if (inp.ms > LIMIT[mode]) return { st: 'late', ms: inp.ms, move: inp.move || null };
    return { st: 'ok', ms: inp.ms, move: inp.move || null };
  }
  const isBad = x => x.st === 'early' || x.st === 'jump';

  /** 서부 — rows 에 place 를 달고 { win, out, why } */
  function resolveWest(rows, rule) {
    const ok = rows.filter(x => x.st === 'ok').sort((a, b) => a.ms - b.ms);
    let place = 0, prev = null;
    ok.forEach((x, i) => { if (x.ms !== prev) place = i + 1; x.place = place; prev = x.ms; });
    const win = ok.length ? ok.filter(x => x.ms === ok[0].ms).map(x => x.id) : [];
    let out = [];
    if (rule === 'survival') {
      const fail = rows.filter(x => x.st !== 'ok');
      if (fail.length && fail.length < rows.length) out = fail.map(x => x.id);
      else if (!fail.length && ok.length > 1) {
        const worst = ok[ok.length - 1].ms;
        const w = ok.filter(x => x.ms === worst);
        if (w.length < ok.length) out = w.map(x => x.id);
      }
    }
    const why = ok.length ? 'fastest' : (rows.some(isBad) ? 'allBad' : 'nobody');
    return { win, out, why };
  }

  /** 사무라이 1:1 — { win, out: [], why } */
  function resolveSamurai(rows) {
    const [a, b] = rows;
    if (!a || !b) return { win: a ? [a.id] : [], out: [], why: 'left' };
    if (isBad(a) && isBad(b)) return { win: [], out: [], why: 'bothEarly' };
    if (isBad(a)) return { win: [b.id], out: [], why: 'early' };
    if (isBad(b)) return { win: [a.id], out: [], why: 'early' };
    const act = x => x.st === 'ok';
    if (!act(a) && !act(b)) return { win: [], out: [], why: 'idle' };
    if (!act(a) || !act(b)) {
      const m = act(a) ? a : b;
      return m.move === 'guard' ? { win: [], out: [], why: 'guardIdle' } : { win: [m.id], out: [], why: 'openHit' };
    }
    // 같은 기술이면 칼끼리 맞부딪혀 비긴다
    if (a.move === b.move) return { win: [], out: [], why: a.move === 'guard' ? 'bothGuard' : 'clash' };
    const w = BEATS[a.move] === b.move ? a : b;
    return { win: [w.id], out: [], why: w.move };
  }

  class Duel {
    constructor(cfg, players, hooks) {
      hooks = hooks || {};
      this.cfg = normCfg(cfg);
      this.speed = hooks.speed || 1;
      this.emitFn = hooks.emit || (() => {});
      this.setT = hooks.set || ((f, ms) => setTimeout(f, ms));
      this.clearT = hooks.clear || (h => clearTimeout(h));
      this.rand = hooks.random || Math.random;
      this.players = players.map(p => ({
        id: p.id, name: p.name, bot: !!p.bot,
        level: BOT[p.level] ? p.level : 'normal',
      }));
      this.scores = {};
      for (const p of this.players) this.scores[p.id] = 0;
      this.alive = new Set(this.players.map(p => p.id));
      this.r = 0;
      this.phase = 'idle';          // idle | intro | wait | signal | result | done
      this.inputs = new Map();
      this.timers = new Set();
      this.sig = null;
      this.last = null;
      this.winnerId = null;
    }

    emit(ev) { try { this.emitFn(ev); } catch (e) { if (typeof console !== 'undefined') console.error(e); } }
    pick(a) { return a[Math.floor(this.rand() * a.length)]; }
    between(lo, hi) { return lo + this.rand() * (hi - lo); }

    later(fn, ms) {
      const h = this.setT(() => { this.timers.delete(h); fn(); }, Math.max(0, ms * this.speed));
      this.timers.add(h);
      return h;
    }
    clearAll() { for (const h of this.timers) this.clearT(h); this.timers.clear(); }
    stop() { this.clearAll(); this.phase = 'done'; }

    start() {
      this.phase = 'intro';
      this.later(() => this.round(), T.first);
    }

    round() {
      this.clearAll();
      this.r++;
      this.phase = 'intro';
      this.inputs = new Map();
      this.sig = null;
      this.emit({ k: 'round', r: this.r, fighters: [...this.alive], scores: { ...this.scores } });
      this.later(() => this.wait(), (this.r === 1 ? T.introFirst : T.intro)[this.cfg.mode]);
    }

    wait() {
      this.phase = 'wait';
      const r = this.r;
      this.emit({ k: 'wait', r });
      // 사무라이 — 가짜 신호 없이, 자세를 잡는 시간이 지나면 바로 고르기
      if (this.cfg.mode === 'samurai') return this.later(() => this.fire(), T.stance);
      const total = this.between(T.waitMin, T.waitMax);
      const x = this.rand();
      const n = !this.cfg.decoys ? 0 : x < 0.3 ? 0 : x < 0.75 ? 1 : 2;
      let last = 0;
      for (let i = 0; i < n; i++) {
        const at = this.between(Math.max(600, last + 700), total - T.decoyGap);
        if (at <= last || at > total - T.decoyGap) break;
        last = at;
        this.later(() => this.decoy(r), at);
      }
      this.later(() => this.fire(), total);
    }

    decoy(r) {
      if (this.phase !== 'wait' || r !== this.r) return;
      const kind = this.pick(DECOY_KINDS[this.cfg.mode][this.cfg.signal]);
      const ev = { k: 'decoy', r, kind };
      if (kind === 'fake') ev.word = this.pick(FAKE_WORDS[this.cfg.mode]);
      this.emit(ev);
      for (const p of this.players) {
        if (!p.bot || !this.alive.has(p.id) || this.inputs.has(p.id)) continue;
        if (this.rand() < BOT[p.level].flinch) {
          this.later(() => { if (this.r === r) this.input(p.id, { r, early: true }); }, this.between(220, 420));
        }
      }
    }

    fire() {
      if (this.phase !== 'wait') return;
      this.phase = 'signal';
      const r = this.r;
      this.sig = this.pick(SIG_KINDS[this.cfg.mode][this.cfg.signal]);
      this.emit({ k: 'signal', r, kind: this.sig });
      for (const p of this.players) {
        if (!p.bot || !this.alive.has(p.id) || this.inputs.has(p.id)) continue;
        const ms = Math.round(this.cfg.mode === 'samurai' ? this.between(700, 2800) : this.between(...BOT[p.level].ms));
        const move = this.pick(MOVES);
        this.later(() => { if (this.r === r) this.input(p.id, { r, ms, move }); }, ms);
      }
      this.later(() => this.resolve(), LIMIT[this.cfg.mode] + SLACK);
      this.checkAllIn();
    }

    /** a = { r, early, ms, move }. 받아들였으면 true */
    input(id, a) {
      a = a || {};
      if (!this.alive.has(id) || this.inputs.has(id)) return false;
      if (a.r != null && a.r !== this.r) return false;
      const samurai = this.cfg.mode === 'samurai';
      // 사무라이는 고르기가 열리기 전에 누른 것은 없던 일
      if (samurai && (this.phase === 'wait' || a.early)) return false;
      if (this.phase === 'wait' || (this.phase === 'signal' && a.early)) {
        this.inputs.set(id, { early: true });
        this.emit({ k: 'early', r: this.r, id });
        // 사무라이는 먼저 움직이면 그 자리에서 끝난다
        if (samurai || this.everyoneIn()) this.resolve();
        return true;
      }
      if (this.phase !== 'signal') return false;
      const ms = Math.round(Number(a.ms));
      if (!isFinite(ms) || ms < 0) return false;
      const move = samurai ? (MOVES.includes(a.move) ? a.move : null) : null;
      if (samurai && !move) return false;
      this.inputs.set(id, { ms, move });
      if (!samurai && ms < MIN_MS) this.emit({ k: 'early', r: this.r, id, jump: true });
      this.checkAllIn();
      return true;
    }

    everyoneIn() { return [...this.alive].every(id => this.inputs.has(id)); }
    checkAllIn() { if (this.phase === 'signal' && this.everyoneIn()) this.resolve(); }

    resolve() {
      if (this.phase !== 'signal' && this.phase !== 'wait') return;
      this.clearAll();
      this.phase = 'result';
      const mode = this.cfg.mode;
      const rows = [...this.alive].map(id => ({ id, ...classify(this.inputs.get(id), mode) }));
      const res = mode === 'samurai' ? resolveSamurai(rows) : resolveWest(rows, this.cfg.rule);
      if (mode === 'samurai') for (const x of rows) x.place = res.win.includes(x.id) ? 1 : (res.win.length ? 2 : null);
      for (const id of res.win) this.scores[id]++;
      for (const id of res.out) this.alive.delete(id);

      const over = this.overWinner();
      this.last = { r: this.r, sig: this.sig, rows, win: res.win, out: res.out, why: res.why };
      this.emit({ k: 'result', ...this.last, scores: { ...this.scores }, alive: [...this.alive], over: over != null, winnerId: over });
      if (over != null) this.finish(over, 'win');
      else this.later(() => this.round(), res.win.length ? T.result[mode] : T.resultNone[mode]);
    }

    overWinner() {
      if (this.alive.size <= 1) return this.alive.size ? [...this.alive][0] : null;
      if (this.cfg.rule === 'survival') return null;
      let best = -1, who = [];
      for (const id of this.alive) {
        const s = this.scores[id];
        if (s > best) { best = s; who = [id]; } else if (s === best) who.push(id);
      }
      return best >= this.cfg.target && who.length === 1 ? who[0] : null;
    }

    finish(winnerId, why) {
      this.clearAll();
      this.phase = 'done';
      this.winnerId = winnerId;
      this.later(() => this.emit({ k: 'over', winnerId, why, scores: { ...this.scores } }), why === 'win' ? T.result[this.cfg.mode] : 0);
    }

    /** 판 중에 나간 사람 */
    forfeit(id) {
      if (!this.alive.has(id) || this.phase === 'done') return;
      this.alive.delete(id);
      this.inputs.delete(id);
      if (this.alive.size <= 1) return this.finish(this.alive.size ? [...this.alive][0] : null, 'left');
      if (this.phase === 'signal') this.checkAllIn();
    }

    snapshot() {
      return {
        cfg: this.cfg, r: this.r, phase: this.phase, sig: this.phase === 'signal' ? this.sig : null,
        scores: { ...this.scores }, alive: [...this.alive], last: this.last, winnerId: this.winnerId,
        players: this.players.map(p => ({ id: p.id, name: p.name, bot: p.bot })),
        done: [...this.inputs.keys()],
      };
    }
  }

  const API = {
    Duel, normCfg, classify, resolveWest, resolveSamurai,
    MODES, RULES, TARGETS, SIGNALS, LEVELS, MOVES, MOVE_NAME, BEATS,
    MAX_PLAYERS, MIN_MS, LIMIT, SLACK, T, SIG_KINDS, DECOY_KINDS, BOT,
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.DuelRules = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
