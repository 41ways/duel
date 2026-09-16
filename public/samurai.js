/**
 * 결투(사무라이 일기토) — 캔버스 연출. west.js 의 West 에 덧붙는다(west.mode === 'samurai' 일 때).
 *
 * 그림은 아직 대부분 코드로 그린다. 쓰는 이미지는 둘뿐
 *   mode_samurai_bg.jpg   눈 내리는 신사 (1365×768) — 방 만들기 · 결투장 배경
 *   mode_samurai_man.png  사무라이 전신 (440×714) — 상대 · 내 뒷모습 실루엣 · 선수 소개
 *
 * 흐름 (서부와 짝)
 *   samhome(에마 걸이 · 결투장 편지) → samboard(도장 벽 족자 두 폭) → [먹 붓질] → samversus(붓 획으로 가르고 対 도장)
 *   → [먹 붓질] → samduel(신호 "斬") → 일섬 → 진 쪽이 베여 갈라짐 → 상성 풀이 · 勝 도장
 */
(function (root) {
  'use strict';

  const West = root.West;
  if (!West) return;
  const P = West.prototype;

  const TAU = Math.PI * 2;
  const BGW = 1365, BGH = 768;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
  const easeIn = t => Math.pow(clamp(t), 2.2);
  const easeIO = t => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const now = () => performance.now();
  const rng = seed => { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

  const FONT_JP = '"Yuji Syuku", "Noto Serif JP", "Hahmlet", serif';
  const FONT_JPB = '"Noto Serif JP", "Yuji Syuku", "Hahmlet", serif';
  const FONT_B = '"Nanum Brush Script", "Hahmlet", cursive';
  const FONT_T = '"Hahmlet", "Nanum Myeongjo", serif';
  const INK = '#15131a', RED = '#a3221b', PAPER = '#efe8d8', GOLD = '#b89b5e';

  // 네 가문 — 천 색 · 문양 · 사람(짝수는 쪽빛 갑옷, 홀수는 붉은 갑옷) · 물들임
  const SCHARS = [
    { ko: '낭인', jp: '浪人', mon: 'tomoe', cloth: '#1f2b45', tint: null },
    { ko: '검객', jp: '剣客', mon: 'kikyo', cloth: '#4a1c1e', tint: null },
    { ko: '무사', jp: '武士', mon: 'hishi', cloth: '#2c3a2c', tint: 'rgba(60,90,50,.36)' },
    { ko: '자객', jp: '刺客', mon: 'igeta', cloth: '#232228', tint: 'rgba(10,10,14,.5)' },
  ];
  const MOVE = {
    light: { ko: '속공', jp: '速' },
    guard: { ko: '방어', jp: '守' },
    heavy: { ko: '강공', jp: '剛' },
  };
  // 사람 그림에서 얼굴 자리(원본 좌표) — 방 만들기에서 편지 위로 얼굴이 나오게
  const FACE = { x: 212, y: 112, h: 170 };
  // 결투장에서 상대가 서는 자리(배경 좌표, 발끝)
  const OPP = { x: 690, y: 616, h: 292 };

  const base = {};
  for (const k of ['draw', 'board', 'westHome', 'backToSelect', 'round', 'decoy', 'shoot', 'early', 'result', 'drawWipe']) base[k] = P[k];

  const isSam = w => w.mode === 'samurai';

  /* ═════════════════════ 바깥에서 부르는 것 ═════════════════════ */

  P.westHome = function () {
    if (!isSam(this)) return base.westHome.call(this);
    const from = this.view;
    this.clearTimers();
    this.homeAt = now();
    this.samHomeFromSelect = from === 'select';
    if (from === 'select') this.view = 'samhome';
    else this.startWipe('samhome', null, from === 'title' ? 'fade' : 'sakura');
    this.match = null;
  };

  P.backToSelect = function () {
    if (!isSam(this)) return base.backToSelect.call(this);
    this.clearTimers();
    this.sel = { hover: null, split: 0.5, pick: null, pickAt: 0, from: 0.5, at: now() + 350 };
    this.startWipe('select', null, 'sakura');
  };

  P.board = function (list) {
    if (!isSam(this)) return base.board.call(this, list);
    if (this.view !== 'samboard') {
      this.clearTimers();
      this.posters = new Map();
      this.boardAt = now();
      if (['title', 'samhome', 'select', 'samduel', 'samversus'].includes(this.view)) this.startWipe('samboard', null, this.view === 'title' ? 'fade' : 'sakura');
      else this.view = 'samboard';
      this.match = null;
    }
    const keep = new Set();
    list.slice(0, 2).forEach((p, i) => {
      keep.add(p.id);
      const old = this.posters.get(p.id);
      if (old && !old.leaving) { Object.assign(old, p, { slot: i }); return; }
      const fresh = now() - this.boardAt > 300;
      const delay = fresh ? 0 : 500 + i * 260;
      this.posters.set(p.id, { ...p, slot: i, at: now() + delay, leaving: 0 });
      // 상대가 스윽 떠오를 때 옷자락 소리
      if (!p.me && this.S) setTimeout(() => this.S.whoosh(0.6), delay);
    });
    for (const q of this.posters.values()) {
      if (!keep.has(q.id) && !q.leaving) {
        q.leaving = now();
        setTimeout(() => { if (this.posters.get(q.id) === q) this.posters.delete(q.id); }, 1300);
      }
    }
  };

  P.round = function (ev) {
    if (!isSam(this)) return base.round.call(this, ev);
    for (const v of Object.values(this._samClips || {})) { try { v.pause(); } catch (_) {} }   // 지난 판 영상 멈춤(VIDEO 켰을 때)
    const m = this.match;
    if (!m) return;
    this.clearTimers();
    m.r = ev.r; m.phase = 'intro'; m.res = null; m.fighters = ev.fighters; m.scores = ev.scores;
    m.raised = new Set(); m.early = new Set(); m.sig = null; m.fake = null;
    const others = ev.fighters.filter(id => id !== m.foreId);
    m.oppId = others.length ? others[0] : null;
    this.fore.char = (this.pl(m.foreId) || {}).char || 0;
    this.fore.gone = false; this.fore.raiseAt = -1e9; this.fore.move = null; this.fore.misfire = false;
    this.samSparks = []; this.samPetals = [];
    if (ev.r === 1) {
      // 결투 시작을 누른 순간 이미 선수 소개로 넘어가고 있으면(startMatch) 다시 닦지 않는다
      if (this.view !== 'samversus') this.startWipe('samversus', () => { this.versusAt = now() + 380; this._samVsHit = false; this.later(() => this.S && this.S.swing(), 300); }, 'sakura');
      this.later(() => this.startWipe('samduel', () => { this.duelAt = now(); }, 'sakura'), 3000);
    } else {
      this.startWipe('samduel', () => { this.duelAt = now(); }, 'sakura');
    }
  };

  /** 결투 시작 — 대기실이 사라지자마자 벚꽃이 쓸고 선수 소개로(첫 판 신호를 기다리며 뚝 끊기지 않게) */
  P.startMatch = (function (orig) {
    return function (o) {
      orig.call(this, o);
      if (!isSam(this) || this.view === 'samversus') return;
      this.startWipe('samversus', () => { this.versusAt = now() + 380; this._samVsHit = false; this.later(() => this.S && this.S.swing(), 300); }, 'sakura');
    };
  })(P.startMatch);

  P.decoy = function (ev) {
    if (!isSam(this)) return base.decoy.call(this, ev);
    const m = this.match; if (!m) return;
    if (ev.kind === 'petal') this.samGust();
    if (ev.kind === 'bird') this.samBird = { at: now(), dir: Math.random() < 0.5 ? 1 : -1 };
    if (ev.kind === 'fake') m.fake = { word: ev.word, at: now() };
  };

  /** 내가 누른 순간 — 칼이 나간다 */
  P.shoot = function (id, move) {
    if (!isSam(this)) return base.shoot.call(this, id);
    const m = this.match; if (!m) return;
    m.raised.add(id);
    if (id === m.foreId) { this.fore.raiseAt = now(); this.fore.move = move || null; this.shakeIt(120, 6); }
  };

  P.early = function (id) {
    if (!isSam(this)) return base.early.call(this, id);
    const m = this.match; if (!m) return;
    m.early.add(id);
    if (id === m.foreId) {
      if (this.fore.raiseAt < 0) this.fore.raiseAt = now();
      this.fore.misfire = true;
      this.say('성급했다!', '#f4d9a8', 1200);
    }
  };

  /* ═════════════════════ 그리기 ═════════════════════ */

  P.draw = function (t) {
    if (!this.view || !this.view.startsWith('sam')) return base.draw.call(this, t);
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);
    this.samDt = Math.min(0.05, (t - (this.samLast || t)) / 1000);
    this.samLast = t;
    if (!this.img.mode_samurai_bg) return;
    ctx.save();
    const sp = (t - this.shake.at) / this.shake.dur;
    if (sp < 1) { const a = this.shake.amp * (1 - sp); ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
    switch (this.view) {
      case 'samhome': this.drawSamHome(t); break;
      case 'samboard': this.drawSamBoard(t); break;
      case 'samversus': this.drawSamVersus(t); break;
      case 'samduel': this.drawSamDuel(t); break;
    }
    ctx.restore();
    this.drawSamFlashes(t);
    this.drawTexts(t);
    this.drawWipe(t);
  };

  /* ─────────── 벚꽃잎 전환 — 꽃잎 바람이 오른쪽에서 왼쪽으로 화면을 쓸고 지나간다 ─────────── */

  /** img/sakura.webp 는 체크무늬 배경이 박힌 그림이라, 분홍빛만 남기고 꽃 한 송이 · 꽃잎 세 장을 잘라 둔다 */
  P.samPetalSprites = function () {
    for (const n of ['sam_lobby_bg', 'sam_red_man', 'sam_blue_back', 'sam_death1', 'sam_death2', 'sam_death3', 'sam_death4', 'sam_stand', 'sam_iai']) this.samImg(n);   // 대기실 · 결과 그림도 미리
    if (this._petals) return this._petals;
    if (!this._sakuraImg) {
      const img = this._sakuraImg = new Image();
      img.onload = () => {
        const cuts = [[80, 55, 262, 298], [388, 126, 162, 212], [320, 316, 158, 192], [153, 430, 100, 118]];
        this._petals = cuts.map(([sx, sy, sw, sh]) => {
          const c = document.createElement('canvas'); c.width = sw; c.height = sh;
          const g = c.getContext('2d');
          g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          const d = g.getImageData(0, 0, sw, sh);
          for (let i = 0; i < d.data.length; i += 4) {
            const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2];
            const pink = r - (gg + b) / 2;                 // 회색 체크무늬 · 워터마크는 0 가까이
            const a = clamp((pink - 5) / 14);
            d.data[i + 3] = Math.round(a * 255);
            // 가장자리에 섞인 회색을 조금 걷어 낸다
            d.data[i] = Math.min(255, r + 6); d.data[i + 1] = Math.max(0, gg - 4); d.data[i + 2] = Math.max(0, b - 2);
          }
          g.putImageData(d, 0, 0);
          return c;
        });
      };
      img.src = '/img/sakura.webp';
    }
    return null;
  };

  P.startWipe = (function (orig) {
    return function (to, onMid, kind) {
      const from = this.view;
      orig.call(this, to, onMid, kind);
      if (kind !== 'sakura' || !this.wipe) return;
      this.wipe.dur = 1150;
      // 선수 소개는 떠 둔 한 장 대신 꽃잎이 다 지나갈 때까지 계속 움직이게 그린다
      if (from === 'samversus') this.wipe.live = from;
      const R = Math.random;
      this.wipe.petals = Array.from({ length: 150 }, () => ({
        u: -0.5 + R() * 1.9, y: R() * 1.1 - 0.05, s: 0.35 + R() * R() * 1.1, rot: R() * TAU, vr: (R() - 0.5) * 9,
        i: R() < 0.12 ? 0 : 1 + Math.floor(R() * 3), ph: R() * TAU, fall: 0.05 + R() * 0.2,
      }));
      this.S && this.S.whoosh(1);
    };
  })(P.startWipe);

  P.drawWipe = function (t) {
    const w = this.wipe;
    if (!w || w.kind !== 'sakura') return base.drawWipe.call(this, t);
    const { ctx, W, H, dpr } = this;
    const p = (t - w.at) / w.dur;
    if (p >= 1) { this.wipe = null; this.onWipe && this.onWipe(null); return; }
    const R = Math.max(W * 0.34, H * 0.55);
    const x = lerp(W + R * 0.4, -R * 1.5, easeIO(p));
    this.onWipe && this.onWipe({ oldRight: x + R * 0.15, newLeft: x + R * 0.85 });
    // 아직 꽃잎이 지나가지 않은 왼쪽은 옛 화면
    // 이음매는 분홍으로 덮지 않고 옛 화면을 가는 띠 여러 장으로 점점 옅게 겹쳐 흐린다
    const edge = x + R * 0.15, fade = R * 0.9, strips = 10;
    if (w.live) {
      // 옛 장면을 떠 둔 캔버스에 이번 프레임으로 다시 그린다
      const g = w.snap.getContext('2d'), view = this.view;
      this.ctx = g; this.view = w.live;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#05070c'; g.fillRect(0, 0, W, H);
      try { g.save(); this.drawSamVersus(t); g.restore(); }
      finally { this.ctx = ctx; this.view = view; }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath(); ctx.rect(0, 0, Math.max(0, edge * dpr), H * dpr); ctx.clip();
    ctx.drawImage(w.snap, 0, 0);
    ctx.restore();
    for (let i = 0; i < strips; i++) {
      const sx = edge + fade * i / strips;
      if (sx >= W || sx + fade / strips <= 0) continue;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1 - (i + 0.5) / strips;
      ctx.beginPath(); ctx.rect(Math.max(0, sx * dpr), 0, (fade / strips) * dpr + 1, H * dpr); ctx.clip();
      ctx.drawImage(w.snap, 0, 0);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 꽃잎 무리 안쪽에만 아주 옅은 벚꽃빛
    const haze = ctx.createLinearGradient(x, 0, x + R * 1.2, 0);
    haze.addColorStop(0, 'rgba(246,224,230,0)');
    haze.addColorStop(0.45, 'rgba(246,224,230,.14)');
    haze.addColorStop(1, 'rgba(246,224,230,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(x, 0, R * 1.2, H);
    const sprites = this.samPetalSprites();
    // save/restore 없이 변환 행렬을 바로 넣는다 — 꽃잎이 많아도 끊기지 않게
    ctx.fillStyle = 'rgba(244,196,206,.95)';
    for (const f of w.petals) {
      const px = x + f.u * R + Math.sin(p * 7 + f.ph) * R * 0.05;
      if (px < -60 || px > W + 60) continue;
      const py = (f.y + p * f.fall) * H + Math.sin(p * 9 + f.ph) * H * 0.025;
      const size = R * 0.16 * f.s;
      // 무리 가운데일수록 짙게, 앞뒤로 흩어진 것은 옅게
      const core = 1 - Math.min(1, Math.abs(f.u - 0.45) / 1.1);
      const a = f.rot + p * f.vr, c = Math.cos(a), s = Math.sin(a);
      const fl = 0.55 + 0.45 * Math.abs(Math.sin(p * 10 + f.ph));   // 뒤집히며 날린다
      ctx.globalAlpha = 0.45 + core * 0.55;
      ctx.setTransform(dpr * c, dpr * s, -dpr * s * fl, dpr * c * fl, dpr * px, dpr * py);
      const sp = sprites && sprites[f.i];
      if (sp) { const h = size * sp.height / sp.width; ctx.drawImage(sp, -size / 2, -h / 2, size, h); }
      else { ctx.beginPath(); ctx.ellipse(0, 0, size * 0.4, size * 0.26, 0, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /* ─────────── 공통 ─────────── */

  P.samFlash = function (dur, rgb) { (this.samFlashes = this.samFlashes || []).push({ at: now(), dur, rgb }); };
  P.drawSamFlashes = function (t) {
    const { ctx, W, H } = this;
    for (const f of this.samFlashes || []) {
      const k = (t - f.at) / f.dur;
      if (k < 0 || k > 1) continue;
      ctx.fillStyle = `${f.rgb}${(1 - k) * 0.9})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.samFlashes = (this.samFlashes || []).filter(f => t - f.at < f.dur);
  };

  P.samCam = function (cx, cy, z) {
    const { ctx, W, H } = this;
    const s = Math.max(W / BGW, H / BGH) * z;
    const hw = W / (2 * s), hh = H / (2 * s);
    cx = clamp(cx, hw, BGW - hw); cy = clamp(cy, hh, BGH - hh);
    ctx.translate(W / 2, H / 2);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    return s;
  };

  /** 이 파일이 따로 쓰는 그림 — 처음 부를 때 받기 시작하고, 다 받기 전엔 null */
  P.samImg = function (name) {
    if (this.img[name]) return this.img[name];
    this._samLoading = this._samLoading || {};
    if (!this._samLoading[name]) {
      const i = this._samLoading[name] = new Image();
      i.onload = () => { this.img[name] = i; };
      i.src = `/img/${name}.${name.endsWith('_bg') ? 'jpg' : 'png'}`;
    }
    return null;
  };

  /** 짝수 가문은 쪽빛 갑옷, 홀수는 붉은 갑옷(그림이 아직이면 쪽빛을 물들여서) */
  P.samSrc = function (char) {
    const red = ((char % 2) + 2) % 2 === 1 && this.samImg('sam_red_man');
    return red || this.img.mode_samurai_man;
  };

  /** 가문마다 살짝 물들인 사람 */
  P.samMan = function (char) {
    this._samMan = this._samMan || {};
    char = ((char % 4) + 4) % 4;
    const img = this.samSrc(char);
    if (!img || !img.naturalWidth) return null;
    const key = char + (img === this.img.mode_samurai_man ? 'b' : 'r');
    if (this._samMan[key]) return this._samMan[key];
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const tint = SCHARS[char].tint || (char === 1 && img === this.img.mode_samurai_man ? 'rgba(150,30,28,.34)' : null);
    if (tint) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = tint;
      g.fillRect(0, 0, c.width, c.height);
    }
    return (this._samMan[key] = c);
  };

  /** 내 뒷모습 — 달빛을 등진 까만 실루엣 (좌우를 뒤집어 칼끝이 상대 쪽) */
  P.samSil = function (char = 0) {
    const img = this.samSrc(char);
    if (!img || !img.naturalWidth) return null;
    this._samSilC = this._samSilC || new Map();
    if (this._samSilC.has(img)) return this._samSilC.get(img);
    const pad = 20;
    const c = document.createElement('canvas'); c.width = img.width + pad * 2; c.height = img.height + pad * 2;
    const g = c.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1);
    try { g.filter = 'blur(3px)'; } catch (_) {}
    g.drawImage(img, pad, pad);
    g.filter = 'none';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, c.width, 0);
    gr.addColorStop(0, 'rgba(5,7,12,.97)'); gr.addColorStop(0.75, 'rgba(8,11,20,.95)'); gr.addColorStop(1, 'rgba(46,58,86,.92)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    this._samSilC.set(img, c);
    return c;
  };

  P.samWashi = function () {
    if (this._samWashi || !this.img.washi) return this._samWashi || null;
    const p = this.ctx.createPattern(this.img.washi, 'repeat');
    if (p && p.setTransform && root.DOMMatrix) p.setTransform(new DOMMatrix().scale(0.5));
    return (this._samWashi = p);
  };

  /** 눈 — 뒤(z 작음)와 앞(z 큼)을 나눠 그린다 */
  P.samSnow = function (t, front, wind = 1) {
    const { ctx, W, H } = this;
    if (!this.snow) {
      const R = rng(42);
      this.snow = Array.from({ length: 170 }, () => ({ x: R(), y: R(), z: 0.25 + R() * 0.75, ph: R() * TAU }));
    }
    // 한 프레임에 한 번만 움직이고, 그리기는 짙기 두 단계로 묶어 경로 하나씩 — 눈송이마다 fill 하면 끊긴다
    if (this._snowT !== t) {
      this._snowT = t;
      const dt = this.samDt || 0;
      const sway = Math.sin(t / 1400);
      for (const f of this.snow) {
        f.y += dt * (0.025 + f.z * 0.07);
        f.x += dt * (-0.02 * wind * f.z + sway * Math.cos(f.ph) * 0.006);
        if (f.y > 1.03) { f.y = -0.03; f.x = Math.random(); }
        if (f.x < -0.03) f.x += 1.06; else if (f.x > 1.03) f.x -= 1.06;
      }
    }
    const bands = front ? [[0.72, 0.86, 'rgba(236,242,252,.72)'], [0.86, 1.01, 'rgba(240,245,253,.86)']] : [[0, 0.5, 'rgba(236,242,252,.42)'], [0.5, 0.72, 'rgba(236,242,252,.6)']];
    for (const [lo, hi, color] of bands) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const f of this.snow) {
        if (f.z <= lo || f.z > hi) continue;
        const r = f.z * (front ? 3.2 : 1.9), x = f.x * W, y = f.y * H;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fill();
    }
  };

  /** 가문 문양 — 둥근 테 안에 */
  P.drawMon = function (kind, x, y, r, color) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.stroke();
    if (kind === 'tomoe') {
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate(i * TAU / 3);
        ctx.beginPath(); ctx.arc(0, -r * 0.36, r * 0.24, 0, TAU); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r * 0.24, -r * 0.36);
        ctx.quadraticCurveTo(r * 0.58, r * 0.05, r * 0.02, r * 0.62);
        ctx.quadraticCurveTo(r * 0.3, r * 0.02, -r * 0.02, -r * 0.12);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else if (kind === 'kikyo') {
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate(i * TAU / 5);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.1);
        ctx.bezierCurveTo(-r * 0.38, -r * 0.25, -r * 0.42, -r * 0.7, -r * 0.14, -r * 0.8);
        ctx.lineTo(0, -r * 0.68);
        ctx.lineTo(r * 0.14, -r * 0.8);
        ctx.bezierCurveTo(r * 0.42, -r * 0.7, r * 0.38, -r * 0.25, 0, -r * 0.1);
        ctx.fill();
        ctx.restore();
      }
    } else if (kind === 'hishi') {
      const d = r * 0.33, s = r * 0.29;
      for (const [cx, cy] of [[0, -d], [d, 0], [0, d], [-d, 0]]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.78); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s * 0.78); ctx.lineTo(cx - s, cy);
        ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.rotate(Math.PI / 4);
      const b = r * 0.13, L = r * 1.1;
      for (const s of [-1, 1]) {
        ctx.fillRect(s * r * 0.24 - b / 2, -L / 2, b, L);
        ctx.fillRect(-L / 2, s * r * 0.24 - b / 2, L, b);
      }
    }
    ctx.restore();
  };

  /** 세로쓰기 */
  P.vtext = function (text, x, y, fs, font, color, gap = 1.02) {
    const { ctx } = this;
    ctx.save();
    ctx.font = `${fs}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [...text].forEach((ch, i) => { if (ch !== ' ') ctx.fillText(ch, x, y + i * fs * gap); });
    ctx.restore();
  };

  /** 붉은 낙관 */
  P.drawSeal = function (text, x, y, size, rot = -0.08, alpha = 1, round = false) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = RED;
    ctx.beginPath();
    if (round) ctx.arc(0, 0, size / 2, 0, TAU);
    else ctx.rect(-size / 2, -size / 2, size, size);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,230,216,.55)'; ctx.lineWidth = size * 0.035;
    ctx.beginPath();
    if (round) ctx.arc(0, 0, size * 0.4, 0, TAU);
    else ctx.rect(-size * 0.4, -size * 0.4, size * 0.8, size * 0.8);
    ctx.stroke();
    ctx.fillStyle = '#f5e6d8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = [...text].length;
    ctx.font = `900 ${size * (n > 1 ? 0.36 : 0.62)}px ${/[぀-ヿ一-鿿]/.test(text) ? FONT_JPB : FONT_T}`;
    if (n > 1 && /[぀-ヿ一-鿿]/.test(text)) [...text].forEach((ch, i) => ctx.fillText(ch, 0, (i - (n - 1) / 2) * size * 0.38));
    else ctx.fillText(text, 0, size * 0.03);
    ctx.restore();
  };

  /* ─────────── 방 만들기 전 — 눈 내리는 신사, 족자 위로 얼굴 ─────────── */

  P.drawSamHome = function (t) {
    const { ctx, W, H } = this;
    const bg = this.img.mode_samurai_bg;
    const a = t - (this.homeAt || t);
    // 방식 고르기 화면이 끝난 모습(배경 1.06배, 가운데에서 0.05W 왼쪽)에서 그대로 이어지게 — 여기서 틀이 달라지면 뚝 끊긴다
    const bs = Math.max(W / bg.width, H / bg.height) * 1.06;
    const bw = bg.width * bs, bh = bg.height * bs;
    ctx.drawImage(bg, (W - bw) / 2 - W * 0.05 + Math.sin(a / 9000) * 8, (H - bh) / 2, bw, bh);
    const settle = this.samHomeFromSelect ? easeIO(a / 1100) : 1;
    ctx.fillStyle = `rgba(6,10,20,${0.28 * settle})`; ctx.fillRect(0, 0, W, H);
    this.samSnow(t, false);
    const man = this.samMan(0);
    // 족자 자리는 매 프레임 재지 않는다(레이아웃을 읽으면 끊긴다) — 0.4초마다
    if (!this._frAt || t - this._frAt > 400 || !this._fr) { this._fr = this.faceRect && this.faceRect(); this._frAt = t; }
    const fr = this._fr;
    if (man) {
      const s0 = H * 0.9 / man.height;
      const from = { k: s0, x: W * 0.4 - man.width * s0 / 2, y: H * 0.99 - man.height * s0 };
      let to = from;
      if (fr) { const k = fr.h / FACE.h; to = { k, x: fr.x + fr.w / 2 - FACE.x * k, y: fr.y + fr.h / 2 - FACE.y * k }; }
      const e = this.samHomeFromSelect ? easeIO(a / 1000) : 1;
      const k = lerp(from.k, to.k, e), mx = lerp(from.x, to.x, e), my = lerp(from.y, to.y, e);
      ctx.drawImage(man, mx, my + Math.sin(t / 1500) * 1.2, man.width * k, man.height * k);
    }
    // 고르기 화면의 아래 어둠 · 안개는 천천히 걷히고, 나무패가 있는 오른쪽이 어두워진다
    if (settle < 1) {
      const low = ctx.createLinearGradient(0, H * 0.45, 0, H);
      low.addColorStop(0, 'rgba(0,0,0,0)'); low.addColorStop(1, `rgba(0,0,0,${0.75 * (1 - settle)})`);
      ctx.fillStyle = low; ctx.fillRect(0, H * 0.45, W, H * 0.55);
    }
    const shadeR = ctx.createLinearGradient(W, 0, W * 0.4, 0);
    shadeR.addColorStop(0, `rgba(4,6,12,${0.6 * settle})`); shadeR.addColorStop(1, 'rgba(4,6,12,0)');
    ctx.fillStyle = shadeR; ctx.fillRect(0, 0, W, H);
    const fog = ctx.createLinearGradient(0, H * 0.65, 0, H);
    fog.addColorStop(0, 'rgba(200,212,235,0)'); fog.addColorStop(1, 'rgba(200,212,235,.3)');
    ctx.fillStyle = fog; ctx.fillRect(0, H * 0.65, W, H * 0.35);
    this.samSnow(t, true);
  };

  /* ─────────── 대기방 — 성문 앞: 나는 등을 보이고, 상대는 나를 보고 선다 ─────────── */

  /** 빈 자리에 서 있는 흐릿한 그림자 */
  P.samGhost = function () {
    const img = this.samSrc(1);
    if (!img || !img.naturalWidth) return null;
    if (this._samGhost && this._samGhost.src === img) return this._samGhost.c;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(10,12,22,.92)';
    g.fillRect(0, 0, c.width, c.height);
    this._samGhost = { src: img, c };
    return c;
  };

  /** 대기방 자리 — 상대는 성문 앞 멀리, 나는 왼쪽 앞에 등을 보이고 */
  P.samLobbyLayout = function (r) {
    const oh = Math.max(110, Math.min(r.height * 0.6, r.width * 0.5));
    return {
      oh, ox: r.left + r.width * 0.63, oy: r.top + r.height * 0.8,
      mh: r.height * 1.4, mx: r.left + r.width * 0.19, mtop: r.top + r.height * 0.2,
    };
  };

  P.drawSamBoard = function (t) {
    const { ctx, W, H } = this;
    const r = (this.wallRect && this.wallRect()) || { left: W * 0.3, top: 60, width: W * 0.68, height: H * 0.6 };
    const list = [...(this.posters || new Map()).values()];
    const meQ = list.find(q => q.me && !q.leaving) || list.find(q => q.me);
    const mySlot = meQ ? meQ.slot : 0, oppSlot = mySlot ? 0 : 1;
    const opps = list.filter(q => !q.me);
    const oppLive = opps.find(q => !q.leaving);
    const L = this.samLobbyLayout(r);
    const { oh, ox, oy } = L;
    const bg = this.samImg('sam_lobby_bg');
    if (bg) {
      const bs = Math.max(W / bg.width, H / bg.height) * 1.1;
      const bw = bg.width * bs, bh = bg.height * bs;
      const bx = clamp(ox - 705 * bs, W - bw, 0);        // 성문(원본 x 705)이 상대 뒤에
      const by = clamp(oy - 540 * bs, H - bh, 0);        // 성문 앞 돌계단(원본 y 540)쯤에 발
      ctx.drawImage(bg, bx, by, bw, bh);
    }
    ctx.fillStyle = 'rgba(4,6,14,.3)'; ctx.fillRect(0, 0, W, H);
    this.samSnow(t, false);
    this.slotRects = [];
    this.slotRects[oppSlot] = { x: ox - oh * 0.36, y: oy - oh, w: oh * 0.72, h: oh };
    this.slotRects[mySlot] = { x: r.left, y: r.top + r.height * 0.25, w: r.width * 0.38, h: r.height * 0.75 };
    // 상대 깃발(뒤) → 상대 · 빈 자리
    // 상대 등에 꽂힌 깃발 — 나를 보고 있으니 몸 뒤로 머리 위에 솟는다(먼저 그려 몸에 가린다)
    for (const q of opps) this.samBanner(q, { x: ox - oh * 0.08, bottom: oy - oh * 0.62, top: Math.max(64, oy - oh * 1.32), cw: Math.min(oh * 0.17, (oh * 0.7) * 0.3), mirror: true, band: this.samBand(q, t), figTop: oy - oh, figH: oh }, t);
    // 빈 자리 그림자 · 봇 앉히기 — 상대가 드러나는 만큼 흐려지고, 상대가 다 사라진 뒤에야 천천히 돌아온다
    const shown = opps.reduce((v, q) => { const bd = this.samBand(q, t); return Math.max(v, bd ? bd.b - bd.a : (q.leaving ? 0 : 1)); }, 0);
    if (opps.length) this._samEmptyAt = 0;
    else if (!this._samEmptyAt) this._samEmptyAt = t;
    const back = opps.length ? 1 - clamp(shown * 1.4) : easeOut((t - this._samEmptyAt) / 600);
    if (back > 0) {
      const ghost = this.samGhost();
      const hover = this.slotHover === oppSlot && !oppLive;
      if (ghost) {
        const gw = ghost.width * oh / ghost.height;
        ctx.globalAlpha = back * (hover ? 0.55 : 0.28 + 0.05 * Math.sin(t / 700));
        ctx.drawImage(ghost, ox - gw / 2, oy - oh, gw, oh);
        ctx.globalAlpha = 1;
      }
      if (!opps.length) {
        ctx.save();
        ctx.globalAlpha = back;
        if (this.canAddBot) this.samPlaque('+ 봇 앉히기', ox, oy - oh * 0.48, Math.max(14, oh * 0.075), hover, t, false);
        else this.samPlaque('상대를 기다리는 중', ox, oy - oh * 0.48, Math.max(12, oh * 0.06), false, t, true);
        ctx.restore();
      }
    }
    for (const q of opps) this.drawSamOppStand(q, L, t);
    // 두 사람이 다 서면 가운데 対
    const both = !!(oppLive && meQ && t > oppLive.at + 900);
    this._samPair = both ? (this._samPair || t) : 0;
    if (both) {
      const se = easeOut((t - this._samPair) / 260);
      const size = Math.min(oh * 0.22, 72);
      ctx.save();
      // 상대 깃발(장대 왼쪽으로 늘어진 천) 이름을 가리지 않게 천 왼쪽 끝에서 한 뼘 더 떨어뜨린다
      const clothLeft = ox - oh * 0.08 - Math.min(oh * 0.17, oh * 0.21);
      ctx.translate(Math.min(r.left + r.width * 0.5, clothLeft - size * 1.15), r.top + r.height * 0.13);
      ctx.scale(lerp(1.9, 1, se), lerp(1.9, 1, se));
      this.drawSeal('対', 0, 0, size, -0.06, se);
      ctx.restore();
      if (!this._samPairHit && se > 0.9) { this._samPairHit = true; this.S && this.S.thud(0.5); }
    } else this._samPairHit = false;
    if (meQ) {
      // 내 깃발 — 등을 보이고 섰으니 내 등(카메라 쪽)에 꽂혀 머리 위로 솟는다. 몸 위에 그린다
      this.drawSamMeStand(meQ, L, t);
      // 깃발 끝이 화면 위(위 막대 아래 64px)를 넘지 않게 — 넘으면 문양 · 이름 첫 글자가 잘린다
      const mTop = Math.max(64, L.mtop - L.mh * 0.4), mCloth = Math.max(L.mtop + L.mh * 0.34, mTop + L.mh * 0.62);
      const chatTop = r.top + r.height + 16;                      // 깃대는 아래 채팅창에 닿을 때까지
      this.samBanner(meQ, { x: L.mx - L.mh * 0.11, bottom: Math.max(chatTop, mCloth), top: mTop, clothBottom: mTop + (mCloth - mTop) * 0.72, cw: Math.min(L.mh * 0.14, (mCloth - mTop) * 0.26), mirror: true, band: this.samBand(meQ, t), figTop: L.mtop, figH: L.mh }, t);
    }
    this.samSnow(t, true);
  };

  /**
   * 나타남 · 사라짐 — 그림은 제자리. 올 땐 머리부터 아래로 드러나고, 나갈 땐 머리부터 사라진다.
   * 보이는 띠 [a, b] (0=머리, 1=발)
   */
  P.samBand = function (q, t) {
    if (t < q.at) return null;
    // 떡하니 나타나지 않게 — 머리부터 발까지 1.6초에 걸쳐 고르게
    const b = easeIO((t - q.at) / 1600);
    const a = q.leaving ? easeIO((t - q.leaving) / 1100) : 0;
    return a >= b ? null : { a, b };
  };

  /** 띠만큼만, 경계는 부드럽게 흐려서 그린다 */
  P.samBandDraw = function (img, x, y, w, h, band, slot = 0) {
    const { ctx } = this;
    if (!band) return;
    if (band.a <= 0 && band.b >= 1) { ctx.drawImage(img, x, y, w, h); return; }
    const cw = Math.max(1, Math.round(w)), ch = Math.max(1, Math.round(h));
    // 사람마다 따로 — 한 캔버스를 같은 프레임에 둘이 번갈아 쓰면 앞사람 그림이 지워진다(나타날 때 안 보이던 까닭)
    this._samBandC = this._samBandC || [];
    const c = this._samBandC[slot] || (this._samBandC[slot] = document.createElement('canvas'));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, cw, ch);
    g.drawImage(img, 0, 0, cw, ch);
    g.globalCompositeOperation = 'destination-in';
    const f = ch * 0.16;
    const ya = band.a * ch, yb = band.b * ch;
    const gr = g.createLinearGradient(0, ya - f, 0, yb + f);
    const span = yb - ya + f * 2;
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(clamp(f / span), band.a <= 0 ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,1)');
    gr.addColorStop(clamp((span - f) / span), 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, cw, ch);   // destination-in 은 칠한 곳 바깥을 전부 지우니, 한 번에 캔버스 전체를 덮어 칠한다
    ctx.drawImage(c, x, y, w, h);
  };

  /** 상대 — 멀리 성문 앞. 밤 색으로 누르고, 발밑 그림자와 옅은 안개 */
  P.drawSamOppStand = function (q, L, t) {
    const { ctx } = this;
    const band = this.samBand(q, t);
    if (!band) return;
    const man = this.samFront(q.char, 0.34);
    if (!man) return;
    const { oh, ox, oy } = L;
    const w = man.width * oh / man.height;
    // 발까지 드러나야 그림자가 짙어진다
    const ground = clamp((band.b - 0.7) / 0.3) * (1 - band.a);
    ctx.save();
    // 발밑 그림자 — 가장자리가 없는 둥근 번짐 하나(발 사이가 가장 짙다)
    ctx.globalAlpha = ground;
    ctx.translate(ox, oy);
    ctx.scale(1, 0.16);
    const cs = ctx.createRadialGradient(0, 0, 0, 0, 0, oh * 0.3);
    cs.addColorStop(0, 'rgba(3,4,9,.62)'); cs.addColorStop(0.45, 'rgba(3,4,9,.32)'); cs.addColorStop(1, 'rgba(3,4,9,0)');
    ctx.fillStyle = cs;
    ctx.beginPath(); ctx.arc(0, 0, oh * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
    this.samBandDraw(man, ox - w / 2, oy - oh + Math.sin(t / 1600) * 0.8, w, oh, band, 1);
    // 발목께를 덮는 옅은 안개 — 네모 틀이 보이지 않게 둥글게 번진다
    ctx.save();
    ctx.globalAlpha = ground;
    ctx.translate(ox, oy - oh * 0.02);
    ctx.scale(1, 0.22);
    const fog = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.75);
    fog.addColorStop(0, 'rgba(120,135,165,.18)'); fog.addColorStop(1, 'rgba(120,135,165,0)');
    ctx.fillStyle = fog;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.75, 0, TAU); ctx.fill();
    ctx.restore();
  };

  /** 나 — 왼쪽 앞에 등을 보이고 선다. 앞사람이라 더 어둡게 */
  P.drawSamMeStand = function (q, L, t) {
    const band = this.samBand(q, t);
    if (!band) return;
    const back = this.samBack(q.char, 0.5);
    if (!back) return;
    const w = back.width * L.mh / back.height;
    this.samBandDraw(back, L.mx - w / 2, L.mtop + Math.sin(t / 1500) * 1.5, w, L.mh, band, 2);
  };

  /**
   * 사시모노 — 등에 꽂아 머리 위로 솟는 깃발. 가문 문양 · 세로 이름 · 도장.
   * o: { x 장대 · bottom 등에 꽂힌 곳 · top 장대 끝 · cw 천 폭 · mirror 천이 장대 왼쪽(글자는 뒤집지 않는다) · band · figTop · figH }
   */
  P.samBanner = function (q, o, t) {
    const band = o.band;
    if (!band) return;
    const { ctx } = this;
    const ch = SCHARS[((q.char % 4) + 4) % 4];
    const { x, bottom, top, cw } = o;
    const side = o.mirror ? -1 : 1;
    const pole = Math.max(3, cw * 0.07);
    const ct = top + cw * 0.18, cb = o.clothBottom != null ? o.clothBottom : top + (bottom - top) * 0.72;   // 천 위 · 아래
    const cl = side > 0 ? x + pole * 0.6 : x - pole * 0.6 - cw, cr = cl + cw;
    const outer = side > 0 ? cr : cl;                                // 바람에 너울지는 쪽
    ctx.save();
    // 사람과 함께 — 올 땐 위(깃발 끝)부터, 나갈 땐 위부터 사라진다
    const clipTop = band.a <= 0 ? -1e4 : o.figTop - (o.figTop - top) + band.a * (o.figTop + o.figH - top);
    const clipBot = top + band.b * (o.figTop + o.figH - top);
    ctx.beginPath(); ctx.rect(x - cw * 2, clipTop, cw * 4, clipBot - clipTop); ctx.clip();
    // 장대 · 위 가로대
    const pg = ctx.createLinearGradient(x - pole, 0, x + pole, 0);
    pg.addColorStop(0, '#2a1c10'); pg.addColorStop(0.5, '#7a5c3a'); pg.addColorStop(1, '#22160c');
    ctx.fillStyle = pg;
    ctx.fillRect(x - pole / 2, top, pole, bottom - top);
    ctx.fillRect(side > 0 ? x - pole / 2 : x - cw - pole * 1.1, ct - pole * 0.6, cw + pole * 1.6, pole * 0.9);
    // 천 — 바깥 가장자리가 바람에 살짝 너울진다
    const sway = Math.sin(t / 900 + q.id) * cw * 0.05 * side;
    ctx.beginPath();
    ctx.moveTo(cl, ct); ctx.lineTo(cr, ct);
    if (side > 0) {
      ctx.bezierCurveTo(cr + sway, ct + (cb - ct) * 0.33, cr - sway, ct + (cb - ct) * 0.66, cr + sway * 0.6, cb);
      ctx.lineTo(cl, cb);
    } else {
      ctx.lineTo(cr, cb); ctx.lineTo(cl + sway * 0.6, cb);
      ctx.bezierCurveTo(cl - sway, ct + (cb - ct) * 0.66, cl + sway, ct + (cb - ct) * 0.33, cl, ct);
    }
    ctx.closePath();
    const cg = ctx.createLinearGradient(cl, 0, cr, 0);
    cg.addColorStop(0, '#d2cdc1'); cg.addColorStop(0.5, '#eae6dc'); cg.addColorStop(1, '#cbc5b8');
    ctx.fillStyle = cg;
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = cw * 0.18; ctx.shadowOffsetX = cw * 0.06 * side;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;
    ctx.fillStyle = 'rgba(30,40,70,.2)'; ctx.fill();            // 밤이라 천도 푸르게 가라앉힌다
    void outer;
    // 장대 쪽 · 위 가로대에 천을 매단 고리(치치)
    ctx.strokeStyle = 'rgba(90,78,60,.9)'; ctx.lineWidth = Math.max(1, pole * 0.4);
    const loops = 7;
    for (let i = 0; i < loops; i++) {
      const ly = ct + (cb - ct) * (i + 0.5) / loops;
      ctx.beginPath(); ctx.ellipse(x + pole * 0.2 * side, ly, pole * 1.1, pole * 0.7, 0, 0, TAU); ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const lx = cl + cw * (i + 0.5) / 3;
      ctx.beginPath(); ctx.ellipse(lx, ct - pole * 0.15, pole * 0.7, pole * 1.1, 0, 0, TAU); ctx.stroke();
    }
    // 문양 · 이름 — 천이 뒤집혀도 글자는 바로
    const mx = (cl + cr) / 2, mr = cw * 0.3;
    ctx.fillStyle = 'rgba(21,19,26,.92)';
    ctx.beginPath(); ctx.arc(mx, ct + cw * 0.45, mr, 0, TAU); ctx.fill();
    this.drawMon(ch.mon, mx, ct + cw * 0.45, mr * 0.78, '#e9e4d8');
    const len = Math.max(2, [...q.name].length);
    const nTop = ct + cw * 0.95, avail = cb - nTop - cw * 0.3;
    const fs = Math.min(cw * 0.66, avail / len);
    this.vtext(q.name, mx, nTop + fs * 0.5, fs, FONT_B, '#15131a', 1);
    const seals = [q.host && ['主', true], q.me && ['나', false], q.bot && ['봇', false]].filter(Boolean);
    const sx = side > 0 ? cr - cw * 0.12 : cl + cw * 0.12;
    seals.forEach(([s, round], i) => this.drawSeal(s, sx, cb - cw * 0.28 - i * cw * 0.42, cw * 0.34, -0.1 + i * 0.12, 1, round));
    if (q.key) {
      ctx.font = `900 ${cw * 0.2}px ${FONT_T}`; ctx.fillStyle = '#ece5d6'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(q.key, mx, cb + cw * 0.12);
    }
    ctx.restore();
  };

  /** 가로 나무 현판 — 봇 앉히기 · 기다리는 중 */
  P.samPlaque = function (text, x, y, fs, hover, t, dim) {
    const { ctx } = this;
    ctx.save();
    ctx.font = `900 ${fs}px ${FONT_T}`;
    const w = ctx.measureText(text).width + fs * 1.6, h = fs * 2;
    const pulse = dim ? 0.85 : 0.8 + 0.2 * Math.sin(t / 380);
    ctx.globalAlpha = hover ? 1 : pulse;
    ctx.fillStyle = dim ? 'rgba(12,14,22,.8)' : hover ? '#b8281f' : '#a3221b';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = dim ? 'rgba(236,229,214,.35)' : 'rgba(245,230,216,.6)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6);
    ctx.fillStyle = '#f5e6d8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + fs * 0.04);
    ctx.restore();
  };

  /* ─────────── 선수 소개 — 붓 획으로 가르고 対 도장 ─────────── */

  P.samPair = function () {
    const m = this.match;
    const ids = m.fighters || m.players.map(p => p.id);
    const me = ids.includes(m.foreId) ? m.foreId : ids[0];
    const other = ids.find(id => id !== me);
    return [this.pl(me), this.pl(other)];
  };

  /**
   * 선수 소개 이름 — 바깥쪽 가장자리에 세로 한 줄:
   * 금테 두른 가문 문양 → 위에서 아래로 그어지는 먹 붓 획 위에 금빛 붓글씨 이름 → 붉은 낙관(가문) 쾅 → 우리말 가문 · YOU
   */
  P.drawSamVsName = function (p, ch, i, side, age, ne) {
    const { ctx, W, H } = this;
    const len = Math.max(2, [...p.name].length);
    const fs = Math.min(H * 0.085, H * 0.5 / len, W * 0.062);
    const nx = i ? W - Math.max(W * 0.075, fs * 1.25) : Math.max(W * 0.075, fs * 1.25);
    const y0 = H * 0.11;
    const monY = y0 + fs * 0.62, monR = fs * 0.58;
    const bandTop = monY + monR + fs * 0.25;
    const nameTop = bandTop + fs * 0.55;
    const bandBot = nameTop + len * fs * 0.98 + fs * 0.35;
    const reach = lerp(bandTop, bandBot, easeIO(age / 700));        // 붓이 지나간 곳까지
    ctx.save();
    // 문양 — 금테 두른 먹빛 원판이 살짝 커지며 나타난다
    const me = easeOut(age / 260);
    ctx.globalAlpha = me;
    ctx.save();
    ctx.translate(nx, monY); ctx.scale(lerp(1.4, 1, me), lerp(1.4, 1, me));
    ctx.fillStyle = 'rgba(10,8,12,.9)';
    ctx.beginPath(); ctx.arc(0, 0, monR, 0, TAU); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(1.5, monR * 0.07);
    ctx.beginPath(); ctx.arc(0, 0, monR * 0.92, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1, monR * 0.03);
    ctx.beginPath(); ctx.arc(0, 0, monR * 1.08, 0, TAU); ctx.stroke();
    this.drawMon(ch.mon, 0, 0, monR * 0.7, '#e6c98a');
    ctx.restore();
    ctx.globalAlpha = 1;
    // 먹 붓 획 — 위에서 아래로 그어진다(마른 붓 끝이 아래)
    ctx.save();
    ctx.beginPath(); ctx.rect(nx - fs * 1.4, bandTop - fs * 0.2, fs * 2.8, reach - bandTop + fs * 0.4); ctx.clip();
    const stroke = this.img.ink_stroke;
    if (stroke) {
      ctx.save();
      ctx.translate(nx, bandTop); ctx.rotate(Math.PI / 2);
      const bw = bandBot - bandTop + fs * 0.9, bh = fs * 1.75;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(stroke, -fs * 0.25, -bh / 2, bw, bh);
      ctx.restore();
    }
    // 양옆 금실 — 끝은 흐리게
    for (const dx of [-1, 1]) {
      const lg = ctx.createLinearGradient(0, bandTop, 0, bandBot);
      lg.addColorStop(0, 'rgba(184,155,94,0)'); lg.addColorStop(0.15, 'rgba(214,185,120,.85)'); lg.addColorStop(0.85, 'rgba(214,185,120,.85)'); lg.addColorStop(1, 'rgba(184,155,94,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(nx + dx * fs * 1.02 - 0.75, bandTop, 1.5, bandBot - bandTop);
    }
    // 이름 — 금빛 붓글씨, 어두운 테와 은은한 빛
    ctx.font = `${fs}px ${FONT_B}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const gold = ctx.createLinearGradient(0, nameTop, 0, nameTop + len * fs);
    gold.addColorStop(0, '#fff4d8'); gold.addColorStop(0.5, '#f0cf8a'); gold.addColorStop(1, '#c9974a');
    [...p.name].forEach((c, k) => {
      if (c === ' ') return;
      const yy = nameTop + k * fs * 0.98 + fs * 0.45;
      ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.09; ctx.strokeStyle = 'rgba(8,6,6,.95)';
      ctx.strokeText(c, nx, yy);
      ctx.shadowColor = 'rgba(255,200,120,.45)'; ctx.shadowBlur = fs * 0.35;
      ctx.fillStyle = gold; ctx.fillText(c, nx, yy);
      ctx.shadowBlur = 0;
    });
    ctx.restore();
    // 붉은 낙관 — 붓이 다 지나간 뒤 쾅
    const se = easeOut((age - 720) / 180);
    if (se > 0) {
      const size = fs * 0.78;
      ctx.save();
      ctx.translate(nx - side * fs * 0.95, bandBot - size * 0.35);
      ctx.scale(lerp(2, 1, se), lerp(2, 1, se));
      this.drawSeal(ch.jp, 0, 0, size, 0.08 * side, se);
      ctx.restore();
    }
    // 우리말 가문 · YOU
    const te = easeOut((age - 900) / 400);
    if (te > 0) {
      ctx.globalAlpha = te;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = `900 ${fs * 0.26}px ${FONT_T}`;
      ctx.fillStyle = 'rgba(230,214,170,.9)';
      ctx.fillText(`${ch.ko} 가문`.split('').join(' '), nx, bandBot + fs * 0.55);
      if (p.me) {
        const tw = fs * 1.1, th = fs * 0.36, ty = bandBot + fs * 0.98;
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
        ctx.strokeRect(nx - tw / 2, ty, tw, th);
        ctx.fillStyle = '#ffd98a'; ctx.font = `900 ${fs * 0.24}px ${FONT_T}`; ctx.textBaseline = 'middle';
        ctx.fillText('YOU', nx, ty + th / 2);
      }
    }
    ctx.restore();
    void ne;
  };

  P.drawSamVersus = function (t) {
    const { ctx, W, H } = this;
    const m = this.match;
    if (!m) return;
    const vt = t - (this.versusAt || t);
    const pair = this.samPair();
    const xt = W * 0.57, xb = W * 0.43;
    const bg = this.img.mode_samurai_bg;
    ctx.fillStyle = '#080a10'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2; i++) {
      const p = pair[i] || { name: '?', char: i };
      const ch = SCHARS[p.char % 4];
      const side = i ? 1 : -1;
      const cx = i ? W * 0.74 : W * 0.26;
      const push = side * 8 * easeOut((vt - 200) / 300);
      ctx.save();
      ctx.translate(push, 0);
      ctx.beginPath();
      if (i) { ctx.moveTo(xt, 0); ctx.lineTo(W + 20, 0); ctx.lineTo(W + 20, H); ctx.lineTo(xb, H); }
      else { ctx.moveTo(-20, 0); ctx.lineTo(xt, 0); ctx.lineTo(xb, H); ctx.lineTo(-20, H); }
      ctx.closePath(); ctx.clip();
      const z = 1.18 + vt / 40000;
      const bs = Math.max(W / bg.width, H / bg.height) * z;
      ctx.drawImage(bg, (W - bg.width * bs) / 2 + (cx - W / 2) * 0.4 - side * vt * 0.004, (H - bg.height * bs) / 2, bg.width * bs, bg.height * bs);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = ch.cloth; ctx.fillRect(-20, 0, W + 40, H);
      ctx.restore();
      ctx.fillStyle = 'rgba(4,6,12,.45)'; ctx.fillRect(-20, 0, W + 40, H);
      this.drawMon(ch.mon, cx, H * 0.42, H * 0.36, 'rgba(239,232,216,.07)');
      // 사람 — 옆에서 미끄러져 들어온다. 오른쪽은 뒤집어 서로 마주 보게
      const man = this.samMan(p.char);
      if (man) {
        const enter = (vt - 150 - i * 120) / 480;
        const e = easeOut(enter);
        const mh = H * 0.96 * (1 + clamp((vt - 700) / 3000) * 0.04);
        const mw = man.width * mh / man.height;
        const mx = cx + side * (1 - e) * W * 0.6;
        if (e > 0) {
          ctx.save();
          ctx.translate(mx, H * 1.02 - mh);
          if (i) ctx.scale(-1, 1);
          if (e < 0.98) for (let g = 3; g >= 1; g--) { ctx.globalAlpha = 0.1 * g; ctx.drawImage(man, -mw / 2 - side * g * W * 0.03 * (1 - e) * (i ? -1 : 1), 0, mw, mh); }
          ctx.globalAlpha = clamp(e * 2);
          ctx.drawImage(man, -mw / 2, 0, mw, mh);
          ctx.restore();
        }
      }
      const low = ctx.createLinearGradient(0, H * 0.55, 0, H);
      low.addColorStop(0, 'rgba(0,0,0,0)'); low.addColorStop(1, 'rgba(0,0,0,.88)');
      ctx.fillStyle = low; ctx.fillRect(-20, H * 0.55, W + 40, H * 0.45);
      // 이름 — 바깥쪽 가장자리에 세로로
      const ne = easeOut((vt - 600 - i * 120) / 650);
      if (ne > 0) this.drawSamVsName(p, ch, i, side, vt - 600 - i * 120, ne);
      ctx.restore();
    }
    // 가르는 붓 획 — 위에서 아래로
    const draw = easeOut(vt / 300);
    if (draw > 0) {
      ctx.save();
      const ex = lerp(xt, xb, draw), ey = H * draw;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#06070b'; ctx.lineWidth = Math.max(14, W * 0.016);
      ctx.beginPath(); ctx.moveTo(xt, -10); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(239,232,216,.85)'; ctx.lineWidth = Math.max(2, W * 0.002);
      ctx.shadowColor = 'rgba(200,220,255,.9)'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(xt, -10); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
    }
    // 対 — 두 사람이 다 들어온 뒤 찍힌다
    const at = 950;
    if (vt > at) {
      const va = vt - at;
      if (!this._samVsHit) {
        this._samVsHit = true;
        this.shakeIt(260, 14);
        this.S && this.S.thud(0.9);
        const R = rng(Math.floor(t));
        this._samInk = Array.from({ length: 16 }, () => ({ a: R() * TAU, d: 0.6 + R() * 0.9, r: 0.03 + R() * 0.07 }));
      }
      const size = Math.min(W, H) * 0.2;
      const e = easeOut(va / 170);
      ctx.save();
      ctx.translate(W / 2, H * 0.47);
      for (const d of this._samInk || []) {
        ctx.fillStyle = `rgba(6,7,11,${0.85 * e})`;
        ctx.beginPath(); ctx.arc(Math.cos(d.a) * size * d.d * e, Math.sin(d.a) * size * d.d * e, size * d.r, 0, TAU); ctx.fill();
      }
      ctx.scale(lerp(2.4, 1, e), lerp(2.4, 1, e));
      this.drawSeal('対', 0, 0, size, -0.08, clamp(va / 80));
      ctx.restore();
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    this.samSnow(t, true, 2);
    if (vt >= 0 && vt < 90) { ctx.fillStyle = `rgba(235,242,255,${0.6 * (1 - vt / 90)})`; ctx.fillRect(0, 0, W, H); }
  };

  /* ─────────── 결투장 — 눈 내리는 신사 ─────────── */

  /* ─────────── 결투장 — 발도술: 자세 → 어두워짐 → Y자 고르기 → 스쳐 벰 → 이긴 쪽 등 뒤에서 진 쪽이 무너진다 ─────────── */

  // app.js 의 SAM_CLASH_MS 와 같은 값 — samuraistart 소리가 끝나 갈 즈음 스쳐 지나간다
  const CLASH = 1450;

  P.samGust = function () {
    const R = Math.random;
    this.samPetals = this.samPetals || [];
    for (let i = 0; i < 46; i++) {
      this.samPetals.push({ x: 1.05 + R() * 0.4, y: R() * 0.8, vx: -(0.35 + R() * 0.4), vy: 0.04 + R() * 0.08, rot: R() * TAU, vr: (R() - 0.5) * 8, s: 0.6 + R() * 0.8, ph: R() * TAU });
    }
  };

  P.samSparkBurst = function () {
    const R = Math.random;
    const { W, H } = this;
    this.samSparks = this.samSparks || [];
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, sp = (0.2 + R()) * Math.min(W, H) * 0.9;
      this.samSparks.push({ x: W * 0.5, y: H * 0.45, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.3 + R() * 0.5 });
    }
  };

  P.drawSamParticles = function (t) {
    const { ctx, W, H } = this;
    const dt = this.samDt || 0;
    if (this.samPetals && this.samPetals.length) {
      for (const p of this.samPetals) {
        p.x += p.vx * dt; p.y += p.vy * dt + Math.sin(t / 300 + p.ph) * dt * 0.05; p.rot += p.vr * dt;
        const s = Math.min(W, H) * 0.011 * p.s;
        const sp = this._petals && this._petals[1 + (Math.floor(p.ph * 10) % 3)];
        ctx.save();
        ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.sin(t / 160 + p.ph));
        if (sp) ctx.drawImage(sp, -s * 1.6, -s * 1.6 * sp.height / sp.width, s * 3.2, s * 3.2 * sp.height / sp.width);
        ctx.restore();
      }
      this.samPetals = this.samPetals.filter(p => p.x > -0.1);
    }
    if (this.samSparks && this.samSparks.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const p of this.samSparks) {
        p.age += dt; p.vx *= 1 - dt * 3; p.vy = p.vy * (1 - dt * 3) + dt * H * 0.6;
        const px = p.x, py = p.y;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.age / p.life; if (k <= 0) continue;
        ctx.strokeStyle = `rgba(255,${200 + 55 * k},${150 + 100 * k},${k})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.restore();
      this.samSparks = this.samSparks.filter(p => p.age < p.life);
    }
  };

  // 스쳐 지나간 뒤의 흐름(스쳐 지나간 순간부터 ms)
  //   엇갈림 → 돌아서 다시 마주 봄 → 진 쪽이 무릎 → 목을 감쌈 → 피를 흘리며 고꾸라짐 → 쓰러짐 → (영상처럼) 이긴 쪽 등 뒤로 넘어가 빛과 함께 승자
  const X = {
    cross: 560,      // 둘이 서로를 스쳐 반대편으로
    turn: 1080,      // 발도술 자세를 물고 있다가 돌아서기 시작
    turnDur: 420,
    kneel: 1700,     // 진 쪽이 털썩 무릎 꿇는다(캄캄해 누군지 모른다)
    clutch: 2250,    // 목을 감싼다
    slump: 3050,     // 피를 흘리며 고개가 앞으로 떨어진다
    fall: 3900,      // 앞으로 무너진다
    cut: 4800,       // 이긴 쪽 등 뒤로 컷이 넘어간다
    drawReveal: 1900,
  };
  const IAI_H = 0.7;    // 발도술 자세는 몸을 낮춘다 — 선 키의 70%
  const IAI_OUT = 0.05; // 벤 뒤 자세가 넓어 서로 붙어 보이지 않게 조금 더 바깥으로

  P.result = function (ev) {
    if (!isSam(this)) return base.result.call(this, ev);
    const m = this.match; if (!m) return;
    m.phase = 'result';
    m.scores = ev.scores;
    m.sig = null; m.fake = null;
    const winId = ev.win.length === 1 ? ev.win[0] : null;
    const loserId = winId != null ? (ev.rows.find(r => r.id !== winId) || {}).id : null;
    m.res = { at: now(), winId, loserId, why: ev.why, rows: ev.rows, over: ev.over };
    // 소리 중 samuraistart · swing · swordfight 는 app.js 가 낸다. 여기는 흔들림 · 불똥 · 돌아섬 · 무릎 · 발소리 · 건넴 · 쓰러짐
    const S = this.S;
    const at = (ms, fn) => this.later(fn, CLASH + ms);
    this.later(() => { this.samFlash(140, 'rgba(240,246,255,'); this.shakeIt(240, 12); }, CLASH);
    at(X.turn, () => S && S.whoosh(0.4));
    // 영상 연출(VIDEO 를 켰을 때만) — 스쳐 지나가는 순간부터 영상
    const clip = this.samResultClip(winId);
    if (clip) {
      this.later(() => {
        m.res.video = clip;
        try { clip.loop = false; clip.currentTime = 0; clip.play().catch(() => { m.res.video = null; }); } catch (_) { m.res.video = null; }
      }, CLASH);
      return;
    }
    if (winId == null) { at(X.cross - 80, () => this.samSparkBurst()); return; }
    at(X.kneel, () => S && S.thud(0.55));
    at(X.slump, () => S && S.thud(0.3));
    at(X.fall + 520, () => { S && S.thud(1); this.shakeIt(120, 4); });
    at(X.cut + 500, () => this.samGust());
  };

  /** 칼날의 별빛 — 네 갈래 빛줄기가 번쩍 커졌다가 사라진다 */
  P.samGlint = function (x, y, r, p) {
    const { ctx } = this;
    const k = p < 0.25 ? easeOut(p / 0.25) : 1 - easeIn((p - 0.25) / 0.75);
    if (k <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6 * k);
    glow.addColorStop(0, `rgba(255,255,255,${k})`); glow.addColorStop(0.3, `rgba(200,225,255,${0.6 * k})`); glow.addColorStop(1, 'rgba(160,200,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 0.6 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${k})`;
    for (const [a, len] of [[0, 1.6], [Math.PI / 2, 1], [Math.PI, 1.6], [-Math.PI / 2, 1]]) {
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, -r * 0.035); ctx.lineTo(r * len * k, 0); ctx.lineTo(0, r * 0.035); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  /** 서 있는 자세 → 발도술 자세(0~1) */
  P.samStance = function (t) {
    const m = this.match;
    if (!m) return 0;
    if (m.phase === 'wait' || m.phase === 'signal') return easeOut((t - (this.waitAt || t)) / 900);
    if (m.phase === 'result' && m.res) return 1;
    return 0;
  };

  P.drawSamDuel = function (t) {
    const { ctx, W, H } = this;
    const m = this.match;
    if (!m) return;
    const res = m.res;
    const a = res ? t - res.at : -1;
    const bh = H * 0.09;
    // 스쳐 지나간 뒤는 다른 장면 — 캄캄한 옆모습
    if (res && a >= CLASH) {
      this.drawSamCross(t, a - CLASH);
      ctx.fillStyle = '#05060a';
      ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      this.drawSamResult(t);
      this.drawScores();
      return;
    }
    const since = t - (this.duelAt || t);
    const stance = this.samStance(t);
    const tension = res ? easeIO(a / CLASH) : 0;
    ctx.save();
    const z = lerp(1.14, 1.0, easeOut(since / 1600)) + stance * 0.1 + tension * 0.08;
    this.samCam(lerp(700, 690, stance), lerp(430, 470, stance), z);
    ctx.drawImage(this.img.mode_samurai_bg, 0, 0, BGW, BGH);
    const opp = this.pl(m.oppId);
    if (opp) this.drawSamOpp(opp, t, since, stance);
    const fog = ctx.createLinearGradient(0, 540, 0, BGH);
    fog.addColorStop(0, 'rgba(210,222,240,0)'); fog.addColorStop(1, 'rgba(210,222,240,.28)');
    ctx.fillStyle = fog; ctx.fillRect(0, 540, BGW, BGH - 540);
    ctx.restore();
    this.samSnow(t, false, 1 + stance);
    this.drawSamFore(t, since, stance);
    // 영상 연출(VIDEO 를 켰을 때만) — 자세를 잡는 순간부터 대치 영상을 겹친다
    const live = m.phase === 'wait' || m.phase === 'signal' || res;
    const stanceClip = live ? this.samStanceClip() : null;
    if (stanceClip && stanceClip.paused) { stanceClip.loop = true; stanceClip.play().catch(() => {}); }
    const iaiK = live && (stanceClip || this.samIaiReady()) ? easeOut((t - (this.waitAt || t)) / 500) : 0;
    if (iaiK > 0) {
      ctx.globalAlpha = iaiK;
      if (stanceClip) this.drawSamVideo(1e9, stanceClip);
      else this.drawSamIai(t - (this.waitAt || t));
      ctx.globalAlpha = 1;
    }
    // 자세를 잡으면 가라앉고, 고르기가 열리면(그리고 둘 다 고른 뒤에도) 거의 캄캄해진다
    const sigAt = m.sig && m.sig.at;
    const open = m.phase === 'signal' && sigAt ? easeOut((t - sigAt) / 450) : 0;
    const k = Math.max(stance * 0.45, open * 0.9, res ? 0.9 : 0);
    if (k > 0) {
      ctx.fillStyle = `rgba(1,2,5,${k * 0.94})`; ctx.fillRect(0, 0, W, H);
      const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.2, W / 2, H * 0.5, Math.max(W, H) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.8 * k + (tension > 0 ? 0.1 * Math.abs(Math.sin(a / 240)) : 0)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    // 고르기가 열리는 순간 — 어둠 속 칼날에 별처럼 한 번 번쩍(발도술 gif)
    if (sigAt && t - sigAt < 700) this.samGlint(W * 0.27, H * 0.63, Math.min(W, H) * 0.12, (t - sigAt) / 700);
    this.drawSamParticles(t);
    this.samSnow(t, true, 1 + stance);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    this.drawScores();
  };

  /* ─────────── 영상 (지금은 꺼 둠 — VIDEO) ─────────── */

  /**
   * 영상으로 연출할 때 쓰는 코드. 지금은 그림 연출을 쓰고 VIDEO = false 로 꺼 둔다.
   * 켜면: public/video/ 의 파일을 찾아 튼다(art/영상-목록.md). 없는 파일은 그림 연출이 대신 나온다.
   *   sam_stance_blue · sam_stance_red  대치(반복)   sam_win_blue · sam_win_red  승부   sam_draw  비김
   *   aftermath.mp4  예전 결과 영상(새 조각이 없을 때)
   *   iai0~2.jpg      발도술 gif 를 484×229 프레임 8×6 칸씩 뽑은 판(70ms 간격 144장, 칼 긋는 125번부터는 안 씀)
   */
  const VIDEO = false;
  const IAI = { fw: 484, fh: 229, cols: 8, per: 48, ms: 70, last: 118, loopFrom: 84, cropB: 20 };
  const colorOf = char => (((char % 2) + 2) % 2 === 1 ? 'red' : 'blue');

  P.samIaiReady = function () {
    if (!VIDEO) return false;
    this._iai = this._iai || [0, 1, 2].map(i => { const im = new Image(); im.src = `/video/iai${i}.jpg`; return im; });
    return this._iai.every(im => im.complete && im.naturalWidth);
  };

  /** 발도술 영상 한 장 — ms 는 자세를 잡은 뒤 흐른 시간. 끝까지 가면 대치 구간을 이어 붙여 돈다 */
  P.drawSamIai = function (ms) {
    const { ctx, W, H } = this;
    const span = IAI.last - IAI.loopFrom;
    const pos = Math.max(0, ms) / IAI.ms;
    const f = pos <= IAI.last ? pos : IAI.loopFrom + ((pos - IAI.loopFrom) % span);
    const i0 = Math.floor(f), mix = f - i0;
    const draw = (i, alpha) => {
      i = Math.min(IAI.last, Math.max(0, i));
      const im = this._iai[Math.floor(i / IAI.per)], k = i % IAI.per;
      const sx = (k % IAI.cols) * IAI.fw, sy = Math.floor(k / IAI.cols) * IAI.fh, sh = IAI.fh - IAI.cropB;
      const s = Math.max(W / IAI.fw, H / sh) * 1.02;
      const dw = IAI.fw * s, dh = sh * s;
      ctx.globalAlpha *= alpha;
      ctx.drawImage(im, sx, sy, IAI.fw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.globalAlpha /= alpha;
    };
    const base = ctx.globalAlpha;
    draw(i0, 1);
    const next = i0 + 1 > IAI.last ? IAI.loopFrom : i0 + 1;     // 프레임 사이를 겹쳐 14fps 도 끊기지 않게
    if (mix > 0.05) draw(next, mix);
    ctx.globalAlpha = base;
  };

  /** 영상 조각 — 처음 부를 때 받기 시작하고, 없거나 못 받았으면 null */
  P.samClip = function (name) {
    if (!VIDEO) return null;
    this._samClips = this._samClips || {};
    let v = this._samClips[name];
    if (!v) {
      v = this._samClips[name] = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.addEventListener('error', () => { v._missing = true; });
      v.src = `/video/${name}.mp4`;
      v.load();
    }
    return !v._missing && v.readyState >= 2 ? v : null;
  };
  P.samVideo = function () { return this.samClip('aftermath'); };

  /** 대치 조각 — 내가 파랑이면 파랑 등 뒤, 빨강이면 빨강 등 뒤 */
  P.samStanceClip = function () {
    const me = this.match && this.pl(this.match.foreId);
    return me ? this.samClip(`sam_stance_${colorOf(me.char)}`) : null;
  };

  /** 영상 한 장 — 가로 영상은 꽉 채우고, 세로 영상은 가운데에 두고 양옆을 같은 영상을 크게 흐려 채운다 */
  P.drawSamVideo = function (c, v) {
    const { ctx, W, H } = this;
    if (!v || v.readyState < 2) return false;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (vw / vh > 1.2) {
      const s = Math.max(W / vw, H / vh);
      ctx.drawImage(v, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
    } else {
      const blur = this._samVidBlur || (this._samVidBlur = document.createElement('canvas'));
      blur.width = 40; blur.height = 24;
      blur.getContext('2d').drawImage(v, 0, vh * 0.3, vw, vh * 0.4, 0, 0, 40, 24);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(blur, 0, 0, W, H);
      ctx.fillStyle = 'rgba(4,6,12,.55)'; ctx.fillRect(0, 0, W, H);
      const s = H / vh, dw = vw * s, x = (W - dw) / 2;
      ctx.drawImage(v, x, 0, dw, H);
      for (const [x0, dir] of [[x, 1], [x + dw, -1]]) {
        const g = ctx.createLinearGradient(x0, 0, x0 + dir * dw * 0.18, 0);
        g.addColorStop(0, 'rgba(4,6,12,.9)'); g.addColorStop(1, 'rgba(4,6,12,0)');
        ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x0 + dir * dw * 0.18), 0, dw * 0.18, H);
      }
    }
    if (c < 300) { ctx.fillStyle = `rgba(240,246,255,${0.9 * (1 - c / 300)})`; ctx.fillRect(0, 0, W, H); }
    return true;
  };

  /** 결과 영상 고르기 — 승자 색 조각 · 비김 조각 → 예전 결과 영상. 없으면 null(그림 연출) */
  P.samResultClip = function (winId) {
    if (!VIDEO) return null;
    const winner = winId != null && this.pl(winId);
    return winId == null ? this.samClip('sam_draw') : (winner && this.samClip(`sam_win_${colorOf(winner.char)}`)) || this.samVideo();
  };

  /** 밤 장면에 맞춰 사람 그림의 색을 눌러 둔다 — 푸른 그늘 · 위에서 오는 달빛 · 발밑 어둠 */
  P.samGraded = function (img, key, { tint = null, dark = 0.36, flip = false } = {}) {
    if (!img || !img.naturalWidth && !img.getContext) return null;
    this._samGrade = this._samGrade || {};
    if (this._samGrade[key]) return this._samGrade[key];
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    if (flip) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    if (tint) { g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = `rgba(14,22,44,${dark})`; g.fillRect(0, 0, c.width, c.height);
    const lg = g.createLinearGradient(0, 0, 0, c.height);
    lg.addColorStop(0, 'rgba(190,210,250,.12)'); lg.addColorStop(0.45, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,.4)');
    g.fillStyle = lg; g.fillRect(0, 0, c.width, c.height);
    return (this._samGrade[key] = c);
  };
  const RED_TINT = 'rgba(150,22,18,.42)';
  P.samBack = function (char, dark = 0.42) {
    const img = this.samImg('sam_blue_back');
    if (!img) return null;
    const red = ((char % 2) + 2) % 2 === 1;
    return this.samGraded(img, `back${red ? 'r' : 'b'}${dark}`, { tint: red ? RED_TINT : null, dark });
  };
  P.samDeath = function (char, n) {
    const img = this.samImg(`sam_death${n}`);
    if (!img) return null;
    const red = ((char % 2) + 2) % 2 === 1;
    return this.samGraded(img, `death${n}${red ? 'r' : 'b'}`, { tint: red ? RED_TINT : null, dark: 0.3 });
  };
  P.samFront = function (char, dark = 0.3) {
    const man = this.samMan(char);
    return man ? this.samGraded(man, `front${char % 4}${man.width}${dark}`, { dark }) : null;
  };

  /** 상대 — 배경 좌표. 자세를 잡으면 낮게 웅크린다 */
  P.drawSamOpp = function (p, t, since, stance) {
    const { ctx } = this;
    const man = this.samFront(p.char, 0.22);
    if (!man) return;
    const h = OPP.h, w = man.width * h / man.height;
    const appear = easeOut((since - 250) / 600);
    const x = OPP.x, y = OPP.y;
    ctx.save();
    ctx.globalAlpha = appear;
    const cs = ctx.createRadialGradient(x, y, 0, x, y, h * 0.3);
    cs.addColorStop(0, 'rgba(10,14,24,.55)'); cs.addColorStop(1, 'rgba(10,14,24,0)');
    ctx.fillStyle = cs;
    ctx.beginPath(); ctx.ellipse(x, y, h * 0.3, h * 0.05, 0, 0, TAU); ctx.fill();
    const sy = 1 - stance * 0.07, sx = 1 + stance * 0.03;
    ctx.drawImage(man, x - w * sx / 2, y - h * sy + Math.sin(t / 1500) * 0.6, w * sx, h * sy);
    ctx.restore();
  };

  /** 내 뒷모습 — 자세를 잡으면 낮아진다 */
  P.drawSamFore = function (t, since, stance) {
    const { ctx, W, H } = this;
    const back = this.samBack(this.fore.char, 0.5);
    if (!back) return;
    const slideIn = (1 - easeOut(since / 900)) * H * 0.35;
    const h = H * 1.25, w = back.width * h / back.height;
    const cx = W * 0.2, top = H * 0.2 + slideIn + stance * H * 0.05;
    const ra = t - this.fore.raiseAt;
    const grip = ra >= 0 && ra < 300 ? Math.sin(ra / 300 * Math.PI) * 5 : 0;
    // 고른 기술은 결과 전까지 드러내지 않는다 — 칼자루를 고쳐 쥐는 움찔만
    ctx.drawImage(back, cx - w / 2 + grip, top + Math.sin(t / 1400) * 2, w, h);
  };

  /** 옆모습 · 무릎 그림 — 캄캄할 땐 까만 실루엣(누군지 모르게), 빛이 돌아오면 가문 색 */
  P.samPose = function (name, char, flip, lit) {
    const img = this.samImg(name);
    if (!img) return null;
    const red = ((char % 2) + 2) % 2 === 1;
    this._samPose = this._samPose || {};
    const key = `${name}${flip ? 'f' : ''}${lit ? (red ? 'r' : 'b') : 'k'}`;
    if (this._samPose[key]) return this._samPose[key];
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    if (flip) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    if (lit) {
      if (red) { g.fillStyle = RED_TINT; g.fillRect(0, 0, c.width, c.height); }
      g.fillStyle = 'rgba(14,22,44,.3)'; g.fillRect(0, 0, c.width, c.height);
    } else {
      // 달빛에 가장자리만 희미하게 — 몸은 까맣게
      const gr = g.createLinearGradient(0, 0, 0, c.height);
      gr.addColorStop(0, 'rgba(24,30,46,.97)'); gr.addColorStop(1, 'rgba(4,5,9,.98)');
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    }
    return (this._samPose[key] = c);
  };

  /** 한 사람 — 실루엣과 색 그림을 빛(lit 0~1)만큼 겹친다. 옆모습 그림 발밑 바닥 조각은 잘라낸다 */
  P.samDrawPose = function (name, char, flip, lit, x, ground, h, cut = 1) {
    const { ctx } = this;
    const dark = this.samPose(name, char, flip, false);
    if (!dark) return;
    const w = dark.width * h / dark.height;
    const sh = dark.height * cut;
    ctx.drawImage(dark, 0, 0, dark.width, sh, x - w / 2, ground - h, w, h * cut);
    if (lit > 0) {
      const col = this.samPose(name, char, flip, true);
      ctx.globalAlpha *= lit;
      if (col) ctx.drawImage(col, 0, 0, col.width, sh, x - w / 2, ground - h, w, h * cut);
      ctx.globalAlpha /= lit;
    }
  };

  /** 스쳐 지나간 뒤 — 옆모습 두 사람: 엇갈림 → 돌아서 마주 봄 → 진 쪽 무릎 · 목을 감쌈 · 고꾸라짐 → 쓰러짐. 비기면 불똥 뒤 빛이 돌아온다 */
  P.drawSamCross = function (t, b) {
    const { ctx, W, H } = this;
    const m = this.match, res = m.res;
    const [me, other] = this.samPair();
    const win = res.winId, draw = win == null;
    if (res.video && this.drawSamVideo(b, res.video)) { this.drawSamParticles(t); return; }
    if (!draw && b >= X.cut) return this.drawSamAftermath(t, b - X.cut);
    const reveal = draw ? easeIO((b - X.drawReveal) / 900) : 0;
    // 배경 — 거의 캄캄한 달밤
    ctx.save();
    this.samCam(690, 470, 1.08);
    ctx.drawImage(this.img.mode_samurai_bg, 0, 0, BGW, BGH);
    ctx.restore();
    ctx.fillStyle = `rgba(2,3,6,${lerp(0.9, 0.42, reveal)})`;
    ctx.fillRect(0, 0, W, H);
    const gy = H * 0.8, fh = Math.min(H * 0.64, W * 0.5);
    // 사람 뒤로 번지는 달빛 안개 — 까만 실루엣이 이 빛에 떠올라 보인다(역광)
    const halo = ctx.createRadialGradient(W / 2, gy - fh * 0.45, 0, W / 2, gy - fh * 0.45, W * 0.55);
    halo.addColorStop(0, `rgba(135,155,200,${0.42 * (1 - reveal * 0.6)})`); halo.addColorStop(0.55, `rgba(90,105,145,${0.18 * (1 - reveal * 0.6)})`); halo.addColorStop(1, 'rgba(60,70,100,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    const ground = ctx.createLinearGradient(0, gy - 6, 0, gy + H * 0.12);
    ground.addColorStop(0, 'rgba(120,135,165,.14)'); ground.addColorStop(1, 'rgba(120,135,165,0)');
    ctx.fillStyle = ground; ctx.fillRect(0, gy - 6, W, H * 0.14);
    // 자리 — 나는 왼쪽에서 오른쪽으로, 상대는 오른쪽에서 왼쪽으로 스친다. face: 1 오른쪽을 봄, -1 왼쪽을 봄
    const e = easeIO(clamp(b / X.cross));
    const turnP = clamp((b - X.turn) / X.turnDur);
    // 무릎 꿇는 쪽은 언제나 오른쪽 — 진 쪽이 왼쪽에서 출발해 오른쪽으로 스쳐 간다(캄캄해서 누군지는 안 보인다)
    const loserOther = !draw && other && other.id === res.loserId;
    const [lp, rp] = loserOther ? [other, me] : [me, other];
    const seats = [
      { p: lp, from: W * 0.24, to: W * 0.72, dir: 1 },
      { p: rp, from: W * 0.76, to: W * 0.28, dir: -1 },
    ];
    for (const s of seats) {
      s.x = lerp(s.from, s.to, e);
      s.face = turnP < 0.5 ? s.dir : -s.dir;      // 반쯤 돌았을 때 방향이 바뀐다
      s.sx = Math.max(0.08, Math.abs(Math.cos(turnP * Math.PI)));   // 돌아서는 동안 옆으로 얇아졌다가 넓어진다
    }
    const ls = seats.find(s => s.p && s.p.id === res.loserId);
    // 속도선 · 잔상
    if (b < X.cross + 120) {
      const k = 1 - clamp((b - X.cross) / 120);
      ctx.strokeStyle = `rgba(210,225,255,${0.3 * k})`; ctx.lineWidth = 1;
      for (let i = 0; i < 30; i++) {
        const yy = H * (0.22 + ((i * 0.618) % 1) * 0.58), len = W * (0.15 + ((i * 0.37) % 1) * 0.4);
        const xx = lerp(-len, W + len, ((i * 0.29 + b / 300) % 1));
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + len, yy); ctx.stroke();
      }
    }
    // 옆모습 그림은 왼쪽을 본다 — 오른쪽을 보려면 뒤집는다
    const pose = (name, s, lit, h, cut, x = s.x) => {
      ctx.save();
      ctx.translate(s.x, 0); ctx.scale(s.sx, 1); ctx.translate(-s.x, 0);
      this.samDrawPose(name, s.p.char, s.face > 0, lit, x, gy, h, cut);
      ctx.restore();
    };
    for (const s of seats) {
      if (!s.p) continue;
      const lost = s === ls;
      ctx.globalAlpha = 1;
      const sg = ctx.createRadialGradient(s.x, gy, 0, s.x, gy, fh * 0.35);
      sg.addColorStop(0, 'rgba(0,0,0,.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(s.x, gy, fh * 0.35, fh * 0.045, 0, 0, TAU); ctx.fill();
      // 스쳐 벨 때는 발도술 자세 — 돌아서면서(옆으로 얇아지는 사이) 선 자세로 바뀐다
      const iai = turnP < 0.5;
      const poseName = iai ? 'sam_iai' : 'sam_stand';
      const poseH = iai ? fh * IAI_H : fh, poseCut = iai ? 1 : 0.9;
      const px = iai ? s.x + s.dir * W * IAI_OUT * e : s.x;   // 벨수록 바깥으로 빠진다
      if (e < 1 && b > 30) {
        for (let g = 3; g >= 1; g--) {
          ctx.globalAlpha = 0.12 * g * (1 - e);
          this.samDrawPose(poseName, s.p.char, s.dir > 0, 0, px - s.dir * g * W * 0.05, gy, poseH, poseCut);
        }
        ctx.globalAlpha = 1;
      }
      if (!lost || b < X.kneel) { pose(poseName, s, reveal, poseH, poseCut, px); continue; }
      // 진 쪽 — 이긴 쪽을 보고 무릎 → 목을 감쌈 → 피를 흘리며 고꾸라짐 → 앞으로 무너짐(겹쳐서 스르르 바뀐다)
      const kb = b - X.kneel;
      const kh = fh * 0.74 * lerp(1.12, 1, easeOut(kb / 220));
      const fall = clamp((b - X.fall) / 650);
      const clutch = clamp((b - X.clutch) / 300);
      const slump = clamp((b - X.slump) / 450);
      const flip = s.face > 0;
      const k = kh / 675;                                    // 무릎 그림(sam_death1~3) 원본 높이 675
      const knee = s.x + s.face * 70 * k;                    // 무릎 자리 — 누운 그림을 여기에 맞춘다
      // 고꾸라진 채 앞으로 기울다가, 누운 모습(sam_death4)으로 스르르 바뀐다
      const tip = easeIn(fall);
      ctx.save();
      ctx.translate(knee, gy); ctx.rotate(s.face * tip * 0.55); ctx.translate(-knee, -gy);
      ctx.globalAlpha = 1 - easeIO((fall - 0.35) / 0.55);
      if (slump < 1) this.samDrawPose(clutch < 1 ? 'sam_death1' : 'sam_death2', s.p.char, flip, 0, s.x, gy, kh);
      if (clutch > 0 && clutch < 1) { ctx.globalAlpha *= clutch; this.samDrawPose('sam_death2', s.p.char, flip, 0, s.x, gy, kh); ctx.globalAlpha /= clutch; }
      if (slump > 0) { ctx.globalAlpha *= slump; this.samDrawPose('sam_death3', s.p.char, flip, 0, s.x, gy, kh); }
      ctx.restore();
      if (fall > 0.35) {
        // 누운 그림(1140×440) — 무릎(원본 x 830)을 무릎 자리에, 몸이 닿는 선(원본 y 370)을 땅에
        ctx.globalAlpha = easeIO((fall - 0.35) / 0.55);
        this.samDrawPose('sam_death4', s.p.char, flip, 0, knee + s.face * 260 * k, gy + 70 * k, 440 * k);
        ctx.globalAlpha = 1;
      }
    }
    // 칼을 뽑는 순간 — 흰 빛줄기 두 갈래와 주황 불똥(발도술 gif의 마지막)
    if (b < 420) {
      const k = 1 - easeIn(b / 420);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const [y0, y1, wdt] of [[0.62, 0.3, 0.012], [0.5, 0.42, 0.006]]) {
        const e2 = easeOut(b / 140);
        const x0 = W * -0.05, x1 = lerp(x0, W * 1.05, e2);
        const lg = ctx.createLinearGradient(x0, 0, x1, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.7, `rgba(235,245,255,${0.9 * k})`); lg.addColorStop(1, `rgba(255,255,255,${k})`);
        ctx.strokeStyle = lg; ctx.lineWidth = H * wdt;
        ctx.shadowColor = 'rgba(190,220,255,1)'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(x0, H * y0); ctx.lineTo(x1, lerp(H * y0, H * y1, e2)); ctx.stroke();
      }
      ctx.restore();
      if (!res.sparked) {
        res.sparked = true;
        const R = Math.random;
        this.samSparks = this.samSparks || [];
        for (let i = 0; i < 90; i++) {
          const an = -Math.PI * (0.05 + R() * 0.9) + (R() < 0.5 ? 0 : Math.PI * 0.1), sp = (0.3 + R()) * Math.min(W, H) * 1.1;
          this.samSparks.push({ x: W * (0.42 + R() * 0.16), y: H * (0.44 + R() * 0.1), vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, age: 0, life: 0.35 + R() * 0.6 });
        }
      }
    }
    // 컷이 넘어가기 직전 암전
    if (!draw && b > X.cut - 350) { ctx.fillStyle = `rgba(0,0,0,${easeIn((b - (X.cut - 350)) / 350)})`; ctx.fillRect(0, 0, W, H); }
    this.drawSamParticles(t);
    this.samSnow(t, true, 1);
  };

  /** 그 뒤(참고 영상) — 이긴 쪽 등 뒤에서: 앞에 쓰러진 진 쪽, 빛이 돌아오며 누군지 드러난다 */
  P.drawSamAftermath = function (t, c) {
    const { ctx, W, H } = this;
    const res = this.match.res;
    const loser = this.pl(res.loserId) || { char: 1 }, winner = this.pl(res.winId) || { char: 0 };
    const light = easeIO((c - 150) / 1400);
    ctx.save();
    this.samCam(lerp(700, 690, easeOut(c / 4000)), 470, lerp(1.1, 1.04, easeOut(c / 4000)));
    ctx.drawImage(this.img.mode_samurai_bg, 0, 0, BGW, BGH);
    // 쓰러진 진 쪽 — 피 흘리며 엎어져 누워 있다
    const d4 = this.samDeath(loser.char, 4);
    if (d4) {
      const k = OPP.h * 0.86 / 675;
      const h = 440 * k, w = d4.width * h / d4.height;
      const x = OPP.x, y = OPP.y + 4;
      const cs = ctx.createRadialGradient(x, y, 0, x, y, w * 0.55);
      cs.addColorStop(0, 'rgba(8,10,18,.55)'); cs.addColorStop(1, 'rgba(8,10,18,0)');
      ctx.fillStyle = cs; ctx.beginPath(); ctx.ellipse(x, y, w * 0.55, h * 0.12, 0, 0, TAU); ctx.fill();
      ctx.drawImage(d4, x - w / 2, y - h + 70 * k, w, h);
    }
    ctx.restore();
    ctx.fillStyle = `rgba(2,3,7,${lerp(0.88, 0.3, light)})`; ctx.fillRect(0, 0, W, H);
    this.samSnow(t, false, 1);
    // 이긴 쪽 등 — 앞에 크게
    const back = this.samBack(winner.char, lerp(0.75, 0.42, light));
    if (back) {
      const e = easeOut(c / 900);
      const h = H * lerp(1.38, 1.3, e), w = back.width * h / back.height;
      ctx.drawImage(back, lerp(W * 0.14, W * 0.22, e) - w / 2, H * 0.16 + Math.sin(t / 1600) * 1.5, w, h);
    }
    // 해 질 녘처럼 따뜻한 빛
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const wg = ctx.createLinearGradient(W, 0, 0, H);
    wg.addColorStop(0, `rgba(255,170,90,${0.55 * light})`); wg.addColorStop(1, `rgba(60,40,80,${0.35 * light})`);
    ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    this.drawSamParticles(t);
    this.samSnow(t, true, 1);
    if (c < 400) { ctx.fillStyle = `rgba(0,0,0,${1 - easeOut(c / 400)})`; ctx.fillRect(0, 0, W, H); }
  };

  P.samWord = function (text, age, size, color, stamp, font = FONT_JP) {
    const { ctx, W, H } = this;
    const fs = Math.min(W, H * 1.6) * size;
    const e = stamp ? easeOut(age / 150) : clamp(age / 120);
    const fade = stamp ? 1 : clamp((700 - age) / 250);
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    const sc = stamp ? lerp(2.4, 1, e) : 1 + (1 - e) * 0.2;
    ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(e, fade);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${fs}px ${font}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * (stamp ? 0.12 : 0.06); ctx.strokeStyle = stamp ? '#6e120c' : 'rgba(0,0,0,.5)';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  /** 한 판 판정 — 빛이 돌아온 뒤에야 누가 이겼는지 · 두 사람의 기술 · 이유 */
  P.drawSamResult = function (t) {
    const m = this.match;
    const res = m && m.res;
    if (!res) return;
    const { ctx, W, H } = this;
    const b = t - res.at - CLASH;
    const draw = res.winId == null;
    // 영상이면 끝나 갈 즈음, 그림 연출이면 빛이 돌아온 뒤
    const capAt = res.video ? Math.max(2400, (res.video.duration || 3) * 1000 - 700) : draw ? X.drawReveal + 350 : X.cut + 1100;
    if (b < capAt) return;
    const [me, other] = this.samPair();
    const rowOf = id => res.rows.find(r => r.id === id) || { st: 'late' };
    const nameOf = id => (this.pl(id) || {}).name || '';
    const e = easeOut((b - capAt) / 500);
    const fs = Math.min(H * 0.05, W * 0.045);
    ctx.save();
    ctx.globalAlpha = e;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 위 — 승자 이름(붓글씨) 또는 引分
    const ty = H * 0.2;
    const top = ctx.createLinearGradient(0, ty - fs * 1.6, 0, ty + fs * 1.6);
    top.addColorStop(0, 'rgba(4,6,12,0)'); top.addColorStop(0.5, 'rgba(4,6,12,.6)'); top.addColorStop(1, 'rgba(4,6,12,0)');
    ctx.fillStyle = top; ctx.fillRect(0, ty - fs * 1.6, W, fs * 3.2);
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = fs * 0.4;
    if (draw) {
      ctx.font = `${fs * 2}px ${FONT_JP}`; ctx.fillStyle = '#f6f1e6';
      ctx.fillText('引分', W / 2, ty);
    } else {
      ctx.font = `${fs * 1.9}px ${FONT_B}`; ctx.fillStyle = '#f6f1e6';
      ctx.fillText(`${nameOf(res.winId)} 승`, W / 2 - fs * 0.6, ty);
    }
    ctx.shadowBlur = 0;
    // 아래 — 두 사람의 기술과 이유
    const cy = H * 0.84 - fs * 0.6;
    const band = ctx.createLinearGradient(0, cy - fs * 1.6, 0, cy + fs * 1.8);
    band.addColorStop(0, 'rgba(4,6,12,0)'); band.addColorStop(0.4, 'rgba(4,6,12,.7)'); band.addColorStop(1, 'rgba(4,6,12,.2)');
    ctx.fillStyle = band; ctx.fillRect(0, cy - fs * 1.6, W, fs * 3.4);
    const cell = (p, x) => {
      if (!p) return;
      const r = rowOf(p.id);
      const mv = r.move && MOVE[r.move];
      const winP = res.winId === p.id;
      ctx.fillStyle = winP ? 'rgba(163,34,27,.95)' : 'rgba(239,232,216,.12)';
      ctx.strokeStyle = 'rgba(239,232,216,.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, cy - fs * 0.2, fs * 0.72, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f6f1e6';
      ctx.font = `${fs * 0.9}px ${FONT_JP}`;
      ctx.fillText(r.st === 'late' ? '止' : mv ? mv.jp : '無', x, cy - fs * 0.2);
      ctx.font = `900 ${fs * 0.38}px ${FONT_T}`;
      ctx.fillText(`${p.name} · ${r.st === 'late' ? '멈춤' : mv ? mv.ko : '—'}`, x, cy + fs * 0.85);
    };
    cell(me, W * 0.36); cell(other, W * 0.64);
    ctx.font = `${fs * 0.8}px ${FONT_JPB}`; ctx.fillStyle = 'rgba(239,232,216,.8)';
    ctx.fillText(draw ? '＝' : res.winId === (me && me.id) ? '▶' : '◀', W / 2, cy - fs * 0.2);
    const why = {
      light: '속공이 강공을 앞지른다', heavy: '강공이 방어를 부순다', guard: '방어가 속공을 받아친다',
      openHit: `${nameOf(res.loserId)}, 칼을 뽑지 못했다`, idle: '둘 다 칼을 뽑지 않았다',
      bothGuard: '서로 막았다', clash: '같은 기술, 칼끼리 맞부딪혔다', left: '상대가 떠났다',
    }[res.why] || '';
    ctx.font = `${fs * 0.62}px ${FONT_B}`; ctx.fillStyle = '#efe3c8';
    ctx.fillText(why, W / 2, cy + fs * 1.55);
    ctx.restore();
    // 勝 도장 — 이름 옆에
    const sealAt = capAt + 420;
    if (!draw && b > sealAt) {
      const se = easeOut((b - sealAt) / 170);
      if (!res.stamped) { res.stamped = true; this.S && this.S.clunk(); }
      ctx.save();
      ctx.font = `${fs * 1.9}px ${FONT_B}`;
      const nw = ctx.measureText(`${nameOf(res.winId)} 승`).width;
      const size = fs * 1.7;
      ctx.translate(W / 2 - fs * 0.6 + nw / 2 + size * 0.75, ty);
      ctx.scale(lerp(2.2, 1, se), lerp(2.2, 1, se));
      this.drawSeal('勝', 0, 0, size, 0.14, se);
      ctx.restore();
    }
  };

  West.SCHARS = SCHARS;
  West.MOVE = MOVE;
})(window);
