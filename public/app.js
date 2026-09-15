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

  const west = new window.West($('#scene'), S);
  window.__west = west;   // 콘솔에서 연출 확인용
  let G = null;      // 지금 하는 판
  let N = null;      // 서버 방 상태
  let overT = null;

  const view = v => { document.body.dataset.view = v; };
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms);
  }
  const myName = () => $('#nameIn').value.trim();

  /* ─────────────────────── 화면 ─────────────────────── */

  function toHome() {
    clearTimeout(overT);
    if (G && G.duel) G.duel.stop();
    G = null;
    S.wind(true);
    west.westHome();
    view('home');
  }

  /** players: [{id, name, bot}] — 자리 순서가 곧 캐릭터 */
  function enterGame({ kind, cfg, players, mine, foreId, duel }) {
    clearTimeout(overT);
    const cast = players.map((p, i) => ({ id: p.id, name: p.name, char: i % CHARS.length, me: kind !== 'pair' && mine.includes(p.id) }));
    G = { kind, cfg, players: cast, mine: new Set(mine), foreId, duel, r: 0, phase: 'intro', locked: new Set(), sigAt: 0, best: {} };
    west.startMatch({ players: cast, foreId, target: cfg.target });
    S.wind(true);
    view('game');
  }

  function onEv(ev) {
    if (!G) return;
    switch (ev.k) {
      case 'round':
        G.r = ev.r; G.phase = 'intro'; G.locked = new Set(); G.fighters = ev.fighters;
        west.round(ev);
        break;
      case 'wait':
        G.phase = 'wait';
        west.wait();
        break;
      case 'decoy':
        west.decoy(ev);
        if (ev.kind === 'crow' || ev.kind === 'caw') S.caw();
        if (ev.kind === 'clunk') S.clunk();
        break;
      case 'signal':
        G.phase = 'signal';
        G.sigAt = performance.now();
        west.signal({ ...ev, hide: G.cfg.signal === 'sound' });
        if (ev.kind === 'bell') S.bell(); else S.hit();
        break;
      case 'early':
        west.early(ev.id);
        break;
      case 'result':
        G.phase = 'result';
        for (const r of ev.rows) if (r.st === 'ok' && (!G.best[r.id] || r.ms < G.best[r.id])) G.best[r.id] = r.ms;
        west.result(ev);
        break;
      case 'over':
        G.phase = 'over';
        west.over(ev);
        clearTimeout(overT);
        overT = setTimeout(() => showOver(ev), 1200);
        break;
    }
  }

  function showOver(ev) {
    if (!G) return;
    const ids = [...G.players].sort((a, b) => (ev.scores[b.id] || 0) - (ev.scores[a.id] || 0) || (G.best[a.id] || 9e9) - (G.best[b.id] || 9e9));
    const w = G.players.find(p => p.id === ev.winnerId);
    $('#overTitle').textContent = w ? `${w.name} 승리` : '승자 없음';
    $('#overList').innerHTML = ids.map((p, i) => `
      <li class="${p.id === ev.winnerId ? 'win' : ''}" style="--i:${i}">
        <span class="rk">${i + 1}</span>
        <img src="/img/${CHARS[p.char].key}_bust.png" alt="">
        <span><b>${esc(p.name)}${p.me ? ' <small style="display:inline">나</small>' : ''}</b><small>${CHARS[p.char].ko} · ${G.best[p.id] ? '최고 ' + (G.best[p.id] / 1000).toFixed(3) + '초' : '기록 없음'}</small></span>
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

  /* ─────────────────────── 입력 — 마우스만 ─────────────────────── */

  function fire(pid) {
    if (!G || !G.mine.has(pid) || G.locked.has(pid)) return;
    if (G.fighters && !G.fighters.includes(pid)) return;
    if (G.phase === 'wait') {
      G.locked.add(pid);
      west.shoot(pid);
      west.early(pid);
      S.shot(false);
      send(pid, { r: G.r, early: true });
    } else if (G.phase === 'signal') {
      const ms = performance.now() - G.sigAt;
      G.locked.add(pid);
      west.shoot(pid);
      S.shot(false);
      send(pid, { r: G.r, ms: Math.round(ms) });
    }
  }

  function send(pid, a) {
    if (G.kind === 'net') wsSend({ t: 'shoot', ...a });
    else G.duel.input(pid, a);
  }

  $('#stage').addEventListener('pointerdown', e => {
    if (!G) return;
    e.preventDefault();
    S.unlock();
    if (G.kind === 'pair') fire(e.clientX < innerWidth / 2 ? G.players[0].id : G.players[1].id);
    else fire([...G.mine][0]);
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
      case 'chat': addChat(m); break;
      case 'ev': if (G && G.kind === 'net') onEv(m.ev); break;
      case 'err':
        if (m.fatal) { forget(); toHome(); }
        toast(m.msg);
        (document.body.dataset.view === 'lobby' ? $('#lobbyErr') : $('#homeErr')).textContent = m.msg;
        break;
      case 'left': forget(); toHome(); break;
    }
  }

  function onState(s) {
    const prev = N;
    N = s;
    if (s.phase === 'lobby') {
      if (G) { G = null; clearTimeout(overT); }
      west.board(s.players.map((p, i) => ({ id: p.id, name: p.name, char: i % CHARS.length, me: p.id === s.meId, host: p.id === s.hostId, bot: p.bot })));
      renderLobby();
      view('lobby');
      return;
    }
    const d = s.duel;
    if (!d) return;
    const fresh = !G || G.kind !== 'net' || (prev && prev.phase !== 'playing' && s.phase === 'playing');
    if (fresh) {
      enterGame({ kind: 'net', cfg: d.cfg, players: d.players, mine: [s.meId], foreId: s.meId, duel: null });
      if (d.r > 0) { G.phase = 'result'; G.r = d.r; }       // 판 도중에 붙었다 — 다음 라운드부터
      if (s.phase === 'over') showOver({ winnerId: s.winnerId, scores: d.scores });
    }
    if (s.phase === 'over' && document.body.dataset.view === 'over') renderOverButtons();
  }

  function renderLobby() {
    const s = N;
    const host = s.hostId === s.meId;
    $('#roomCode').textContent = s.code;
    document.querySelectorAll('#hostOpts select[data-cfg]').forEach(sel => { sel.value = String(s.cfg[sel.dataset.cfg]); });
    $('#hostOpts').hidden = !host;
    west.canAddBot = host && s.players.length < R.MAX_PLAYERS.west;
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
      if (s.players.length >= R.MAX_PLAYERS.west) return;
      title = '봇 앉히기';
      items = Object.entries(LV).map(([lv, ko]) => [`${ko}`, () => wsSend({ t: 'addBot', level: lv })]);
    } else {
      if (p.id === s.meId) return;
      title = p.name;
      items = [];
      if (!p.bot) items.push(['방장 넘기기', () => wsSend({ t: 'host', id: p.id })]);
      items.push([p.bot ? '봇 빼기' : '내보내기', () => wsSend({ t: 'kick', id: p.id })]);
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
    if (document.body.dataset.view !== 'lobby' || !N || N.hostId !== N.meId) return;
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

  $('#startGameBtn').addEventListener('click', () => { S.unlock(); west.select(); view('select'); });
  $('#scene').addEventListener('pointermove', e => { if (document.body.dataset.view === 'select') west.selectHover(e.clientX); });
  $('#backSelect').addEventListener('click', () => { if (N) { wsSend({ t: 'leave' }); forget(); } west.backToSelect(); view('select'); });
  $('#soonBack').addEventListener('click', () => { west.selectReset(); view('select'); });
  $('#scene').addEventListener('pointerleave', () => { if (document.body.dataset.view === 'select') west.selectHover(null); });
  $('#scene').addEventListener('click', e => {
    if (document.body.dataset.view !== 'select') return;
    S.unlock();
    west.selectPick(e.clientX, side => {
      if (side === 'west') { west.westHome(); view('home'); }
      else view('soon');
    });
  });
  $('#createBtn').addEventListener('click', () => {
    S.unlock(); local.set('duel.name', myName()); $('#homeErr').textContent = '';
    connect(() => wsSend({ t: 'create', name: myName(), mode: 'west' }));
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
  $('#pairBtn').addEventListener('click', () => startLocal('pair'));

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
