/**
 * 결투(총잡이) — 캔버스 연출.
 *
 * 그림은 전부 이미지(img/)에서 온다. 코드는 자르고 · 옮기고 · 번쩍이기만 한다.
 *   plate.jpg  사람을 지운 결투장 (1408×768)
 *   back.png   앞에 선 판초 뒷모습,  back_arm.png 총 드는 오른 아래팔
 *   gunN.png   총잡이 전신,  gunN_far.png 멀리 선 모습(대기 색),  gunN_bust.png 가슴 위
 *   weed.png   회전초,  low.jpg 낮은 카메라 배경
 *
 * 흐름
 *   title(결투 글자) → field(처음) · board(대기방, 수배서 벽) → [회전초] → versus(번개 선수 소개) → [회전초] → duel
 *   → 총성 × 상대 수 → 암전 → fall(무릎 · 쓰러짐, 다리 쪽 낮은 카메라) → 먼지 → reveal(멀리 승자 · 이름)
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const PW = 1408, PH = 768, HORIZON = 294;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
  const easeIn = t => Math.pow(clamp(t), 2.2);
  const easeIO = t => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const now = () => performance.now();

  const CHARS = [
    { key: 'gun1', ko: '떠돌이', en: 'THE STRANGER', color: '#9a6a3c' },
    { key: 'gun2', ko: '사냥꾼', en: 'THE HUNTER', color: '#7a5a3a' },
    { key: 'gun3', ko: '보안관', en: 'THE SHERIFF', color: '#4f5e45' },
    { key: 'gun4', ko: '검은 옷', en: 'THE MAN IN BLACK', color: '#2c2a2e' },
  ];
  // 멀리 서는 자리 (plate 좌표, 발끝)
  const SLOTS = [{ x: 955, y: 512 }, { x: 1165, y: 486 }, { x: 790, y: 468 }];
  const figH = y => (y - HORIZON + 4) * 1.26;
  // 서체: 한글 제목은 함렛(굵은 명조), 영문은 알파 슬랩(나무 활자), 수배서 손글씨는 나눔손글씨 펜
  const FONT_T = '"Hahmlet", "Nanum Myeongjo", serif';
  const FONT_W = '"Alfa Slab One", Georgia, serif';
  const FONT_H = '"Nanum Pen Script", cursive';
  const FONT_JP = '"Yuji Syuku", "Noto Serif JP", "Hahmlet", serif';

  function load(src) {
    return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }

  class West {
    constructor(canvas, sound) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.S = sound;
      this.img = {};
      this.view = 'none';
      this.fore = { char: 0, raiseAt: -1e9, gone: false };
      this.far = new Map();          // 대기실 · 처음 화면의 먼 사람들
      this.weeds = [];
      this.dust = [];
      this.motes = [];
      this.wipe = null;
      this.flashes = [];
      this.shake = { at: -1e9, dur: 1, amp: 0 };
      this.texts = [];
      this.match = null;
      this.timers = [];
      this.nextWeed = 0;
      this.last = now();
      this.ready = this.loadAll();
      this.resize();
      addEventListener('resize', () => this.resize());
      for (let i = 0; i < 40; i++) this.motes.push({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.01, r: 0.6 + Math.random() * 1.6, ph: Math.random() * TAU });
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    async loadAll() {
      const names = ['plate.jpg', 'back.png', 'back_arm.png', 'back_down.png', 'back_dead.png', 'weed.png', 'low.jpg', 'poster_blank.png', 'wood.jpg', 'ink_stroke.png', 'mode_west_bg.jpg', 'mode_west_man.png', 'mode_samurai_bg.jpg', 'mode_samurai_man.png',
        ...CHARS.flatMap(c => [`${c.key}.png`, `${c.key}_far.png`, `${c.key}_bust.png`])];
      const imgs = await Promise.all(names.map(n => load('/img/' + n)));
      names.forEach((n, i) => { this.img[n.replace(/\.\w+$/, '')] = imgs[i]; });
      this.sil = CHARS.map((c, i) => this.silhouette(this.img[c.key], i));
      this.puff = this.makePuff();
      try { await Promise.all([document.fonts.load(`900 40px ${FONT_T}`), document.fonts.load(`40px ${FONT_W}`), document.fonts.load(`40px ${FONT_H}`), document.fonts.load(`40px ${FONT_JP}`, '一騎討準備中'), document.fonts.load('40px Rye'), document.fonts.load('40px "Nanum Brush Script"')]); } catch (_) {}
    }

    /** 판초가 아닌 사람이 앞에 설 때 — 역광에 뭉개진 어깨 너머 실루엣 */
    silhouette(img, i) {
      if (!img || i === 0) return null;
      const c = document.createElement('canvas');
      c.width = img.width + 16; c.height = img.height + 16;
      const g = c.getContext('2d');
      try { g.filter = 'blur(2.5px)'; } catch (_) {}
      g.drawImage(img, 8, 8);
      g.filter = 'none';
      g.globalCompositeOperation = 'source-atop';
      const gr = g.createLinearGradient(0, 0, c.width, 0);
      gr.addColorStop(0, 'rgba(24,17,12,.97)'); gr.addColorStop(0.8, 'rgba(34,24,16,.93)'); gr.addColorStop(1, 'rgba(90,64,40,.9)');
      g.fillStyle = gr;
      g.fillRect(0, 0, c.width, c.height);
      return c;
    }

    makePuff() {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(214,196,164,.9)');
      gr.addColorStop(0.45, 'rgba(206,186,152,.5)');
      gr.addColorStop(1, 'rgba(200,180,150,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return c;
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const r = this.cv.getBoundingClientRect();
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.dpr = dpr;
      this.cv.width = Math.round(this.W * dpr);
      this.cv.height = Math.round(this.H * dpr);
    }

    later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

    /* ═════════════════════ 바깥에서 부르는 것 ═════════════════════ */

    title() {
      this.clearTimers(); this.view = 'title'; this.viewAt = now(); this.match = null;
      this._tev = {}; this.sparks = []; this.smokes = [];
    }
    /** 시작 화면 연출을 건너뛴다 */
    skipTitle() {
      if (this.view !== 'title' || now() - this.viewAt > 2900) return;
      this.viewAt = now() - 2900;
      this._tev = { s1: true, s2: true, sl: true, cl: true };
      this.smokes = [];
    }
    get titleDone() { return this.view !== 'title' || now() - this.viewAt > 2700; }

    /**
     * 처음 화면 · 대기실. others: [{id, char}] — 새로 온 사람은 지평선에서 걸어 나오고, 나간 사람은 돌아 걸어간다.
     */
    field(foreChar, others = [], { instant = false } = {}) {
      if (this.view !== 'field') { this.clearTimers(); this.fieldAt = now(); }
      const from = this.view;
      if (from === 'title' || from === 'select') this.startWipe('field');
      else this.view = 'field';
      this.match = null;
      this.fore.char = foreChar;
      this.fore.gone = false;
      const keep = new Set();
      others.slice(0, SLOTS.length).forEach((o, i) => {
        keep.add(o.id);
        const slot = SLOTS[i];
        let f = this.far.get(o.id);
        if (!f) {
          f = { id: o.id, char: o.char, x: slot.x, y: slot.y, from: { x: slot.x + (i === 2 ? -60 : 60), y: HORIZON + 22 }, at: now(), dur: instant ? 0 : 3400, leaving: false };
          this.far.set(o.id, f);
          if (!instant) this.steps(3400);
        } else if (f.x !== slot.x || f.y !== slot.y) {
          const p = this.farPos(f);
          f.from = { x: p.x, y: p.y }; f.x = slot.x; f.y = slot.y; f.at = now(); f.dur = 1400;
        }
        f.char = o.char;
      });
      for (const f of this.far.values()) {
        if (keep.has(f.id) || f.leaving) continue;
        const p = this.farPos(f);
        f.from = { x: p.x, y: p.y }; f.x = p.x + 40; f.y = HORIZON + 20; f.at = now(); f.dur = 2600; f.leaving = true;
        setTimeout(() => { if (this.far.get(f.id) === f) this.far.delete(f.id); }, 2700);
      }
    }

    steps(dur) {
      if (!this.S) return;
      const n = Math.floor(dur / 430);
      for (let i = 1; i < n; i++) setTimeout(() => this.S.step && this.S.step(0.15 + 0.5 * i / n), i * 430);
    }

    /** players: [{id, name, char, me}], foreId, oppOf(r) 는 app 이 정하지 않고 여기서 돌린다 */
    startMatch({ players, foreId, target }) {
      this.clearTimers();
      this.match = { players, foreId, target, scores: {}, r: 0, phase: 'intro', res: null, oppId: null, sigAt: 0, fake: null };
      for (const p of players) this.match.scores[p.id] = 0;
      this.far.clear();
    }

    pl(id) { return this.match && this.match.players.find(p => p.id === id); }

    round(ev) {
      const m = this.match;
      if (!m) return;
      this.clearTimers();
      m.r = ev.r; m.phase = 'intro'; m.res = null; m.fighters = ev.fighters; m.scores = ev.scores;
      m.raised = new Set(); m.early = new Set(); m.sig = null; m.fake = null;
      // 결투장에 보이는 상대 — 라운드마다 돌아가며
      const others = ev.fighters.filter(id => id !== m.foreId);
      m.oppId = others.length ? others[(ev.r - 1) % others.length] : null;
      this.fore.char = (this.pl(m.foreId) || {}).char || 0;
      this.fore.gone = false; this.fore.raiseAt = -1e9;
      if (ev.r === 1) {
        this.startWipe('versus', () => { this.versusAt = now() + 420; this.later(() => this.S && this.S.thunder(), 420); });
        this.later(() => this.startWipe('duel', () => { this.duelAt = now(); }), 3700);
      } else {
        this.startWipe('duel', () => { this.duelAt = now(); });
      }
    }

    wait() { if (this.match) { this.match.phase = 'wait'; this.waitAt = now(); } }

    decoy(ev) {
      const m = this.match; if (!m) return;
      if (ev.kind === 'weed') this.spawnWeed(true);
      if (ev.kind === 'crow') this.crow = { at: now(), dir: Math.random() < 0.5 ? 1 : -1 };
      if (ev.kind === 'fake') m.fake = { word: ev.word, at: now() };
    }

    signal(ev) {
      const m = this.match; if (!m) return;
      m.phase = 'signal'; m.sig = { kind: ev.kind, at: now(), hide: ev.hide };
    }

    /** 내가 누른 순간 — 손이 올라가고 총이 불을 뿜는다 */
    shoot(id) {
      const m = this.match; if (!m) return;
      m.raised.add(id);
      if (id === m.foreId) { this.fore.raiseAt = now(); this.shakeIt(140, 9); }
    }

    early(id) {
      const m = this.match; if (!m) return;
      m.early.add(id);
      if (id === m.foreId && this.fore.raiseAt < 0) { this.fore.raiseAt = now(); this.fore.misfire = true; }
      if (id === m.foreId) this.say('오발!', '#ffcf5a', 1200);
    }

    say(text, color = '#fff', dur = 1500, size = 0.09) { this.texts.push({ text, color, at: now(), dur, size }); }

    result(ev) {
      const m = this.match; if (!m) return;
      m.phase = 'result';
      m.scores = ev.scores;
      m.sig = null; m.fake = null;
      if (!ev.win.length) {
        this.say(ev.why === 'allBad' ? '모두 오발' : '아무도 쏘지 않았다', '#f3e2c0', 2600, 0.07);
        return;
      }
      const winId = ev.win[0];
      const losers = ev.rows.filter(r => !ev.win.includes(r.id));
      // 쓰러지는 사람 — 가장 아깝게 진 사람
      const ok = losers.filter(r => r.st === 'ok').sort((a, b) => a.ms - b.ms);
      const loser = ok[0] || losers[0];
      const row = ev.rows.find(r => r.id === winId);
      m.res = { at: now(), winId, loserId: loser ? loser.id : null, ms: row ? row.ms : null, shots: Math.max(1, ev.rows.length - 1), over: ev.over };
      const t0 = m.res.at;
      // 총성 × 상대 수 → 암전
      for (let i = 0; i < m.res.shots; i++) {
        this.later(() => {
          this.flashes.push({ at: now(), dur: 130 });
          this.shakeIt(160, 14);
          this.S && this.S.shot(i > 0);
        }, i * 150);
      }
      this.later(() => { this.view = 'black'; }, m.res.shots * 150 + 140);
      const FALL = m.res.shots * 150 + 700;
      m.res.fallAt = t0 + FALL;
      this.later(() => { this.view = 'fall'; this.S && this.S.wind(true); }, FALL);
      this.later(() => this.S && this.S.thud(0.6), FALL + 780);
      this.later(() => this.S && this.S.clink(), FALL + 900);
      m.res.hazeAt = t0 + FALL + 2400;
      this.later(() => { this.S && this.S.thud(1); this.dustBurst(); this.shakeIt(300, 10); }, FALL + 2400);
      m.res.revealAt = t0 + FALL + 3100;                 // 먼지막이 가장 짙을 때 장면을 바꾼다
      this.later(() => { this.view = 'reveal'; }, FALL + 3100);
      m.res.nameAt = t0 + FALL + 4300;
      this.later(() => this.S && this.S.whistle(), FALL + 4000);
    }

    over(ev) { if (this.match) this.match.overAt = now(); void ev; }

    /* ═════════════════════ 효과 ═════════════════════ */

    shakeIt(dur, amp) { this.shake = { at: now(), dur, amp }; }

    startWipe(to, onMid) {
      // 지금 그림을 떠 두고, 새 장면 위를 회전초가 오른쪽→왼쪽으로 닦는다
      const snap = document.createElement('canvas');
      snap.width = this.cv.width; snap.height = this.cv.height;
      snap.getContext('2d').drawImage(this.cv, 0, 0);
      this.wipe = { snap, at: now(), dur: 950 };
      this.view = to;
      if (onMid) onMid();
      this.S && this.S.whoosh(0.9);
    }

    spawnWeed(big) {
      const y = big ? 560 + Math.random() * 120 : 420 + Math.random() * 110;
      const s = big ? 1.2 + Math.random() * 0.4 : (y - HORIZON) / 250 * (0.6 + Math.random() * 0.3);
      const dir = Math.random() < 0.75 ? -1 : 1;
      this.weeds.push({ x: dir < 0 ? PW + 150 : -150, y, s, dir, v: (big ? 520 : 70 + Math.random() * 60) * (0.8 + s * 0.3), rot: 0, ph: Math.random() * TAU });
      if (big) this.S && this.S.whoosh(0.8);
    }

    dustBurst() {
      const { W, H } = this;
      for (let i = 0; i < 70; i++) {
        const a = -Math.PI * (0.05 + Math.random() * 0.9);
        const sp = 0.15 + Math.random() * 0.6;
        this.dust.push({ x: W * (0.5 + (Math.random() - 0.5) * 0.3), y: H * (0.8 + Math.random() * 0.1), vx: Math.cos(a) * sp * W, vy: Math.sin(a) * sp * H * 0.7, r: H * (0.06 + Math.random() * 0.12), g: 1 + Math.random() * 1.5, age: 0, life: 3.2 + Math.random() * 1.6 });
      }
    }

    /* ═════════════════════ 루프 ═════════════════════ */

    loop() {
      const t = now();
      if (this.cv.clientWidth !== Math.round(this.W) || this.cv.clientHeight !== Math.round(this.H)) this.resize();
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(t, dt);
      try { this.draw(t); } catch (e) { console.error(e); }
      requestAnimationFrame(this.loop);
    }

    update(t, dt) {
      const busy = this.view === 'field' || this.view === 'duel';
      if (busy && t > this.nextWeed) {
        if (this.weeds.filter(w => w.s < 1).length < 2) this.spawnWeed(false);
        this.nextWeed = t + 4000 + Math.random() * 6000;
      }
      for (const w of this.weeds) {
        w.x += w.dir * w.v * dt;
        w.ph += dt * (4 + w.v / 80);
        w.rot += w.dir * w.v * dt / (60 * w.s);
      }
      this.weeds = this.weeds.filter(w => w.x > -300 && w.x < PW + 300);
      for (const d of this.dust) {
        d.age += dt;
        d.vx *= 1 - dt * 1.6; d.vy *= 1 - dt * 1.6;
        d.vy -= dt * this.H * 0.02;
        d.x += d.vx * dt + Math.sin(d.age * 1.3 + d.r) * dt * 20; d.y += d.vy * dt;
        d.r += dt * this.H * 0.035 * d.g;
      }
      this.dust = this.dust.filter(d => d.age < d.life);
      for (const mo of this.motes) { mo.x += mo.v * dt; mo.y += Math.sin(t / 2000 + mo.ph) * dt * 0.005; if (mo.x > 1.05) mo.x = -0.05; }
    }

    /** plate 좌표로 그리기 — 화면을 꽉 채우게(cover) 맞추고 cx,cy 를 가운데로 */
    plateCam(cx, cy, z) {
      const { ctx, W, H } = this;
      const base = Math.max(W / PW, H / PH);
      const s = base * z;
      // 가장자리가 비지 않게 가운데 좌표를 막는다
      const hw = W / (2 * s), hh = H / (2 * s);
      cx = clamp(cx, hw, PW - hw); cy = clamp(cy, hh, PH - hh);
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      return s;
    }

    draw(t) {
      const { ctx, W, H, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b0806';
      ctx.fillRect(0, 0, W, H);
      if (!this.img.plate) return;
      ctx.save();
      const sp = (t - this.shake.at) / this.shake.dur;
      if (sp < 1) { const a = this.shake.amp * (1 - sp); ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
      switch (this.view) {
        case 'title': this.drawTitle(t); break;
        case 'select': this.drawSelect(t); break;
        case 'board': this.drawBoard(t); break;
        case 'westhome': this.drawWestHome(t); break;
        case 'field': this.drawField(t); break;
        case 'versus': this.drawVersus(t); break;
        case 'duel': this.drawDuel(t); break;
        case 'fall': this.drawFall(t); break;
        case 'reveal': this.drawReveal(t); break;
      }
      ctx.restore();
      if (!['versus', 'black', 'title', 'board', 'select', 'westhome'].includes(this.view)) this.drawGrade(t);
      this.drawFlashes(t);
      this.drawTexts(t);
      this.drawWipe(t);
    }

    /* ─────────── 시작 화면 ─────────── */

    /**
     * 시작 화면 — 어둠 속 총 두 발. 총구 불빛에 "결투"가 얼핏 비치고 화약 연기가 번진다.
     * 칼빛이 결과 투 사이를 비스듬히 베면 두 글자가 칼자국을 따라 살짝 엇갈린 채 드러나고,
     * 글자 뒤에서 칼 두 자루가 맞부딪히며 DUEL 과 게임 시작.
     */
    drawTitle(t) {
      const { ctx, W, H } = this;
      const a = t - this.viewAt;
      const S1 = 350, S2 = 1050, SL = 1750, CL = 2500;
      const cx = W / 2, cy = H * 0.36;
      const fs = Math.min(W * 0.3, H * 0.3);
      const ev = this._tev || (this._tev = {});
      const once = (k, at, fn) => { if (!ev[k] && a >= at) { ev[k] = true; fn(); } };
      const muzzles = [
        { k: 's1', at: S1, x: W * 0.03, y: H * 0.66, ang: -0.18, seed: 3 },
        { k: 's2', at: S2, x: W * 0.97, y: H * 0.28, ang: Math.PI + 0.12, seed: 7 },
      ];
      for (const m of muzzles) {
        once(m.k, m.at, () => {
          this.S && this.S.shot(false);
          this.shakeIt(170, 9);
          this.smokes = this.smokes || [];
          for (let i = 0; i < 22; i++) {
            const sp = (0.2 + Math.random()) * fs * 0.9;
            const an = m.ang + (Math.random() - 0.5) * 0.9;
            this.smokes.push({ x: m.x + Math.cos(m.ang) * fs * 0.15, y: m.y + Math.sin(m.ang) * fs * 0.15, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - fs * 0.05, r: fs * (0.09 + Math.random() * 0.1), age: 0, life: 2.4 + Math.random() * 1.8 });
          }
        });
      }
      once('sl', SL, () => { this.S && this.S.slash(); this.shakeIt(240, 7); });
      once('cl', CL, () => {
        this.S && this.S.thud(0.5); this.S && this.S.clink();
        this.shakeIt(320, 11);
        this.flashes.push({ at: t, dur: 140 });
        this.sparks = [];
        for (let i = 0; i < 90; i++) {
          const ang = Math.random() * TAU;
          const sp = (0.3 + Math.random()) * fs * 3.2;
          const bp = this.btnCenter();
          this.sparks.push({ x: bp.x, y: bp.y + bp.w * 0.12, vx: Math.cos(ang) * sp * 0.6, vy: Math.sin(ang) * sp * 0.6, age: 0, life: 0.25 + Math.random() * 0.6 });
        }
      });
      const dt = Math.min(0.05, (t - (this._tlast || t)) / 1000); this._tlast = t;

      // 바탕
      ctx.fillStyle = '#030201'; ctx.fillRect(0, 0, W, H);
      const cut = a >= SL + 100;
      const warm = cut ? easeOut((a - SL) / 800) : 0;
      if (warm > 0) {
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
        bg.addColorStop(0, `rgba(58,34,20,${warm})`); bg.addColorStop(0.6, `rgba(20,12,7,${warm})`); bg.addColorStop(1, 'rgba(4,2,1,0)');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      }
      let lit = 0;
      for (const m of muzzles) {
        const d = a - m.at;
        const k = d >= 0 ? Math.exp(-d / 150) * (d < 30 ? 1 : 0.85 + 0.15 * Math.sin(d / 9)) : 0;
        lit = Math.max(lit, k);
        if (k < 0.01) continue;
        const lg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, W * 1.1);
        lg.addColorStop(0, `rgba(255,210,140,${0.8 * k})`); lg.addColorStop(0.3, `rgba(150,86,36,${0.35 * k})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      }

      // 칼 두 자루 — 게임 시작 단추 뒤에서 X 로 맞부딪혀 그대로 걸린다
      this.drawTitleSwords(t, a - CL, fs);

      // 글자 — 칼 전엔 총구 불빛에만 비치고, 벤 뒤엔 칼자국을 따라 엇갈린다
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${fs}px ${FONT_T}`;
      const w0 = ctx.measureText('결').width, w1 = ctx.measureText('투').width;
      const gap = fs * 0.06;
      const x0 = cx - (w0 + w1 + gap) / 2 + w0 / 2;
      const x1 = x0 + w0 / 2 + gap + w1 / 2;
      const gapX = x0 + w0 / 2 + gap / 2;
      const cutAng = -1.12;                        // 오른쪽 위 → 왼쪽 아래
      const ux = Math.cos(cutAng), uy = Math.sin(cutAng);
      const shift = cut ? fs * lerp(0.26, 0.17, easeOut((a - SL - 100) / 500)) : 0;
      const textA = cut ? 1 : lit * 0.92;
      // 먹 붓자국 시안은 글자 뒤에 깔린다
      if ((this.cutStyle ?? 1) === 3 && a >= SL + 110) this.drawCutScar(3, easeOut((a - SL - 110) / 400), gapX, cy, ux, uy, fs, t);
      if (textA > 0.01) {
        ctx.globalAlpha = textA;
        const tg = ctx.createLinearGradient(0, cy - fs * 0.5, 0, cy + fs * 0.5);
        tg.addColorStop(0, '#f7ead2'); tg.addColorStop(0.55, '#dcc29a'); tg.addColorStop(1, '#8e6c46');
        ctx.fillStyle = tg;
        ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = fs * 0.08; ctx.shadowOffsetY = fs * 0.03;
        ctx.fillText('결', x0 + ux * shift, cy + uy * shift);
        ctx.fillText('투', x1 - ux * shift, cy - uy * shift);
      }
      ctx.restore();

      // 벤 자국 — 시안 다섯 가지 (this.cutStyle)
      if (a >= SL + 110 && (this.cutStyle ?? 1) !== 3) this.drawCutScar(this.cutStyle ?? 1, easeOut((a - SL - 110) / 400), gapX, cy, ux, uy, fs, t);
      // 칼빛 — 결과 투 사이를 지나간다
      const sd = a - SL;
      if (sd >= 0 && sd < 560) {
        const len = Math.max(W, H) * 1.2;
        const p0 = { x: gapX - ux * len / 2, y: cy - uy * len / 2 };
        const p1 = { x: gapX + ux * len / 2, y: cy + uy * len / 2 };
        const p = easeOut(sd / 110);
        const fade = 1 - clamp((sd - 110) / 450);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(200,225,255,.95)'; ctx.shadowBlur = 34;
        ctx.strokeStyle = `rgba(235,244,255,${fade})`;
        ctx.lineWidth = Math.max(2, fs * 0.028) * (0.35 + fade * 0.65);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(lerp(p1.x, p0.x, p), lerp(p1.y, p0.y, p)); ctx.stroke();
        ctx.restore();
      }

      // 총구 화염 — 총구 앞으로 길게 뻗는 불꽃 · 옆으로 터지는 불꽃 · 하얀 심
      for (const m of muzzles) {
        const d = a - m.at;
        if (d >= 0 && d < 110) this.drawMuzzleReal(m.x, m.y, fs * 0.85, m.ang, d, m.seed);
      }
      // 화약 연기
      if (this.smokes && this.puff) {
        ctx.save();
        for (const s of this.smokes) {
          s.age += dt; s.vx *= 1 - dt * 1.4; s.vy = s.vy * (1 - dt * 1.4) - fs * 0.02 * dt;
          s.x += s.vx * dt + Math.sin(s.age * 1.7 + s.r) * dt * 6; s.y += s.vy * dt; s.r += dt * fs * 0.09;
          const k = 1 - s.age / s.life;
          if (k <= 0) continue;
          const glow = Math.max(0, lit);
          ctx.globalAlpha = 0.28 * k * (0.55 + glow);
          ctx.drawImage(this.smokeSprite(), s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
        ctx.restore();
        this.smokes = this.smokes.filter(s => s.age < s.life);
      }
      // 불꽃
      if (this.sparks && this.sparks.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.sparks) {
          p.age += dt; p.vx *= 0.93; p.vy = p.vy * 0.93 + fs * 0.08; p.x += p.vx * dt; p.y += p.vy * dt;
          const k = 1 - p.age / p.life;
          if (k <= 0) continue;
          ctx.strokeStyle = `rgba(255,${Math.round(170 + 80 * k)},${Math.round(90 * k)},${k})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
        }
        ctx.restore();
        this.sparks = this.sparks.filter(p => p.age < p.life);
      }
      // DUEL · 금빛 줄
      const le = easeOut((a - CL - 100) / 600);
      if (le > 0) {
        const y = cy + fs * 0.78;
        const halfW = fs * 1.05 * le;
        ctx.fillStyle = `rgba(201,161,94,${0.9 * le})`;
        ctx.fillRect(cx - halfW, y, halfW - fs * 0.34, Math.max(1, fs * 0.012));
        ctx.fillRect(cx + fs * 0.34, y, halfW - fs * 0.34, Math.max(1, fs * 0.012));
        ctx.save();
        ctx.globalAlpha = le;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `${fs * 0.13}px ${FONT_W}`;
        ctx.fillStyle = '#c9a15e';
        ctx.fillText('D U E L', cx, y + fs * 0.01);
        ctx.restore();
      }
    }

    /**
     * 벤 자국 시안
     *  0 선 없음 — 어긋난 글자만, 틈에 옅은 그림자
     *  1 빛 실선 — 양 끝이 가늘어지는 금빛 한 줄
     *  2 붉은 칼자국 — 끝이 날카롭게 빠지는 붉은 획, 핏방울 몇 개
     *  3 먹 붓자국 — 글자 뒤로 마른 붓 한 획
     *  4 화면이 갈라진 틈 — 화면 끝까지 이어지는 가는 틈과 어긋난 가장자리
     */
    drawCutScar(style, k, gx, gy, ux, uy, fs, t) {
      const { ctx, W, H } = this;
      const reach = fs * 1.05;
      const A = { x: gx - ux * reach, y: gy - uy * reach }, B = { x: gx + ux * reach, y: gy + uy * reach };
      const nx = -uy, ny = ux;
      ctx.save();
      if (style === 0) {
        ctx.globalCompositeOperation = 'multiply';
        const g = ctx.createLinearGradient(gx - nx * fs * 0.05, gy - ny * fs * 0.05, gx + nx * fs * 0.05, gy + ny * fs * 0.05);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(0,0,0,${0.5 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(A.x - nx * fs * 0.05, A.y - ny * fs * 0.05); ctx.lineTo(B.x - nx * fs * 0.05, B.y - ny * fs * 0.05);
        ctx.lineTo(B.x + nx * fs * 0.05, B.y + ny * fs * 0.05); ctx.lineTo(A.x + nx * fs * 0.05, A.y + ny * fs * 0.05);
        ctx.fill();
      } else if (style === 1) {
        const w = fs * 0.014 * k;
        ctx.fillStyle = '#f6dfae';
        ctx.shadowColor = 'rgba(255,210,140,.8)'; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y); ctx.lineTo(gx + nx * w, gy + ny * w); ctx.lineTo(B.x, B.y); ctx.lineTo(gx - nx * w, gy - ny * w);
        ctx.closePath(); ctx.fill();
      } else if (style === 2) {
        const w = fs * 0.03 * k;
        const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
        g.addColorStop(0, 'rgba(120,14,10,0)'); g.addColorStop(0.3, '#8e1a12'); g.addColorStop(0.55, '#b02518'); g.addColorStop(1, 'rgba(120,14,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(gx + nx * w, gy + ny * w, B.x, B.y); ctx.quadraticCurveTo(gx - nx * w * 0.4, gy - ny * w * 0.4, A.x, A.y);
        ctx.fill();
        ctx.fillStyle = '#9a1f14';
        for (let i = 0; i < 5; i++) {
          const f = 0.35 + i * 0.09, px = lerp(A.x, B.x, f) + nx * w, py = lerp(A.y, B.y, f) + ny * w;
          const drip = fs * (0.03 + (i % 3) * 0.03) * easeOut((k - 0.3) / 0.7);
          ctx.beginPath(); ctx.ellipse(px, py + drip, fs * 0.008, drip * 0.6 + 1, 0, 0, TAU); ctx.fill();
        }
      } else if (style === 3) {
        const img = this.img.ink_stroke;
        if (img) {
          ctx.globalAlpha = 0.9 * k;
          ctx.translate(gx, gy);
          ctx.rotate(Math.atan2(uy, ux) + Math.PI);
          const L = fs * 2.8 * lerp(0.6, 1, k), T = fs * 0.42;
          ctx.filter = 'sepia(1) saturate(3) hue-rotate(-20deg) brightness(.55)';
          ctx.drawImage(img, -L / 2, -T / 2, L, T);
          ctx.filter = 'none';
        }
      } else if (style === 4) {
        const far = Math.max(W, H);
        const P = { x: gx - ux * far, y: gy - uy * far }, Q = { x: gx + ux * far, y: gy + uy * far };
        ctx.strokeStyle = `rgba(0,0,0,${0.9 * k})`;
        ctx.lineWidth = fs * 0.03;
        ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(Q.x, Q.y); ctx.stroke();
        ctx.strokeStyle = `rgba(255,228,180,${0.7 * k})`;
        ctx.lineWidth = 1.5;
        for (const sgn of [-1, 1]) {
          const o = fs * 0.015 * sgn;
          ctx.beginPath(); ctx.moveTo(P.x + nx * o, P.y + ny * o); ctx.lineTo(Q.x + nx * o, Q.y + ny * o); ctx.stroke();
        }
      }
      ctx.restore();
      void t;
    }

    /** 게임 시작 단추 가운데 (화면 좌표). app 이 btnRect 를 넣어 준다 */
    btnCenter() {
      const r = this.btnRect && this.btnRect();
      if (r && r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
      return { x: this.W / 2, y: this.H * 0.8, w: 260 };
    }

    /** 단추에 마우스를 올리면 칼이 벌어졌다가 다시 맞부딪힌다 */
    titleHover(on) {
      if (this.view !== 'title') return;
      const h = this._hov || (this._hov = { on: false, at: -1e9, hit: true });
      if (on && !h.on) { h.at = now(); h.hit = false; }
      h.on = on;
    }

    drawTitleSwords(t, cd, fs) {
      if (cd <= -240) return;
      const bp = this.btnCenter();
      const L = Math.max(bp.w * 0.9, fs * 1.0);
      // 위에서 내리꽂혀 단추 뒤에 거의 눕듯이 X 로 걸린다
      const stab = easeIn((cd + 240) / 240);
      const rec = cd > 0 ? Math.exp(-cd / 150) * Math.sin(cd / 38) * 0.04 : 0;
      const h = this._hov || { on: false, at: -1e9, hit: true };
      const ha = t - h.at;
      // 호버 — 가위처럼 깔짝: 0–90 벌어짐, 90–160 닫힘(부딪힘), 그 뒤 가라앉음
      let snip = 0;
      if (ha < 90) snip = 0.26 * easeOut(ha / 90);
      else if (ha < 160) snip = lerp(0.26, -0.05, easeIn((ha - 90) / 70));
      else if (ha < 520) snip = -0.05 * Math.exp(-(ha - 160) / 90) * Math.cos((ha - 160) / 40);
      if (ha >= 155 && !h.hit) {
        h.hit = true;
        this.S && this.S.clink();
        for (let i = 0; i < 18; i++) {
          const an = Math.random() * TAU;
          const sp = (0.3 + Math.random()) * fs * 1.4;
          this.sparks.push({ x: bp.x, y: bp.y + bp.w * 0.02, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, age: 0, life: 0.2 + Math.random() * 0.35 });
        }
      }
      const cross = { x: bp.x, y: bp.y + bp.w * 0.02 };
      const BASE = 0.36;                              // 가로에서 20° 남짓 — 거의 누운 X
      for (const side of [-1, 1]) {
        const ang = (side < 0 ? BASE : Math.PI - BASE) + (side < 0 ? -1 : 1) * (snip + rec);
        const d = L * 0.55 + (1 - stab) * this.H * 0.7;
        const hx = cross.x - Math.cos(ang) * d - (1 - stab) * side * 0;
        const hy = cross.y - Math.sin(ang) * d;
        this.drawKatana(hx, hy, L, ang, side);
      }
    }

    smokeSprite() {
      if (this._smoke) return this._smoke;
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(190,184,176,.9)'); gr.addColorStop(0.5, 'rgba(160,154,146,.45)'); gr.addColorStop(1, 'rgba(140,134,126,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return (this._smoke = c);
    }

    /** 총구 화염. ang 방향으로 쏜다. d: 불붙은 뒤 ms */
    drawMuzzleReal(x, y, size, ang, d, seed) {
      const { ctx } = this;
      const k = 1 - d / 110;
      const grow = easeOut(d / 25);
      let s = seed * 9301;
      const rnd = () => ((s = (s * 16807 + 11) % 2147483647) / 2147483647);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      // 앞으로 뻗는 원뿔
      const len = size * (0.9 + 0.5 * grow) * (0.6 + 0.4 * k);
      const cone = ctx.createLinearGradient(0, 0, len, 0);
      cone.addColorStop(0, `rgba(255,250,230,${k})`); cone.addColorStop(0.25, `rgba(255,200,90,${0.9 * k})`); cone.addColorStop(0.7, `rgba(255,110,30,${0.5 * k})`); cone.addColorStop(1, 'rgba(160,40,10,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.05);
      for (let i = 0; i <= 10; i++) {
        const tt = i / 10;
        ctx.lineTo(len * tt, -size * (0.05 + 0.16 * Math.sin(tt * Math.PI)) * (0.7 + rnd() * 0.6));
      }
      for (let i = 10; i >= 0; i--) {
        const tt = i / 10;
        ctx.lineTo(len * tt, size * (0.05 + 0.16 * Math.sin(tt * Math.PI)) * (0.7 + rnd() * 0.6));
      }
      ctx.closePath(); ctx.fill();
      // 옆으로 터지는 작은 불꽃 네 갈래
      for (const sgn of [-1, 1]) {
        for (const f of [0.18, 0.42]) {
          const px = len * f, sl = size * (0.22 + rnd() * 0.18) * k;
          const g = ctx.createLinearGradient(px, 0, px + sl * 0.4, sgn * sl);
          g.addColorStop(0, `rgba(255,220,140,${0.8 * k})`); g.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(px - size * 0.03, 0); ctx.lineTo(px + sl * 0.45, sgn * sl); ctx.lineTo(px + size * 0.06, 0);
          ctx.closePath(); ctx.fill();
        }
      }
      // 하얀 심과 번짐
      const core = ctx.createRadialGradient(size * 0.06, 0, 0, size * 0.06, 0, size * 0.45);
      core.addColorStop(0, `rgba(255,255,255,${k})`); core.addColorStop(0.3, `rgba(255,230,170,${0.7 * k})`); core.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(size * 0.06, 0, size * 0.45, 0, TAU); ctx.fill();
      ctx.restore();
    }

    /** 칼 — (hx, hy) 는 날밑 자리, ang 은 칼끝 방향, L 은 칼날 길이 */
    drawKatana(hx, hy, L, ang, side) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(hx, hy); ctx.rotate(ang);
      const w = L * 0.028;
      // 칼날 (살짝 휨)
      const bl = ctx.createLinearGradient(0, -w, 0, w);
      bl.addColorStop(0, '#f6f9fc'); bl.addColorStop(0.45, '#b9c3cc'); bl.addColorStop(0.55, '#8b959e'); bl.addColorStop(1, '#4c545b');
      ctx.fillStyle = bl;
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.9);
      ctx.quadraticCurveTo(L * 0.55, -w * 1.9 * side * 0 - w * 2.2, L, -w * 0.4);
      ctx.lineTo(L * 1.02, 0);
      ctx.quadraticCurveTo(L * 0.55, -w * 0.6, 0, w * 0.9);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, w * 0.15);
      ctx.beginPath(); ctx.moveTo(w, -w * 0.7); ctx.quadraticCurveTo(L * 0.55, -w * 2.0, L * 0.98, -w * 0.35); ctx.stroke();
      // 날밑
      ctx.fillStyle = '#6b5424';
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.9, w * 3.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,150,.35)';
      ctx.beginPath(); ctx.ellipse(-w * 0.2, -w, w * 0.35, w * 1.4, 0, 0, TAU); ctx.fill();
      // 손잡이 — 검은 끈을 마름모로 감았다
      const hl = L * 0.3;
      ctx.fillStyle = '#16110e';
      ctx.fillRect(-hl - w, -w * 1.2, hl, w * 2.4);
      ctx.fillStyle = '#d8ccb2';
      const n = 7;
      for (let i = 0; i < n; i++) {
        const px = -w - hl + (i + 0.5) * hl / n;
        ctx.beginPath(); ctx.moveTo(px - hl / n * 0.35, 0); ctx.lineTo(px, -w * 0.85); ctx.lineTo(px + hl / n * 0.35, 0); ctx.lineTo(px, w * 0.85); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#8a6a2a'; ctx.fillRect(-hl - w * 1.8, -w * 1.3, w * 0.9, w * 2.6);
      ctx.restore();
    }

    /* ─────────── 모드 고르기 — 왼쪽 StandOff · 오른쪽 一騎討 ─────────── */

    select() {
      const from = this.view;
      this.clearTimers();
      this.sel = { hover: null, split: 0.5, pick: null, pickAt: 0, from: 0.5, at: now() };
      if (from === 'title') this.startWipe('select', null, 'flash'); else this.view = 'select';
      this.match = null;
    }

    /** 처음 화면에서 되돌아가기 — 서부 쪽이 다시 반으로 줄어든다 */
    backToSelect() {
      this.clearTimers();
      this.sel = { hover: null, split: 1.2, pick: null, pickAt: 0, from: 1.2, at: now() - 2000 };
      this.view = 'select';
    }

    selectSide(x) { const s = this.sel; return x < (s ? s.split : 0.5) * this.W ? 'west' : 'samurai'; }

    selectHover(x) {
      const s = this.sel;
      if (!s || s.pick || this.view !== 'select') return;
      const side = x == null ? null : this.selectSide(x);
      if (side !== s.hover && side && this.S) this.S.step(0.5);
      s.hover = side;
    }

    /** 고른 쪽이 화면을 다 덮을 때 done(side) */
    selectPick(x, done) {
      const s = this.sel;
      if (!s || s.pick || this.view !== 'select') return;
      s.pick = this.selectSide(x);
      s.pickAt = now(); s.from = s.split;
      this.S && this.S.whoosh(0.7);
      this.later(() => done(s.pick), 850);
    }

    selectReset() {
      const s = this.sel;
      if (!s) return;
      s.from = s.split; s.pickAt = now(); s.pick = null; s.back = true;
    }

    drawSelect(t) {
      const { ctx, W, H } = this;
      const s = this.sel;
      if (!s) return;
      const dt = Math.min(0.05, (t - (s.last || t)) / 1000); s.last = t;
      if (s.pick) s.split = lerp(s.from, s.pick === 'west' ? 1.2 : -0.2, easeIO((t - s.pickAt) / 800));
      else {
        const target = s.hover === 'west' ? 0.6 : s.hover === 'samurai' ? 0.4 : 0.5;
        s.split += (target - s.split) * Math.min(1, dt * 7);
      }
      const intro = easeOut((t - s.at) / 700);
      const slant = W * 0.05;
      const sx = s.split * W;
      const panels = [
        { side: 'west', bg: this.img.mode_west_bg, man: this.img.mode_west_man, poly: [[0, 0], [sx + slant, 0], [sx - slant, H], [0, H]], cxp: sx / 2, off: -(1 - intro) * W * 0.5 },
        { side: 'samurai', bg: this.img.mode_samurai_bg, man: this.img.mode_samurai_man, poly: [[sx + slant, 0], [W, 0], [W, H], [sx - slant, H]], cxp: sx + (W - sx) / 2, off: (1 - intro) * W * 0.5 },
      ];
      ctx.fillStyle = '#050302'; ctx.fillRect(0, 0, W, H);
      for (const p of panels) {
        if (!p.bg) continue;
        const on = s.pick ? s.pick === p.side : s.hover === p.side;
        const dim = s.pick ? (on ? 0 : 0.8) : s.hover ? (on ? 0 : 0.62) : 0.22;
        p.dimNow = p.dimNow == null ? dim : p.dimNow;
        ctx.save();
        ctx.translate(p.off, 0);
        ctx.beginPath(); p.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.clip();
        // 배경 — 패널 가운데로 조금 끌어온다
        const bs = Math.max(W / p.bg.width, H / p.bg.height) * (on ? 1.06 : 1.02);
        const bw = p.bg.width * bs, bh = p.bg.height * bs;
        ctx.drawImage(p.bg, (W - bw) / 2 + (p.cxp - W / 2) * 0.5, (H - bh) / 2, bw, bh);
        // 사람
        if (p.man) {
          const mh = H * (on ? 0.9 : 0.86);
          const mw = p.man.width * mh / p.man.height;
          const shadow = ctx.createRadialGradient(p.cxp, H * 0.97, 0, p.cxp, H * 0.97, mw * 0.6);
          shadow.addColorStop(0, 'rgba(0,0,0,.55)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = shadow; ctx.fillRect(p.cxp - mw, H * 0.9, mw * 2, H * 0.12);
          const mx = p.cxp - mw / 2, my = H * 0.99 - mh;
          // 배경 빛을 받은 가장자리 — 서부는 오른쪽 위 햇빛, 사무라이는 왼쪽 위 달빛
          const rim = this.backlit(p.side === 'west' ? 'mode_west_man' : 'mode_samurai_man');
          if (rim) {
            ctx.save();
            ctx.globalAlpha = 0.28;
            const rs = p.side === 'west' ? 1 : -1;
            ctx.filter = p.side === 'west' ? 'none' : 'hue-rotate(180deg) saturate(0.4) brightness(1.4)';
            ctx.drawImage(rim.rim, mx + rs * mh * 0.004, my - mh * 0.003, mw, mh);
            ctx.restore();
          }
          ctx.drawImage(p.man, mx, my, mw, mh);
        }
        // 발밑 안개 · 먼지
        const fog = ctx.createLinearGradient(0, H * 0.7, 0, H);
        const fc = p.side === 'west' ? '200,160,110' : '190,205,230';
        fog.addColorStop(0, `rgba(${fc},0)`); fog.addColorStop(0.7, `rgba(${fc},.35)`); fog.addColorStop(1, `rgba(${fc},.5)`);
        ctx.fillStyle = fog; ctx.fillRect(0, H * 0.7, W, H * 0.3);
        // 빛 — 서부 햇살, 사무라이는 눈발
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (p.side === 'west') {
          const sun = ctx.createRadialGradient(p.cxp + W * 0.25, -H * 0.1, 0, p.cxp + W * 0.25, -H * 0.1, H * 1.1);
          sun.addColorStop(0, 'rgba(255,210,140,.35)'); sun.addColorStop(1, 'rgba(255,180,100,0)');
          ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(255,225,180,.5)';
          for (const mo of this.motes) { ctx.beginPath(); ctx.arc(mo.x * W, mo.y * H, mo.r, 0, TAU); ctx.fill(); }
        } else {
          ctx.fillStyle = 'rgba(235,240,255,.7)';
          for (const mo of this.motes) {
            const yy = ((mo.y + t / 9000 * (0.6 + mo.v * 40)) % 1) * H;
            const xx = (mo.x * W + Math.sin(t / 1300 + mo.ph) * 18);
            ctx.beginPath(); ctx.arc(xx, yy, mo.r * 1.2, 0, TAU); ctx.fill();
          }
        }
        ctx.restore();
        const shade = ctx.createLinearGradient(0, H * 0.45, 0, H);
        shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.75)');
        ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = p.side === 'west' ? 'rgba(10,5,2,1)' : 'rgba(2,4,12,1)';
        ctx.globalAlpha = dim;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        // 이름
        const fsz = Math.min(H * 0.1, W * 0.07);
        const lx = p.side === 'west' ? Math.max(W * 0.05, 24) : W - Math.max(W * 0.05, 24);
        ctx.textAlign = p.side === 'west' ? 'left' : 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 1 - dim * 0.6;
        ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 20;
        const lg = ctx.createLinearGradient(0, H * 0.8 - fsz, 0, H * 0.8);
        lg.addColorStop(0, '#fff3d6'); lg.addColorStop(1, '#d6a860');
        ctx.fillStyle = lg;
        ctx.font = p.side === 'west' ? `${fsz}px Rye, ${FONT_W}` : `${fsz * 1.15}px ${FONT_JP}`;
        ctx.fillText(p.side === 'west' ? 'StandOff' : '一騎討', lx + p.off * 0, H * 0.84);
        ctx.shadowBlur = 0;
        if (p.side === 'west') {
          ctx.font = `${fsz * 0.24}px ${FONT_W}`;
          ctx.fillStyle = 'rgba(255,236,200,.9)';
          ctx.fillText('★  DEAD OR ALIVE  ★   총잡이 1–4인', lx, H * 0.84 + fsz * 0.45);
        } else {
          ctx.font = `${fsz * 0.42}px "Nanum Brush Script", cursive`;
          ctx.fillStyle = 'rgba(240,244,255,.92)';
          ctx.fillText('사무라이 일대일 · 준비 중', lx, H * 0.84 + fsz * 0.55);
          // 붉은 낙관
          const sz = fsz * 0.55;
          const tx = lx - ctx.measureText('사무라이 일대일 · 준비 중').width - sz * 1.2;
          ctx.save();
          ctx.translate(tx, H * 0.84 + fsz * 0.2); ctx.rotate(-0.06);
          ctx.fillStyle = 'rgba(179,38,30,.92)';
          ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
          ctx.fillStyle = '#f5e6d8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `${sz * 0.4}px ${FONT_JP}`;
          ctx.fillText('準備', 0, -sz * 0.18); ctx.fillText('中', 0, sz * 0.24);
          ctx.restore();
        }
        ctx.restore();
      }
      // 가르는 선
      ctx.save();
      ctx.strokeStyle = 'rgba(255,236,200,.85)'; ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(255,210,150,.9)'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(sx + slant, 0); ctx.lineTo(sx - slant, H); ctx.stroke();
      ctx.restore();
      if (!s.pick && intro > 0.95) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `700 ${Math.max(12, H * 0.022)}px ${FONT_T}`;
        ctx.fillStyle = 'rgba(255,240,215,.7)';
        ctx.fillText('결투 방식을 고르세요', W / 2, H * 0.07);
        ctx.restore();
      }
    }

    /** 옆에서 본 권총 — 총구가 +x. 크기 L */
    drawRevolver(x, y, L, rot, gleam) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot); ctx.scale(L, L);
      ctx.lineJoin = 'round';
      const steel = ctx.createLinearGradient(0, -0.16, 0, 0.1);
      steel.addColorStop(0, '#c9d0d6'); steel.addColorStop(0.35, '#6e767e'); steel.addColorStop(1, '#23272c');
      // 손잡이
      const wood = ctx.createLinearGradient(-0.35, 0, 0, 0.4);
      wood.addColorStop(0, '#7a4a28'); wood.addColorStop(1, '#3a2010');
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.moveTo(-0.08, 0.02); ctx.bezierCurveTo(-0.14, 0.14, -0.26, 0.3, -0.3, 0.42);
      ctx.quadraticCurveTo(-0.24, 0.5, -0.15, 0.46);
      ctx.bezierCurveTo(-0.1, 0.32, -0.02, 0.18, 0.04, 0.07); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1b0f07'; ctx.lineWidth = 0.012; ctx.stroke();
      // 방아쇠울
      ctx.strokeStyle = '#3a3f45'; ctx.lineWidth = 0.022;
      ctx.beginPath(); ctx.arc(0.07, 0.07, 0.07, 0.1, Math.PI * 0.95); ctx.stroke();
      ctx.fillStyle = '#2a2e33'; ctx.fillRect(0.05, 0.02, 0.015, 0.08);
      // 뭉치 · 실린더 · 공이치기
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(-0.14, -0.09); ctx.lineTo(0.22, -0.09); ctx.lineTo(0.24, 0.04); ctx.lineTo(0.02, 0.07); ctx.lineTo(-0.1, 0.05); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.13, -0.08); ctx.lineTo(-0.22, -0.16); ctx.lineTo(-0.18, -0.18); ctx.lineTo(-0.08, -0.1); ctx.fill();
      ctx.fillStyle = '#4b5259';
      roundRectPath(ctx, -0.02, -0.12, 0.2, 0.16, 0.03); ctx.fill();
      ctx.strokeStyle = 'rgba(20,22,25,.8)'; ctx.lineWidth = 0.008;
      for (const yy of [-0.07, -0.03, 0.01]) { ctx.beginPath(); ctx.moveTo(0.0, yy); ctx.lineTo(0.16, yy); ctx.stroke(); }
      // 총열
      ctx.fillStyle = steel;
      ctx.fillRect(0.2, -0.085, 0.62, 0.055);
      ctx.fillRect(0.2, -0.03, 0.44, 0.03);
      ctx.fillStyle = '#1d2024'; ctx.fillRect(0.78, -0.11, 0.025, 0.03);
      // 번쩍
      const gx = lerp(-0.3, 0.9, gleam);
      const sh = ctx.createLinearGradient(gx - 0.08, 0, gx + 0.08, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.45)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh; ctx.fillRect(-0.2, -0.085, 1.05, 0.03);
      ctx.restore();
    }

    /* ─────────── 대기방 — 나무 벽에 수배서 ─────────── */

    /** list: [{id, name, char, me, host, bot}] — 들어오면 수배서가 박히고, 나가면 떨어진다 */
    board(list) {
      if (this.view !== 'board') {
        this.clearTimers();
        this.posters = new Map();
        this.boardAt = now();
        if (this.view === 'title' || this.view === 'westhome' || this.view === 'select') this.startWipe('board'); else this.view = 'board';
        this.match = null;
      }
      const keep = new Set();
      list.slice(0, 4).forEach((p, i) => {
        keep.add(p.id);
        const old = this.posters.get(p.id);
        if (old && !old.leaving) { Object.assign(old, p, { slot: i }); return; }
        const fresh = now() - this.boardAt > 300;
        const delay = fresh ? 0 : 500 + i * 160;
        this.posters.set(p.id, { ...p, slot: i, at: now() + delay, tilt: (Math.random() - 0.5) * 0.05, leaving: 0 });
        if (this.S) setTimeout(() => { this.S.clunk(); this.S.clink(); }, delay + 200);
      });
      for (const q of this.posters.values()) {
        if (!keep.has(q.id) && !q.leaving) {
          q.leaving = now();
          setTimeout(() => { if (this.posters.get(q.id) === q) this.posters.delete(q.id); }, 700);
        }
      }
    }

    /** 대기방 화면 좌표 → { slot, id(없으면 null) } */
    slotAt(x, y) {
      for (const [i, r] of (this.slotRects || []).entries()) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          const q = [...(this.posters || new Map()).values()].find(v => v.slot === i && !v.leaving);
          return { slot: i, id: q ? q.id : null, rect: r };
        }
      }
      return null;
    }
    posterAt(x, y) { const s = this.slotAt(x, y); return s ? s.id : null; }

    /** 가슴 위 사진을 수배서에 인쇄된 것처럼 — 세피아, 대비, 가장자리 번짐 */
    photo(char) {
      this._photos = this._photos || {};
      if (this._photos[char]) return this._photos[char];
      const img = this.img[CHARS[char].key + '_bust'];
      if (!img) return null;
      const BW = 420, BH = 300;
      const c = document.createElement('canvas'); c.width = BW; c.height = BH;
      const g = c.getContext('2d');
      g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, BW, BH);
      const k = BW * 0.66 / img.width;
      g.drawImage(img, (BW - img.width * k) / 2, 8, img.width * k, img.height * k);
      const d = g.getImageData(0, 0, BW, BH);
      for (let i = 0; i < d.data.length; i += 4) {
        const l = (0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]) / 255;
        const v = clamp((l - 0.5) * 1.3 + 0.52);
        d.data[i] = 58 + v * 182; d.data[i + 1] = 42 + v * 162; d.data[i + 2] = 28 + v * 122;
      }
      g.putImageData(d, 0, 0);
      const vg = g.createRadialGradient(BW / 2, BH / 2, BH * 0.3, BW / 2, BH / 2, BW * 0.65);
      vg.addColorStop(0, 'rgba(90,60,30,0)'); vg.addColorStop(1, 'rgba(90,60,30,.45)');
      g.fillStyle = vg; g.fillRect(0, 0, BW, BH);
      return (this._photos[char] = c);
    }

    drawBoard(t) {
      const { ctx, W, H } = this;
      const wood = this.img.wood, poster = this.img.poster_blank;
      if (!wood || !poster) return;
      const ws = Math.max(W / wood.width, H / wood.height);
      ctx.drawImage(wood, (W - wood.width * ws) / 2, (H - wood.height * ws) / 2, wood.width * ws, wood.height * ws);
      const light = ctx.createRadialGradient(W / 2, H * 0.1, 0, W / 2, H * 0.3, Math.max(W, H) * 0.8);
      light.addColorStop(0, 'rgba(255,220,160,.18)'); light.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = light; ctx.fillRect(0, 0, W, H);
      // 네 자리는 app 이 비워 둔 벽 자리(wallRect) 안에 — 넓으면 한 줄, 좁으면 두 줄
      const r = (this.wallRect && this.wallRect()) || { left: 0, top: 58, width: W, height: H - 160 };
      const aspect = poster.width / poster.height;
      const fit = c => { const rw = Math.ceil(4 / c); return Math.min((r.height - (rw + 1) * 12) / rw, (r.width - (c + 1) * 28) / c / aspect); };
      const cols = fit(4) >= fit(2) ? 4 : 2, rows = cols === 4 ? 1 : 2;
      const ph = fit(cols);
      const pw = ph * aspect;
      const gx = (r.width - cols * pw) / (cols + 1);
      const gy = (r.height - rows * ph) / (rows + 1);
      const at = i => ({ x: r.left + gx + (i % cols) * (pw + gx), y: r.top + gy + Math.floor(i / cols) * (ph + gy) });
      this.slotRects = [0, 1, 2, 3].map(i => ({ ...at(i), w: pw, h: ph }));
      const list = [...(this.posters || new Map()).values()];
      for (let i = 0; i < 4; i++) {
        if (list.some(v => v.slot === i && !v.leaving)) continue;
        const { x, y } = at(i);
        this.drawEmptyPoster(x, y, pw, ph, t, i);
      }
      for (const q of list) {
        const { x, y } = at(q.slot);
        this.drawPoster(q, x, y, pw, ph, t);
      }
    }

    drawNail(x, y, r) {
      const { ctx } = this;
      ctx.fillStyle = '#1d1712'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,210,.35)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); ctx.fill();
    }

    /** 수배서 속 — 사진 틀 · DEAD OR ALIVE · 이름. k = 화면 픽셀 / 원본 픽셀 */
    posterFace(k, { pic, name, empty }) {
      const { ctx } = this;
      const bx = 64, by = 150, bw = 448, bh = 318;
      ctx.fillStyle = empty ? 'rgba(59,36,20,.18)' : '#2e1c10';
      ctx.fillRect((bx - 7) * k, (by - 7) * k, (bw + 14) * k, (bh + 14) * k);
      ctx.fillStyle = '#e6d5ad';
      ctx.fillRect((bx - 3) * k, (by - 3) * k, (bw + 6) * k, (bh + 6) * k);
      if (pic) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(pic, bx * k, by * k, bw * k, bh * k);
        ctx.restore();
      } else {
        // 빈 자리 — 누군지 모를 까만 실루엣
        ctx.fillStyle = 'rgba(42,26,14,.8)';
        const cx = (bx + bw / 2) * k, base = (by + bh) * k;
        ctx.beginPath();
        ctx.moveTo(cx - 150 * k, base);
        ctx.quadraticCurveTo(cx - 140 * k, base - 90 * k, cx - 60 * k, base - 110 * k);
        ctx.lineTo(cx - 40 * k, base - 150 * k);
        ctx.quadraticCurveTo(cx - 60 * k, base - 200 * k, cx - 45 * k, base - 215 * k);
        ctx.lineTo(cx - 120 * k, base - 215 * k);
        ctx.quadraticCurveTo(cx - 150 * k, base - 225 * k, cx - 120 * k, base - 240 * k);
        ctx.quadraticCurveTo(cx - 60 * k, base - 250 * k, cx - 52 * k, base - 270 * k);
        ctx.quadraticCurveTo(cx - 40 * k, base - 305 * k, cx, base - 300 * k);
        ctx.quadraticCurveTo(cx + 40 * k, base - 305 * k, cx + 52 * k, base - 270 * k);
        ctx.quadraticCurveTo(cx + 60 * k, base - 250 * k, cx + 120 * k, base - 240 * k);
        ctx.quadraticCurveTo(cx + 150 * k, base - 225 * k, cx + 120 * k, base - 215 * k);
        ctx.lineTo(cx + 45 * k, base - 215 * k);
        ctx.quadraticCurveTo(cx + 60 * k, base - 200 * k, cx + 40 * k, base - 150 * k);
        ctx.lineTo(cx + 60 * k, base - 110 * k);
        ctx.quadraticCurveTo(cx + 140 * k, base - 90 * k, cx + 150 * k, base);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(230,213,173,.85)';
        ctx.font = `${120 * k}px ${FONT_W}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', cx, base - 175 * k);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#3b2414';
      ctx.font = `${50 * k}px Rye, ${FONT_W}`;
      ctx.fillText('DEAD OR ALIVE', 288 * k, 540 * k, 470 * k);
      ctx.fillRect(90 * k, 560 * k, 396 * k, 3 * k);
      ctx.fillStyle = empty ? 'rgba(59,36,20,.55)' : '#2a170c';
      ctx.font = `900 ${104 * k}px ${FONT_T}`;
      ctx.fillText(name, 288 * k, 672 * k, 480 * k);
    }

    drawEmptyPoster(x, y, pw, ph, t, i) {
      const { ctx } = this;
      const poster = this.img.poster_blank;
      const k = pw / poster.width;
      const hover = this.slotHover === i;
      ctx.save();
      ctx.translate(x, y);
      // 해진 종이 한 장이 반쯤 떼어진 채 붙어 있다 — 흐리게, 점선 테두리
      ctx.globalAlpha = hover ? 0.95 : 0.72;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = ph * 0.03; ctx.shadowOffsetY = ph * 0.01;
      ctx.filter = 'grayscale(.6) brightness(.8)';
      ctx.drawImage(poster, 0, 0, pw, ph);
      ctx.restore();
      ctx.filter = 'none';
      this.posterFace(k, { pic: null, name: '빈 자리', empty: true });
      ctx.globalAlpha = 1;
      ctx.setLineDash([10 * k * 2, 8 * k * 2]);
      ctx.lineDashOffset = -t / 40;
      ctx.strokeStyle = hover ? 'rgba(255,214,140,.95)' : 'rgba(255,230,190,.55)';
      ctx.lineWidth = Math.max(2, 5 * k);
      ctx.strokeRect(-6, -6, pw + 12, ph + 12);
      ctx.setLineDash([]);
      if (this.canAddBot) {
        const pulse = 0.75 + 0.25 * Math.sin(t / 380 + i);
        ctx.fillStyle = `rgba(142,42,28,${hover ? 1 : 0.85 * pulse})`;
        const bw = 330 * k, bh = 70 * k, bx = (576 * k - bw) / 2, byy = 700 * k - bh / 2 + 12 * k;
        ctx.fillRect(bx, byy - 4 * k, bw, bh);
        ctx.fillStyle = '#f3e1b8';
        ctx.font = `900 ${34 * k}px ${FONT_T}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+ 봇 앉히기', 288 * k, byy + bh / 2 - 4 * k);
      }
      this.drawNail(pw / 2, 14 * k, 7 * k);
      ctx.restore();
    }

    drawPoster(q, x, y, pw, ph, t) {
      const { ctx } = this;
      const poster = this.img.poster_blank;
      const k = pw / poster.width;
      if (t < q.at) return;
      const e = easeOut((t - q.at) / 420);
      let drop = (1 - e) * -ph * 0.18, rot = q.tilt + (1 - e) * 0.16, alpha = clamp(e * 2);
      if (q.leaving) {
        const l = easeIn((t - q.leaving) / 600);
        drop = l * ph * 0.5; rot = q.tilt + l * 0.5; alpha = 1 - l;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x + pw / 2, y + 14 * k + drop);
      ctx.rotate(rot);
      ctx.translate(-pw / 2, -14 * k);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = ph * 0.04; ctx.shadowOffsetY = ph * 0.015;
      ctx.drawImage(poster, 0, 0, pw, ph);
      ctx.restore();
      this.posterFace(k, { pic: this.photo(q.char % 4), name: q.name });
      // 도장 — 나 · 봇 · 방장
      const stamps = [];
      if (q.me) stamps.push('나');
      if (q.bot) stamps.push('BOT');
      if (q.host) stamps.push('방장');
      stamps.forEach((stamp, si) => {
        const se = easeOut((t - q.at - 380 - si * 120) / 220);
        if (se <= 0) return;
        ctx.save();
        ctx.translate((si ? 120 : 452) * k, (si ? 425 : 420) * k); ctx.rotate(si ? 0.14 : -0.2);
        const sc = lerp(1.8, 1, se);
        ctx.scale(sc, sc);
        ctx.globalAlpha = alpha * 0.85 * se;
        ctx.strokeStyle = '#a3241b'; ctx.fillStyle = '#a3241b';
        ctx.lineWidth = 6 * k;
        ctx.font = stamp === 'BOT' ? `${40 * k}px ${FONT_W}` : `900 ${44 * k}px ${FONT_T}`;
        const tw = ctx.measureText(stamp).width + 36 * k, th = 70 * k;
        ctx.strokeRect(-tw / 2, -th / 2, tw, th);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(stamp, 0, 3 * k);
        ctx.restore();
      });
      this.drawNail(pw / 2, 14 * k, 7 * k);
      ctx.restore();
    }

    /* ─────────── 방 만들기 전 — 서부 거리, 사람은 오른쪽 ─────────── */

    westHome() {
      const from = this.view;
      this.clearTimers();
      this.homeAt = now();
      this.homeFrom = from === 'select' ? 0.6 : 0.72;
      if (from === 'title' || from === 'board' || from === 'over') this.startWipe('westhome'); else this.view = 'westhome';
      this.match = null;
    }

    drawWestHome(t) {
      const { ctx, W, H } = this;
      const bg = this.img.mode_west_bg, man = this.img.mode_west_man;
      if (!bg) return;
      const a = t - (this.homeAt || t);
      const bs = Math.max(W / bg.width, H / bg.height) * 1.06;
      const bw = bg.width * bs, bh = bg.height * bs;
      ctx.drawImage(bg, (W - bw) / 2 + W * 0.05 + Math.sin(t / 9000) * 8, (H - bh) / 2, bw, bh);
      const narrow = W < 760;
      const mxN = lerp(this.homeFrom || 0.72, narrow ? 0.5 : 0.7, easeIO(a / 800));
      if (man) {
        const mh = H * (narrow ? 0.7 : 0.9);
        const mw = man.width * mh / man.height;
        const cx = W * mxN;
        const shadow = ctx.createRadialGradient(cx, H * 0.97, 0, cx, H * 0.97, mw * 0.6);
        shadow.addColorStop(0, 'rgba(0,0,0,.55)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadow; ctx.fillRect(cx - mw, H * 0.9, mw * 2, H * 0.12);
        const rim = this.backlit('mode_west_man');
        if (rim) { ctx.save(); ctx.globalAlpha = 0.28; ctx.drawImage(rim.rim, cx - mw / 2 + mh * 0.004, H * 0.99 - mh - mh * 0.003, mw, mh); ctx.restore(); }
        ctx.drawImage(man, cx - mw / 2, H * 0.99 - mh + Math.sin(t / 1400) * 1.5, mw, mh);
      }
      const shade = ctx.createLinearGradient(0, 0, W * 0.6, 0);
      shade.addColorStop(0, 'rgba(10,6,3,.55)'); shade.addColorStop(1, 'rgba(10,6,3,0)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
      const fog = ctx.createLinearGradient(0, H * 0.7, 0, H);
      fog.addColorStop(0, 'rgba(200,160,110,0)'); fog.addColorStop(1, 'rgba(200,160,110,.45)');
      ctx.fillStyle = fog; ctx.fillRect(0, H * 0.7, W, H * 0.3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sun = ctx.createRadialGradient(W * 0.95, -H * 0.1, 0, W * 0.95, -H * 0.1, H * 1.1);
      sun.addColorStop(0, 'rgba(255,210,140,.35)'); sun.addColorStop(1, 'rgba(255,180,100,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,225,180,.5)';
      for (const mo of this.motes) { ctx.beginPath(); ctx.arc(mo.x * W, mo.y * H, mo.r, 0, TAU); ctx.fill(); }
      ctx.restore();
    }

    /* ─────────── 처음 화면 ─────────── */


    farPos(f) {
      const p = f.dur ? easeIO((now() - f.at) / f.dur) : 1;
      return { x: lerp(f.from.x, f.x, p), y: lerp(f.from.y, f.y, p), p };
    }

    drawField(t) {
      const { ctx, W, H } = this;
      const drift = Math.sin(t / 7000) * 12;
      ctx.save();
      // 멀리 선 사람이 있으면 그 사람들이 화면에 들어오게 가운데를 옮긴다
      const z = 1.03;
      const hw = W / (2 * Math.max(W / PW, H / PH) * z);
      let right = 0;
      for (const f of this.far.values()) if (!f.leaving) right = Math.max(right, f.x);
      const cx = right ? Math.max(720, right + 90 - hw) : (W < H ? 560 : 720);
      this.fieldCx = this.fieldCx == null ? cx : lerp(this.fieldCx, cx, 0.03);
      this.plateCam(this.fieldCx + drift, 390, z);
      ctx.drawImage(this.img.plate, 0, 0, PW, PH);
      const items = [];
      for (const f of this.far.values()) {
        const p = this.farPos(f);
        items.push({ y: p.y, fn: () => this.drawFar(f.char, p.x, p.y, { walk: p.p < 1 ? t : 0, alpha: f.leaving ? 1 - p.p : clamp(p.p * 4) }) });
      }
      for (const w of this.weeds) if (w.s < 1) items.push({ y: w.y, fn: () => this.drawWeed(w) });
      items.sort((a, b) => a.y - b.y).forEach(i => i.fn());
      this.drawFore(t, (t - (this.fieldAt || 0)));
      for (const w of this.weeds) if (w.s >= 1) this.drawWeed(w);
      ctx.restore();
    }

    drawFar(char, x, y, { walk = 0, alpha = 1, smoke = 0 } = {}) {
      const { ctx } = this;
      const img = this.img[CHARS[char].key + '_far'] || this.img[CHARS[char].key];
      if (!img || alpha <= 0) return;
      const h = figH(y);
      const w = img.width * h / img.height;
      let bob = 0, rot = 0;
      if (walk) { const ph = walk / 430 * Math.PI; bob = -Math.abs(Math.sin(ph)) * h * 0.018; rot = Math.sin(ph) * 0.022; }
      ctx.save();
      ctx.globalAlpha = alpha;
      // 그림자 — 원래 사진처럼 왼쪽 뒤로 길게
      ctx.fillStyle = 'rgba(70,52,34,.22)';
      ctx.beginPath(); ctx.ellipse(x - h * 0.28, y + 1, h * 0.34, h * 0.024, 0.02, 0, TAU); ctx.fill();
      const cs = ctx.createRadialGradient(x, y, 0, x, y, h * 0.16);
      cs.addColorStop(0, 'rgba(40,28,18,.45)'); cs.addColorStop(1, 'rgba(40,28,18,0)');
      ctx.fillStyle = cs;
      ctx.beginPath(); ctx.ellipse(x, y, h * 0.16, h * 0.03, 0, 0, TAU); ctx.fill();
      ctx.translate(x, y + bob);
      ctx.rotate(rot);
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
      if (smoke > 0) this.drawSmoke(x + w * 0.28, y - h * 0.5, h * 0.05, smoke);
    }

    drawWeed(w) {
      const { ctx } = this;
      const img = this.img.weed;
      if (!img) return;
      const r = 58 * w.s;
      const hop = Math.abs(Math.sin(w.ph)) * r * 0.5;
      ctx.save();
      ctx.fillStyle = 'rgba(70,50,30,.22)';
      ctx.beginPath(); ctx.ellipse(w.x - r * 0.2, w.y, r * (0.9 - hop / r * 0.3), r * 0.12, 0, 0, TAU); ctx.fill();
      ctx.translate(w.x, w.y - r - hop);
      ctx.rotate(w.rot);
      ctx.drawImage(img, -r * 1.05, -r * 1.05, r * 2.1, r * 2.1);
      ctx.restore();
    }

    /** 앞사람. age: 등장 후 ms (옆에서 밀려 들어온다) */
    drawFore(t, age) {
      if (this.fore.gone) return;
      const { ctx } = this;
      const slide = age == null ? 0 : (1 - easeOut(age / 900)) * -520;
      const breathe = Math.sin(t / 1300) * 2;
      ctx.save();
      ctx.translate(slide, breathe);
      const ch = this.fore.char;
      const ra = t - this.fore.raiseAt;
      if (ch === 0 && this.img.back) {
        this.drawBack(ra);
      } else if (this.sil[ch]) {
        const s = this.sil[ch];
        const k = 2.35;
        ctx.drawImage(s, 330 - s.width * k / 2, 15 - 8 * k, s.width * k, s.height * k);
        if (ra >= 0 && ra < 900) this.drawRaiseSil(ra);
      }
      ctx.restore();
    }

    /** 뒷모습 — 사진 속 판초처럼 크게. 누르면 오른 아래팔이 팔꿈치를 축으로 올라가 상대를 겨눈다 */
    drawBack(ra) {
      const { ctx } = this;
      const img = this.img.back, arm = this.img.back_arm;
      const K = 2.25, X0 = 330 - 143 * K, Y0 = 15 - 40 * K;
      const elbow = { x: X0 + 273 * K, y: Y0 + 240 * K };
      const raising = ra >= 0 && ra < 1000;
      const e = raising ? easeOut(ra / 80) * (1 - easeIO((ra - 550) / 450)) : 0;
      const ang = -0.95 * e;                          // 허리춤에서 뽑아 그대로 쏘는 높이
      // 팔을 뒤에 먼저 — 몸이 팔꿈치 윗부분을 덮는다
      if (arm) {
        const ghosts = raising && ra < 100 ? [0.55, 0.8, 1] : [1];
        for (const g of ghosts) {
          ctx.save();
          ctx.globalAlpha = g === 1 ? 1 : 0.3;
          ctx.translate(elbow.x, elbow.y);
          ctx.rotate(ang * g);
          ctx.scale(K, K * lerp(1, 0.86, e));        // 앞으로 뻗으면 조금 짧아 보인다
          ctx.drawImage(arm, -60, -20);
          if (e > 0.2 && g === 1) {
            // 손에 쥔 권총 (옆에서 본 실루엣)
            this.drawRevolver(-2, 150, 62, Math.PI / 2 - 0.15, 0.5);
          }
          ctx.restore();
        }
      }
      ctx.drawImage(img, X0, Y0, img.width * K, img.height * K);
      if (raising) {
        const tip = rotateP(elbow.x - 8 * K, elbow.y + 196 * K, elbow, ang);
        if (!this.fore.misfire || ra < 200) this.drawMuzzle(tip.x, tip.y, 46, ra);
        this.drawSmoke(tip.x, tip.y, 14, ra / 1000);
      }
    }

    drawRaiseSil(ra) {
      const { ctx } = this;
      const e = easeOut(ra / 85);
      const x0 = 470, y0 = 560;
      const x1 = lerp(500, 690, e), y1 = lerp(760, 470, e);
      ctx.strokeStyle = '#1c140e'; ctx.lineWidth = 46; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = '#120d0a';
      ctx.save(); ctx.translate(x1, y1); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
      ctx.fillRect(0, -9, 64, 18);
      ctx.restore();
      const tip = { x: x1 + Math.cos(Math.atan2(y1 - y0, x1 - x0)) * 70, y: y1 + Math.sin(Math.atan2(y1 - y0, x1 - x0)) * 70 };
      this.drawMuzzle(tip.x, tip.y, 46, ra);
      this.drawSmoke(tip.x, tip.y, 14, ra / 1000);
    }

    drawMuzzle(x, y, r, ms) {
      if (ms < 0 || ms > 90) return;
      const { ctx } = this;
      const k = 1 - ms / 90;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, `rgba(255,255,235,${k})`);
      g.addColorStop(0.25, `rgba(255,210,110,${0.9 * k})`);
      g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; const rr = (i % 2 ? 0.8 : 2.4) * r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.fill();
      ctx.restore();
    }

    drawSmoke(x, y, r, sec) {
      if (sec < 0 || sec > 2.2) return;
      const { ctx } = this;
      for (let i = 0; i < 5; i++) {
        const s = sec - i * 0.08; if (s < 0) continue;
        ctx.fillStyle = `rgba(225,220,210,${0.35 * (1 - s / 2.2)})`;
        ctx.beginPath();
        ctx.arc(x + Math.sin(i * 2.3 + s) * r + s * r * 2, y - s * r * 4 - i * r * 0.5, r * (0.7 + s * 2), 0, TAU);
        ctx.fill();
      }
    }

    /* ─────────── 선수 소개 ─────────── */

    drawVersus(t) {
      const { ctx, W, H } = this;
      const m = this.match;
      if (!m) return;
      const ids = m.fighters || m.players.map(p => p.id);
      const n = Math.max(2, ids.length);
      const vt = t - (this.versusAt || t);
      if (!this.bolts || this.bolts.n !== n || this.bolts.W !== W || this.bolts.H !== H) this.bolts = makeBolts(n, W, H);
      const crack = easeOut(vt / 260);
      ctx.fillStyle = '#070504';
      ctx.fillRect(0, 0, W, H);
      const town = this.img.mode_west_bg || this.img.plate;
      for (let i = 0; i < n; i++) {
        const p = this.pl(ids[i]) || { name: '?', char: i };
        const ch = CHARS[p.char % 4];
        const poly = panelPoly(this.bolts, i, n, W, H);
        const cx0 = W * (i + 0.5) / n;
        const side = cx0 < W / 2 ? -1 : cx0 > W / 2 ? 1 : (i % 2 ? 1 : -1);
        ctx.save();
        const push = (i - (n - 1) / 2) * 10 * easeOut((vt - 220) / 300);
        ctx.translate(push, 0);
        ctx.beginPath(); poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.clip();
        // 실제 거리 사진을 어둡게 깔고, 캐릭터 색으로 물들인다
        if (town) {
          const z = 1.15 + vt / 40000;
          const bs = Math.max(W / town.width, H / town.height) * z;
          const bw = town.width * bs, bh = town.height * bs;
          ctx.drawImage(town, (W - bw) / 2 + (cx0 - W / 2) * 0.35 - side * vt * 0.004 * W / 100, (H - bh) / 2, bw, bh);
        }
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = shade(ch.color, -0.15);
        ctx.fillRect(-20, 0, W + 40, H);
        ctx.restore();
        ctx.fillStyle = 'rgba(8,5,3,.45)';
        ctx.fillRect(-20, 0, W + 40, H);
        // 위에서 떨어지는 빛기둥
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const shaft = ctx.createLinearGradient(cx0 - W / n * 0.3, 0, cx0 + W / n * 0.3, H);
        shaft.addColorStop(0, 'rgba(255,220,160,.28)'); shaft.addColorStop(0.6, 'rgba(255,190,120,.06)'); shaft.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shaft;
        ctx.beginPath();
        ctx.moveTo(cx0 - W / n * 0.18, 0); ctx.lineTo(cx0 + W / n * 0.1, 0); ctx.lineTo(cx0 + W / n * 0.55, H); ctx.lineTo(cx0 - W / n * 0.45, H);
        ctx.fill();
        ctx.restore();
        // 가슴 위 — 옆에서 미끄러져 들어와 멈추고, 천천히 다가간다
        const bust = this.img[ch.key + '_bust'];
        if (bust) {
          const enter = (vt - 180 - i * 90) / 460;
          const e = easeOut(enter);
          const over = enter > 0.7 && enter < 1.3 ? Math.sin((enter - 0.7) / 0.6 * Math.PI) * 0.012 : 0;
          const bh = Math.min(H * 0.86, (W / n) * 1.9 * bust.height / bust.width) * (1 + clamp((vt - 700) / 3000) * 0.05);
          const bw = bust.width * bh / bust.height;
          const baseX = cx0 - bw / 2;
          const bx = baseX + side * (1 - e) * W * 0.7 - side * over * W;
          const by = H - bh + H * 0.02;
          if (e > 0) {
            // 움직이는 동안 잔상
            if (e < 0.98) {
              for (let g = 3; g >= 1; g--) {
                ctx.globalAlpha = 0.12 * g;
                ctx.drawImage(bust, bx + side * g * W * 0.03 * (1 - e), by, bw, bh);
              }
            }
            const rim = this.backlit(ch.key + '_bust');
            ctx.globalAlpha = clamp(e * 2);
            if (rim) {
              ctx.globalAlpha = clamp(e * 2) * 0.3;
              ctx.drawImage(rim.rim, bx - side * bh * 0.003, by - bh * 0.004, bw, bh);
              ctx.globalAlpha = clamp(e * 2);
            }
            ctx.drawImage(bust, bx, by, bw, bh);
            ctx.globalAlpha = 1;
            // 멈추는 순간 번쩍
            const land = vt - 180 - i * 90 - 460;
            if (land > 0 && land < 220) {
              ctx.fillStyle = `rgba(255,240,215,${0.35 * (1 - land / 220)})`;
              ctx.fillRect(-20, 0, W + 40, H);
            }
          }
        }
        // 발밑 어둠 · 이름
        const low = ctx.createLinearGradient(0, H * 0.55, 0, H);
        low.addColorStop(0, 'rgba(0,0,0,0)'); low.addColorStop(1, 'rgba(0,0,0,.92)');
        ctx.fillStyle = low; ctx.fillRect(-20, H * 0.55, W + 40, H * 0.45);
        const ne = easeOut((vt - 620 - i * 90) / 500);
        if (ne > 0) {
          const fs = Math.min(H * 0.085, (W / n) * 0.2);
          const ny = H * 0.9;
          ctx.save();
          ctx.beginPath(); ctx.rect(cx0 - W / n / 2, ny - fs * 2, (W / n) * ne, fs * 3); ctx.clip();
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e0b35e';
          ctx.fillRect(cx0 - fs * 1.6, ny - fs * 1.08, fs * 3.2, Math.max(1, fs * 0.03));
          ctx.font = `${fs * 0.26}px ${FONT_W}`;
          ctx.fillText(ch.en.split('').join(' '), cx0, ny - fs * 1.2);
          const ng = ctx.createLinearGradient(0, ny - fs, 0, ny);
          ng.addColorStop(0, '#fffaf0'); ng.addColorStop(1, '#d9c3a0');
          ctx.fillStyle = ng;
          ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = fs * 0.2; ctx.shadowOffsetY = fs * 0.05;
          ctx.font = `900 ${fs}px ${FONT_T}`;
          ctx.fillText(p.name, cx0, ny);
          ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
          if (p.me) { ctx.font = `700 ${fs * 0.26}px ${FONT_T}`; ctx.fillStyle = '#ffd98a'; ctx.fillText('YOU', cx0, ny + fs * 0.42); }
          ctx.restore();
        }
        ctx.restore();
      }
      // 번개 모양으로 가르는 선 — 위에서 아래로 그어지고, 굵고 또렷하게 남는다
      ctx.save();
      ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      for (const b of this.bolts.lines) {
        // 그어진 길이만큼
        const segs = b.length - 1;
        const upto = crack * segs;
        const pathTo = () => {
          ctx.beginPath(); ctx.moveTo(b[0][0], b[0][1]);
          for (let k = 1; k <= segs; k++) {
            if (k - 1 >= upto) break;
            const f = Math.min(1, upto - (k - 1));
            ctx.lineTo(lerp(b[k - 1][0], b[k][0], f), lerp(b[k - 1][1], b[k][1], f));
          }
        };
        pathTo(); ctx.strokeStyle = '#050302'; ctx.lineWidth = Math.max(10, W * 0.009); ctx.stroke();
        ctx.shadowColor = 'rgba(255,214,140,.9)'; ctx.shadowBlur = 18;
        pathTo(); ctx.strokeStyle = '#f3d08a'; ctx.lineWidth = Math.max(4, W * 0.0035); ctx.stroke();
        ctx.shadowBlur = 0;
        pathTo(); ctx.strokeStyle = '#fff6df'; ctx.lineWidth = Math.max(1.5, W * 0.0012); ctx.stroke();
      }
      ctx.restore();
      // VS — 선수가 다 들어온 뒤: 먹 원판이 찍히고, 붉은 별이 돌아 들어오고, V 와 S 가 양옆에서 박힌다
      const vsAt = 180 + (n - 1) * 90 + 520;
      if (vt > vsAt) {
        const fs = Math.min(W, H) * (n === 2 ? 0.2 : 0.11);
        const spots = n === 2 ? [[W / 2, H * 0.45]] : this.bolts.lines.map(b => [lerp(b[1][0], b[2][0], 0.5), H * 0.46]);
        const va = vt - vsAt;
        const disc = va < 160 ? easeOut(va / 160) * 1.12 : 1.12 - 0.12 * easeOut((va - 160) / 200);
        const star = easeOut((va - 60) / 320);
        const fly = easeIn((va - 200) / 200);
        const hit = va >= 400;
        if (hit && !this._vsHit) {
          this._vsHit = true;
          this.shakeIt(260, 14);
          this.S && this.S.thud(0.9);
          for (const [x, y] of spots) for (let i = 0; i < 22; i++) {
            const an = Math.random() * TAU, sp = (0.3 + Math.random()) * fs * 2.2;
            (this.vsSparks = this.vsSparks || []).push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, age: 0, life: 0.5 + Math.random() * 0.6, dust: true });
          }
        }
        if (!hit) this._vsHit = false;
        const bump = hit ? Math.exp(-(va - 400) / 90) * Math.sin((va - 400) / 22) * fs * 0.025 : 0;
        for (const [x, y] of spots) {
          ctx.save();
          ctx.translate(x, y);
          // 해진 먹 원판
          ctx.save();
          ctx.scale(disc, disc);
          ctx.fillStyle = '#1c120b';
          ctx.beginPath();
          for (let i = 0; i <= 36; i++) {
            const an = i / 36 * TAU, rr = fs * (0.95 + ((i * 7919) % 13) / 13 * 0.08);
            i ? ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
          }
          ctx.fill();
          ctx.strokeStyle = '#e2c48c'; ctx.lineWidth = fs * 0.03;
          ctx.beginPath(); ctx.arc(0, 0, fs * 0.84, 0, TAU); ctx.stroke();
          ctx.lineWidth = fs * 0.012;
          ctx.beginPath(); ctx.arc(0, 0, fs * 0.78, 0, TAU); ctx.stroke();
          ctx.restore();
          // 붉은 별
          if (star > 0) {
            ctx.save();
            ctx.rotate((1 - star) * Math.PI);
            ctx.scale(star, star);
            ctx.fillStyle = '#9a2a1c';
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
              const an = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? fs * 0.3 : fs * 0.72;
              i ? ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
            }
            ctx.closePath(); ctx.fill();
            ctx.restore();
          }
          // V · S — 나무 활자
          ctx.font = `${fs * 0.95}px Rye, ${FONT_W}`;
          ctx.textBaseline = 'middle';
          const vw = ctx.measureText('V').width;
          const vx = lerp(-W * 0.6, -vw - fs * 0.02, fly) - bump;
          const sx = lerp(W * 0.6, fs * 0.02, fly) + bump;
          ctx.lineJoin = 'round';
          ctx.textAlign = 'left';
          for (const [ch, px] of [['V', vx], ['S', sx]]) {
            if (fly <= 0) continue;
            ctx.lineWidth = fs * 0.12; ctx.strokeStyle = '#1c120b';
            ctx.strokeText(ch, px, fs * 0.04);
            ctx.fillStyle = '#6e1f13'; ctx.fillText(ch, px + fs * 0.03, fs * 0.07);
            ctx.fillStyle = '#f3e1b8'; ctx.fillText(ch, px, fs * 0.04);
          }
          ctx.restore();
        }
        if (this.vsSparks && this.vsSparks.length) {
          ctx.save();
          for (const p of this.vsSparks) {
            p.age += 1 / 60; p.vx *= 0.9; p.vy = p.vy * 0.9 - fs * 0.02; p.x += p.vx / 60; p.y += p.vy / 60;
            const k = 1 - p.age / p.life;
            if (k <= 0) continue;
            ctx.fillStyle = `rgba(214,190,150,${0.45 * k})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, fs * 0.12 * (1.6 - k), 0, TAU); ctx.fill();
          }
          ctx.restore();
          this.vsSparks = this.vsSparks.filter(p => p.age < p.life);
        }
      } else { this._vsHit = false; this.vsSparks = []; }
      // 먼지 알갱이 · 가장자리 어둠
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const mo of this.motes) {
        ctx.fillStyle = `rgba(255,220,170,${0.25 + 0.2 * Math.sin(t / 700 + mo.ph)})`;
        ctx.beginPath(); ctx.arc(mo.x * W, mo.y * H, mo.r * 1.3, 0, TAU); ctx.fill();
      }
      ctx.restore();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      if (vt >= 0 && vt < 90) { ctx.fillStyle = `rgba(255,245,225,${0.6 * (1 - vt / 90)})`; ctx.fillRect(0, 0, W, H); }
    }

    /* ─────────── 결투장 ─────────── */

    drawDuel(t) {
      const { ctx, W, H } = this;
      const m = this.match;
      if (!m) return;
      const since = t - (this.duelAt || t);
      const waitK = m.phase === 'wait' || m.phase === 'signal' ? clamp((t - (this.waitAt || t)) / 7000) : 0;
      ctx.save();
      // 들어오며 살짝 당겼다가, 기다리는 동안 천천히 조인다
      const z = lerp(1.12, 1.0, easeOut(since / 1600)) + waitK * 0.12;
      const hw = W / (2 * Math.max(W / PW, H / PH) * z);
      const cxWant = lerp(700, 760, waitK);
      this.plateCam(Math.max(cxWant, SLOTS[0].x + 90 - hw), lerp(384, 400, waitK), z);
      ctx.drawImage(this.img.plate, 0, 0, PW, PH);
      const opp = this.pl(m.oppId);
      const items = [];
      if (opp) {
        const st = SLOTS[0];
        const appear = clamp((since - 250) / 500);
        const smoke = m.phase === 'result' && m.res && this.view === 'duel' ? (t - m.res.at) / 1000 : 0;
        items.push({ y: st.y, fn: () => this.drawFar(opp.char, st.x, st.y, { alpha: appear, smoke }) });
      }
      for (const w of this.weeds) if (w.s < 1) items.push({ y: w.y, fn: () => this.drawWeed(w) });
      items.sort((a, b) => a.y - b.y).forEach(i => i.fn());
      if (this.crow) this.drawCrow(t);
      this.drawFore(t, since);
      for (const w of this.weeds) if (w.s >= 1) this.drawWeed(w);
      ctx.restore();
      // 레터박스
      const bh = H * 0.09;
      ctx.fillStyle = '#080605';
      ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      // 가짜 신호 · 진짜 신호
      if (m.fake) {
        const a = t - m.fake.at;
        if (a < 700) this.bigWord(m.fake.word, a, 0.11, '#eadcc0', false);
      }
      if (m.sig && !m.sig.hide) this.bigWord('지금!', t - m.sig.at, 0.2, '#ffe9b0', true);
      if (m.sig && m.sig.kind === 'bell' && !m.sig.hide) this.bigWord('🔔', t - m.sig.at, 0.12, '#fff', true);
      this.drawScores();
    }

    bigWord(text, age, size, color, stamp) {
      const { ctx, W, H } = this;
      const fs = Math.min(W, H * 1.6) * size;
      const e = stamp ? easeOut(age / 160) : clamp(age / 120);
      const fade = stamp ? 1 : clamp((700 - age) / 250);
      ctx.save();
      ctx.translate(W / 2, H * 0.42);
      const sc = stamp ? lerp(2.2, 1, e) : 1 + (1 - e) * 0.2;
      ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(e, fade);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${fs}px ${FONT_T}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = fs * (stamp ? 0.1 : 0.06); ctx.strokeStyle = stamp ? '#6e160c' : 'rgba(0,0,0,.45)';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = color;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    drawCrow(t) {
      const { ctx } = this;
      const a = (t - this.crow.at) / 1800;
      if (a > 1) { this.crow = null; return; }
      const x = this.crow.dir > 0 ? lerp(-80, PW + 80, a) : lerp(PW + 80, -80, a);
      const y = 120 + Math.sin(a * 5) * 20;
      const s = 34, flap = Math.sin(t / 60);
      ctx.strokeStyle = '#15110e'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s, y - flap * s * 0.5);
      ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.3, x, y);
      ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.3, x + s, y - flap * s * 0.5);
      ctx.stroke();
    }

    drawScores() {
      const m = this.match;
      if (!m || m.target <= 1) return;
      const { ctx, W, H } = this;
      const fs = Math.max(12, H * 0.022);
      ctx.save();
      ctx.font = `700 ${fs}px "Pretendard Variable", system-ui`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      let y = H * 0.09 + fs * 1.4;
      for (const p of m.players) {
        const s = m.scores[p.id] || 0;
        const pips = '●'.repeat(s) + '○'.repeat(Math.max(0, m.target - s));
        ctx.fillStyle = 'rgba(255,244,225,.85)';
        ctx.fillText(`${p.name}  ${pips}`, W - 18, y);
        y += fs * 1.5;
      }
      ctx.restore();
    }

    /* ─────────── 무릎 · 쓰러짐 ─────────── */

    /** 역광용 — 따뜻한 가장자리 빛만 미리 떠 둔다 */
    backlit(key) {
      this._bl = this._bl || {};
      if (this._bl[key]) return this._bl[key];
      const img = this.img[key];
      if (!img || !img.complete || !img.naturalWidth) return null;
      const rim = document.createElement('canvas'); rim.width = img.width; rim.height = img.height;
      const g = rim.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgb(255,204,140)'; g.fillRect(0, 0, rim.width, rim.height);
      const buf = document.createElement('canvas'); buf.width = img.width; buf.height = img.height;
      return (this._bl[key] = { img, rim, buf });
    }

    /** 발끝(x, y) 기준 높이 h. exposure 0 = 완전 역광 실루엣, 1 = 제 색. 한 장에 합쳐서 그려 겹칠 때 비치지 않게 */
    drawBacklit(key, x, y, h, exposure, alpha = 1, sx = 1, sy = 1) {
      const b = this.backlit(key);
      if (!b || alpha <= 0) return;
      const { ctx } = this;
      const ex = Math.round(exposure * 50) / 50;
      if (b.ex !== ex) {
        b.ex = ex;
        const g = b.buf.getContext('2d');
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, b.buf.width, b.buf.height);
        g.drawImage(b.img, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = `rgba(13,8,5,${1 - ex})`;
        g.fillRect(0, 0, b.buf.width, b.buf.height);
      }
      const w = b.img.width * h / b.img.height;
      ctx.save();
      ctx.translate(x, y); ctx.scale(sx, sy);
      const r = Math.max(1.5, h * 0.004);
      ctx.globalAlpha = alpha * (0.9 - exposure * 0.6);
      ctx.drawImage(b.rim, -w / 2 - r, -h - r * 0.7, w, h);
      ctx.drawImage(b.rim, -w / 2 + r * 0.6, -h - r, w, h);
      ctx.globalAlpha = alpha;
      ctx.drawImage(b.buf, -w / 2, -h, w, h);
      ctx.restore();
    }

    /**
     * 낮은 카메라, 등 뒤. 해를 등진 역광이라 처음엔 까만 실루엣.
     *  0–560 선 채 휘청 · 560–780 무릎이 꺾이며 주저앉음(착지하며 살짝 튕김) · 780–1900 멈춤, 숨
     *  1900–2350 앞으로 기울다 무너짐 · 2350 땅에 닿음 → 흙먼지가 화면을 덮고, 그 너머로 승자
     */
    drawFall(t) {
      const { ctx, W, H } = this;
      const m = this.match;
      if (!m || !m.res) return;
      const f = t - m.res.fallAt;
      const low = this.img.low;
      const push = 1.04 + easeIO(f / 3000) * 0.1;
      const bw = Math.max(W, H * low.width / low.height) * push, bh = bw * low.height / low.width;
      ctx.drawImage(low, (W - bw) / 2, (H - bh) / 2 - f * 0.004, bw, bh);
      const sun = ctx.createRadialGradient(W * 0.52, H * 0.4, 0, W * 0.52, H * 0.4, Math.max(W, H) * 0.55);
      sun.addColorStop(0, 'rgba(255,236,200,.95)'); sun.addColorStop(0.25, 'rgba(255,200,140,.45)'); sun.addColorStop(1, 'rgba(255,170,100,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H); ctx.restore();
      const gy = H * 0.86;
      const ground = ctx.createLinearGradient(0, H * 0.68, 0, H);
      ground.addColorStop(0, 'rgba(60,40,26,0)'); ground.addColorStop(1, 'rgba(34,22,14,.9)');
      ctx.fillStyle = ground; ctx.fillRect(0, H * 0.68, W, H * 0.32);

      const hs = Math.min(H * 0.8, W * 1.3);
      const cx = W * 0.5;
      // 선 채 → 무릎이 꺾이며 가라앉는다. 서 있는 그림을 아래로 눌러 내리다 무릎 그림으로 바꾼다
      const buckle = easeIn((f - 560) / 200);
      if (f < 800) {
        const sway = Math.sin(f / 80) * 0.02 * clamp(f / 300) * (1 - buckle);
        ctx.save(); ctx.translate(cx, gy + buckle * hs * 0.1); ctx.rotate(sway);
        this.drawBacklit('back', 0, 0, hs, 0, 1 - clamp((f - 740) / 60), 1, lerp(1, 0.86, buckle));
        ctx.restore();
      }
      if (f >= 740 && f < 2420) {
        const inA = clamp((f - 740) / 60);
        const land = f > 780 ? Math.exp(-(f - 780) / 110) * Math.sin((f - 780) / 35) * 0.025 : 0;
        const breathe = f > 1000 && f < 1900 ? Math.sin(f / 300) * 0.006 : 0;
        const lean = easeIn((f - 1900) / 450);
        const outA = 1 - clamp((f - 2330) / 90);
        ctx.save();
        ctx.translate(cx, gy - lean * H * 0.05);
        this.drawBacklit('back_down', 0, 0, hs * 0.8, 0.08, inA * outA, 1, 1 - land + breathe - lean * 0.14);
        ctx.restore();
      }
      if (f >= 2330) {
        const inA = clamp((f - 2330) / 90);
        const drop = 1 - easeOut((f - 2330) / 130);
        const settle = f > 2460 ? Math.exp(-(f - 2460) / 140) * Math.sin((f - 2460) / 45) * 0.012 : 0;
        const expo = 0.08 + 0.3 * easeIO((f - 2500) / 1200);
        ctx.save();
        ctx.translate(cx, gy + H * 0.02 - drop * H * 0.06);
        this.drawBacklit('back_dead', 0, 0, hs * 0.84, expo, inA, 1, 1 + drop * 0.12 + settle);
        ctx.restore();
      }
      if (f > 790 && !this._kneeDust) {
        this._kneeDust = true;
        for (let i = 0; i < 18; i++) this.dust.push({ x: cx + (Math.random() - 0.5) * hs * 0.35, y: gy, vx: (Math.random() - 0.5) * W * 0.35, vy: -Math.random() * H * 0.08, r: H * 0.035, g: 0.5, age: 0, life: 1.4 });
      }
      if (f < 100) this._kneeDust = false;
      this.drawDust(t);
      this.drawHaze(t);
      if (f < 300) { ctx.fillStyle = `rgba(0,0,0,${1 - f / 300})`; ctx.fillRect(0, 0, W, H); }
      const bh2 = H * 0.09;
      ctx.fillStyle = '#080605'; ctx.fillRect(0, 0, W, bh2); ctx.fillRect(0, H - bh2, W, bh2);
    }

    /** 쓰러진 순간부터 화면을 덮었다가 걷히는 흙먼지 막 — 쓰러짐과 승자 장면이 이 뒤에서 바뀐다 */
    drawHaze(t) {
      const m = this.match;
      if (!m || !m.res || !m.res.hazeAt) return;
      const a = t - m.res.hazeAt;
      if (a < 0) return;
      const up = easeOut(a / 450), down = easeIO((a - 650) / 950);
      const k = up * (1 - down);
      if (k <= 0.005) return;
      const { ctx, W, H } = this;
      // 아래에서 짙고 위로 옅게 — 땅에서 피어오른 먼지
      const g = ctx.createLinearGradient(0, H * (0.9 - up * 0.9), 0, H);
      g.addColorStop(0, `rgba(214,192,158,${0.55 * k})`);
      g.addColorStop(0.5, `rgba(206,182,148,${0.92 * k})`);
      g.addColorStop(1, `rgba(170,146,112,${0.97 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (this.puff) {
        ctx.save();
        const drift = a / 1000;
        for (let i = 0; i < 14; i++) {
          const px = ((i * 0.137 + drift * (0.03 + i * 0.004)) % 1.2 - 0.1) * W;
          const py = H * (0.25 + (i * 0.29 % 0.7)) - drift * H * 0.04 * (1 + i % 3);
          const r = H * (0.25 + (i % 4) * 0.08);
          ctx.globalAlpha = 0.55 * k;
          ctx.drawImage(this.puff, px - r, py - r, r * 2, r * 2);
        }
        ctx.restore();
      }
    }

    drawDust(t) {
      const { ctx } = this;
      if (!this.puff) return;
      for (const d of this.dust) {
        const k = 1 - d.age / d.life;
        ctx.globalAlpha = clamp(k * 1.4) * 0.85;
        ctx.drawImage(this.puff, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
      }
      ctx.globalAlpha = 1;
      void t;
    }

    /* ─────────── 먼지 너머 승자 ─────────── */

    /** 먼지가 걷히면 해를 등진 승자가 까만 실루엣으로 서 있다가, 눈이 적응하듯 옷차림이 드러난다 */
    drawReveal(t) {
      const { ctx, W, H } = this;
      const m = this.match;
      if (!m || !m.res) return;
      const a = t - m.res.revealAt;
      const win = this.pl(m.res.winId);
      const ex = easeIO((a - 250) / 1500);
      ctx.save();
      const z = lerp(1.35, 1.55, easeIO(a / 5000));
      this.plateCam(955, 390, z);
      ctx.drawImage(this.img.plate, 0, 0, PW, PH);
      ctx.fillStyle = `rgba(14,8,4,${0.72 * (1 - ex)})`;
      ctx.fillRect(0, 0, PW, PH);
      const sun = ctx.createRadialGradient(955, 250, 0, 955, 250, 420);
      sun.addColorStop(0, `rgba(255,236,200,${0.9 - ex * 0.65})`);
      sun.addColorStop(0.3, `rgba(255,190,120,${0.4 - ex * 0.3})`);
      sun.addColorStop(1, 'rgba(255,170,100,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = sun; ctx.fillRect(0, 0, PW, PH); ctx.restore();
      if (win) {
        const key = CHARS[win.char % 4].key + '_far';
        const y = SLOTS[0].y, h = figH(y);
        ctx.fillStyle = 'rgba(40,28,18,.4)';
        ctx.beginPath(); ctx.ellipse(SLOTS[0].x, y, h * 0.16, h * 0.03, 0, 0, TAU); ctx.fill();
        this.drawBacklit(key, SLOTS[0].x, y, h, ex);
        this.drawSmoke(SLOTS[0].x + h * 0.12, y - h * 0.5, h * 0.05, (a + 2500) / 1000);
      }
      ctx.restore();
      this.drawDust(t);
      this.drawHaze(t);
      const bh = H * 0.09;
      ctx.fillStyle = '#080605'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      // 결과판이 뜨면 이름표는 비켜 준다
      if (win && t > m.res.nameAt && !(m.overAt && t - m.overAt > 1100)) this.drawNameCard(win, t - m.res.nameAt, m.res.ms);
    }

    /** 콜 오브 듀티 1등 분대처럼 — 금빛 선이 그어지고 이름이 옆에서 밀려 나온다 */
    drawNameCard(p, a, ms) {
      const { ctx, W, H } = this;
      const ch = CHARS[p.char % 4];
      const x = W * 0.07, y = H * 0.7;
      const fs = Math.min(H * 0.11, W * 0.09);
      ctx.save();
      // 사막 위에서도 읽히게 — 왼쪽 아래를 어둡게 덮는다
      const band = easeOut(a / 400);
      const bg = ctx.createLinearGradient(0, 0, W * 0.62, 0);
      bg.addColorStop(0, `rgba(12,7,4,${0.8 * band})`); bg.addColorStop(0.7, `rgba(12,7,4,${0.55 * band})`); bg.addColorStop(1, 'rgba(12,7,4,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, y - fs * 1.55, W * 0.62, fs * 2.75);
      ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = fs * 0.12;
      const line = easeOut(a / 350);
      ctx.fillStyle = '#e8b85a';
      ctx.fillRect(x, y + fs * 0.35, W * 0.42 * line, Math.max(2, fs * 0.04));
      // 윗줄
      const e1 = easeOut((a - 120) / 380);
      ctx.globalAlpha = e1;
      ctx.font = `${fs * 0.3}px ${FONT_W}`;
      ctx.fillStyle = '#e8b85a';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('WINNER', x + (1 - e1) * -40, y - fs * 1.02);
      ctx.fillStyle = 'rgba(255,240,215,.75)';
      ctx.font = `700 ${fs * 0.22}px "Pretendard Variable", system-ui`;
      ctx.fillText(`${ch.ko} · ${ch.en}`, x + fs * 1.95 + (1 - e1) * -40, y - fs * 1.02);
      // 이름 — 비스듬히 잘려 나오며
      const e2 = easeOut((a - 260) / 450);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.beginPath(); ctx.rect(x - 10, y - fs * 1.0, W, fs * 1.35); ctx.clip();
      ctx.translate(x + (1 - e2) * -W * 0.5, y);
      ctx.transform(1, 0, -0.12, 1, 0, 0);
      ctx.font = `900 ${fs}px ${FONT_T}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillText(p.name, 5, 5);
      ctx.fillStyle = '#fff8ea';
      ctx.fillText(p.name, 0, 0);
      ctx.restore();
      // 아랫줄
      const e3 = easeOut((a - 600) / 400);
      ctx.globalAlpha = e3;
      ctx.font = `800 ${fs * 0.3}px "Pretendard Variable", system-ui`;
      ctx.fillStyle = '#fff';
      const msText = ms != null ? `${(ms / 1000).toFixed(3)}초` : '';
      ctx.fillText(msText, x, y + fs * 0.85);
      if (p.me) { ctx.fillStyle = '#ffd98a'; ctx.fillText('YOU', x + ctx.measureText(msText + '   ').width, y + fs * 0.85); }
      ctx.restore();
    }

    /* ─────────── 공통 덧칠 ─────────── */

    drawGrade(t) {
      const { ctx, W, H } = this;
      const vg = ctx.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.35, W / 2, H * 0.52, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(30,15,5,.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      if (this.view === 'title' || this.view === 'field' || this.view === 'duel') {
        ctx.fillStyle = 'rgba(255,240,210,.35)';
        for (const mo of this.motes) { ctx.beginPath(); ctx.arc(mo.x * W, mo.y * H, mo.r, 0, TAU); ctx.fill(); }
      }
      void t;
    }

    drawFlashes(t) {
      const { ctx, W, H } = this;
      for (const f of this.flashes) {
        const k = (t - f.at) / f.dur;
        if (k < 0 || k > 1) continue;
        ctx.fillStyle = `rgba(255,236,190,${1 - k})`;
        ctx.fillRect(0, 0, W, H);
      }
      this.flashes = this.flashes.filter(f => t - f.at < f.dur);
      if (this.view === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    }

    drawTexts(t) {
      for (const x of this.texts) {
        const a = t - x.at;
        if (a > x.dur) continue;
        const { ctx, W, H } = this;
        const fs = Math.min(W, H * 1.6) * x.size;
        ctx.save();
        ctx.globalAlpha = clamp(a / 120) * clamp((x.dur - a) / 300);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${fs}px ${FONT_T}`;
        ctx.lineWidth = fs * 0.08; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineJoin = 'round';
        ctx.strokeText(x.text, W / 2, H * 0.6);
        ctx.fillStyle = x.color; ctx.fillText(x.text, W / 2, H * 0.6);
        ctx.restore();
      }
      this.texts = this.texts.filter(x => t - x.at < x.dur);
    }

    drawWipe(t) {
      const w = this.wipe;
      if (!w) return;
      const { ctx, W, H, dpr } = this;
      const p = (t - w.at) / w.dur;
      if (p >= 1) { this.wipe = null; return; }
      const R = H * 0.62;
      const x = lerp(W + R * 1.2, -R * 1.4, easeIO(p));
      // 아직 닦이지 않은 왼쪽은 옛 그림
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath(); ctx.rect(0, 0, Math.max(0, (x + R * 0.2) * dpr), H * dpr); ctx.clip();
      ctx.drawImage(w.snap, 0, 0);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 닦고 지나간 자리의 먼지 띠
      const g = ctx.createLinearGradient(x, 0, x + R * 1.6, 0);
      g.addColorStop(0, 'rgba(205,185,150,.95)'); g.addColorStop(1, 'rgba(205,185,150,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, R * 1.6, H);
      // 커다란 회전초
      const img = this.img.weed;
      if (img) {
        const hop = Math.abs(Math.sin(p * 9)) * H * 0.04;
        ctx.save();
        ctx.translate(x, H * 0.5 - hop);
        ctx.rotate(-p * 11);
        ctx.drawImage(img, -R * 1.08, -R * 1.08, R * 2.16, R * 2.16);
        if (!this.strands) this.strands = Array.from({ length: 60 }, () => [Math.random() * TAU, 0.25 + Math.random() * 0.7, Math.random() * TAU, 0.6 + Math.random() * 2]);
        ctx.lineCap = 'round';
        for (const pass of [0, 1]) {
          ctx.strokeStyle = pass ? 'rgba(214,190,140,.8)' : 'rgba(70,50,28,.75)';
          ctx.lineWidth = pass ? R * 0.012 : R * 0.022;
          for (const [a0, rr, a2, len] of this.strands) {
            ctx.beginPath();
            ctx.arc(Math.cos(a0) * R * rr * 0.3, Math.sin(a0) * R * rr * 0.3, R * (0.35 + rr * 0.5), a2 + pass * 0.05, a2 + len);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
  }

  /* 도우미 */
  function rotateP(x, y, pv, a) {
    const dx = x - pv.x, dy = y - pv.y;
    return { x: pv.x + dx * Math.cos(a) - dy * Math.sin(a), y: pv.y + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  function limb(ctx, a, b, wa, wb) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    const cx = Math.cos(ang), sy = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(a.x + cx * wa / 2, a.y + sy * wa / 2);
    ctx.lineTo(b.x + cx * wb / 2, b.y + sy * wb / 2);
    ctx.arc(b.x, b.y, wb / 2, ang, ang + Math.PI);
    ctx.lineTo(a.x - cx * wa / 2, a.y - sy * wa / 2);
    ctx.arc(a.x, a.y, wa / 2, ang + Math.PI, ang + TAU);
    ctx.closePath();
    ctx.fill();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function makeBolts(n, W, H) {
    const lines = [];
    for (let i = 1; i < n; i++) {
      const x = W * i / n;
      const d = W * Math.min(0.06, 0.12 / n);
      // 위에서 비스듬히 내려오다 → 옆으로 꺾고 → 다시 내려오다 → 한 번 더 꺾여 아래로 (꺾임 셋)
      lines.push([[x + d, 0], [x - d * 0.35, H * 0.4], [x + d * 0.55, H * 0.52], [x - d * 0.2, H * 0.66], [x - d, H]]);
    }
    return { n, W, H, lines };
  }

  function panelPoly(b, i, n, W, H) {
    const left = i === 0 ? [[-30, 0], [-30, H]] : b.lines[i - 1];
    const right = i === n - 1 ? [[W + 30, 0], [W + 30, H]] : b.lines[i];
    return [...left, ...[...right].reverse()];
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  West.CHARS = CHARS;
  root.West = West;
})(window);
