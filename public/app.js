/**
 * 결투 — 화면 흐름 · 입력 · 연결.
 *  - 온라인은 서버(game.js)가 판을 쥐고, 봇이랑 연습 · 한 기기 둘이는 브라우저에서 duel.js 를 직접 돌린다.
 *    이벤트 모양이 같아서 onEv 하나로 연출(west.js)에 넘긴다.
 *  - 조작은 마우스(터치) 하나. 누른 시각은 신호를 받은 순간부터 잰다.
 */
(function () {
  'use strict';
  const R = window.DuelRules;
  const S = window.Sound;
  const $ = s => document.querySelector(s);
  const store = (area) => ({
    get(k) { try { return area().getItem(k); } catch (_) { return null; } },
    set(k, v) { try { v == null ? area().removeItem(k) : area().setItem(k, v); } catch (_) {} },
  });
  const local = store(() => localStorage), sess = store(() => sessionStorage);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHARS = window.West.CHARS;
  const SCHARS = window.West.SCHARS;

  const west = new window.West($('#scene'), S);
  window.__west = west;   // 콘솔에서 연출 확인용
  west.onWipe = c => wipeClip(c);
  let G = null;      // 지금 하는 판
  let N = null;      // 서버 방 상태
  let overT = null, moveT = null;

  // 서부(west) · 사무라이(samurai) — 화면 글자 · 서체 · 캔버스 연출이 통째로 바뀐다
  let mode = 'west';
  let lastRooms = null;
  function setMode(m) {
    const was = mode;
    mode = m === 'samurai' ? 'samurai' : 'west';
    if (was !== mode && lastRooms) renderRooms(lastRooms);
    document.body.dataset.mode = mode;
    west.mode = mode;
    if (west.samPetalSprites) west.samPetalSprites();   // 벚꽃잎 전환에 쓸 그림을 미리
    const sig = document.querySelector('#hostOpts select[data-cfg="signal"] option[value="mix"]');
    if (sig) sig.textContent = mode === 'samurai' ? '화면에 "斬"' : '화면에 "지금!"';
  }
  setMode('west');

  // 화면 전환. 캔버스가 회전초로 닦는 중이면 DOM 창도 회전초 뒤에서 바뀌게 한다
  const VIEW_EL = { title: 'title', home: 'home', lobby: 'lobby', over: 'over' };
  let leavingEl = null;
  const view = v => {
    const prev = document.body.dataset.view;
    document.body.dataset.view = v;
    const w = window.__west;
    if (w && w.wipe && performance.now() - w.wipe.at < 150 && prev !== v) {
      if (leavingEl) { leavingEl.style.clipPath = ''; leavingEl.style.opacity = ''; leavingEl.classList.remove('leaving'); }   // 닦기 도중에 또 바뀌어도 잘린 자국이 남지 않게
      leavingEl = VIEW_EL[prev] ? document.getElementById(VIEW_EL[prev]) : null;
      if (leavingEl) leavingEl.classList.add('leaving');
      wipeClip(w.wipe.kind === 'fade' ? { fade: 0 } : { oldRight: innerWidth, newLeft: innerWidth });
    }
  };
  function wipeClip(c) {
    const cur = VIEW_EL[document.body.dataset.view] ? document.getElementById(VIEW_EL[document.body.dataset.view]) : null;
    if (!c) {
      for (const id of Object.values(VIEW_EL)) { const el = document.getElementById(id); if (el) { el.style.clipPath = ''; el.style.opacity = ''; } }
      if (leavingEl) { leavingEl.style.clipPath = ''; leavingEl.style.opacity = ''; leavingEl.classList.remove('leaving'); leavingEl = null; }
      return;
    }
    if (c.fade != null) {
      if (cur) cur.style.opacity = c.fade;
      if (leavingEl) leavingEl.style.opacity = 1 - c.fade;
      return;
    }
    if (cur) cur.style.clipPath = `inset(0 0 0 ${Math.max(0, c.newLeft)}px)`;
    if (leavingEl) leavingEl.style.clipPath = `inset(0 ${Math.max(0, innerWidth - c.oldRight)}px 0 0)`;
  }
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms);
  }
  const myName = () => $('#nameIn').value.trim();

  /* ─────────────────────── 화면 ─────────────────────── */

  function toHome() {
    clearTimeout(overT);
    if (G && G.duel) G.duel.stop();
    if (G) clearTimeout(G.samT);
    G = null;
    S.stopMusic();
    S.wind(true);
    west.westHome();
    view('home');
    watchRooms();
  }

  /** players: [{id, name, bot}] — 자리 순서가 곧 캐릭터 */
  function enterGame({ kind, cfg, players, mine, foreId, duel }) {
    clearTimeout(overT);
    const cast = players.map((p, i) => ({ id: p.id, name: p.name, char: i % CHARS.length, me: kind !== 'pair' && mine.includes(p.id) }));
    G = { kind, cfg, players: cast, mine: new Set(mine), foreId, duel, r: 0, phase: 'intro', locked: new Set(), sigAt: 0, best: {} };
    setMode(cfg.mode);
    west.startMatch({ players: cast, foreId, target: cfg.target });
    document.body.classList.toggle('pair', kind === 'pair');
    resetMoves();
    S.wind(true);
    view('game');
  }

  function onEv(ev) {
    if (!G) return;
    switch (ev.k) {
      case 'round':
        G.r = ev.r; G.phase = 'intro'; G.locked = new Set(); G.fighters = ev.fighters;
        clearTimeout(G.samT);
        west.round(ev);
        resetMoves();
        break;
      case 'wait':
        G.phase = 'wait';
        west.wait();
        // 사무라이 — 발도술 자세를 잡고 어두워지며 노래, 고르기는 signal 에서 열린다
        if (G.cfg.mode === 'samurai') S.music('samuraiready', 0.85);
        else document.body.classList.add('live');
        break;
      case 'decoy':
        west.decoy(ev);
        if (ev.kind === 'crow' || ev.kind === 'caw') S.caw();
        if (ev.kind === 'clunk') S.clunk();
        if (ev.kind === 'bird' || ev.kind === 'chirp') S.chirp();
        if (ev.kind === 'knock') S.knock();
        break;
      case 'signal':
        G.phase = 'signal';
        G.sigAt = performance.now();
        west.signal({ ...ev, hide: G.cfg.signal === 'sound' });
        if (G.cfg.mode === 'samurai') {
          // Y자 고르기 — 5초 모래시계를 처음부터
          const box = $('#moves');
          box.classList.remove('timing'); void box.offsetWidth; box.classList.add('timing');
          document.body.classList.add('live');
          clearTimeout(moveT);
          moveT = setTimeout(() => box.classList.add('locked'), R.LIMIT.samurai);   // 시간이 다 되면 칸을 닫는다
          break;
        }
        if (ev.kind === 'bell') S.bell(); else if (ev.kind === 'gong') S.gong(); else S.hit();
        break;
      case 'early':
        west.early(ev.id);
        break;
      case 'result':
        G.phase = 'result';
        setTimeout(() => document.body.classList.remove('live'), 500);
        for (const r of ev.rows) if (r.st === 'ok' && (!G.best[r.id] || r.ms < G.best[r.id])) G.best[r.id] = r.ms;
        west.result(ev);
        if (G.cfg.mode === 'samurai') {
          // 둘 다 골랐다 — 시작 소리, 스쳐 지나가는 순간에 벰(승부) · 칼 부딪힘(비김)
          S.stopMusic(0.25);
          S.play('samuraistart', 1);
          const g = G;
          g.samT = setTimeout(() => { if (G === g) S.play(ev.win.length ? 'swing' : 'swordfight', 1.3, () => (ev.win.length ? S.slash() : S.clash())); }, SAM_CLASH_MS);
        }
        break;
      case 'over':
        G.phase = 'over';
        if (gameAt && N && N.hostId === N.meId && window.norara) {
          norara.ev('end', { n: N.players.filter(p => !p.bot).length, sec: Math.round((Date.now() - gameAt) / 1000) });
          gameAt = 0;
        }
        S.stopMusic(0.3);                                   // 판정 없이 끝나도(상대가 나감) 노래는 멎는다
        document.body.classList.remove('live');
        clearTimeout(moveT);
        west.over(ev);
        clearTimeout(overT);
        overT = setTimeout(() => showOver(ev), 400);
        break;
    }
  }

  function showOver(ev) {
    if (!G) return;
    const ids = [...G.players].sort((a, b) => (ev.scores[b.id] || 0) - (ev.scores[a.id] || 0) || (G.best[a.id] || 9e9) - (G.best[b.id] || 9e9));
    const w = G.players.find(p => p.id === ev.winnerId);
    $('#overTitle').textContent = w ? `${w.name} 승리` : '승자 없음';
    const sam = G.cfg.mode === 'samurai';
    $('#overList').innerHTML = ids.map((p, i) => `
      <li class="${p.id === ev.winnerId ? 'win' : ''}" style="--i:${i}">
        <span class="rk">${i + 1}</span>
        ${sam ? `<span class="mon">${SCHARS[p.char % 4].jp[0]}</span>` : `<img src="/img/${CHARS[p.char].key}_bust.png" alt="">`}
        <span><b>${esc(p.name)}${p.me ? ' <small style="display:inline">나</small>' : ''}</b><small>${(sam ? SCHARS[p.char % 4] : CHARS[p.char]).ko}${sam ? '' : ' · ' + (G.best[p.id] ? '최고 ' + (G.best[p.id] / 1000).toFixed(3) + '초' : '기록 없음')}</small></span>
        <strong>${ev.scores[p.id] || 0}<em>승</em></strong>
      </li>`).join('');
    renderOverButtons();
    view('over');
  }

  function renderOverButtons() {
    const net = G && G.kind === 'net';
    const host = net && N && N.hostId === N.meId;
    $('#againBtn').hidden = net && !host;
    $('#lobbyBtn').hidden = !host;
    $('#overWait').textContent = net && !host ? '방장이 다음 판을 고르는 중…' : '';
  }

  /* ─────────────────────── 입력 ─────────────────────── */

  // 한 기기에서 같이 할 때 자리별 키. 혼자면 마우스(아무 데나 클릭)
  const KEYSETS = { 2: ['Space', 'Enter'], 3: ['KeyA', 'Space', 'Enter'], 4: ['KeyA', 'Space', 'Enter', 'Mouse'] };
  const KEY_LABEL = { Space: 'SPACE', Enter: 'ENTER', KeyA: 'A', Mouse: '좌클릭', ASD: 'A W D', ARW: '← ↑ →' };
  // 사무라이 — Y자: 왼쪽 속공 · 위 강공 · 오른쪽 방어. 왼쪽 자리 A W D, 오른쪽 자리 화살표(혼자면 둘 다)
  const SAM_KEYS = {
    KeyA: ['ASD', 'light'], KeyW: ['ASD', 'heavy'], KeyD: ['ASD', 'guard'],
    ArrowLeft: ['ARW', 'light'], ArrowUp: ['ARW', 'heavy'], ArrowRight: ['ARW', 'guard'],
  };
  const SAM_CLASH_MS = 1450;   // samuraistart 소리(1.56초)가 끝나 갈 즈음 스쳐 지나간다 — samurai.js 와 맞춘다
  /** 이 기기에서 조작하는 자리들(나 먼저, 들어온 순서) → [{id, key}] */
  function mySeats(players, meId, m = mode) {
    const seats = players.filter(p => p.id === meId || (p.local && p.owner === meId));
    if (m === 'samurai') return seats.map((p, i) => ({ id: p.id, key: i ? 'ARW' : 'ASD' }));
    const keys = KEYSETS[seats.length];
    return seats.map((p, i) => ({ id: p.id, key: keys ? keys[i] : 'Mouse' }));
  }

  function fire(pid, move) {
    if (!G || !G.mine.has(pid) || G.locked.has(pid)) return;
    if (G.fighters && !G.fighters.includes(pid)) return;
    const sam = G.cfg.mode === 'samurai';
    if (sam && (!move || G.phase !== 'signal')) return;   // 사무라이는 고르기가 열렸을 때만
    if (sam && performance.now() - G.sigAt > R.LIMIT.samurai) return;   // 모래시계가 끝난 뒤는 안 받는다
    const sound = () => (sam ? S.play('swordout', 0.9, () => S.swing()) : S.shot(false));   // 사무라이는 칼 뽑는 소리, 서부는 총성
    if (G.phase === 'wait') {
      G.locked.add(pid);
      west.shoot(pid, move);
      west.early(pid);
      sound();
      markMove(pid, move);
      send(pid, { r: G.r, early: true });
    } else if (G.phase === 'signal') {
      const ms = performance.now() - G.sigAt;
      G.locked.add(pid);
      west.shoot(pid, move);
      sound();
      markMove(pid, move);
      send(pid, { r: G.r, ms: Math.round(ms), move });
    }
  }

  // 기술 단추 — 고르면 세 칸 모두 흐려진다(혼자일 때만 누를 수 있다)
  function resetMoves() {
    clearTimeout(moveT);
    document.body.classList.remove('live');
    const box = $('#moves');
    box.classList.remove('locked', 'timing');
    const two = !!(G && G.keys);
    document.body.classList.toggle('seats', two);
    const K = { light: ['A', '←'], heavy: ['W', '↑'], guard: ['D', '→'] };
    box.querySelectorAll('kbd[data-k]').forEach(k => { k.textContent = two ? K[k.dataset.k].join('·') : K[k.dataset.k][0]; });
  }
  function markMove(pid, move) {
    if (!move || (G.keys && pid !== G.foreId)) return;
    $('#moves').classList.add('locked');   // 무엇을 골랐는지는 표시하지 않는다
  }
  $('#moves').addEventListener('pointerdown', e => {
    const b = e.target.closest('.mv');
    if (!b || !G || G.keys) return;
    e.preventDefault();
    S.unlock();
    fire([...G.mine][0], b.dataset.move);
  });

  function send(pid, a) {
    if (G.kind === 'net') wsSend({ t: 'shoot', pid, ...a });
    else G.duel.input(pid, a);
  }

  $('#stage').addEventListener('pointerdown', e => {
    if (!G) return;
    e.preventDefault();
    S.unlock();
    if (G.cfg.mode === 'samurai') return;   // 사무라이는 기술 단추 · 키로만
    if (G.keys) { if (e.button === 0 && G.keys.has('Mouse')) fire(G.keys.get('Mouse')); return; }
    fire([...G.mine][0]);
  });
  addEventListener('keydown', e => {
    if (!G || document.body.dataset.view !== 'game' || e.repeat) return;
    if (G.cfg.mode === 'samurai') {
      const hit = SAM_KEYS[e.code];
      if (!hit) return;
      const pid = G.keys ? G.keys.get(hit[0]) : [...G.mine][0];
      if (pid == null) return;
      e.preventDefault();
      S.unlock();
      fire(pid, hit[1]);
      return;
    }
    if (!G.keys) return;
    const pid = G.keys.get(e.code);
    if (pid == null) return;
    e.preventDefault();
    S.unlock();
    fire(pid);
  });
  $('#stage').addEventListener('contextmenu', e => e.preventDefault());

  /* ─────────────────────── 이 기기에서 ─────────────────────── */

  const BOT_NAMES = ['빌리', '장고', '애니'];

  function startLocal(kind) {
    S.unlock();
    const cfg = R.normCfg({ mode: 'west', target: 1 });
    let players, mine;
    if (kind === 'solo') {
      players = [{ id: 1, name: myName() || '나' }, { id: 2, name: BOT_NAMES[0], bot: true, level: 'normal' }];
      mine = [1];
    } else {
      players = [{ id: 1, name: '왼쪽' }, { id: 2, name: '오른쪽' }];
      mine = [1, 2];
    }
    const duel = new R.Duel(cfg, players, { emit: ev => { if (G && G.duel === duel) onEv(ev); } });
    enterGame({ kind, cfg, players, mine, foreId: 1, duel });
    G.again = () => startLocal(kind);
    duel.start();
  }

  /* ─────────────────────── 연결 ─────────────────────── */

  let ws = null, pingT = null, want = false;

  function connect(onOpen) {
    if (ws && ws.readyState === 1) return onOpen();
    if (ws && ws.readyState === 0) return ws._q.push(onOpen);
    const sock = ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    sock._q = [onOpen];
    sock.onopen = () => { clearInterval(pingT); pingT = setInterval(() => wsSend({ t: 'ping' }), 25_000); sock._q.splice(0).forEach(f => f()); };
    sock.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onMsg(m); };
    sock.onclose = e => {
      if (ws !== sock) return;
      clearInterval(pingT); ws = null;
      if (e.code === 4001) { want = false; toast('다른 탭에서 이 자리를 이어받았어요.'); return; }
      if (e.code === 4000) { toast('오래 가만히 있어서 연결을 쉬어요. 누르면 다시 붙어요.', 5000); addEventListener('pointerdown', () => want && resume(), { once: true }); return; }
      if (want) setTimeout(resume, 1200);
    };
  }
  function wsSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function resume() {
    const code = sess.get('duel.code'), token = sess.get('duel.token');
    if (!code || !token) return;
    want = true;
    connect(() => wsSend({ t: 'resume', code, token }));
  }
  function forget() {
    want = false; N = null;
    sess.set('duel.code', null); sess.set('duel.token', null);
    history.replaceState(null, '', location.pathname);
  }

  function onMsg(m) {
    switch (m.t) {
      case 'joined':
        $('#chatLog').innerHTML = '';
        sess.set('duel.code', m.code); sess.set('duel.token', m.token);
        want = true;
        history.replaceState(null, '', `?room=${m.code}`);
        break;
      case 'state': onState(m); break;
      case 'rooms': renderRooms(m); break;
      case 'chat': addChat(m); break;
      case 'ev': if (G && G.kind === 'net') onEv(m.ev); break;
      case 'err':
        if (m.fatal) { forget(); toHome(); }
        toast(m.msg);
        (document.body.dataset.view === 'lobby' ? $('#lobbyErr') : $('#homeErr')).textContent = m.msg;
        break;
      case 'left': if (document.body.dataset.view === 'home') wsSend({ t: 'rooms' }); else { forget(); toHome(); } break;
    }
  }

  let gameAt = 0;                 // 이 판이 언제 시작했는지 (방장 화면에서만 쓴다)

  function onState(s) {
    const prev = N;
    N = s;
    setMode(s.cfg.mode);
    if (s.phase === 'lobby') {
      if (G) { clearTimeout(G.samT); G = null; clearTimeout(overT); S.stopMusic(); }
      const seats = mySeats(s.players, s.meId);
      const keyOf = new Map(seats.length > 1 ? seats.map(x => [x.id, KEY_LABEL[x.key]]) : []);
      west.board(s.players.map((p, i) => ({ id: p.id, name: p.name, char: i % CHARS.length, me: p.id === s.meId, host: p.id === s.hostId, bot: p.bot, key: keyOf.get(p.id) || null })));
      renderLobby();
      view('lobby');
      return;
    }
    const d = s.duel;
    if (!d) return;
    const fresh = !G || G.kind !== 'net' || (prev && prev.phase !== 'playing' && s.phase === 'playing');
    // 판 수 세기 — 방장 화면에서만. 사람마다 보내면 한 판이 인원수만큼 세어진다.
    if (prev && prev.phase !== 'playing' && s.phase === 'playing' && s.hostId === s.meId && window.norara) {
      gameAt = Date.now();
      norara.ev('start', { n: s.players.filter(p => !p.bot).length });
    }
    if (fresh) {
      const seats = mySeats(s.players, s.meId);
      enterGame({ kind: 'net', cfg: d.cfg, players: d.players, mine: seats.map(x => x.id), foreId: s.meId, duel: null });
      G.keys = seats.length > 1 ? new Map(seats.map(x => [x.key, x.id])) : null;
      resetMoves();                                         // 자리가 정해진 뒤라야 키 안내가 맞는다
      if (d.r > 0) { G.phase = 'result'; G.r = d.r; west.resumeView({ r: d.r, scores: d.scores, alive: d.alive }); }   // 판 도중에 붙었다 — 다음 라운드부터
      if (s.phase === 'over') showOver({ winnerId: s.winnerId, scores: d.scores });
    }
    if (s.phase === 'over' && document.body.dataset.view === 'over') renderOverButtons();
  }

  function renderLobby() {
    const s = N;
    const host = s.hostId === s.meId;
    $('#roomCode').textContent = s.code;
    document.querySelectorAll('#hostOpts select[data-cfg]').forEach(sel => { sel.value = String(s.cfg[sel.dataset.cfg]); sel.disabled = !host; });
    $('#rulesNote').textContent = host ? '' : '방장이 규칙을 정하고 있어요.';
    west.canAddBot = host && s.players.length < R.MAX_PLAYERS[mode];
    if (!host) closeSlotMenu();
    $('#startBtn').disabled = !host;
    $('#startBtn').textContent = host ? '결투 시작' : '방장을 기다리는 중';
    $('#lobbyErr').textContent = '';
  }

  // 대기방 — 빈 자리를 누르면 봇 앉히기, 다른 사람 수배서를 누르면 방장 넘기기 · 내보내기 (방장만)
  const LV = { easy: '쉬움', normal: '보통', hard: '어려움' };
  function openSlotMenu(hit) {
    const s = N, menu = $('#slotMenu');
    const p = hit.id != null ? s.players.find(x => x.id === hit.id) : null;
    let title, items;
    if (!p) {
      if (s.hostId !== s.meId || s.players.length >= R.MAX_PLAYERS[mode]) return;
      // 사무라이는 가위바위보라 봇 실력 차이가 없다 — 바로 앉힌다
      if (mode === 'samurai') { wsSend({ t: 'addBot', level: 'normal' }); return; }
      title = '봇 앉히기';
      items = Object.entries(LV).map(([lv, ko]) => [`${ko}`, () => wsSend({ t: 'addBot', level: lv })]);
    } else {
      if (p.id === s.meId) return;
      title = p.name;
      items = [];
      if (p.local) {
        if (p.owner !== s.meId && s.hostId !== s.meId) return;
        items.push(['자리 빼기', () => wsSend({ t: 'removeLocal', id: p.id })]);
        $('#smTitle').textContent = title;
      }
      if (!p.local) {
        if (s.hostId !== s.meId) return;
        if (!p.bot) items.push(['방장 넘기기', () => wsSend({ t: 'host', id: p.id })]);
        items.push([p.bot ? '봇 빼기' : '내보내기', () => wsSend({ t: 'kick', id: p.id })]);
      }
    }
    $('#smTitle').textContent = title;
    $('#smBody').innerHTML = '';
    for (const [label, fn] of items) {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = label;
      b.addEventListener('click', () => { S.unlock(); fn(); closeSlotMenu(); });
      $('#smBody').appendChild(b);
    }
    const r = hit.rect;
    menu.style.left = `${r.x + r.w * 0.08}px`;
    menu.style.width = `${r.w * 0.84}px`;
    menu.style.top = `${r.y + r.h * (p ? 0.55 : 0.62)}px`;
    menu.classList.remove('open'); void menu.offsetWidth; menu.classList.add('open');
    menu.dataset.slot = hit.slot;
  }
  function closeSlotMenu() { $('#slotMenu').classList.remove('open'); }
  $('#scene').addEventListener('click', e => {
    if (document.body.dataset.view !== 'lobby' || !N) return;
    const hit = west.slotAt(e.clientX, e.clientY);
    const menu = $('#slotMenu');
    if (!hit) return closeSlotMenu();
    if (menu.classList.contains('open') && menu.dataset.slot === String(hit.slot)) return closeSlotMenu();
    S.unlock();
    openSlotMenu(hit);
  });
  $('#scene').addEventListener('pointermove', e => {
    if (document.body.dataset.view !== 'lobby') return;
    const hit = N && N.hostId === N.meId ? west.slotAt(e.clientX, e.clientY) : null;
    west.slotHover = hit && hit.id == null ? hit.slot : null;
    $('#scene').style.cursor = hit && (hit.id == null || hit.id !== N.meId) ? 'pointer' : '';
  });

  // 열린 방 — 처음 화면에 있는 동안 서버가 바뀔 때마다 보내 준다
  function watchRooms() {
    // 방에 붙어 있는 채로 처음 화면에 왔다면(새로고침 뒤 자동 복귀 등) 먼저 나와야 목록을 받는다
    connect(() => { if (N) { wsSend({ t: 'leave' }); forget(); } wsSend({ t: 'rooms' }); });
  }
  function renderRooms(m) {
    lastRooms = m;
    $('#online').textContent = `지금 ${m.online}명 접속`;
    const list = m.list.filter(r => (r.mode || 'west') === mode);
    $('#roomEmpty').hidden = list.length > 0;
    if (mode === 'samurai') {
      // 대나무 장대에 매달린 나무패 — 빈 패로 줄을 채운다
      const ul = $('#roomList');
      // 큼직한 패 118px · 틈 26px 한 줄(방이 넘치면 줄이 늘어난다) (style.css 와 맞춘다)
      const cols = Math.max(1, Math.floor((ul.clientWidth - 28 - 14 + 26) / (118 + 26)));
      const fitRows = 1;
      const rows = Math.max(1, Math.ceil(list.length / cols));
      // 남는 높이만큼 패를 아래로 늘인다(너무 길어지지는 않게)
      ul.style.setProperty('--tagH', `${Math.round(Math.max(260, Math.min(440, (ul.clientHeight - 36 - (rows - 1) * 44) / rows)))}px`);
      const blanks = Math.max(0, Math.max(fitRows, Math.ceil(list.length / cols)) * cols - list.length);
      ul.innerHTML = list.map((r, i) => `
        <li data-code="${r.code}" class="tag-li ${r.phase === 'lobby' ? '' : 'playing'}" style="--i:${i}" title="${esc(r.host)}의 방 · ${r.n}/${r.max} · ${r.target === 1 ? '단판' : r.target + '선승'}">
          <div class="tag"><span class="tg-mon">${r.phase === 'lobby' ? '待' : '戦'}</span><b>${esc(r.host)}</b><small>${r.n}/${r.max}</small></div>
        </li>`).join('') + Array.from({ length: blanks }, (_, i) => `<li class="tag-li blank" style="--i:${list.length + i}"><div class="tag"></div></li>`).join('');
      return;
    }
    $('#roomList').innerHTML = list.map(r => `
      <li data-code="${r.code}" class="${r.phase === 'lobby' ? '' : 'playing'}">
        <b>${esc(r.host)}의 방</b><span class="n">${r.n}/${r.max}</span>
        <small>${r.phase === 'lobby' ? (r.n >= r.max ? '꽉 참' : '기다리는 중 · 눌러서 들어가기') : '결투 중'} · ${r.target === 1 ? '단판' : r.target + '선승'}</small>
      </li>`).join('');
  }
  addEventListener('resize', () => { if (mode === 'samurai' && lastRooms && document.body.dataset.view === 'home') renderRooms(lastRooms); });
  $('#roomList').addEventListener('click', e => {
    const li = e.target.closest('li[data-code]');
    if (!li || li.classList.contains('playing')) return;
    S.unlock();
    local.set('duel.name', myName());
    connect(() => wsSend({ t: 'join', code: li.dataset.code, name: myName() }));
  });

  // 채팅
  function addChat(m) {
    const li = document.createElement('li');
    if (m.sys) { li.className = 'sys'; li.textContent = m.text; }
    else {
      const b = document.createElement('b'); b.textContent = m.name;
      const sp = document.createElement('span'); sp.textContent = m.text;
      li.append(b, sp);
      if (N && m.from === N.meId) li.className = 'me';
    }
    const log = $('#chatLog');
    log.appendChild(li);
    while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  $('#chatForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#chatIn').value.trim();
    if (!text) return;
    wsSend({ t: 'chat', text });
    $('#chatIn').value = '';
  });

  /* ─────────────────────── 단추 ─────────────────────── */

  $('#nameIn').value = local.get('duel.name') || '';
  $('#nameIn').addEventListener('change', () => local.set('duel.name', myName()));

  // 게임 시작 — 칼 휘두르는 소리와 총성을 함께. 누르기 시작할 때 소리를 깨워 녹음 파일이 준비되게
  $('#startGameBtn').addEventListener('pointerdown', () => S.unlock());
  $('#startGameBtn').addEventListener('click', () => { S.unlock(); S.swing(); S.shot(false); west.select(); view('select'); });
  $('#scene').addEventListener('pointermove', e => { if (document.body.dataset.view === 'select') west.selectHover(e.clientX); });
  $('#backSelect').addEventListener('click', () => { if (N) { wsSend({ t: 'leave' }); forget(); } west.backToSelect(); view('select'); });
  $('#scene').addEventListener('pointerleave', () => { if (document.body.dataset.view === 'select') west.selectHover(null); });
  $('#scene').addEventListener('click', e => {
    if (document.body.dataset.view !== 'select') return;
    S.unlock();
    west.selectPick(e.clientX, side => {
      setMode(side);
      west.westHome(); view('home'); watchRooms();
    });
  });
  $('#createBtn').addEventListener('click', () => {
    S.unlock(); local.set('duel.name', myName()); $('#homeErr').textContent = '';
    connect(() => wsSend({ t: 'create', name: myName(), mode }));
  });
  const join = () => {
    S.unlock();
    const code = $('#codeIn').value.trim().toUpperCase();
    if (code.length !== 4) { $('#homeErr').textContent = '방 코드 네 글자를 넣어 주세요.'; return; }
    local.set('duel.name', myName()); $('#homeErr').textContent = '';
    connect(() => wsSend({ t: 'join', code, name: myName() }));
  };
  $('#joinBtn').addEventListener('click', join);
  $('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

  $('#helpBtn').addEventListener('click', e => {
    e.stopPropagation();
    const open = $('#helpBox').hidden;
    $('#helpBox').hidden = !open;
    $('#helpBtn').setAttribute('aria-expanded', String(open));
  });
  addEventListener('pointerdown', e => {
    if (!$('#helpBox').hidden && !e.target.closest('.together')) { $('#helpBox').hidden = true; $('#helpBtn').setAttribute('aria-expanded', 'false'); }
  });

  // 방 만들기 화면 — 수배서 종이가 살짝 펄럭인다
  (function flutter(t) {
    requestAnimationFrame(flutter);
    if (document.body.dataset.view !== 'home') return;
    const sheet = document.querySelector('#home .sheet');
    if (!sheet) return;
    const f1 = Math.sin(t / 900), f2 = Math.sin(t / 1370 + 1.3);
    sheet.style.rotate = `${(f1 * 0.12).toFixed(3)} ${(f2 * 0.2).toFixed(3)} ${(f1 * 0.05).toFixed(3)} ${(4 + Math.abs(f1) * 1.5).toFixed(2)}deg`;
  })(0);

  $('#addLocalBtn').addEventListener('click', () => { S.unlock(); wsSend({ t: 'addLocal' }); });
  $('#copyBtn').addEventListener('click', async () => {
    const url = `${location.origin}/?room=${N.code}`;
    try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요.'); } catch (_) { toast(url, 5000); }
  });
  document.querySelectorAll('#hostOpts select[data-cfg]').forEach(sel => sel.addEventListener('change', () => {
    const k = sel.dataset.cfg;
    const v = k === 'target' ? Number(sel.value) : k === 'decoys' ? sel.value === 'true' : sel.value;
    wsSend({ t: 'cfg', cfg: { [sel.dataset.cfg]: v } });
  }));
  $('#startBtn').addEventListener('click', () => { S.unlock(); wsSend({ t: 'start' }); });
  $('#leaveBtn').addEventListener('click', quit);

  $('#againBtn').addEventListener('click', () => {
    S.unlock();
    if (!G) return;
    if (G.kind === 'net') wsSend({ t: 'again', now: true }); else G.again();
  });
  $('#lobbyBtn').addEventListener('click', () => wsSend({ t: 'again' }));
  $('#homeBtn').addEventListener('click', quit);
  $('#quitBtn').addEventListener('click', quit);
  function quit() {
    if (N) { wsSend({ t: 'leave' }); forget(); }
    toHome();
  }

  const muteIcon = () => { $('#muteBtn').textContent = S.muted ? '🔇' : '🔊'; };
  $('#muteBtn').addEventListener('click', () => { S.setMuted(!S.muted); muteIcon(); });
  muteIcon();

  /* ─────────────────────── 시작 ─────────────────────── */

  west.btnRect = () => $('#startGameBtn').getBoundingClientRect();
  west.wallRect = () => $('#wall').getBoundingClientRect();
  // 수배서 구멍의 '최종' 자리 — 미끄러져 들어오는 중에도 사람은 제자리에 서 있어야 해서 transform 을 뺀 offset 으로 잰다
  west.faceRect = () => {
    const hole = $('#faceHole'), sheet = hole.parentElement;
    if (document.body.dataset.view !== 'home' || !hole.offsetWidth) return null;
    const r = { x: sheet.offsetLeft + sheet.clientLeft + hole.offsetLeft, y: sheet.offsetTop + sheet.clientTop + hole.offsetTop - $('#home').scrollTop, w: hole.offsetWidth, h: hole.offsetHeight };
    // 좁은 창에서 화면을 굴리면 구멍이 밖으로 나간다 — 그때는 사람을 구멍에 맞추지 않고 그냥 세운다
    if (r.h < 20 || r.y + r.h < 0 || r.y > innerHeight) return null;
    return r;
  };
  // 화면을 굴리거나 창 크기가 바뀌면 얼굴 칸 자리를 다시 잰다(캔버스 쪽 캐시를 지운다)
  const faceMoved = () => { west._frAt = 0; };
  $('#home').addEventListener('scroll', faceMoved, { passive: true });
  addEventListener('resize', faceMoved);

  $('#startGameBtn').addEventListener('pointerenter', () => west.titleHover(true));
  $('#startGameBtn').addEventListener('pointerleave', () => west.titleHover(false));
  west.title();
  view('title');
  // 로고가 찍히고 나서 단추. 연출 도중에 누르면 건너뛴다
  const titleT = setInterval(() => { if (west.titleDone) { document.body.classList.add('ready'); clearInterval(titleT); } }, 100);
  $('#title').addEventListener('pointerdown', e => { if (e.target.id !== 'startGameBtn') { S.unlock(); west.skipTitle(); } });
  const q = new URLSearchParams(location.search).get('room');
  // 초대 링크로 오면 시작 연출 뒤 바로 처음 화면(방 코드 칸)으로
  if (sess.get('duel.code') && sess.get('duel.token')) resume();
  else if (q) { $('#codeIn').value = q.toUpperCase().slice(0, 4); }
})();
