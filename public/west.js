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
 *   title(총과 칼이 부딪혀 로고) → field(처음 · 대기실) → [회전초] → versus(번개 선수 소개) → [회전초] → duel
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
  const FONT_T = '"Black Han Sans", "Pretendard Variable", system-ui, sans-serif';
  const FONT_W = '"Rye", Georgia, serif';

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
      const names = ['plate.jpg', 'back.png', 'back_arm.png', 'weed.png', 'low.jpg',
        ...CHARS.flatMap(c => [`${c.key}.png`, `${c.key}_far.png`, `${c.key}_bust.png`])];
      const imgs = await Promise.all(names.map(n => load('/img/' + n)));
      names.forEach((n, i) => { this.img[n.replace(/\.\w+$/, '')] = imgs[i]; });
      this.sil = CHARS.map((c, i) => this.silhouette(this.img[c.key], i));
      this.puff = this.makePuff();
      try { await Promise.all([document.fonts.load(`40px ${FONT_T}`), document.fonts.load(`40px ${FONT_W}`)]); } catch (_) {}
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
      const dpr = Math.min(devicePixelRatio || 1, 2);
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
      this.titleHit = false; this.sparks = [];
    }
    /** 시작 화면 연출을 건너뛴다 */
    skipTitle() { if (this.view === 'title' && now() - this.viewAt < 1500) this.viewAt = now() - 1500; }
    get titleDone() { return this.view !== 'title' || now() - this.viewAt > 1300; }

    /**
     * 처음 화면 · 대기실. others: [{id, char}] — 새로 온 사람은 지평선에서 걸어 나오고, 나간 사람은 돌아 걸어간다.
     */
    field(foreChar, others = [], { instant = false } = {}) {
      if (this.view !== 'field') { this.clearTimers(); this.fieldAt = now(); }
      const from = this.view;
      if (from === 'title') this.startWipe('field');
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
      this.later(() => this.S && this.S.thud(0.6), FALL + 850);
      this.later(() => this.S && this.S.clink(), FALL + 1050);
      this.later(() => { this.S && this.S.thud(1); this.dustBurst(); this.shakeIt(300, 10); }, FALL + 2600);
      m.res.revealAt = t0 + FALL + 3000;
      this.later(() => { this.view = 'reveal'; }, FALL + 3000);
      m.res.nameAt = t0 + FALL + 4300;
      this.later(() => this.S && this.S.whistle(), FALL + 4200);
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
        case 'field': this.drawField(t); break;
        case 'versus': this.drawVersus(t); break;
        case 'duel': this.drawDuel(t); break;
        case 'fall': this.drawFall(t); break;
        case 'reveal': this.drawReveal(t); break;
      }
      ctx.restore();
      if (this.view !== 'versus' && this.view !== 'black' && this.view !== 'title') this.drawGrade(t);
      this.drawFlashes(t);
      this.drawTexts(t);
      this.drawWipe(t);
    }

    /* ─────────── 시작 화면 ─────────── */

    /**
     * 시작 화면 — 권총과 칼이 양쪽에서 날아와 가운데서 부딪히고, 불꽃 속에서 로고가 찍힌다.
     *  0–650 날아옴 · 650 충돌(섬광 · 불꽃 · 소리) · 650–1300 X자로 물러나 자리 잡음 · 800– 로고
     */
    drawTitle(t) {
      const { ctx, W, H } = this;
      const a = t - this.viewAt - 250;
      const HIT = 650;
      const U = Math.min(W, H * 1.5) * 0.36;
      const cx = W / 2, cy = H * 0.44;
      // 어두운 바탕 · 가운데 불빛
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
      const heat = a > HIT ? 0.6 + 0.4 * Math.exp(-(a - HIT) / 700) : 0.35;
      bg.addColorStop(0, `rgba(${Math.round(90 * heat + 20)},${Math.round(45 * heat + 12)},18,1)`);
      bg.addColorStop(0.55, '#140c08');
      bg.addColorStop(1, '#050303');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      if (!this.titleHit && a >= HIT) {
        this.titleHit = true;
        this.shakeIt(380, 18);
        this.flashes.push({ at: t, dur: 220 });
        if (this.S) { this.S.clash(); this.S.shot(false); }
        for (let i = 0; i < 90; i++) {
          const ang = Math.random() * TAU, sp = (0.3 + Math.random()) * U * 3.2;
          this.sparks.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - U * 0.4, age: 0, life: 0.4 + Math.random() * 0.9 });
        }
      }
      // 날아오기 → 부딪힘 → 되튕겨 X자
      const inP = easeIn(a / HIT);
      const back = easeOut((a - HIT) / 650);
      // 끝자리: 두 무기의 가운데가 로고 뒤에서 X 로 겹친다
      const gR = -0.55, sR = 0.55, gL = U * 1.05, sL = U * 1.0;
      const gEnd = { x: cx - Math.cos(gR) * 0.3 * gL, y: cy - Math.sin(gR) * 0.3 * gL + U * 0.02, r: gR };
      const sEnd = { x: cx + Math.cos(sR) * 0.62 * sL, y: cy + Math.sin(sR) * 0.62 * sL - U * 0.02, r: sR };
      const hitG = { x: cx - U * 0.42, y: cy + U * 0.05, r: -0.12 };
      const hitS = { x: cx + U * 0.36, y: cy - U * 0.05, r: 0.28 };
      const mix = (p, q, k, bump) => ({ x: lerp(p.x, q.x, k) + bump, y: lerp(p.y, q.y, k), r: lerp(p.r, q.r, k) });
      const gun = a < HIT
        ? mix({ x: -U * 1.4, y: H * 0.9, r: 1.2 }, hitG, inP, 0)
        : mix(hitG, gEnd, back, -Math.sin(back * Math.PI) * U * 0.25);
      const sw = a < HIT
        ? mix({ x: W + U * 1.6, y: -H * 0.1, r: -1.0 }, hitS, inP, 0)
        : mix(hitS, sEnd, back, Math.sin(back * Math.PI) * U * 0.25);
      const gScale = lerp(U * 0.82, gL, back), sScale = lerp(U, sL, back);
      const gleam = ((t - this.viewAt) % 3200) / 3200;
      if (a > -250) {
        this.drawSword(sw.x, sw.y, sScale, sw.r, gleam);
        this.drawRevolver(gun.x, gun.y, gScale, gun.r, gleam);
      }
      // 불꽃
      const dt = 1 / 60;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.sparks) {
        p.age += dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + U * 0.06; p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.age / p.life;
        if (k <= 0) continue;
        ctx.strokeStyle = `rgba(255,${Math.round(170 + 80 * k)},${Math.round(90 * k)},${k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      }
      this.sparks = this.sparks.filter(p => p.age < p.life);
      // 충격파
      if (a > HIT && a < HIT + 500) {
        const k = (a - HIT) / 500;
        ctx.strokeStyle = `rgba(255,220,160,${0.6 * (1 - k)})`;
        ctx.lineWidth = U * 0.05 * (1 - k);
        ctx.beginPath(); ctx.arc(cx, cy, U * 2.2 * easeOut(k), 0, TAU); ctx.stroke();
      }
      ctx.restore();
      // 불티 — 계속 올라간다
      if (a > HIT) {
        if (!this.embers) this.embers = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.05, r: 0.8 + Math.random() * 1.8, ph: Math.random() * TAU }));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const e of this.embers) {
          e.y -= e.v * dt; if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); }
          const flick = 0.5 + 0.5 * Math.sin(t / 180 + e.ph);
          ctx.fillStyle = `rgba(255,${140 + Math.round(flick * 60)},60,${0.35 * flick * clamp((a - HIT) / 800)})`;
          ctx.beginPath(); ctx.arc((e.x + Math.sin(t / 2000 + e.ph) * 0.02) * W, e.y * H, e.r, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      // 로고
      const le = easeOut((a - HIT - 120) / 380);
      if (le > 0) {
        const fs = Math.min(W * 0.26, H * 0.34);
        ctx.save();
        ctx.translate(cx, cy + fs * 0.08);
        const sc = lerp(1.7, 1, le);
        ctx.scale(sc, sc);
        ctx.globalAlpha = clamp(le * 1.6);
        // 로고는 따로 그려 두고 빛줄기는 글자 안에만
        const logo = this.logoCanvas(fs, gleam);
        ctx.drawImage(logo, -logo.width / 2, -logo.height / 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `${fs * 0.17}px ${FONT_W}`;
        ctx.fillStyle = '#e8b85a';
        const spaced = 'D U E L';
        ctx.fillText(spaced, 0, fs * 0.66);
        ctx.restore();
      }
    }

    logoCanvas(fs, gleam) {
      const c = this._logo || (this._logo = document.createElement('canvas'));
      const w = Math.ceil(fs * 2.6), h = Math.ceil(fs * 1.4);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${fs}px ${FONT_T}`;
      g.lineJoin = 'round';
      g.lineWidth = fs * 0.12; g.strokeStyle = '#1a0c05';
      g.strokeText('결투', w / 2, h / 2);
      const gr = g.createLinearGradient(0, h / 2 - fs * 0.5, 0, h / 2 + fs * 0.5);
      gr.addColorStop(0, '#fff3cf'); gr.addColorStop(0.45, '#e9b45a'); gr.addColorStop(0.55, '#b86a24'); gr.addColorStop(1, '#6e3510');
      g.fillStyle = gr;
      g.fillText('결투', w / 2, h / 2);
      g.globalCompositeOperation = 'source-atop';
      const gx = lerp(-fs * 0.5, w + fs * 0.5, gleam);
      const sh = g.createLinearGradient(gx - fs * 0.3, 0, gx + fs * 0.3, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.55)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      return c;
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

    /** 칼 — 칼끝이 -x, 손잡이가 +x. 길이 L */
    drawSword(x, y, L, rot, gleam) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot); ctx.scale(L, L);
      // 칼날 — 살짝 휜다
      const blade = ctx.createLinearGradient(0, -0.04, 0, 0.03);
      blade.addColorStop(0, '#f4f7fa'); blade.addColorStop(0.45, '#aeb7c0'); blade.addColorStop(1, '#5d666f');
      ctx.fillStyle = blade;
      ctx.beginPath();
      ctx.moveTo(0.02, -0.032);
      ctx.quadraticCurveTo(-0.8, -0.075, -1.55, -0.02);
      ctx.lineTo(-1.62, 0.0);
      ctx.quadraticCurveTo(-0.8, -0.02, 0.02, 0.018);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.006;
      ctx.beginPath(); ctx.moveTo(0, -0.028); ctx.quadraticCurveTo(-0.8, -0.07, -1.5, -0.018); ctx.stroke();
      // 칼날 위 빛
      const gx = lerp(-1.7, 0.2, gleam);
      const sh = ctx.createLinearGradient(gx - 0.15, 0, gx + 0.15, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.8)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.moveTo(0.02, -0.032); ctx.quadraticCurveTo(-0.8, -0.075, -1.55, -0.02); ctx.lineTo(-1.62, 0); ctx.quadraticCurveTo(-0.8, -0.02, 0.02, 0.018); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // 날밑 · 손잡이
      ctx.fillStyle = '#b8903a';
      ctx.beginPath(); ctx.ellipse(0.03, -0.007, 0.022, 0.085, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1b1614';
      roundRectPath(ctx, 0.05, -0.036, 0.46, 0.058, 0.02); ctx.fill();
      ctx.fillStyle = '#d9cdb4';
      for (let i = 0; i < 7; i++) {
        const px = 0.08 + i * 0.06;
        ctx.beginPath(); ctx.moveTo(px, -0.007); ctx.lineTo(px + 0.022, -0.03); ctx.lineTo(px + 0.044, -0.007); ctx.lineTo(px + 0.022, 0.016); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#8a6a2a'; ctx.fillRect(0.5, -0.04, 0.03, 0.066);
      ctx.restore();
    }

    /* ─────────── 처음 · 대기실 ─────────── */

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
      ctx.drawImage(img, -r * 1.14, -r, r * 2.28, r * 1.98);
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
      // 번개 경계 — 위에서 아래로 갈라진다
      if (!this.bolts || this.bolts.n !== n || this.bolts.W !== W || this.bolts.H !== H) this.bolts = makeBolts(n, W, H);
      const crack = easeOut(vt / 220);
      ctx.fillStyle = '#120c08';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < n; i++) {
        const p = this.pl(ids[i]) || { name: '?', char: i };
        const ch = CHARS[p.char % 4];
        const poly = panelPoly(this.bolts, i, n, W, H);
        const cx0 = W * (i + 0.5) / n;
        ctx.save();
        // 갈라지면서 양옆으로 살짝 벌어진다
        const push = (i - (n - 1) / 2) * 10 * easeOut((vt - 120) / 300);
        ctx.translate(push, 0);
        ctx.beginPath(); poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.clip();
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, shade(ch.color, -0.55)); bg.addColorStop(0.6, shade(ch.color, -0.1)); bg.addColorStop(1, shade(ch.color, -0.65));
        ctx.fillStyle = bg;
        ctx.fillRect(-20, 0, W + 40, H);
        // 방사선
        ctx.save();
        ctx.translate(cx0, H * 0.45);
        ctx.rotate(vt / 9000);
        ctx.fillStyle = 'rgba(255,230,190,.06)';
        for (let k = 0; k < 18; k++) { ctx.rotate(TAU / 18); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -W * 0.07); ctx.lineTo(W, W * 0.07); ctx.fill(); }
        ctx.restore();
        // 가슴 위 — 옆에서 들어온다
        const bust = this.img[ch.key + '_bust'];
        if (bust) {
          const side = cx0 < W / 2 ? -1 : cx0 > W / 2 ? 1 : (i % 2 ? 1 : -1);
          const e = easeOut((vt - 150 - i * 70) / 520);
          const bh = Math.min(H * 0.8, (W / n) * 1.9 * bust.height / bust.width);
          const bw = bust.width * bh / bust.height;
          const bx = cx0 - bw / 2 + side * (1 - e) * W * 0.6;
          ctx.globalAlpha = clamp(e * 2);
          ctx.drawImage(bust, bx, H - bh, bw, bh);
          ctx.globalAlpha = 1;
          const shadowG = ctx.createLinearGradient(0, H * 0.62, 0, H);
          shadowG.addColorStop(0, 'rgba(0,0,0,0)'); shadowG.addColorStop(1, 'rgba(0,0,0,.85)');
          ctx.fillStyle = shadowG; ctx.fillRect(0, H * 0.62, W, H * 0.38);
        }
        // 이름
        const ne = easeOut((vt - 520 - i * 80) / 400);
        if (ne > 0) {
          const fs = Math.min(H * 0.085, (W / n) * 0.22);
          ctx.globalAlpha = ne;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e8b85a';
          ctx.font = `${fs * 0.34}px ${FONT_W}`;
          ctx.fillText(ch.en, cx0, H * 0.86 - fs * 1.05 + (1 - ne) * 20);
          ctx.fillStyle = '#fff6e6';
          ctx.font = `${fs}px ${FONT_T}`;
          ctx.lineWidth = fs * 0.08; ctx.strokeStyle = 'rgba(0,0,0,.6)';
          ctx.strokeText(p.name, cx0, H * 0.86 + (1 - ne) * 20);
          ctx.fillText(p.name, cx0, H * 0.86 + (1 - ne) * 20);
          if (p.me) { ctx.font = `700 ${fs * 0.28}px "Pretendard Variable", system-ui`; ctx.fillStyle = '#ffd98a'; ctx.fillText('YOU', cx0, H * 0.86 + fs * 0.5); }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      // 번개 선
      ctx.save();
      for (const b of this.bolts.lines) {
        const upto = Math.floor(b.length * crack);
        ctx.beginPath();
        for (let k = 0; k <= upto && k < b.length; k++) (k ? ctx.lineTo(b[k][0], b[k][1]) : ctx.moveTo(b[k][0], b[k][1]));
        ctx.shadowColor = '#bfe4ff'; ctx.shadowBlur = 24;
        ctx.strokeStyle = 'rgba(210,235,255,.9)'; ctx.lineWidth = 9; ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.restore();
      // VS
      const ve = easeOut((vt - 380) / 260);
      if (ve > 0) {
        const fs = Math.min(W, H) * (n === 2 ? 0.26 : 0.14);
        const spots = n === 2 ? [[W / 2, H * 0.44]] : this.bolts.lines.map(b => b[Math.floor(b.length * 0.42)]);
        for (const [x, y] of spots) {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(lerp(2.4, 1, ve), lerp(2.4, 1, ve));
          ctx.globalAlpha = ve;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `${fs}px ${FONT_W}`;
          ctx.lineWidth = fs * 0.08; ctx.strokeStyle = '#3a1206';
          ctx.strokeText('VS', 0, 0);
          const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
          g.addColorStop(0, '#fff2c2'); g.addColorStop(0.5, '#f2a93b'); g.addColorStop(1, '#b3461a');
          ctx.fillStyle = g; ctx.fillText('VS', 0, 0);
          ctx.restore();
        }
      }
      // 갈라지는 순간 번쩍
      if (vt >= 0 && vt < 160) { ctx.fillStyle = `rgba(235,245,255,${0.9 * (1 - vt / 160)})`; ctx.fillRect(0, 0, W, H); }
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
      ctx.font = `${fs}px ${FONT_T}`;
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

    drawFall(t) {
      const { ctx, W, H } = this;
      const m = this.match;
      if (!m || !m.res) return;
      const f = t - m.res.fallAt;
      // 배경: 낮은 카메라, 초점 밖
      const low = this.img.low;
      const push = 1.05 + clamp(f / 3000) * 0.06;
      const bw = Math.max(W, H * low.width / low.height) * push, bh = bw * low.height / low.width;
      ctx.drawImage(low, (W - bw) / 2 - f * 0.01, (H - bh) / 2 + H * 0.04, bw, bh);
      // 가까운 땅 — 무릎이 꺾이면 카메라도 따라 내려가며 다가간다
      const gy = H * 0.8;
      const grd = ctx.createLinearGradient(0, H * 0.6, 0, H);
      grd.addColorStop(0, 'rgba(120,95,70,0)'); grd.addColorStop(0.55, 'rgba(90,70,50,.55)'); grd.addColorStop(1, 'rgba(50,38,28,.95)');
      ctx.fillStyle = grd; ctx.fillRect(0, H * 0.6, W, H * 0.4);
      this.drawLegs(f, gy);
      this.drawDust(t);
      // 암전에서 열린다
      if (f < 260) { ctx.fillStyle = `rgba(0,0,0,${1 - f / 260})`; ctx.fillRect(0, 0, W, H); }
      const bh2 = H * 0.09;
      ctx.fillStyle = '#080605'; ctx.fillRect(0, 0, W, bh2); ctx.fillRect(0, H - bh2, W, bh2);
    }

    /** 쓰러지는 사람은 누군지 모르게 늘 같은 검은 실루엣(뒷모습 다리)으로 — 역광 가장자리만 따뜻하게 */
    makeFallSil() {
      const img = this.img.back;
      if (!img) return null;
      const P = 8;
      const c = document.createElement('canvas');
      c.width = img.width + P * 2; c.height = img.height + P * 2;
      const g = c.getContext('2d');
      const tint = (color, dx, dy) => {
        const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
        const tg = t.getContext('2d');
        tg.drawImage(img, P, P);
        tg.globalCompositeOperation = 'source-atop';
        tg.fillStyle = color; tg.fillRect(0, 0, t.width, t.height);
        g.drawImage(t, dx, dy);
      };
      tint('rgba(255,196,130,.95)', -3, -2);
      tint('#120c08', 0, 0);
      return c;
    }

    /**
     * 무릎 높이 카메라, 뒤에서 조금 옆. 실루엣을 무릎에서 잘라 꺾는다.
     *  0–450 선 채 휘청 · 450–850 무릎이 땅에 닿음(정강이는 카메라 쪽으로 누워 짧아진다)
     *  850–2000 멈춤 — 오금 · 허벅지 · 밑창 · 2000–2600 앞으로(멀어지며) 쓰러짐
     */
    drawLegs(f, gy) {
      const { ctx, W, H } = this;
      if (!this.fallSil) this.fallSil = this.makeFallSil();
      const sil = this.fallSil;
      if (!sil) return;
      const WAIST = 330 + 8, KNEE = 512 + 8, FOOT = 680 + 8;
      const s = (H * 0.95) / (FOOT - WAIST) * lerp(1, 1.25, easeIO((f - 450) / 900));
      const L = (FOOT - KNEE) * s;
      const sway = f < 450 ? Math.sin(f / 65) * 0.03 * (f / 450) : 0;
      const k = easeIn((f - 450) / 400);
      const p = easeIn((f - 2000) / 600);
      const kneeY = lerp(gy - L, gy - L * 0.12, k);
      const shinH = lerp(L, L * 0.3, k);
      const upperH = KNEE * s * lerp(1, 0.16, p);
      const w = sil.width * s;
      ctx.save();
      ctx.translate(W * 0.5, gy);
      ctx.rotate(sway);
      ctx.transform(1, 0, -0.08, 1, 0, 0);     // 비스듬히 옆에서
      ctx.translate(0, -gy);
      // 정강이 · 부츠
      ctx.drawImage(sil, 0, KNEE, sil.width, FOOT - KNEE, -w / 2, kneeY, w, shinH);
      // 꿇으면 부츠 밑창이 카메라를 본다
      if (k > 0.3) {
        ctx.fillStyle = `rgba(92,70,48,${0.9 * (k - 0.3) / 0.7})`;
        for (const sx of [-0.2, 0.2]) {
          ctx.beginPath();
          ctx.ellipse(sx * w, kneeY + shinH - w * 0.02, w * 0.1, w * 0.045, 0, 0, TAU);
          ctx.fill();
        }
        // 무릎이 닿은 자리 그림자
        ctx.fillStyle = `rgba(10,6,4,${0.55 * k})`;
        ctx.beginPath(); ctx.ellipse(0, kneeY + 4, w * 0.5, w * 0.04, 0, 0, TAU); ctx.fill();
      }
      // 허벅지부터 위 — 쓰러지면 무릎을 축으로 납작해진다(멀어진다)
      ctx.drawImage(sil, 0, 0, sil.width, KNEE, -w / 2, kneeY - upperH + 2, w, upperH);
      // 떨어지는 권총
      if (f > 900) {
        const g = easeIn((f - 900) / 170);
        ctx.fillStyle = '#120c08';
        ctx.save();
        ctx.translate(w * 0.42, lerp(kneeY - L * 0.8, gy + L * 0.1, g));
        ctx.rotate(lerp(-0.5, 1.4, g));
        ctx.fillRect(-w * 0.12, -w * 0.025, w * 0.24, w * 0.05);
        ctx.fillRect(-w * 0.12, -w * 0.025, w * 0.05, w * 0.12);
        ctx.restore();
      }
      ctx.restore();
      if (f > 850 && !this._kneeDust) {
        this._kneeDust = true;
        for (let i = 0; i < 18; i++) this.dust.push({ x: W * 0.5 + (Math.random() - 0.5) * w, y: gy - L * 0.1, vx: (Math.random() - 0.5) * W * 0.3, vy: -Math.random() * H * 0.12, r: H * 0.04, g: 0.6, age: 0, life: 1.4 });
      }
      if (f < 100) this._kneeDust = false;
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

    drawReveal(t) {
      const { ctx, W, H } = this;
      const m = this.match;
      if (!m || !m.res) return;
      const a = t - m.res.revealAt;
      const win = this.pl(m.res.winId);
      ctx.save();
      const z = lerp(1.35, 1.6, easeIO(a / 5000));
      this.plateCam(955, 390, z);
      ctx.drawImage(this.img.plate, 0, 0, PW, PH);
      if (win) this.drawFar(win.char, 955, 512, { smoke: (a + 2500) / 1000 });
      ctx.restore();
      // 초점: 먼지가 걷히며 선명해진다 — 앞쪽 흐린 흙바닥과 쓰러진 몸
      const blurA = 1 - easeOut(a / 1600);
      ctx.fillStyle = `rgba(200,180,150,${0.55 * blurA})`;
      ctx.fillRect(0, 0, W, H);
      const body = ctx.createRadialGradient(W * 0.42, H * 1.05, 0, W * 0.42, H * 1.05, W * 0.45);
      body.addColorStop(0, 'rgba(18,12,8,.85)'); body.addColorStop(0.5, 'rgba(18,12,8,.5)'); body.addColorStop(1, 'rgba(18,12,8,0)');
      ctx.fillStyle = body;
      ctx.fillRect(0, H * 0.6, W, H * 0.4);
      this.drawDust(t);
      const bh = H * 0.09;
      ctx.fillStyle = '#080605'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      if (win && t > m.res.nameAt) this.drawNameCard(win, t - m.res.nameAt, m.res.ms);
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
      ctx.font = `${fs}px ${FONT_T}`;
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
        ctx.font = `${fs}px ${FONT_T}`;
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
        ctx.drawImage(img, -R * 1.15, -R, R * 2.3, R * 2.0);
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
