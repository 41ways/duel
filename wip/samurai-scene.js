/**
 * 결투 — 캔버스 연출.
 *
 * 구도는 영화 속 결투 장면처럼 "내 어깨 너머" — 앞에 내 뒷모습이 크게, 멀리 상대가 서 있다.
 * 라운드마다 컷을 나눈다:  풍경 패닝 → 상대 클로즈업(등장) → 어깨 너머(내가 들어옴) → 서서히 다가감.
 *
 * 좌표는 CSS 픽셀. 층마다 시차(parallax)를 줘서 카메라가 당길 때 깊이가 느껴지게 한다.
 * 규칙은 모른다. app.js 가 이벤트를 넘겨주면 그림만 그린다.
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
  const easeIO = t => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const linear = t => clamp(t);

  function rng(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  const COLORS = ['#b8322a', '#2f6a9e', '#d09a2e', '#7a4a9a', '#2e8a7a', '#d8642a', '#9aa0a8', '#b04a78'];

  // 층 시차 — 땅 · 회전초 · 먼 사람은 같은 값이어야 발이 땅에 붙어 있다
  const PX = { sky: 0.08, cloud: 0.16, far: 0.34, ground: 0.72, fore: 1.0 };

  class Scene {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = 'west';
      this.figs = new Map();
      this.order = [];              // 그리는 순서용 id
      this.foreId = null;
      this.timers = [];
      this.weeds = [];
      this.birds = [];
      this.parts = [];
      this.streaks = [];
      this.cam = { from: null, to: { z: 1, x: 0.5, y: 0.5 }, at: 0, dur: 0, ease: easeIO };
      this.blinkAt = -1e9;
      this.flash = { at: -1e9, dur: 1, color: '#fff', a: 0 };
      this.shake = { at: -1e9, dur: 1, amp: 0 };
      this.punchAt = -1e9;
      this.bars = { v: 0, target: 0 };
      this.tint = null;             // { at, kind }
      this.bell = null;
      this.redAt = null;            // 내가 졌을 때 붉은 가장자리
      this.phase = 'menu';
      this.last = performance.now();
      this.nextWeed = 0;

      this.grain = this.makeGrain();
      this.resize();
      this.build();
      addEventListener('resize', () => this.resize());
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ─────────────────────── 준비 ─────────────────────── */

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = this.cv.getBoundingClientRect();
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.dpr = dpr;
      this.cv.width = Math.round(this.W * dpr);
      this.cv.height = Math.round(this.H * dpr);
    }

    makeGrain() {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const g = c.getContext('2d');
      const img = g.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    }

    /** 배경 모양은 정규화(0..1) 좌표로 만들어 두고 그릴 때 크기를 곱한다 */
    build() {
      const R = rng(this.mode === 'west' ? 1877 : 1603);
      this.clouds = [];
      for (let i = 0; i < 11; i++) {
        const puffs = [];
        const n = 5 + Math.floor(R() * 7);
        for (let k = 0; k < n; k++) puffs.push({ dx: (k - n / 2) * 0.045 + (R() - 0.5) * 0.04, dy: (R() - 0.5) * 0.012 - Math.sin(k / n * Math.PI) * 0.022, r: 0.025 + R() * 0.03, sx: 1.6 + R() * 1.2 });
        this.clouds.push({ x: -0.5 + R() * 2, y: 0.04 + R() * 0.3, s: 0.6 + R() * 0.9, v: 0.004 + R() * 0.006, puffs, dark: R() < 0.4 });
      }
      // 서부: 메사(탁자 모양 바위산). 사무라이: 먹으로 번진 산등성이
      this.mesas = [];
      let x = -0.55;
      while (x < 1.6) {
        const w = 0.08 + R() * 0.22;
        const top = 0.26 + R() * 0.1;
        const pts = [];
        const steps = 6;
        pts.push([x, 0.445]);
        pts.push([x + w * 0.08, 0.445 - (0.445 - top) * 0.4]);
        pts.push([x + w * 0.14, top + R() * 0.01]);
        for (let k = 1; k < steps; k++) pts.push([x + w * (0.14 + 0.72 * k / steps), top + (R() - 0.5) * 0.012]);
        pts.push([x + w * 0.86, top + R() * 0.012]);
        pts.push([x + w * 0.93, 0.445 - (0.445 - top) * 0.35]);
        pts.push([x + w, 0.445]);
        this.mesas.push({ pts, top, x, w, far: R() < 0.35 });
        x += w * (0.6 + R() * 0.9) + (R() < 0.4 ? R() * 0.2 : 0);
      }
      this.ridges = [0, 1, 2].map(layer => {
        const pts = [];
        for (let i = 0; i <= 80; i++) {
          const t = i / 80;
          const X = -0.6 + t * 2.2;
          const y = 0.3 + layer * 0.045 + Math.sin(X * (5 + layer * 3) + layer) * 0.035 + Math.sin(X * 17 + layer * 2) * 0.012 + (R() - 0.5) * 0.006;
          pts.push([X, y]);
        }
        return pts;
      });
      this.cracks = [];
      for (let i = 0; i < 70; i++) {
        const d = Math.pow(R(), 0.8);
        let cx = -0.5 + R() * 2, cy = d;
        const seg = [];
        for (let k = 0; k < 4 + R() * 4; k++) { seg.push([cx, cy]); cx += (R() - 0.5) * 0.06; cy += (R() - 0.5) * 0.03; }
        this.cracks.push(seg);
      }
      this.scrub = [];
      for (let i = 0; i < 160; i++) this.scrub.push({ x: -0.5 + R() * 2, d: Math.pow(R(), 1.6), r: 0.4 + R() });
      this.grass = [];
      for (let i = 0; i < 420; i++) this.grass.push({ x: -0.5 + R() * 2, d: Math.pow(R(), 0.7), h: 0.6 + R() * 0.8, ph: R() * TAU });
    }

    setMode(mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      this.weeds = []; this.birds = []; this.parts = [];
      this.build();
    }

    /** list: [{id, name}], foreId: 앞에 뒷모습으로 설 사람(없으면 null) */
    setCast(list, foreId) {
      const old = this.figs;
      this.figs = new Map();
      list.forEach((p, i) => {
        const prev = old.get(p.id);
        this.figs.set(p.id, prev ? Object.assign(prev, { name: p.name }) : {
          id: p.id, name: p.name, color: COLORS[i % COLORS.length], visible: true,
          pose: 'idle', poseAt: 0, fallAt: null, appearAt: -1e9, out: false, label: null,
        });
      });
      this.foreId = foreId != null && this.figs.has(foreId) ? foreId : null;
      this.order = list.map(p => p.id);
    }

    colorOf(id) { const f = this.figs.get(id); return f ? f.color : '#999'; }

    later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
    clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

    /* ─────────────────────── 카메라 ─────────────────────── */

    camNow(now) {
      const c = this.cam;
      if (!c.from || !c.dur) return c.to;
      const p = c.ease((now - c.at) / c.dur);
      return { z: lerp(c.from.z, c.to.z, p), x: lerp(c.from.x, c.to.x, p), y: lerp(c.from.y, c.to.y, p) };
    }
    cut(z, x, y, blink = true) {
      this.cam = { from: null, to: { z, x, y }, at: performance.now(), dur: 0, ease: easeIO };
      if (blink) this.blinkAt = performance.now();
    }
    pan(z, x, y, dur, ease = easeIO) {
      const now = performance.now();
      this.cam = { from: { ...this.camNow(now) }, to: { z, x, y }, at: now, dur, ease };
    }

    /* ─────────────────────── 자리 ─────────────────────── */

    layout() {
      const { W, H } = this;
      const hY = H * 0.445;
      const portrait = W < H * 0.95;
      const out = new Map();
      const vis = this.order.filter(id => { const f = this.figs.get(id); return f && f.visible; });
      const fore = this.foreId != null && vis.includes(this.foreId) ? this.foreId : null;
      if (fore != null) {
        const S = portrait ? Math.min(H * 0.58, W * 1.0) : Math.min(H * 0.86, W * 0.5);
        out.set(fore, { fore: true, x: W * (portrait ? 0.2 : 0.17), y: H + S * 0.04, S });
      }
      const far = vis.filter(id => id !== fore);
      const n = far.length;
      const x0 = fore != null ? (portrait ? 0.46 : 0.52) : 0.18;
      const x1 = fore != null ? 0.92 : 0.82;
      far.forEach((id, i) => {
        const t = n === 1 ? (this.phase === 'menu' ? -0.05 : fore != null ? 0.35 : 0.5) : i / (n - 1);
        const d = n === 1 ? 0.34 : (n <= 3 ? 0.3 : 0.24) + (i % 2) * (n <= 3 ? 0.06 : 0.08);
        const h = H * 0.9 * d * (portrait ? 0.7 : 1) * (n > 4 ? 0.85 : 1);
        out.set(id, { fore: false, x: W * lerp(x0, x1, t), y: hY + (H - hY) * d, h, d });
      });
      return out;
    }

    focusOnFar(L) {
      const far = [...L.values()].filter(v => !v.fore);
      if (!far.length) return { z: 1.2, x: 0.5, y: 0.55 };
      const minX = Math.min(...far.map(v => v.x)), maxX = Math.max(...far.map(v => v.x));
      const cy = far.reduce((s, v) => s + (v.y - v.h * 0.55), 0) / far.length;
      const span = (maxX - minX) / this.W + 0.12;
      const z = far.length === 1 ? (this.mode === 'samurai' ? 2.3 : 2.2) : clamp(0.75 / span, 1.3, 2.2);
      // 시차 때문에 실제로 보이는 위치는 층마다 달라서, 땅 층 기준으로 역산한다
      const p = PX.ground;
      const fx = 0.5 + ((minX + maxX) / 2 / this.W - 0.5) / p;
      const fy = 0.5 + (cy / this.H - 0.5) / p;
      return { z: 1 + (z - 1) / p, x: fx, y: fy };
    }

    /* ─────────────────────── 이벤트 ─────────────────────── */

    menu() {
      this.clearTimers();
      this.phase = 'menu';
      this.tint = null; this.bell = null; this.redAt = null;
      this.bars.target = 0;
      for (const f of this.figs.values()) { f.visible = true; f.pose = 'idle'; f.fallAt = null; f.appearAt = -1e9; f.out = false; f.label = null; }
      this.cut(1.04, 0.52, 0.5, false);
      this.pan(1.12, 0.56, 0.52, 14000, linear);
    }

    round(ev) {
      this.clearTimers();
      const now = performance.now();
      this.phase = 'intro';
      this.tint = null; this.bell = null; this.redAt = null; this.streaks = [];
      const alive = new Set(ev.fighters);
      for (const f of this.figs.values()) {
        f.visible = alive.has(f.id);
        f.pose = 'idle'; f.fallAt = null; f.label = null; f.appearAt = 1e12;
      }
      this.bars.target = 1;
      // 컷 1 — 풍경 패닝, 회전초 하나
      this.cut(1.45, 0.86, 0.42);
      this.pan(1.38, 0.2, 0.44, 950, easeIO);
      this.spawnWeed({ d: 0.42 + Math.random() * 0.2, dir: 1, big: false, speed: 0.16 });
      // 컷 2 — 상대 등장
      this.later(() => {
        const L = this.layout();
        const f = this.focusOnFar(L);
        this.cut(f.z, f.x, f.y);
        this.pan(f.z * 1.06, f.x, f.y, 850, linear);
        let k = 0;
        for (const [id, v] of L) {
          if (v.fore) continue;
          const fig = this.figs.get(id);
          const at = performance.now() + 120 + k++ * 110;
          fig.appearAt = at;
          this.later(() => this.dust(v.x, v.y, v.h * 0.5, 14), at - performance.now());
        }
      }, 950);
      // 컷 3 — 어깨 너머, 내가 들어온다
      this.later(() => {
        const L = this.layout();
        const noFore = this.foreId == null || !alive.has(this.foreId);
        this.cut(noFore ? 1.02 : 1.0, 0.5, 0.5);
        this.pan(noFore ? 1.06 : 1.04, 0.52, 0.5, 850, linear);
        for (const [id, v] of L) if (v.fore) this.figs.get(id).appearAt = performance.now();
        for (const [id] of L) { const g = this.figs.get(id); if (g.appearAt > 1e11) g.appearAt = performance.now(); }
      }, 1780);
      void now;
    }

    wait() {
      this.phase = 'wait';
      for (const f of this.figs.values()) if (f.appearAt > 1e11) f.appearAt = performance.now();
      this.pan(1.13, 0.56, 0.52, 6500, linear);
    }

    decoy(ev) {
      const k = ev.kind;
      if (k === 'weed') this.spawnWeed({ d: 0.78, dir: Math.random() < 0.5 ? 1 : -1, big: true, speed: 0.55 });
      else if (k === 'crow' || k === 'bird') this.spawnBird(true);
      else if (k === 'petal') for (let i = 0; i < 60; i++) this.spawnPetal(true);
      if (k === 'weed' || k === 'crow' || k === 'bird' || k === 'petal') this.shakeIt(90, 1.5);
    }

    signal(ev) {
      const now = performance.now();
      this.phase = 'signal';
      this.punchAt = now;
      if (ev.kind === 'sky' || ev.kind === 'moon') this.tint = { at: now, kind: ev.kind };
      if ((ev.kind === 'bell' || ev.kind === 'gong') && !ev.hide) this.bell = { at: now, kind: ev.kind };
      if (ev.kind === 'word') this.flashIt('#fff', 0.35, 120);
    }

    /** 누른 즉시 — 내 손이 먼저 움직여야 반응이 좋게 느껴진다 */
    shoot(id, move) {
      const f = this.figs.get(id);
      if (!f || f.pose !== 'idle') return;
      f.pose = this.mode === 'samurai' ? move : 'draw';
      f.poseAt = performance.now();
      if (this.mode === 'west') this.shakeIt(120, id === this.foreId ? 7 : 3);
    }

    early(id) {
      const f = this.figs.get(id);
      if (!f) return;
      if (f.pose === 'idle') { f.pose = 'early'; f.poseAt = performance.now(); }
      f.label = '오발';
      if (this.mode === 'samurai') f.label = '먼저 움직임';
    }

    result(ev) {
      const now = performance.now();
      this.phase = 'result';
      this.bars.target = 0.7;
      const win = new Set(ev.win);
      const outs = new Set(ev.out || []);
      const samurai = this.mode === 'samurai';
      const L = this.layout();
      let delay = 0;
      for (const row of ev.rows) {
        const f = this.figs.get(row.id);
        if (!f) continue;
        if (row.st === 'ok' && f.pose === 'idle') {
          f.pose = samurai ? row.move : 'draw';
          f.poseAt = now + (row.ms || 0) * 0.15;
        }
        if (row.st === 'jump' && f.pose === 'idle') { f.pose = 'early'; f.poseAt = now; }
        f.label = row.st === 'ok' ? (samurai ? null : (row.ms / 1000).toFixed(3) + '초')
          : row.st === 'early' ? (samurai ? '먼저 움직임' : '오발')
          : row.st === 'jump' ? '부정출발' : '늦음';
        const loses = samurai ? (ev.win.length && !win.has(row.id))
          : (outs.has(row.id) || (ev.win.length && !win.has(row.id) && row.st !== 'early'));
        if (loses) {
          f.fallAt = now + 260 + delay;
          delay += 140;
          const v = L.get(row.id);
          if (v && samurai) this.later(() => this.slash(v), 180);
        }
        if (outs.has(row.id)) f.out = true;
      }
      if (ev.win.length) {
        this.flashIt('#fff8e0', samurai ? 0.55 : 0.7, 110);
        this.shakeIt(260, samurai ? 6 : 9);
      } else if (samurai && ev.why === 'clash') {
        this.flashIt('#dfe8ff', 0.6, 90);
        const v = [...L.values()].find(x => !x.fore);
        if (v) this.sparks(v.x - v.h * 0.1, v.y - v.h * 0.6, 26);
      }
      if (this.foreId != null && win.size && !win.has(this.foreId) && ev.rows.some(r => r.id === this.foreId)) this.redAt = now + 250;
      this.pan(1.02, 0.5, 0.5, 700, easeOut);
    }

    over(ev) {
      this.clearTimers();
      this.phase = 'over';
      this.bars.target = 1;
      const L = this.layout();
      const v = L.get(ev.winnerId);
      if (!v) return;
      if (v.fore) this.pan(1.18, 0.3, 0.62, 2500, easeIO);
      else {
        const f = this.focusOnFar(new Map([[ev.winnerId, v]]));
        this.pan(f.z * 0.9, f.x, f.y, 2500, easeIO);
      }
    }

    /* ─────────────────────── 효과 ─────────────────────── */

    flashIt(color, a, dur) { this.flash = { at: performance.now(), dur, color, a }; }
    shakeIt(dur, amp) { this.shake = { at: performance.now(), dur, amp }; }

    spawnWeed({ d, dir, big, speed }) {
      const R = Math.random;
      const arcs = [];
      for (let i = 0; i < 28; i++) arcs.push([R() * TAU, 0.2 + R() * 0.8, R() * TAU, 0.5 + R() * 2.2]);
      this.weeds.push({ d, dir, big, speed, x: dir > 0 ? -0.2 : 1.2, rot: R() * TAU, ph: R() * TAU, arcs, seed: R() });
    }

    spawnBird(big) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.birds.push({ x: dir > 0 ? -0.1 : 1.1, y: 0.1 + Math.random() * 0.2, dir, big, v: big ? 0.35 : 0.08, ph: Math.random() * TAU, s: big ? 1 : 0.35 });
    }

    spawnPetal(burst) {
      this.parts.push({
        kind: 'petal', x: burst ? -0.1 - Math.random() * 0.3 : Math.random() * 1.2 - 0.1, y: Math.random() * 0.9,
        vx: (burst ? 0.5 : 0.04) + Math.random() * 0.1, vy: 0.02 + Math.random() * 0.04, r: 2 + Math.random() * 3,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 6, life: burst ? 3 : 12, age: 0,
      });
    }

    dust(x, y, size, n) {
      for (let i = 0; i < n; i++) {
        this.parts.push({
          kind: 'dust', px: x + (Math.random() - 0.5) * size * 0.6, py: y - Math.random() * size * 0.1,
          vx: (Math.random() - 0.5) * size * 1.2, vy: -Math.random() * size * 0.4, r: size * (0.08 + Math.random() * 0.12),
          life: 0.9 + Math.random() * 0.6, age: 0, layer: 'ground',
        });
      }
    }

    sparks(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = 150 + Math.random() * 400;
        this.parts.push({ kind: 'spark', px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.3, age: 0, layer: 'ground' });
      }
    }

    slash(v) {
      const cx = v.fore ? v.x + v.S * 0.1 : v.x;
      const cy = v.fore ? v.y - v.S * 0.55 : v.y - v.h * 0.6;
      const len = v.fore ? v.S * 0.8 : v.h * 1.4;
      this.streaks.push({ x: cx, y: cy, len, a: -0.5 + Math.random() * 0.3, at: performance.now(), fore: v.fore });
      this.sparks(cx, cy, 14);
    }

    /* ─────────────────────── 루프 ─────────────────────── */

    loop() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(now, dt);
      this.draw(now);
      requestAnimationFrame(this.loop);
    }

    update(now, dt) {
      if (now > this.nextWeed) {
        if (this.weeds.filter(w => !w.big).length < 2) this.spawnWeed({ d: 0.1 + Math.random() * 0.45, dir: Math.random() < 0.8 ? 1 : -1, big: false, speed: 0.05 + Math.random() * 0.07 });
        this.nextWeed = now + 3500 + Math.random() * 6000;
      }
      if (this.mode === 'west' && Math.random() < dt * 0.05 && this.birds.length < 2) this.spawnBird(false);
      if (this.mode === 'samurai' && this.parts.filter(p => p.kind === 'petal').length < 26 && Math.random() < dt * 4) this.spawnPetal(false);

      for (const w of this.weeds) {
        w.x += w.dir * w.speed * dt * (0.8 + 0.4 * Math.abs(Math.sin(now / 700 + w.ph)));
        w.rot += w.dir * w.speed * dt * (w.big ? 9 : 14) / Math.max(0.3, w.d);
        w.ph += dt * (w.big ? 7 : 4.5);
      }
      this.weeds = this.weeds.filter(w => w.x > -0.4 && w.x < 1.4);
      for (const b of this.birds) { b.x += b.dir * b.v * dt; b.ph += dt * (b.big ? 16 : 8); b.y += Math.sin(b.ph * 0.2) * dt * 0.01; }
      this.birds = this.birds.filter(b => b.x > -0.2 && b.x < 1.2);
      for (const p of this.parts) {
        p.age += dt;
        if (p.kind === 'petal') { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.y > 1) p.y = -0.02; }
        else { p.px += p.vx * dt; p.py += p.vy * dt; p.vx *= 1 - dt * (p.kind === 'spark' ? 3 : 2.2); p.vy = p.vy * (1 - dt * 2) + (p.kind === 'spark' ? 600 : -8) * dt; }
      }
      this.parts = this.parts.filter(p => p.age < p.life && (p.kind !== 'petal' || p.x < 1.3));
      this.bars.v += (this.bars.target - this.bars.v) * Math.min(1, dt * 5);
    }

    /** 층 하나에 카메라를 건다 */
    withCam(p, now, fn) {
      const { ctx, W, H } = this;
      const c = this.camNow(now);
      const punch = 1 + 0.045 * (1 - easeOut((now - this.punchAt) / 260)) * (now - this.punchAt < 260 ? 1 : 0);
      const z = 1 + (c.z * punch - 1) * p;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(z, z);
      ctx.translate(-(W / 2 + (c.x - 0.5) * W * p), -(H / 2 + (c.y - 0.5) * H * p));
      fn();
      ctx.restore();
    }

    draw(now) {
      const { ctx, W, H, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      const sp = (now - this.shake.at) / this.shake.dur;
      if (sp < 1) {
        const a = this.shake.amp * (1 - sp);
        ctx.translate((Math.random() - 0.5) * a * 2, (Math.random() - 0.5) * a * 2);
      }
      const samurai = this.mode === 'samurai';
      const L = this.layout();

      this.withCam(PX.sky, now, () => (samurai ? this.drawSkyS(now) : this.drawSkyW(now)));
      this.withCam(PX.cloud, now, () => (samurai ? this.drawSun(now) : this.drawClouds(now)));
      this.withCam(PX.far, now, () => (samurai ? this.drawRidges() : this.drawMesas()));
      this.withCam(PX.ground, now, () => {
        if (samurai) this.drawFieldS(now); else this.drawGroundW();
        this.drawBirds(now);
        // 먼 층: 사람 · 회전초를 깊이 순서대로
        const items = [];
        for (const [id, v] of L) if (!v.fore) items.push({ d: v.d, fn: () => this.drawFar(this.figs.get(id), v, now, L) });
        for (const w of this.weeds) if (!w.big) items.push({ d: w.d, fn: () => this.drawWeed(w) });
        items.sort((a, b) => a.d - b.d).forEach(i => i.fn());
        if (samurai) this.drawGrassFront(now);
        this.drawParts('ground');
        this.drawStreaks(now, false);
      });
      this.withCam(PX.fore, now, () => {
        for (const w of this.weeds) if (w.big) this.drawWeed(w);
        for (const [id, v] of L) if (v.fore) this.drawFore(this.figs.get(id), v, now, L);
        this.drawStreaks(now, true);
        this.drawPetals();
      });
      ctx.restore();

      this.drawOverlay(now);
    }

    /* ─────────────────────── 서부 배경 ─────────────────────── */

    drawSkyW() {
      const { ctx, W, H } = this;
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.46);
      g.addColorStop(0, '#6f8193');
      g.addColorStop(0.55, '#a9b0b3');
      g.addColorStop(1, '#d9d2c3');
      ctx.fillStyle = g;
      ctx.fillRect(-W, -H, W * 3, H * 2.5);
    }

    drawClouds(now) {
      const { ctx, W, H } = this;
      for (const c of this.clouds) {
        const x = (((c.x + now / 1000 * c.v) + 0.5) % 2.2 - 0.6) * W;
        const y = c.y * H;
        const s = c.s * Math.min(W, H * 1.6);
        // 그림자 쪽 먼저, 밝은 쪽을 위로 살짝 올려 겹친다
        ctx.fillStyle = c.dark ? 'rgba(96,104,114,.32)' : 'rgba(130,138,146,.28)';
        for (const p of c.puffs) { ctx.beginPath(); ctx.ellipse(x + p.dx * s, y + p.dy * s + p.r * s * 0.35, p.r * s * p.sx, p.r * s * 0.8, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = c.dark ? 'rgba(200,202,204,.3)' : 'rgba(240,238,232,.38)';
        for (const p of c.puffs) { ctx.beginPath(); ctx.ellipse(x + p.dx * s - p.r * s * 0.2, y + p.dy * s - p.r * s * 0.15, p.r * s * p.sx * 0.85, p.r * s * 0.7, 0, 0, TAU); ctx.fill(); }
      }
    }

    drawMesas() {
      const { ctx, W, H } = this;
      // 먼 띠 — 푸르스름한 지평선
      ctx.fillStyle = '#8e96a0';
      ctx.beginPath();
      ctx.moveTo(-W, H * 0.445);
      for (let i = 0; i <= 30; i++) ctx.lineTo(-W + i / 30 * W * 3, H * (0.43 + Math.sin(i * 1.7) * 0.004));
      ctx.lineTo(2 * W, H * 0.46); ctx.lineTo(-W, H * 0.46);
      ctx.fill();
      for (const m of this.mesas) {
        const path = new Path2D();
        m.pts.forEach(([x, y], i) => (i ? path.lineTo(x * W, y * H) : path.moveTo(x * W, y * H)));
        path.closePath();
        const g = ctx.createLinearGradient(0, m.top * H, 0, H * 0.445);
        if (m.far) { g.addColorStop(0, '#b58a7c'); g.addColorStop(1, '#a88f86'); }
        else { g.addColorStop(0, '#b4674a'); g.addColorStop(0.5, '#a0533b'); g.addColorStop(1, '#b98a6e'); }
        ctx.fillStyle = g;
        ctx.fill(path);
        ctx.save();
        ctx.clip(path);
        // 지층 줄무늬
        ctx.strokeStyle = m.far ? 'rgba(90,60,55,.15)' : 'rgba(70,30,20,.22)';
        ctx.lineWidth = Math.max(1, H * 0.002);
        for (let y = m.top + 0.01; y < 0.445; y += 0.012) {
          ctx.beginPath(); ctx.moveTo((m.x - 0.02) * W, y * H); ctx.lineTo((m.x + m.w + 0.02) * W, (y + 0.002) * H); ctx.stroke();
        }
        // 오른쪽 그늘
        ctx.fillStyle = m.far ? 'rgba(60,40,50,.12)' : 'rgba(60,20,15,.25)';
        ctx.fillRect((m.x + m.w * 0.72) * W, m.top * H, m.w * 0.3 * W, H);
        ctx.restore();
      }
    }

    drawGroundW() {
      const { ctx, W, H } = this;
      const hY = H * 0.445;
      const g = ctx.createLinearGradient(0, hY, 0, H);
      g.addColorStop(0, '#bfae94');
      g.addColorStop(0.25, '#d2c3a8');
      g.addColorStop(1, '#ddd0b8');
      ctx.fillStyle = g;
      ctx.fillRect(-W, hY, W * 3, H * 1.5);
      // 지평선 먼지 안개
      const haze = ctx.createLinearGradient(0, hY - H * 0.03, 0, hY + H * 0.06);
      haze.addColorStop(0, 'rgba(220,210,195,0)');
      haze.addColorStop(0.5, 'rgba(220,210,195,.55)');
      haze.addColorStop(1, 'rgba(220,210,195,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(-W, hY - H * 0.03, W * 3, H * 0.09);
      ctx.strokeStyle = 'rgba(120,100,70,.28)';
      for (const seg of this.cracks) {
        ctx.lineWidth = Math.max(0.6, seg[0][1] * H * 0.004);
        ctx.beginPath();
        seg.forEach(([x, d], i) => { const y = hY + (H - hY) * clamp(d); i ? ctx.lineTo(x * W, y) : ctx.moveTo(x * W, y); });
        ctx.stroke();
      }
      for (const s of this.scrub) {
        const y = hY + (H - hY) * s.d;
        const r = (0.6 + s.d * 7) * s.r;
        ctx.fillStyle = 'rgba(105,92,60,.45)';
        ctx.beginPath(); ctx.ellipse(s.x * W, y, r * 1.6, r * 0.6, 0, 0, TAU); ctx.fill();
      }
    }

    drawWeed(w) {
      const { ctx, W, H } = this;
      const hY = H * 0.445;
      const d = w.d;
      const r = w.big ? H * 0.11 : H * (0.012 + d * 0.075);
      const gy = w.big ? H * 0.97 : hY + (H - hY) * d;
      const x = w.x * W;
      const hop = Math.abs(Math.sin(w.ph)) * r * (w.big ? 0.9 : 0.6);
      const y = gy - r - hop;
      ctx.fillStyle = 'rgba(80,60,35,.22)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.2, gy, r * (1 - hop / r * 0.3), r * 0.18, 0, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(w.rot);
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? '#c6ab7c' : '#7d6440';
        ctx.lineWidth = Math.max(0.7, r * (pass ? 0.035 : 0.06));
        for (const [a, rr, a2, len] of w.arcs) {
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * rr * 0.35, Math.sin(a) * r * rr * 0.35, r * (0.45 + rr * 0.5), a2, a2 + len);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawBirds(now) {
      const { ctx, W, H } = this;
      for (const b of this.birds) {
        const x = b.x * W, y = b.y * H;
        const s = H * 0.035 * b.s;
        const flap = Math.sin(b.ph) * 0.8;
        ctx.strokeStyle = '#1a1614'; ctx.fillStyle = '#1a1614';
        ctx.lineWidth = s * 0.14; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - s, y - flap * s * 0.6);
        ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.35 - flap * s * 0.2, x, y);
        ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.35 - flap * s * 0.2, x + s, y - flap * s * 0.6);
        ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y + s * 0.05, s * 0.22, s * 0.1, 0, 0, TAU); ctx.fill();
      }
      void now;
    }

    /* ─────────────────────── 사무라이 배경 ─────────────────────── */

    drawSkyS() {
      const { ctx, W, H } = this;
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.46);
      g.addColorStop(0, '#1c1b2e');
      g.addColorStop(0.5, '#5b3a4a');
      g.addColorStop(0.85, '#c7704a');
      g.addColorStop(1, '#e6a36a');
      ctx.fillStyle = g;
      ctx.fillRect(-W, -H, W * 3, H * 2.5);
    }

    drawSun(now) {
      const { ctx, W, H } = this;
      const red = this.tint && this.tint.kind === 'moon' ? easeOut((now - this.tint.at) / 120) : 0;
      const x = W * 0.66, y = H * 0.34, r = H * 0.2;
      const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.2);
      glow.addColorStop(0, red ? 'rgba(220,30,20,.5)' : 'rgba(255,220,170,.35)');
      glow.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = red ? '#c21d14' : '#f4dcb0';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      // 해 앞을 지나는 가는 구름
      ctx.fillStyle = 'rgba(60,40,60,.35)';
      for (let i = 0; i < 3; i++) {
        const cx = ((now / 60000 * (1 + i * 0.3) + i * 0.37) % 1.6 - 0.3) * W;
        ctx.beginPath(); ctx.ellipse(cx, H * (0.3 + i * 0.05), W * 0.16, H * 0.008, 0, 0, TAU); ctx.fill();
      }
    }

    drawRidges() {
      const { ctx, W, H } = this;
      const cols = ['#5a4a5e', '#43394d', '#2f2a38'];
      this.ridges.forEach((pts, i) => {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(pts[0][0] * W, H * 0.5);
        for (const [x, y] of pts) ctx.lineTo(x * W, (y + 0.06) * H);
        ctx.lineTo(pts[pts.length - 1][0] * W, H * 0.5);
        ctx.fill();
        // 산 사이 안개
        const g = ctx.createLinearGradient(0, H * (0.36 + i * 0.04), 0, H * 0.5);
        g.addColorStop(0, 'rgba(200,120,90,0)');
        g.addColorStop(1, `rgba(200,120,90,${0.25 - i * 0.07})`);
        ctx.fillStyle = g;
        ctx.fillRect(-W, H * (0.36 + i * 0.04), W * 3, H * 0.15);
      });
    }

    drawFieldS(now) {
      const { ctx, W, H } = this;
      const hY = H * 0.445;
      const g = ctx.createLinearGradient(0, hY, 0, H);
      g.addColorStop(0, '#6b5a52');
      g.addColorStop(0.3, '#4a3e3a');
      g.addColorStop(1, '#2a2322');
      ctx.fillStyle = g;
      ctx.fillRect(-W, hY, W * 3, H * 1.5);
      this.drawGrassRows(now, 0, 0.55);
    }

    drawGrassFront(now) { this.drawGrassRows(now, 0.55, 1.01); }

    drawGrassRows(now, d0, d1) {
      const { ctx, W, H } = this;
      const hY = H * 0.445;
      ctx.lineCap = 'round';
      for (const b of this.grass) {
        if (b.d < d0 || b.d >= d1) continue;
        const y = hY + (H - hY) * b.d;
        const h = H * (0.01 + b.d * 0.09) * b.h;
        const sway = Math.sin(now / 900 + b.x * 9 + b.ph) * h * 0.25;
        ctx.strokeStyle = `rgba(${Math.round(150 + b.h * 40)},${Math.round(130 + b.h * 25)},${Math.round(95 + b.h * 10)},${0.35 + b.d * 0.5})`;
        ctx.lineWidth = Math.max(0.6, h * 0.05);
        ctx.beginPath();
        ctx.moveTo(b.x * W, y);
        ctx.quadraticCurveTo(b.x * W + sway * 0.3, y - h * 0.6, b.x * W + sway, y - h);
        ctx.stroke();
      }
    }

    drawPetals() {
      const { ctx, W, H } = this;
      for (const p of this.parts) {
        if (p.kind !== 'petal') continue;
        ctx.save();
        ctx.translate(p.x * W, p.y * H);
        ctx.rotate(p.rot);
        ctx.fillStyle = 'rgba(240,200,205,.85)';
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    /* ─────────────────────── 사람 ─────────────────────── */

    fallP(f, now) { return f.fallAt == null ? 0 : easeOut((now - f.fallAt) / 520); }

    /** 멀리 서 있는 사람 — 정면 */
    drawFar(f, v, now, L) {
      if (!f) return;
      const { ctx } = this;
      const ap = clamp((now - f.appearAt) / 420);
      if (ap <= 0) return;
      const u = v.h / 100;
      const fall = this.fallP(f, now);
      const side = v.x < this.W * 0.5 ? -1 : 1;
      ctx.save();
      ctx.globalAlpha = easeOut(ap) * (f.out && fall >= 1 ? 0.75 : 1);
      // 그림자
      ctx.fillStyle = 'rgba(60,45,30,.28)';
      ctx.beginPath(); ctx.ellipse(v.x + 20 * u * (1 - fall), v.y, (26 + fall * 30) * u, 3.2 * u, -0.05, 0, TAU); ctx.fill();
      ctx.translate(v.x, v.y + (1 - easeOut(ap)) * 10 * u);
      if (fall) {
        ctx.translate(0, -fall * 4 * u);
        ctx.rotate(side * fall * Math.PI * 0.47);
      }
      if (this.mode === 'samurai') this.samuraiFront(u, f, now); else this.cowboyFront(u, f, now);
      ctx.restore();
      this.drawLabel(f, v.x, v.y - v.h * 1.12, v.h, now);
      void L;
    }

    drawLabel(f, x, y, size, now) {
      const { ctx } = this;
      if (this.phase === 'intro' || this.phase === 'menu') {
        if (now - f.appearAt < 0 || !f.name) return;
      }
      if (!f.name) return;
      const fs = clamp(size * 0.1, 11, 18);
      ctx.save();
      ctx.font = `700 ${fs}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const text = f.name;
      const w = ctx.measureText(text).width + fs;
      ctx.globalAlpha = clamp((now - f.appearAt) / 400);
      ctx.fillStyle = 'rgba(20,14,10,.62)';
      roundRect(ctx, x - w / 2, y - fs * 1.5, w, fs * 1.45, fs * 0.4); ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillRect(x - w / 2 + fs * 0.35, y - fs * 0.95, fs * 0.35, fs * 0.35);
      ctx.fillStyle = '#f5ecdc';
      ctx.fillText(text, x + fs * 0.2, y - fs * 0.25);
      if (f.label) {
        ctx.font = `800 ${fs * 1.05}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
        const bad = f.label === '오발' || f.label === '부정출발' || f.label === '늦음' || f.label === '먼저 움직임';
        ctx.fillStyle = bad ? '#ffcf5a' : '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = fs * 0.22; ctx.lineJoin = 'round';
        ctx.strokeText(f.label, x, y - fs * 1.7);
        ctx.fillText(f.label, x, y - fs * 1.7);
      }
      ctx.restore();
    }

    cowboyFront(u, f, now) {
      const { ctx } = this;
      const breathe = Math.sin(now / 900 + f.id) * 0.5 * u;
      const pose = f.poseAt <= now ? f.pose : 'idle';
      const t = (now - f.poseAt) / 1000;
      // 다리 · 부츠
      ctx.fillStyle = '#2b2723';
      poly(ctx, [[-10 * u, -50 * u], [-1.5 * u, -50 * u], [-3.5 * u, -2 * u], [-11.5 * u, -2 * u]]);
      poly(ctx, [[1.5 * u, -50 * u], [10 * u, -50 * u], [11.5 * u, -2 * u], [3.5 * u, -2 * u]]);
      ctx.fillStyle = '#1a1512';
      poly(ctx, [[-12 * u, -9 * u], [-3 * u, -9 * u], [-2 * u, 0], [-14 * u, 0]]);
      poly(ctx, [[3 * u, -9 * u], [12 * u, -9 * u], [14 * u, 0], [2 * u, 0]]);
      ctx.translate(0, breathe);
      // 몸통 — 가죽 셔츠
      const body = ctx.createLinearGradient(-15 * u, 0, 15 * u, 0);
      body.addColorStop(0, '#24211f'); body.addColorStop(0.45, '#3c3834'); body.addColorStop(1, '#1f1c1a');
      ctx.fillStyle = body;
      poly(ctx, [[-12.5 * u, -51 * u], [12.5 * u, -51 * u], [15 * u, -79 * u], [9 * u, -83 * u], [-9 * u, -83 * u], [-15 * u, -79 * u]]);
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.8 * u;
      line(ctx, 0, -83 * u, 0, -52 * u);
      // 벨트 · 총집
      ctx.fillStyle = '#5b3b22'; ctx.fillRect(-13 * u, -55 * u, 26 * u, 4.5 * u);
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(-2 * u, -54.5 * u, 4 * u, 3.5 * u);
      ctx.fillStyle = '#6a4526';
      poly(ctx, [[9 * u, -52 * u], [15 * u, -52 * u], [16 * u, -38 * u], [11 * u, -37 * u]]);
      // 스카프
      ctx.fillStyle = f.color;
      poly(ctx, [[-6 * u, -83 * u], [6 * u, -83 * u], [0, -75 * u]]);
      // 팔
      const arm = (x0, y0, x1, y1, w) => { ctx.strokeStyle = '#2d2926'; ctx.lineWidth = w * u; ctx.lineCap = 'round'; line(ctx, x0 * u, y0 * u, x1 * u, y1 * u); ctx.fillStyle = '#a67a5a'; circle(ctx, x1 * u, y1 * u, 2.4 * u); };
      arm(-14, -78, -18, -52, 5.5);
      if (pose === 'draw') {
        // 총을 앞으로 — 몸 쪽으로 짧게 겹쳐 보인다
        arm(14, -78, 7, -66, 6);
        ctx.fillStyle = '#151515';
        ctx.fillRect(4 * u, -69 * u, 6 * u, 5 * u);
        this.muzzle(6.5 * u, -67 * u, 12 * u, t, 1);
      } else if (pose === 'early') {
        arm(14, -78, 20, -46, 5.5);
        ctx.strokeStyle = '#151515'; ctx.lineWidth = 2.2 * u;
        line(ctx, 20 * u, -46 * u, 23 * u, -36 * u);
        this.smoke(24 * u, -34 * u, 5 * u, t);
      } else {
        arm(14, -78, 17.5, -53, 5.5);
      }
      // 목 · 머리
      ctx.fillStyle = '#8c6448'; ctx.fillRect(-3 * u, -87 * u, 6 * u, 5 * u);
      ctx.fillStyle = '#b48665';
      ctx.beginPath(); ctx.ellipse(0, -92 * u, 6.2 * u, 7.6 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(40,25,15,.45)';
      ctx.beginPath(); ctx.ellipse(0, -95 * u, 6.2 * u, 3 * u, 0, Math.PI, TAU); ctx.fill();
      ctx.fillRect(-4 * u, -89 * u, 8 * u, 3 * u);
      // 모자
      ctx.fillStyle = '#1d1a18';
      ctx.beginPath(); ctx.ellipse(0, -97.5 * u, 17 * u, 3.2 * u, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8.5 * u, -98 * u);
      ctx.bezierCurveTo(-9 * u, -106 * u, -6 * u, -109 * u, 0, -106.5 * u);
      ctx.bezierCurveTo(6 * u, -109 * u, 9 * u, -106 * u, 8.5 * u, -98 * u);
      ctx.fill();
      ctx.fillStyle = '#3b2c20'; ctx.fillRect(-8.6 * u, -100.5 * u, 17.2 * u, 1.8 * u);
    }

    samuraiFront(u, f, now) {
      const { ctx } = this;
      const breathe = Math.sin(now / 1100 + f.id) * 0.5 * u;
      const pose = f.poseAt <= now ? f.pose : 'idle';
      const t = (now - f.poseAt) / 1000;
      // 하카마
      const hk = ctx.createLinearGradient(-20 * u, 0, 20 * u, 0);
      hk.addColorStop(0, '#1c2030'); hk.addColorStop(0.5, '#343a52'); hk.addColorStop(1, '#1a1d2b');
      ctx.fillStyle = hk;
      poly(ctx, [[-13 * u, -50 * u], [13 * u, -50 * u], [21 * u, 0], [-21 * u, 0]]);
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.8 * u;
      for (const x of [-9, -3, 3, 9]) line(ctx, x * 0.6 * u, -48 * u, x * u * 1.3, 0);
      ctx.translate(0, breathe);
      // 저고리
      ctx.fillStyle = '#2b3042';
      poly(ctx, [[-13 * u, -50 * u], [13 * u, -50 * u], [16 * u, -79 * u], [9 * u, -83 * u], [-9 * u, -83 * u], [-16 * u, -79 * u]]);
      ctx.strokeStyle = '#d8cbb0'; ctx.lineWidth = 1.2 * u;
      line(ctx, -5 * u, -83 * u, 2 * u, -62 * u); line(ctx, 5 * u, -83 * u, -1 * u, -66 * u);
      // 오비
      ctx.fillStyle = f.color; ctx.fillRect(-13.5 * u, -55 * u, 27 * u, 6 * u);
      // 칼집 (왼쪽 허리)
      const sword = pose === 'idle' || pose === 'early';
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 2.6 * u; ctx.lineCap = 'round';
      line(ctx, -8 * u, -54 * u, -34 * u, -40 * u);
      if (sword) { ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 2.2 * u; line(ctx, -6 * u, -55 * u, 4 * u, -60 * u); }
      const skin = '#b48a68';
      const arm = (x0, y0, x1, y1) => { ctx.strokeStyle = '#2b3042'; ctx.lineWidth = 6 * u; line(ctx, x0 * u, y0 * u, x1 * u, y1 * u); ctx.fillStyle = skin; circle(ctx, x1 * u, y1 * u, 2.4 * u); };
      const blade = (x0, y0, x1, y1, a = 1) => {
        ctx.strokeStyle = `rgba(225,232,240,${a})`; ctx.lineWidth = 1.8 * u; line(ctx, x0 * u, y0 * u, x1 * u, y1 * u);
        ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = 2.6 * u;
        const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
        line(ctx, x0 * u, y0 * u, (x0 - dx / l * 8) * u, (y0 - dy / l * 8) * u);
      };
      if (pose === 'light') {
        arm(-14, -78, 14, -64); arm(14, -78, 20, -64);
        blade(21, -64, 62, -70);
        this.arcTrail(20 * u, -64 * u, 42 * u, -0.9, 0.3, t);
      } else if (pose === 'heavy') {
        arm(-14, -78, -3, -106); arm(14, -78, 3, -106);
        blade(0, -108, 6, -150);
      } else if (pose === 'guard') {
        arm(-14, -78, -2, -62); arm(14, -78, 3, -62);
        blade(1, -62, -10, -118);
      } else if (pose === 'early') {
        arm(-14, -78, -8, -56); arm(14, -78, -2, -58);
        this.smoke(-4 * u, -60 * u, 3 * u, t);
      } else {
        arm(-14, -78, -6, -56); arm(14, -78, 17, -53);
      }
      // 머리 · 상투
      ctx.fillStyle = '#8a6448'; ctx.fillRect(-3 * u, -87 * u, 6 * u, 5 * u);
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse(0, -92 * u, 6 * u, 7.5 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#161214';
      ctx.beginPath(); ctx.ellipse(0, -96 * u, 6.4 * u, 4.2 * u, 0, Math.PI, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -102 * u, 2 * u, 3.4 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(40,20,20,.35)'; ctx.fillRect(-4 * u, -92 * u, 8 * u, 1.4 * u);
    }

    /** 앞에 크게 보이는 내 뒷모습 */
    drawFore(f, v, now, L) {
      if (!f) return;
      const { ctx, W } = this;
      const ap = easeOut((now - f.appearAt) / 650);
      if (ap <= 0) return;
      const u = v.S / 100;
      const fall = this.fallP(f, now);
      // 겨눌 곳 — 가장 가까운 상대
      let target = null;
      for (const o of L.values()) if (!o.fore && (!target || o.x < target.x)) target = o;
      ctx.save();
      ctx.translate(v.x - (1 - ap) * W * 0.45, v.y + (1 - ap) * v.S * 0.08 + fall * v.S * 0.45);
      ctx.rotate(-fall * 0.35);
      ctx.globalAlpha = 1 - fall * 0.3;
      const breathe = Math.sin(now / 1000) * 0.5 * u;
      ctx.translate(0, breathe);
      if (this.mode === 'samurai') this.samuraiBack(u, f, now, v, target); else this.cowboyBack(u, f, now, v, target);
      ctx.restore();
      if (f.label && this.phase !== 'intro') {
        const fs = clamp(v.S * 0.045, 14, 30);
        ctx.save();
        ctx.font = `900 ${fs}px "Black Han Sans", "Pretendard Variable", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = fs * 0.25;
        const bad = !/초$/.test(f.label);
        ctx.fillStyle = bad ? '#ffcf5a' : '#fff';
        const lx = v.x + v.S * 0.02, ly = v.y - v.S * 1.08;
        ctx.strokeText(f.label, lx, ly); ctx.fillText(f.label, lx, ly);
        ctx.restore();
      }
    }

    aimPoint(v, target, u) {
      // 앞사람 좌표계(발 기준, 회전 전)에서 겨눌 방향
      if (!target) return { a: -0.12 };
      const tx = (target.x - v.x) / u, ty = (target.y - target.h * 0.55 - v.y) / u;
      return { a: Math.atan2(ty - -40, tx - 30) };
    }

    cowboyBack(u, f, now, v, target) {
      const { ctx } = this;
      const pose = f.poseAt <= now ? f.pose : 'idle';
      const t = (now - f.poseAt) / 1000;
      // 총 든 팔은 판초 밑에서 나오니 먼저 그린다
      if (pose === 'draw') {
        const { a } = this.aimPoint(v, target, u);
        const sx = 28 * u, sy = -42 * u;
        const len = 34 * u * easeOut(t / 0.07);
        const hx = sx + Math.cos(a) * len, hy = sy + Math.sin(a) * len;
        ctx.strokeStyle = '#2a2521'; ctx.lineWidth = 9 * u; ctx.lineCap = 'round';
        line(ctx, sx, sy, hx, hy);
        ctx.fillStyle = '#9b7152'; circle(ctx, hx, hy, 3.6 * u);
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
        ctx.fillStyle = '#181818'; ctx.fillRect(0, -2 * u, 13 * u, 3.2 * u);
        ctx.fillStyle = '#5a3d26'; ctx.fillRect(-2 * u, -1 * u, 4 * u, 6 * u);
        ctx.restore();
        this.muzzle(hx + Math.cos(a) * 14 * u, hy + Math.sin(a) * 14 * u, 16 * u, t, 1);
      }
      // 판초
      const ponch = new Path2D();
      ponch.moveTo(-9 * u, -71 * u);
      ponch.bezierCurveTo(-20 * u, -69 * u, -30 * u, -64 * u, -34 * u, -56 * u);
      ponch.lineTo(-44 * u, 2 * u);
      ponch.lineTo(44 * u, 2 * u);
      ponch.lineTo(36 * u, -54 * u);
      ponch.bezierCurveTo(31 * u, -64 * u, 20 * u, -69 * u, 9 * u, -71 * u);
      ponch.closePath();
      ctx.fillStyle = '#5e4c3c';
      ctx.fill(ponch);
      ctx.save();
      ctx.clip(ponch);
      const band = (y, h, col, zig) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        const step = 5;
        ctx.moveTo(-50 * u, (y - h / 2) * u);
        for (let x = -50, k = 0; x <= 50; x += step, k++) ctx.lineTo(x * u, (y - h / 2 + (k % 2 ? zig : -zig)) * u);
        for (let x = 50, k = 20; x >= -50; x -= step, k--) ctx.lineTo(x * u, (y + h / 2 + (k % 2 ? zig : -zig)) * u);
        ctx.closePath(); ctx.fill();
      };
      band(-60, 3, '#3a2d23', 0);
      band(-55, 2.2, '#c9b594', 0.6);
      band(-50, 1.6, '#8e3024', 0);
      band(-42, 7, '#3b2e24', 1.8);
      band(-42, 2.4, '#c7b18e', 1.6);
      band(-33, 1.8, '#8e3024', 0.4);
      band(-26, 4, '#6e5a46', 0);
      band(-19, 2.2, '#c9b594', 1);
      band(-14, 3.2, '#8e3024', 1.4);
      band(-6, 6, '#3b2e24', 2);
      band(-6, 1.8, '#c9b594', 1.4);
      // 날염 무늬 — 계단 마름모
      ctx.fillStyle = 'rgba(200,180,145,.55)';
      for (let x = -40; x <= 40; x += 16) {
        for (const y of [-26, 3]) poly(ctx, [[x * u, (y - 4) * u], [(x + 4) * u, y * u], [x * u, (y + 4) * u], [(x - 4) * u, y * u]]);
      }
      // 주름 · 음영
      const sh = ctx.createLinearGradient(-44 * u, 0, 44 * u, 0);
      sh.addColorStop(0, 'rgba(0,0,0,.45)'); sh.addColorStop(0.35, 'rgba(0,0,0,0)'); sh.addColorStop(0.7, 'rgba(0,0,0,.05)'); sh.addColorStop(1, 'rgba(0,0,0,.5)');
      ctx.fillStyle = sh; ctx.fillRect(-50 * u, -80 * u, 100 * u, 90 * u);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2 * u;
      for (const x of [-18, 4, 22]) { ctx.beginPath(); ctx.moveTo(x * 0.5 * u, -64 * u); ctx.quadraticCurveTo((x + 3) * u, -30 * u, x * 1.3 * u, 2 * u); ctx.stroke(); }
      ctx.restore();
      // 총집과 손 (아직 안 뽑았을 때)
      if (pose !== 'draw') {
        ctx.fillStyle = '#6d4a2c';
        poly(ctx, [[30 * u, -20 * u], [39 * u, -21 * u], [41 * u, -4 * u], [33 * u, -2 * u]]);
        ctx.fillStyle = '#4a3322'; ctx.fillRect(29 * u, -24 * u, 9 * u, 5 * u);
        ctx.fillStyle = '#2a2521';
        ctx.beginPath(); ctx.ellipse(38 * u, -28 * u, 5 * u, 7 * u, -0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9b7152';
        ctx.beginPath(); ctx.ellipse(37 * u, -23 * u, 3.6 * u, 3 * u, 0.2, 0, TAU); ctx.fill();
        if (pose === 'early') {
          ctx.strokeStyle = '#181818'; ctx.lineWidth = 3 * u; line(ctx, 38 * u, -22 * u, 44 * u, -8 * u);
          this.smoke(45 * u, -6 * u, 7 * u, t);
        }
      }
      // 목 · 머리 뒤통수
      ctx.fillStyle = '#2d2520';
      poly(ctx, [[-8 * u, -72 * u], [8 * u, -72 * u], [6 * u, -79 * u], [-6 * u, -79 * u]]);
      ctx.fillStyle = '#8f6a50';
      ctx.beginPath(); ctx.ellipse(8.2 * u, -82 * u, 1.8 * u, 3 * u, 0.2, 0, TAU); ctx.fill();
      const hair = ctx.createLinearGradient(0, -92 * u, 0, -76 * u);
      hair.addColorStop(0, '#3a2d22'); hair.addColorStop(1, '#6b5240');
      ctx.fillStyle = hair;
      ctx.beginPath(); ctx.ellipse(0, -84 * u, 8 * u, 9.5 * u, 0, 0, TAU); ctx.fill();
      // 모자 — 뒤에서 본 챙
      ctx.save();
      ctx.translate(0, -89 * u); ctx.rotate(-0.06);
      const br = ctx.createLinearGradient(0, -6 * u, 0, 5 * u);
      br.addColorStop(0, '#5a4a3e'); br.addColorStop(1, '#241c17');
      ctx.fillStyle = br;
      ctx.beginPath();
      ctx.moveTo(-27 * u, 1 * u);
      ctx.bezierCurveTo(-24 * u, -6 * u, 24 * u, -6 * u, 27 * u, -1 * u);
      ctx.bezierCurveTo(22 * u, 5 * u, -22 * u, 7 * u, -27 * u, 1 * u);
      ctx.fill();
      const cr = ctx.createLinearGradient(-11 * u, 0, 11 * u, 0);
      cr.addColorStop(0, '#2e241e'); cr.addColorStop(0.4, '#54443a'); cr.addColorStop(1, '#2a211b');
      ctx.fillStyle = cr;
      ctx.beginPath();
      ctx.moveTo(-11 * u, -2 * u);
      ctx.bezierCurveTo(-12 * u, -12 * u, -8 * u, -15.5 * u, 0, -13 * u);
      ctx.bezierCurveTo(8 * u, -15.5 * u, 12 * u, -12 * u, 11 * u, -2 * u);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1e1713'; ctx.fillRect(-11.2 * u, -4.5 * u, 22.4 * u, 2.4 * u);
      ctx.restore();
    }

    samuraiBack(u, f, now, v, target) {
      const { ctx } = this;
      const pose = f.poseAt <= now ? f.pose : 'idle';
      const t = (now - f.poseAt) / 1000;
      const { a } = this.aimPoint(v, target, u);
      const blade = (x0, y0, ang, len) => {
        const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, '#9aa3ad'); g.addColorStop(1, '#f2f6fa');
        ctx.strokeStyle = g; ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
        line(ctx, x0, y0, x1, y1);
        ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 4.5 * u;
        line(ctx, x0, y0, x0 - Math.cos(ang) * 13 * u, y0 - Math.sin(ang) * 13 * u);
        ctx.fillStyle = '#b8963c'; circle(ctx, x0, y0, 3 * u);
      };
      const armTo = (x, y) => {
        ctx.strokeStyle = '#252c42'; ctx.lineWidth = 10 * u; ctx.lineCap = 'round';
        line(ctx, 27 * u, -58 * u, x, y);
        ctx.fillStyle = '#9d7457'; circle(ctx, x, y, 3.6 * u);
      };
      if (pose === 'light') {
        const e = easeOut(t / 0.08);
        const hx = 44 * u, hy = -50 * u;
        armTo(hx, hy);
        blade(hx, hy, lerp(a + 1.4, a, e), 60 * u);
        this.arcTrail(hx, hy, 58 * u, a + 1.4, a, t);
      } else if (pose === 'guard') {
        armTo(34 * u, -46 * u);
        blade(34 * u, -46 * u, -1.9, 70 * u);
      }
      // 기모노 등판
      const back = new Path2D();
      back.moveTo(-10 * u, -72 * u);
      back.bezierCurveTo(-24 * u, -70 * u, -34 * u, -66 * u, -37 * u, -57 * u);
      back.lineTo(-42 * u, 2 * u); back.lineTo(42 * u, 2 * u); back.lineTo(37 * u, -57 * u);
      back.bezierCurveTo(34 * u, -66 * u, 24 * u, -70 * u, 10 * u, -72 * u);
      back.closePath();
      const kg = ctx.createLinearGradient(-42 * u, 0, 42 * u, 0);
      kg.addColorStop(0, '#141826'); kg.addColorStop(0.45, '#2c3450'); kg.addColorStop(1, '#131623');
      ctx.fillStyle = kg; ctx.fill(back);
      ctx.save(); ctx.clip(back);
      ctx.fillStyle = f.color; ctx.fillRect(-50 * u, -24 * u, 100 * u, 8 * u);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-50 * u, -17 * u, 100 * u, 1.5 * u);
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.5 * u;
      line(ctx, 0, -70 * u, 0, -24 * u);
      ctx.restore();
      // 가문 문양
      ctx.strokeStyle = '#e8dfcc'; ctx.lineWidth = 1.2 * u;
      circle(ctx, 0, -52 * u, 6.5 * u, true);
      ctx.fillStyle = '#e8dfcc';
      for (let k = 0; k < 3; k++) { const an = -Math.PI / 2 + k * TAU / 3; circle(ctx, Math.cos(an) * 2.6 * u, -52 * u + Math.sin(an) * 2.6 * u, 2 * u); }
      // 허리 칼자루 (칼을 안 뽑았을 때)
      if (pose === 'idle' || pose === 'early') {
        ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 5 * u; ctx.lineCap = 'round';
        line(ctx, -34 * u, -20 * u, -50 * u, -34 * u);
        ctx.fillStyle = '#b8963c'; ctx.beginPath(); ctx.ellipse(-34 * u, -20 * u, 4 * u, 2 * u, -0.7, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(230,220,200,.5)'; ctx.lineWidth = 0.8 * u;
        for (let k = 1; k < 5; k++) line(ctx, (-34 - k * 3.2 - 1) * u, (-20 - k * 2.8 + 1.5) * u, (-34 - k * 3.2 + 1) * u, (-20 - k * 2.8 - 1.5) * u);
        if (pose === 'early') this.smoke(-30 * u, -20 * u, 5 * u, t);
      }
      if (pose === 'heavy') {
        const e = easeOut(t / 0.1);
        armTo(18 * u, -100 * u);
        blade(18 * u, -100 * u, lerp(-0.4, -1.75, e), 66 * u);
      }
      // 목 · 상투 · 삿갓
      ctx.fillStyle = '#1b1a20'; poly(ctx, [[-8 * u, -72 * u], [8 * u, -72 * u], [6 * u, -79 * u], [-6 * u, -79 * u]]);
      ctx.fillStyle = '#17131a';
      ctx.beginPath(); ctx.ellipse(0, -82 * u, 7.5 * u, 8.5 * u, 0, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(0, -86 * u); ctx.rotate(0.04);
      const kasa = new Path2D();
      kasa.moveTo(-34 * u, 3 * u); kasa.quadraticCurveTo(-12 * u, -10 * u, 0, -17 * u); kasa.quadraticCurveTo(12 * u, -10 * u, 34 * u, 3 * u);
      kasa.quadraticCurveTo(0, 7 * u, -34 * u, 3 * u);
      const kc = ctx.createLinearGradient(0, -17 * u, 0, 5 * u);
      kc.addColorStop(0, '#d8bc84'); kc.addColorStop(1, '#8a6c3e');
      ctx.fillStyle = kc; ctx.fill(kasa);
      ctx.save(); ctx.clip(kasa);
      ctx.strokeStyle = 'rgba(90,65,30,.45)'; ctx.lineWidth = 0.7 * u;
      for (let k = -8; k <= 8; k++) line(ctx, 0, -17 * u, k * 4.5 * u, 6 * u);
      for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.ellipse(0, -17 * u + k * 5 * u, k * 9 * u, k * 2.2 * u, 0, 0, Math.PI); ctx.stroke(); }
      ctx.restore();
      ctx.restore();
    }

    muzzle(x, y, r, t, k) {
      const { ctx } = this;
      if (t < 0) return;
      if (t < 0.09) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
        g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.3, 'rgba(255,210,90,.95)'); g.addColorStop(1, 'rgba(255,120,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, rr = (i % 2 ? 0.7 : 1.8) * r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        ctx.fill();
      }
      this.smoke(x, y, r * 0.5 * k, t - 0.05);
    }

    smoke(x, y, r, t) {
      if (t < 0 || t > 1.4) return;
      const { ctx } = this;
      for (let i = 0; i < 4; i++) {
        const tt = t - i * 0.06; if (tt < 0) continue;
        ctx.fillStyle = `rgba(220,215,205,${0.45 * (1 - tt / 1.4)})`;
        circle(ctx, x + Math.sin(i * 2.1 + tt * 2) * r * 0.8, y - tt * r * 5 - i * r * 0.6, r * (0.8 + tt * 2.2));
      }
    }

    arcTrail(x, y, r, a0, a1, t) {
      if (t < 0 || t > 0.35) return;
      const { ctx } = this;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - t / 0.35)})`;
      ctx.lineWidth = r * 0.08;
      ctx.beginPath(); ctx.arc(x, y, r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    }

    drawStreaks(now, fore) {
      const { ctx } = this;
      for (const s of this.streaks) {
        if (s.fore !== fore) continue;
        const p = (now - s.at) / 420;
        if (p < 0 || p > 1) continue;
        const len = s.len * easeOut(p * 3);
        ctx.save();
        ctx.translate(s.x, s.y); ctx.rotate(s.a);
        ctx.strokeStyle = `rgba(255,255,255,${1 - p})`;
        ctx.lineWidth = Math.max(2, s.len * 0.02) * (1 - p);
        line(ctx, -len / 2, 0, len / 2, 0);
        ctx.strokeStyle = `rgba(200,30,20,${0.8 * (1 - p)})`;
        ctx.lineWidth = Math.max(1, s.len * 0.008);
        line(ctx, -len / 2, 3, len / 2, 3);
        ctx.restore();
      }
    }

    drawParts(layer) {
      const { ctx } = this;
      for (const p of this.parts) {
        if (p.layer !== layer) continue;
        const k = 1 - p.age / p.life;
        if (p.kind === 'dust') {
          ctx.fillStyle = this.mode === 'samurai' ? `rgba(120,100,90,${0.35 * k})` : `rgba(205,190,160,${0.5 * k})`;
          circle(ctx, p.px, p.py, p.r * (1 + (1 - k) * 1.5));
        } else if (p.kind === 'spark') {
          ctx.strokeStyle = `rgba(255,240,190,${k})`;
          ctx.lineWidth = 2;
          line(ctx, p.px, p.py, p.px - p.vx * 0.02, p.py - p.vy * 0.02);
        }
      }
    }

    /* ─────────────────────── 화면 위 ─────────────────────── */

    drawOverlay(now) {
      const { ctx, W, H } = this;
      const samurai = this.mode === 'samurai';
      // 신호: 하늘이 핏빛으로
      if (this.tint && this.tint.kind === 'sky') {
        const p = easeOut((now - this.tint.at) / 90);
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgba(210,40,25,${0.75 * p})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = `rgba(60,0,0,${0.18 * p})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (this.tint && this.tint.kind === 'moon') {
        const p = easeOut((now - this.tint.at) / 90);
        ctx.fillStyle = `rgba(90,0,10,${0.3 * p})`;
        ctx.fillRect(0, 0, W, H);
      }
      // 종 — 위에서 흔들린다
      if (this.bell && this.bell.kind === 'bell') {
        const t = (now - this.bell.at) / 1000;
        const s = Math.min(W, H) * 0.09;
        ctx.save();
        ctx.translate(W / 2, H * 0.14);
        ctx.rotate(Math.sin(t * 22) * 0.5 * Math.exp(-t * 2));
        ctx.fillStyle = '#c99a2e'; ctx.strokeStyle = '#5a3f12'; ctx.lineWidth = s * 0.06;
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, 0); ctx.bezierCurveTo(-s * 0.35, s * 0.1, -s * 0.4, s * 0.6, -s * 0.6, s * 0.85);
        ctx.lineTo(s * 0.6, s * 0.85); ctx.bezierCurveTo(s * 0.4, s * 0.6, s * 0.35, s * 0.1, s * 0.2, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5a3f12'; circle(ctx, 0, s * 0.95, s * 0.12);
        ctx.restore();
      }
      if (this.bell && this.bell.kind === 'gong') {
        const t = (now - this.bell.at) / 1000;
        const r = Math.min(W, H) * 0.08 * (1 + Math.sin(t * 40) * 0.02 * Math.exp(-t * 3));
        ctx.save();
        ctx.translate(W / 2, H * 0.16);
        ctx.fillStyle = '#b88a2e'; ctx.strokeStyle = '#3a2508'; ctx.lineWidth = r * 0.08;
        circle(ctx, 0, 0, r); ctx.stroke();
        ctx.strokeStyle = `rgba(255,230,160,${Math.exp(-t * 2)})`; ctx.lineWidth = r * 0.05;
        for (let k = 1; k <= 3; k++) circle(ctx, 0, 0, r * (1 + ((t * 1.6 + k / 3) % 1) * 1.2), true);
        ctx.restore();
      }
      // 번쩍
      const fp = (now - this.flash.at) / this.flash.dur;
      if (fp < 1) { ctx.fillStyle = hexA(this.flash.color, this.flash.a * (1 - fp)); ctx.fillRect(0, 0, W, H); }
      // 컷 사이 깜빡
      const bp = (now - this.blinkAt) / 90;
      if (bp < 1) { ctx.fillStyle = `rgba(10,8,6,${1 - bp})`; ctx.fillRect(0, 0, W, H); }
      // 내가 맞았을 때
      if (this.redAt && now > this.redAt) {
        const p = clamp((now - this.redAt) / 300);
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, 'rgba(140,0,0,0)'); g.addColorStop(1, `rgba(140,0,0,${0.55 * p})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      // 비네트
      const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, samurai ? 'rgba(0,0,0,.55)' : 'rgba(40,20,5,.42)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      // 필름 톤 · 그레인
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.globalCompositeOperation = 'overlay';
      const ox = Math.floor(Math.random() * 160), oy = Math.floor(Math.random() * 160);
      ctx.translate(-ox, -oy);
      ctx.fillStyle = ctx.createPattern(this.grain, 'repeat');
      ctx.fillRect(0, 0, W + 160, H + 160);
      ctx.restore();
      // 레터박스
      const bh = H * 0.085 * this.bars.v;
      if (bh > 0.5) {
        ctx.fillStyle = '#0b0907';
        ctx.fillRect(0, 0, W, bh);
        ctx.fillRect(0, H - bh, W, bh);
      }
    }
  }

  /* 그림 도우미 */
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
  function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function circle(ctx, x, y, r, stroke) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); stroke ? ctx.stroke() : ctx.fill(); }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  root.Scene = Scene;
})(window);
