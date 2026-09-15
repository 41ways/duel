/**
 * 결투 — 소리. 총성 · 칼 휘두르기는 녹음 파일(sound/), 나머지는 WebAudio 로 합성한다.
 */
(function (root) {
  'use strict';
  let ctx = null, master = null, noiseBuf = null, windNode = null;
  let muted = false;
  try { muted = localStorage.getItem('duel.mute') === '1'; } catch (_) {}

  // 녹음 파일은 미리 받아 두고, 소리를 켤 수 있게 되면(첫 클릭) 푼다. 못 받으면 합성음으로
  const FILES = {
    shot: '/sound/shotsound.mp3', swing: '/sound/swing.mp3', swordout: '/sound/swordout.mp3', swordfight: '/sound/swordfight.mp3',
    samuraiready: '/sound/samuraiready.mp3', samuraistart: '/sound/samuraistart.mp3',
  };
  let music = null;
  const bufs = {}, raws = {};
  for (const k in FILES) {
    raws[k] = typeof fetch === 'function'
      ? fetch(FILES[k]).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
      : Promise.resolve(null);
  }
  function loadFiles() {
    for (const k in raws) {
      raws[k].then(raw => raw && ctx.decodeAudioData(raw.slice(0)))
        .then(buf => { if (buf) bufs[k] = buf; })
        .catch(() => {});
    }
  }

  function ac() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loadFiles();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function noise(t, dur, filterType, freq, q, peak, dec, dest) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, 0.002, peak, dec);
    src.connect(f); f.connect(g); g.connect(dest || master);
    src.start(t); src.stop(t + dur);
    return f;
  }
  function tone(t, type, f0, f1, peak, a, dec, dest) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
    const g = ctx.createGain(); env(g, t, a, peak, dec);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + a + dec + 0.05);
  }

  const S = {
    unlock() { ac(); },
    get muted() { return muted; },
    setMuted(v) {
      muted = !!v;
      try { localStorage.setItem('duel.mute', muted ? '1' : '0'); } catch (_) {}
      if (master) master.gain.value = muted ? 0 : 0.8;
    },

    shot(far) {
      if (!ac()) return; const t = ctx.currentTime;
      const k = far ? 0.45 : 1;
      if (bufs.shot) {
        // 여러 발이 겹칠 때 똑같이 들리지 않게 음높이를 조금씩 흔들고, 뒤따르는 총성은 멀고 먹먹하게
        const src = ctx.createBufferSource(); src.buffer = bufs.shot;
        src.playbackRate.value = (far ? 0.9 : 1) * (0.96 + Math.random() * 0.08);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = far ? 2200 : 16000;
        const g = ctx.createGain(); g.gain.value = 1.2 * k;
        src.connect(f); f.connect(g); g.connect(master);
        src.start(t, 0.05);   // 파일 앞 0.05초 빈 곳은 건너뛰어 화면 번쩍임과 맞춘다
        return;
      }
      noise(t, 0.6, 'lowpass', far ? 1800 : 4200, 0.7, 0.9 * k, far ? 0.5 : 0.35);
      tone(t, 'sine', 140, 45, 0.8 * k, 0.003, 0.25);
      // 협곡 메아리
      noise(t + 0.22, 0.6, 'lowpass', 900, 0.5, 0.18 * k, 0.5);
      noise(t + 0.48, 0.6, 'lowpass', 700, 0.5, 0.08 * k, 0.5);
    },
    /** 녹음 파일 한 번 — 없으면 fallback(합성음) */
    play(name, gain = 1, fallback) {
      if (!ac()) return null;
      if (!bufs[name]) { if (fallback) fallback(); return null; }
      const src = ctx.createBufferSource(); src.buffer = bufs[name];
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(g); g.connect(master);
      src.start(ctx.currentTime);
      return { src, g };
    },
    /** 깔리는 노래 — 새로 틀면 앞의 것은 끈다 */
    music(name, gain = 0.9) {
      S.stopMusic(0.15);
      music = S.play(name, gain);
    },
    stopMusic(fade = 0.4) {
      if (!music || !ctx) return;
      const m = music; music = null;
      m.g.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
      setTimeout(() => { try { m.src.stop(); } catch (_) {} }, fade * 1000 + 100);
    },
    // 칼 휘두르기 — 녹음 파일, 없으면 합성한 베기 소리
    swing() {
      if (!ac()) return;
      if (!bufs.swing) return S.slash();
      const src = ctx.createBufferSource(); src.buffer = bufs.swing;
      src.playbackRate.value = 0.97 + Math.random() * 0.06;
      const g = ctx.createGain(); g.gain.value = 1.3;
      src.connect(g); g.connect(master);
      src.start(ctx.currentTime);
    },
    click() { if (!ac()) return; const t = ctx.currentTime; noise(t, 0.05, 'highpass', 2500, 1, 0.3, 0.03); tone(t, 'square', 900, 600, 0.05, 0.001, 0.03); },
    misfire() {
      if (!ac()) return; const t = ctx.currentTime;
      noise(t, 0.3, 'bandpass', 1200, 1.5, 0.5, 0.18);
      tone(t, 'sine', 90, 40, 0.4, 0.002, 0.15);
    },
    bell() {
      if (!ac()) return; const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) for (const [m, a] of [[1, 0.5], [2.76, 0.25], [5.4, 0.12], [8.9, 0.06]]) tone(t + i * 0.18, 'sine', 1046 * m, 1046 * m, a * 0.6, 0.002, 1.1 - i * 0.3);
    },
    gong() {
      if (!ac()) return; const t = ctx.currentTime;
      for (const [m, a] of [[1, 0.6], [1.48, 0.3], [2.1, 0.2], [2.9, 0.12], [4.3, 0.08]]) tone(t, 'sine', 180 * m, 175 * m, a * 0.7, 0.004, 2.4);
      noise(t, 0.2, 'bandpass', 600, 1, 0.3, 0.12);
    },
    clunk() { if (!ac()) return; const t = ctx.currentTime; tone(t, 'triangle', 220, 110, 0.5, 0.002, 0.12); noise(t, 0.08, 'bandpass', 800, 2, 0.2, 0.05); },
    knock() { if (!ac()) return; const t = ctx.currentTime; for (const dt of [0, 0.14]) { tone(t + dt, 'triangle', 520, 380, 0.4, 0.001, 0.08); noise(t + dt, 0.06, 'bandpass', 1800, 3, 0.2, 0.04); } },
    caw() {
      if (!ac()) return; const t = ctx.currentTime;
      for (const dt of [0, 0.32]) {
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 3; f.connect(master);
        tone(t + dt, 'sawtooth', 760, 480, 0.35, 0.02, 0.2, f);
      }
    },
    chirp() { if (!ac()) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) tone(t + i * 0.09, 'sine', 3200, 4600, 0.12, 0.005, 0.06); },
    whoosh(dur = 0.5) {
      if (!ac()) return; const t = ctx.currentTime;
      const f = noise(t, dur + 0.1, 'bandpass', 500, 1.2, 0.35, dur);
      f.frequency.exponentialRampToValueAtTime(2400, t + dur);
    },
    slash() {
      if (!ac()) return; const t = ctx.currentTime;
      const f = noise(t, 0.3, 'bandpass', 1500, 2, 0.5, 0.2);
      f.frequency.exponentialRampToValueAtTime(5000, t + 0.15);
      for (const m of [2100, 3150, 4730]) tone(t + 0.02, 'sine', m, m, 0.06, 0.001, 0.4);
    },
    clash() {
      if (!ac()) return; const t = ctx.currentTime;
      for (const m of [1800, 2710, 3920, 5230]) tone(t, 'sine', m, m * 0.99, 0.18, 0.001, 0.7);
      noise(t, 0.2, 'highpass', 3000, 0.7, 0.4, 0.1);
    },
    hit() { if (!ac()) return; const t = ctx.currentTime; tone(t, 'sine', 120, 50, 0.6, 0.002, 0.3); noise(t, 0.15, 'lowpass', 600, 1, 0.4, 0.1); },
    sting(win) {
      if (!ac()) return; const t = ctx.currentTime;
      const notes = win ? [392, 494, 587, 784] : [392, 370, 349, 262];
      notes.forEach((n, i) => tone(t + i * 0.13, 'triangle', n, n, 0.18, 0.01, i === 3 ? 0.9 : 0.2));
    },
    thunder() {
      if (!ac()) return; const t = ctx.currentTime;
      noise(t, 0.15, 'highpass', 2000, 0.7, 0.7, 0.08);
      const f = noise(t + 0.03, 2.2, 'lowpass', 900, 0.8, 0.9, 1.8);
      f.frequency.exponentialRampToValueAtTime(120, t + 1.8);
      tone(t, 'sine', 70, 35, 0.5, 0.01, 1.2);
    },
    thud(k = 1) {
      if (!ac()) return; const t = ctx.currentTime;
      tone(t, 'sine', 95, 38, 0.7 * k, 0.004, 0.35);
      noise(t, 0.5, 'lowpass', 500, 0.8, 0.5 * k, 0.4);
    },
    clink() {
      if (!ac()) return; const t = ctx.currentTime;
      for (const [dt, m] of [[0, 1], [0.09, 0.8]]) { tone(t + dt, 'triangle', 1900 * m, 1700 * m, 0.1, 0.001, 0.15); noise(t + dt, 0.06, 'bandpass', 3000, 3, 0.12, 0.04); }
    },
    step(v = 0.4) {
      if (!ac()) return; const t = ctx.currentTime;
      noise(t, 0.12, 'bandpass', 700 + Math.random() * 300, 1.2, 0.25 * v, 0.08);
      if (Math.random() < 0.5) tone(t + 0.02, 'sine', 3400 + Math.random() * 400, 3000, 0.02 * v, 0.001, 0.12);   // 박차
    },
    // 먼지 너머 승자 — 휘파람 한 소절
    whistle() {
      if (!ac()) return; const t = ctx.currentTime;
      const notes = [[0, 880, 0.22], [0.26, 1318, 0.22], [0.52, 880, 0.22], [0.78, 1318, 0.5], [1.4, 1174, 0.9]];
      for (const [dt, f, d] of notes) {
        const o = ctx.createOscillator(); o.type = 'sine';
        const vib = ctx.createOscillator(); vib.frequency.value = 6;
        const vg = ctx.createGain(); vg.gain.value = f * 0.012;
        vib.connect(vg); vg.connect(o.frequency);
        o.frequency.setValueAtTime(f * 0.94, t + dt);
        o.frequency.exponentialRampToValueAtTime(f, t + dt + 0.06);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.13, t + dt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + d);
        o.connect(g); g.connect(master);
        o.start(t + dt); vib.start(t + dt); o.stop(t + dt + d + 0.05); vib.stop(t + dt + d + 0.05);
      }
    },
    // 판 사이 바람 — 조용히 깔린다
    wind(on) {
      if (!ac()) return;
      if (on && !windNode) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
        const g = ctx.createGain(); g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.5);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
        const lg = ctx.createGain(); lg.gain.value = 180;
        lfo.connect(lg); lg.connect(f.frequency); lfo.start();
        src.connect(f); f.connect(g); g.connect(master); src.start();
        windNode = { src, g, lfo };
      } else if (!on && windNode) {
        const w = windNode; windNode = null;
        w.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
        setTimeout(() => { try { w.src.stop(); w.lfo.stop(); } catch (_) {} }, 1500);
      }
    },
  };
  root.Sound = S;
})(window);
