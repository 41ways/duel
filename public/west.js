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
  const FONT_JP = '"Noto Serif JP", "Hahmlet", serif';

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
      const names = ['plate.jpg', 'back.png', 'back_arm.png', 'back_down.png', 'back_dead.png', 'weed.png', 'low.jpg', 'poster.png', 'wood.jpg', 'mode_west_bg.jpg', 'mode_west_man.png', 'mode_samurai_bg.jpg', 'mode_samurai_man.png',
        ...CHARS.flatMap(c => [`${c.key}.png`, `${c.key}_far.png`, `${c.key}_bust.png`])];
      const imgs = await Promise.all(names.map(n => load('/img/' + n)));
      names.forEach((n, i) => { this.img[n.replace(/\.\w+$/, '')] = imgs[i]; });
      this.sil = CHARS.map((c, i) => this.silhouette(this.img[c.key], i));
      this.puff = this.makePuff();
      try { await Promise.all([document.fonts.load(`900 40px ${FONT_T}`), document.fonts.load(`40px ${FONT_W}`), document.fonts.load(`40px ${FONT_H}`), document.fonts.load(`900 40px ${FONT_JP}`, '一騎討')]); } catch (_) {}
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
      this._tev = {}; this.sparks = [];
    }
    /** 시작 화면 연출을 건너뛴다 */
    skipTitle() {
      if (this.view !== 'title' || now() - this.viewAt > 2700) return;
      this.viewAt = now() - 2700;
      this._tev = { s1: true, s2: true, sl: true, cl: true };
    }
    get titleDone() { return this.view !== 'title' || now() - this.viewAt > 2500; }

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
      m.res.nameAt = t0 + FALL + 5300;
      this.later(() => this.S && this.S.whistle(), FALL + 4900);
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
        case 'field': this.drawField(t); break;
        case 'versus': this.drawVersus(t); break;
        case 'duel': this.drawDuel(t); break;
        case 'fall': this.drawFall(t); break;
        case 'reveal': this.drawReveal(t); break;
      }
      ctx.restore();
      if (!['versus', 'black', 'title', 'board', 'select'].includes(this.view)) this.drawGrade(t);
      this.drawFlashes(t);
      this.drawTexts(t);
      this.drawWipe(t);
    }

    /* ─────────── 시작 화면 ─────────── */

    /**
     * 시작 화면 — 어둠 속 총 두 발. 총구 불빛에 "결투"가 얼핏 비치고,
     * 칼이 화면을 비스듬히 베면 글자가 온전히 드러난다. 칼끼리 부딪히며 DUEL 과 게임 시작.
     */
    drawTitle(t) {
      const { ctx, W, H } = this;
      const a = t - this.viewAt;
      const S1 = 350, S2 = 950, SL = 1550, CL = 2350;
      const cx = W / 2, cy = H * 0.42;
      const fs = Math.min(W * 0.3, H * 0.3);
      const ev = this._tev || (this._tev = {});
      const once = (k, at, fn) => { if (!ev[k] && a >= at) { ev[k] = true; fn(); } };
      const clashP = { x: cx, y: cy + fs * 0.66 };
      once('s1', S1, () => { this.S && this.S.shot(false); this.shakeIt(160, 9); });
      once('s2', S2, () => { this.S && this.S.shot(false); this.shakeIt(160, 9); });
      once('sl', SL, () => { this.S && this.S.slash(); this.shakeIt(240, 7); });
      once('cl', CL, () => {
        this.S && this.S.clash();
        this.shakeIt(320, 12);
        this.flashes.push({ at: t, dur: 160 });
        this.sparks = [];
        for (let i = 0; i < 80; i++) {
          const ang = -Math.PI * Math.random() + (Math.random() < 0.2 ? Math.PI * Math.random() : 0);
          const sp = (0.4 + Math.random()) * fs * 3;
          this.sparks.push({ x: clashP.x, y: clashP.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0, life: 0.35 + Math.random() * 0.8 });
        }
      });
      const muzzles = [{ at: S1, x: W * 0.04, y: H * 0.64, dir: 1 }, { at: S2, x: W * 0.96, y: H * 0.3, dir: -1 }];
      const lit = Math.max(...muzzles.map(m => (a >= m.at ? Math.exp(-(a - m.at) / 190) : 0)));
      const cut = a >= SL + 110;

      // 한 장 그려 두고 칼자국을 따라 두 쪽으로 어긋나게 보여 준다
      const buf = this._tbuf || (this._tbuf = document.createElement('canvas'));
      if (buf.width !== this.cv.width || buf.height !== this.cv.height) { buf.width = this.cv.width; buf.height = this.cv.height; }
      const g = buf.getContext('2d');
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.fillStyle = '#030201'; g.fillRect(0, 0, W, H);
      const warm = cut ? easeOut((a - SL) / 700) : 0;
      if (warm > 0) {
        const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
        bg.addColorStop(0, `rgba(58,34,20,${warm})`); bg.addColorStop(0.6, `rgba(20,12,7,${warm})`); bg.addColorStop(1, 'rgba(4,2,1,0)');
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
      }
      for (const m of muzzles) {
        const k = a >= m.at ? Math.exp(-(a - m.at) / 190) : 0;
        if (k < 0.01) continue;
        const lg = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, W * 1.1);
        lg.addColorStop(0, `rgba(255,214,150,${0.75 * k})`); lg.addColorStop(0.35, `rgba(150,90,40,${0.35 * k})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = lg; g.fillRect(0, 0, W, H);
      }
      const textA = cut ? 1 : lit * 0.9;
      if (textA > 0.01) {
        g.save();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `900 ${fs}px ${FONT_T}`;
        g.globalAlpha = textA;
        const tg = g.createLinearGradient(0, cy - fs * 0.5, 0, cy + fs * 0.5);
        tg.addColorStop(0, '#f7ead2'); tg.addColorStop(0.55, '#dcc29a'); tg.addColorStop(1, '#8e6c46');
        g.fillStyle = tg;
        g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = fs * 0.08; g.shadowOffsetY = fs * 0.03;
        g.fillText('결투', cx, cy);
        g.restore();
      }

      // 칼자국 — 오른쪽 위에서 왼쪽 아래로
      const p0 = { x: W * 0.78, y: -H * 0.05 }, p1 = { x: W * 0.22, y: H * 1.05 };
      const nx = -(p1.y - p0.y), ny = p1.x - p0.x;
      const nl = Math.hypot(nx, ny);
      const split = a >= SL + 110 ? fs * 0.09 * (1 - easeOut((a - SL - 110) / 520)) : 0;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const half = (sign) => {
        ctx.save();
        ctx.beginPath();
        const far = Math.max(W, H) * 2 * this.dpr;
        const ux = (nx / nl) * sign * far, uy = (ny / nl) * sign * far;
        const P0 = { x: p0.x * this.dpr, y: p0.y * this.dpr }, P1 = { x: p1.x * this.dpr, y: p1.y * this.dpr };
        const dx = (P1.x - P0.x) * 3, dy = (P1.y - P0.y) * 3;
        ctx.moveTo(P0.x - dx, P0.y - dy); ctx.lineTo(P1.x + dx, P1.y + dy);
        ctx.lineTo(P1.x + dx + ux, P1.y + dy + uy); ctx.lineTo(P0.x - dx + ux, P0.y - dy + uy);
        ctx.closePath(); ctx.clip();
        const off = split * this.dpr * sign;
        ctx.drawImage(buf, (P1.x - P0.x) / Math.hypot(P1.x - P0.x, P1.y - P0.y) * off, (P1.y - P0.y) / Math.hypot(P1.x - P0.x, P1.y - P0.y) * off);
        ctx.restore();
      };
      if (split > 0.3) { half(1); half(-1); } else ctx.drawImage(buf, 0, 0);
      ctx.restore();

      // 총구 불꽃과 예광선
      for (const m of muzzles) {
        const d = a - m.at;
        if (d < 0 || d > 260) continue;
        if (d < 70) this.drawMuzzle(m.x, m.y, Math.min(W, H) * 0.05, d * 1.2);
        const tp = clamp(d / 70);
        ctx.strokeStyle = `rgba(255,236,190,${0.9 * (1 - d / 260)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + m.dir * W * 1.05 * tp, m.y + (cy - m.y) * 0.3 * tp);
        ctx.stroke();
      }
      // 칼 빛
      const sd = a - SL;
      if (sd >= 0 && sd < 520) {
        const p = easeOut(sd / 120);
        const fade = 1 - clamp((sd - 120) / 400);
        const ex = lerp(p0.x, p1.x, p), ey = lerp(p0.y, p1.y, p);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(200,225,255,.9)'; ctx.shadowBlur = 30;
        ctx.strokeStyle = `rgba(230,240,255,${0.95 * fade})`;
        ctx.lineWidth = Math.max(2, fs * 0.03) * (0.4 + fade * 0.6);
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.restore();
      }
      // 칼끼리 — 양쪽 아래에서 올라와 가운데서 부딪힌다
      const cd = a - CL;
      if (cd > -200 && cd < 700) {
        const inP = easeIn((cd + 200) / 200);
        const back = cd > 0 ? easeOut(cd / 500) : 0;
        const fade = cd > 0 ? 1 - clamp((cd - 150) / 500) : 1;
        for (const side of [-1, 1]) {
          const ang = side < 0 ? -0.42 : Math.PI + 0.42;
          const len = fs * 1.5;
          const tipX = lerp(clashP.x + side * W * 0.6, clashP.x + side * fs * 0.05, inP) + side * back * fs * 0.25;
          const tipY = lerp(clashP.y + H * 0.4, clashP.y, inP) + back * fs * 0.1;
          ctx.save();
          ctx.translate(tipX, tipY);
          ctx.rotate(ang + (side < 0 ? 0 : 0));
          ctx.globalAlpha = fade;
          const bl = ctx.createLinearGradient(-len, 0, 0, 0);
          bl.addColorStop(0, 'rgba(120,130,145,0)'); bl.addColorStop(0.6, 'rgba(210,220,232,.9)'); bl.addColorStop(1, 'rgba(255,255,255,1)');
          ctx.fillStyle = bl;
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.quadraticCurveTo(-len * 0.5, -fs * 0.03, -len, -fs * 0.018); ctx.lineTo(-len, fs * 0.012); ctx.quadraticCurveTo(-len * 0.5, fs * 0.004, 0, 0);
          ctx.fill();
          ctx.restore();
        }
        if (cd > 0 && cd < 450) {
          const k = cd / 450;
          ctx.strokeStyle = `rgba(255,225,170,${0.7 * (1 - k)})`;
          ctx.lineWidth = fs * 0.03 * (1 - k);
          ctx.beginPath(); ctx.arc(clashP.x, clashP.y, fs * 1.8 * easeOut(k), 0, TAU); ctx.stroke();
        }
      }
      // 불꽃
      if (this.sparks && this.sparks.length) {
        const dt = 1 / 60;
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
      const le = easeOut((a - CL - 80) / 600);
      if (le > 0) {
        const y = cy + fs * 0.66;
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

    /* ─────────── 모드 고르기 — 왼쪽 StandOff · 오른쪽 一騎討 ─────────── */

    select() {
      const from = this.view;
      this.clearTimers();
      this.sel = { hover: null, split: 0.5, pick: null, pickAt: 0, from: 0.5, at: now() };
      if (from === 'title') this.startWipe('select', null, 'flash'); else this.view = 'select';
      this.match = null;
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
          ctx.drawImage(p.man, p.cxp - mw / 2, H * 0.99 - mh, mw, mh);
        }
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
        ctx.font = p.side === 'west' ? `${fsz}px ${FONT_W}` : `900 ${fsz * 1.05}px ${FONT_JP}`;
        ctx.fillText(p.side === 'west' ? 'StandOff' : '一騎討', lx + p.off * 0, H * 0.84);
        ctx.shadowBlur = 0;
        ctx.font = `700 ${fsz * 0.24}px ${FONT_T}`;
        ctx.fillStyle = 'rgba(255,240,215,.85)';
        ctx.fillText(p.side === 'west' ? '스탠드오프 · 총잡이 1–4인' : '일기토 · 사무라이 1:1 · 준비 중', lx, H * 0.84 + fsz * 0.42);
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
        if (this.view === 'title') this.startWipe('board'); else this.view = 'board';
        this.match = null;
      }
      const keep = new Set();
      list.slice(0, 4).forEach((p, i) => {
        keep.add(p.id);
        const old = this.posters.get(p.id);
        if (old && !old.leaving) { Object.assign(old, p, { slot: i }); return; }
        const fresh = now() - this.boardAt > 300;
        const delay = fresh ? 0 : i * 160;
        this.posters.set(p.id, { ...p, slot: i, at: now() + delay, tilt: (Math.random() - 0.5) * 0.06, leaving: 0 });
        if (this.S) setTimeout(() => { this.S.clunk(); this.S.clink(); }, delay + 200);
      });
      for (const q of this.posters.values()) {
        if (!keep.has(q.id) && !q.leaving) {
          q.leaving = now();
          setTimeout(() => { if (this.posters.get(q.id) === q) this.posters.delete(q.id); }, 700);
        }
      }
    }

    /** 대기방 화면 좌표 → 수배서 id (방장이 눌러 내보낼 때) */
    posterAt(x, y) {
      for (const q of (this.posters || new Map()).values()) {
        const r = q.rect;
        if (r && !q.leaving && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return q.id;
      }
      return null;
    }

    /** 가슴 위 사진을 수배서에 인쇄된 것처럼 — 세피아, 대비, 가장자리 번짐 */
    photo(char) {
      this._photos = this._photos || {};
      if (this._photos[char]) return this._photos[char];
      const img = this.img[CHARS[char].key + '_bust'];
      if (!img) return null;
      const BW = 347, BH = 215;
      const c = document.createElement('canvas'); c.width = BW; c.height = BH;
      const g = c.getContext('2d');
      g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, BW, BH);
      const k = BW * 0.62 / img.width;
      g.drawImage(img, (BW - img.width * k) / 2, 6, img.width * k, img.height * k);
      const d = g.getImageData(0, 0, BW, BH);
      for (let i = 0; i < d.data.length; i += 4) {
        const l = (0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]) / 255;
        const v = clamp((l - 0.5) * 1.25 + 0.5);
        d.data[i] = 60 + v * 180; d.data[i + 1] = 44 + v * 160; d.data[i + 2] = 30 + v * 120;
      }
      g.putImageData(d, 0, 0);
      const vg = g.createRadialGradient(BW / 2, BH / 2, BH * 0.3, BW / 2, BH / 2, BW * 0.65);
      vg.addColorStop(0, 'rgba(90,60,30,0)'); vg.addColorStop(1, 'rgba(90,60,30,.45)');
      g.fillStyle = vg; g.fillRect(0, 0, BW, BH);
      return (this._photos[char] = c);
    }

    drawBoard(t) {
      const { ctx, W, H } = this;
      const wood = this.img.wood, poster = this.img.poster;
      if (!wood || !poster) return;
      const ws = Math.max(W / wood.width, H / wood.height);
      ctx.drawImage(wood, (W - wood.width * ws) / 2, (H - wood.height * ws) / 2, wood.width * ws, wood.height * ws);
      const light = ctx.createRadialGradient(W / 2, H * 0.1, 0, W / 2, H * 0.3, Math.max(W, H) * 0.8);
      light.addColorStop(0, 'rgba(255,220,160,.18)'); light.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = light; ctx.fillRect(0, 0, W, H);
      // 네 자리 — 넓으면 한 줄, 좁으면 두 줄. 아래는 단추 줄 자리
      const barH = W < 700 ? 190 : 110;
      const top = 56, areaH = H - barH - top;
      const wide = W / areaH > 1.6;
      const cols = wide ? 4 : 2, rows = wide ? 1 : 2;
      const aspect = poster.width / poster.height;
      const ph = Math.min((areaH - (rows + 1) * 16) / rows, (W - (cols + 1) * 16) / cols / aspect);
      const pw = ph * aspect;
      const gx = (W - cols * pw) / (cols + 1);
      const gy = (areaH - rows * ph) / (rows + 1);
      const at = i => ({ x: gx + (i % cols) * (pw + gx), y: top + gy + Math.floor(i / cols) * (ph + gy) });
      const list = [...(this.posters || new Map()).values()];
      for (let i = 0; i < 4; i++) {
        if (list.some(v => v.slot === i && !v.leaving)) continue;
        const { x, y } = at(i);
        ctx.fillStyle = 'rgba(255,235,200,.05)';
        ctx.fillRect(x, y, pw, ph);
        ctx.fillStyle = 'rgba(255,238,210,.45)';
        ctx.font = `${ph * 0.07}px ${FONT_H}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('빈 자리', x + pw / 2, y + ph / 2);
        this.drawNail(x + pw / 2, y + ph * 0.02, Math.max(2, ph * 0.01));
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

    drawPoster(q, x, y, pw, ph, t) {
      const { ctx } = this;
      const poster = this.img.poster;
      const k = pw / poster.width;
      if (t < q.at) return;
      const e = easeOut((t - q.at) / 420);
      let drop = (1 - e) * -ph * 0.18, rot = q.tilt + (1 - e) * 0.16, alpha = clamp(e * 2);
      if (q.leaving) {
        const l = easeIn((t - q.leaving) / 600);
        drop = l * ph * 0.5; rot = q.tilt + l * 0.5; alpha = 1 - l;
      }
      q.rect = { x, y, w: pw, h: ph };
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x + pw / 2, y + 14 * k + drop);
      ctx.rotate(rot);
      ctx.translate(-pw / 2, -14 * k);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = ph * 0.04; ctx.shadowOffsetY = ph * 0.015;
      ctx.drawImage(poster, 0, 0, pw, ph);
      ctx.restore();
      // 사진
      const pic = this.photo(q.char % 4);
      if (pic) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(pic, 114 * k, 185 * k, 347 * k, 215 * k);
        ctx.restore();
      }
      // 이름 · 별명 — 펜으로 채운다
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillStyle = '#2b1d12';
      ctx.font = `${20 * k}px ${FONT_W}`;
      ctx.fillText('NAME', 40 * k, 522 * k);
      ctx.strokeStyle = 'rgba(43,29,18,.55)'; ctx.lineWidth = Math.max(1, 1.2 * k);
      ctx.beginPath(); ctx.moveTo(108 * k, 528 * k); ctx.lineTo(350 * k, 528 * k); ctx.stroke();
      ctx.font = `${14 * k}px ${FONT_W}`;
      ctx.fillText(CHARS[q.char % 4].en, 365 * k, 522 * k, 175 * k);
      ctx.font = `${66 * k}px ${FONT_H}`;
      ctx.fillStyle = '#1f2946';
      ctx.fillText(q.name, 114 * k, 526 * k, 236 * k);
      // 도장
      const stamp = q.me ? '나' : q.bot ? 'BOT' : null;
      if (stamp) {
        const se = easeOut((t - q.at - 380) / 220);
        if (se > 0) {
          ctx.save();
          ctx.translate(415 * k, 355 * k); ctx.rotate(-0.22);
          const sc = lerp(1.8, 1, se);
          ctx.scale(sc, sc);
          ctx.globalAlpha = alpha * 0.8 * se;
          ctx.strokeStyle = '#a3241b'; ctx.fillStyle = '#a3241b';
          ctx.lineWidth = 5 * k;
          const sw = (stamp === '나' ? 80 : 104) * k, sh = 58 * k;
          ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
          ctx.font = stamp === '나' ? `900 ${40 * k}px ${FONT_T}` : `${30 * k}px ${FONT_W}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(stamp, 0, 2 * k);
          ctx.restore();
        }
      }
      if (q.host) {
        ctx.save();
        ctx.translate(150 * k, 214 * k); ctx.rotate(-0.08);
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = '#a3241b';
        ctx.fillRect(-38 * k, -17 * k, 76 * k, 34 * k);
        ctx.fillStyle = '#f3e6cf';
        ctx.font = `900 ${22 * k}px ${FONT_T}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('방장', 0, 1 * k);
        ctx.restore();
      }
      this.drawNail(pw / 2, 14 * k, 7 * k);
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
      const crack = easeOut(vt / 200);
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
        const push = (i - (n - 1) / 2) * 12 * easeOut((vt - 100) / 300);
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
      // 번개 — 처음엔 떨리며 번쩍이고, 가라앉아 은은히 빛난다
      const flick = vt < 420 ? (Math.random() < 0.5 ? 1 : 0.45) : 0.75 + 0.25 * Math.sin(t / 90);
      ctx.save();
      for (const b of this.bolts.lines) {
        const upto = Math.floor((b.length - 1) * crack);
        const jit = vt < 420 ? W * 0.004 : 0;
        const path = () => {
          ctx.beginPath();
          for (let k = 0; k <= upto; k++) {
            const x = b[k][0] + (k && k < b.length - 1 ? (Math.random() - 0.5) * jit : 0);
            k ? ctx.lineTo(x, b[k][1]) : ctx.moveTo(x, b[k][1]);
          }
        };
        ctx.globalCompositeOperation = 'lighter';
        path(); ctx.shadowColor = '#9fd2ff'; ctx.shadowBlur = 40 * flick;
        ctx.strokeStyle = `rgba(150,200,255,${0.55 * flick})`; ctx.lineWidth = 16; ctx.stroke();
        path(); ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(220,240,255,${0.95 * flick})`; ctx.lineWidth = 5; ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
        path(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        // 곁가지
        if (vt < 500) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(200,230,255,${0.6 * flick})`; ctx.lineWidth = 1.5;
          for (let k = 2; k < b.length - 1 && k <= upto; k += 3) {
            ctx.beginPath(); ctx.moveTo(b[k][0], b[k][1]);
            ctx.lineTo(b[k][0] + (k % 2 ? 1 : -1) * W * 0.04, b[k][1] + H * 0.05);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.restore();
      // VS — 크게 떨어져 박히고, 색이 갈라졌다 모인다
      const vsAt = 460, ve = easeOut((vt - vsAt) / 240);
      if (ve > 0) {
        const fs = Math.min(W, H) * (n === 2 ? 0.24 : 0.13);
        const spots = n === 2 ? [[W / 2, H * 0.42]] : this.bolts.lines.map(b => b[Math.floor(b.length * 0.42)]);
        if (!this._vsHit && vt >= vsAt + 240) {
          this._vsHit = true;
          this.shakeIt(260, 14);
          this.S && this.S.thud(0.8);
        }
        if (vt < vsAt) this._vsHit = false;
        for (const [x, y] of spots) {
          const sc = lerp(3.2, 1, ve);
          const split = (1 - clamp((vt - vsAt - 240) / 260)) * fs * 0.06;
          ctx.save();
          ctx.translate(x, y); ctx.scale(sc, sc);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `${fs}px ${FONT_W}`;
          ctx.globalAlpha = ve;
          if (split > 0.5) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = 'rgba(255,60,40,.7)'; ctx.fillText('VS', -split, 0);
            ctx.fillStyle = 'rgba(40,200,255,.7)'; ctx.fillText('VS', split, 0);
            ctx.globalCompositeOperation = 'source-over';
          }
          ctx.lineJoin = 'round';
          ctx.lineWidth = fs * 0.1; ctx.strokeStyle = '#1c0a04';
          ctx.strokeText('VS', 0, 0);
          const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
          g.addColorStop(0, '#fff6d8'); g.addColorStop(0.45, '#f0b048'); g.addColorStop(0.55, '#c56a1c'); g.addColorStop(1, '#6b2a08');
          ctx.fillStyle = g; ctx.fillText('VS', 0, 0);
          ctx.restore();
          const rk = (vt - vsAt - 240) / 520;
          if (rk > 0 && rk < 1) {
            ctx.strokeStyle = `rgba(255,220,160,${0.7 * (1 - rk)})`;
            ctx.lineWidth = fs * 0.05 * (1 - rk);
            ctx.beginPath(); ctx.arc(x, y, fs * 2.2 * easeOut(rk), 0, TAU); ctx.stroke();
          }
        }
      }
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
      if (vt >= 0 && vt < 150) { ctx.fillStyle = `rgba(235,245,255,${0.95 * (1 - vt / 150)})`; ctx.fillRect(0, 0, W, H); }
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
      const up = easeOut(a / 520), down = easeIO((a - 900) / 1900);
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
      const ex = easeIO((a - 700) / 2200);
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
      const pts = [];
      const segs = 9;
      let seed = i * 97 + n * 13;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k <= segs; k++) {
        const y = H * k / segs;
        const skew = (0.5 - k / segs) * W * 0.12;
        const jag = k === 0 || k === segs ? 0 : (k % 2 ? 1 : -1) * W * (0.02 + rnd() * 0.035);
        pts.push([x + skew + jag, y]);
      }
      lines.push(pts);
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
