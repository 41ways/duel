'use strict';
/**
 * 플레이 시뮬레이션 — 방 여러 개를 한꺼번에 굴리며 사람처럼 논다.
 *   node test/sim.js [ws주소] [방 개수]
 *   SIM_MODE=samurai node test/sim.js        # 한 종류만
 * 신호를 받으면 0.2~0.9초 뒤에 누르고, 넷 중 하나는 그냥 멈춘다.
 * 봇 · 같은 기기 자리 · 방장 넘기기 · 판 중 끊김 · 다시 붙기를 섞어 돌린다.
 * 지켜야 하는 것(정원, 방장은 사람) 이 깨지거나 판이 안 끝나면 문제로 적는다.
 */
const WebSocket = require('ws');
const URL = process.argv[2] || 'ws://localhost:8850/ws';
const R = (a, b) => a + Math.random() * (b - a);
const MOVES = ['light', 'heavy', 'guard'];
const problems = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(name) {
  const c = { name, ws: new WebSocket(URL), state: null, open: false, closed: false, r: 0 };
  c.ws.on('open', () => { c.open = true; });
  c.ws.on('close', () => { c.closed = true; });
  c.ws.on('error', () => {});
  c.ws.on('message', d => {
    let m; try { m = JSON.parse(d); } catch (_) { return; }
    if (m.t === 'joined') c.token = m.token;
    else if (m.t === 'state') {
      c.state = m;
      const max = m.cfg && m.cfg.mode === 'samurai' ? 2 : 4;
      if (m.players.length > max) problems.push(`정원 초과: ${m.players.length}/${max} (${m.cfg.mode})`);
      const host = m.players.find(p => p.id === m.hostId);
      const humans = m.players.filter(p => !p.bot && !p.local);
      if (humans.length && host && (host.bot || host.local)) problems.push(`방장이 사람이 아님: ${host.name}`);
      if (humans.length && !host) problems.push('사람이 있는데 방장이 없음');
    } else if (m.t === 'ev') {
      const e = m.ev;
      if (e.k === 'round') c.r = e.r;
      if (e.k === 'signal' && Math.random() > 0.25) {
        setTimeout(() => c.send({ t: 'shoot', r: c.r, ms: Math.round(R(160, 700)), move: MOVES[Math.floor(Math.random() * 3)] }), R(180, 800));
      }
    }
  });
  c.send = o => { try { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); } catch (_) {} };
  c.wait = async (fn, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(40); } return false; };
  return c;
}

async function room(i) {
  const mode = process.env.SIM_MODE || (i % 2 ? 'samurai' : 'west');
  const a = client(`가${i}`), b = client(`나${i}`);
  await a.wait(() => a.open); await b.wait(() => b.open);
  a.send({ t: 'create', name: a.name, mode });
  if (!await a.wait(() => a.state)) return problems.push(`${i}: 방이 안 만들어짐`);
  const code = a.state.code;
  b.send({ t: 'join', code, name: b.name });
  if (!await b.wait(() => b.state)) return problems.push(`${i}: 못 들어감`);
  if (mode === 'west' && Math.random() < 0.6) { a.send({ t: 'addBot', level: 'normal' }); await sleep(120); }
  if (mode === 'west' && Math.random() < 0.4) { a.send({ t: 'addLocal', name: '친구' }); await sleep(120); }
  if (Math.random() < 0.3) {
    const other = a.state.players.find(p => !p.bot && !p.local && p.id !== a.state.meId);
    if (other) { a.send({ t: 'host', id: other.id }); await sleep(150); }
  }
  if (Math.random() < 0.5) { a.send({ t: 'cfg', cfg: { target: 3 } }); await sleep(120); }
  if (Math.random() < 0.4) { b.send({ t: 'chat', text: '가자' }); await sleep(80); }
  const hostC = a.state.hostId === a.state.meId ? a : b;
  hostC.send({ t: 'start' });
  if (!await a.wait(() => a.state && a.state.phase === 'playing', 8000)) return problems.push(`${i}: 시작이 안 됨`);

  const cut = Math.random() < 0.35;
  let cutDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    if (a.state && a.state.phase === 'over') break;
    for (const c of [a, b]) {
      if (c.closed) continue;
      const d = c.state && c.state.duel;
      if (d && Math.random() < 0.06) c.send({ t: 'shoot', r: d.r, ms: Math.round(R(120, 900)), move: MOVES[Math.floor(Math.random() * 3)] });
    }
    if (cut && !cutDone && Date.now() - t0 > 4000) {
      cutDone = true;
      const code2 = b.state && b.state.code, tok = b.token;
      b.ws.close();
      if (Math.random() < 0.6) {
        await sleep(R(800, 2500));
        const c2 = client(b.name); await c2.wait(() => c2.open);
        c2.send({ t: 'resume', code: code2, token: tok });
        if (!await c2.wait(() => c2.state, 4000)) problems.push(`${i}: 다시 붙기 실패`);
        b.closed = true; b.rejoined = c2;
      }
    }
    await sleep(R(250, 700));
  }
  const fin = a.state;
  if (!fin) problems.push(`${i}: 상태 없음`);
  else if (fin.phase !== 'over' && fin.phase !== 'lobby') problems.push(`${i}: 안 끝남 (phase=${fin.phase}, mode=${mode}, cut=${cut})`);
  if (fin && fin.phase === 'over') { a.send({ t: 'again', now: true }); await sleep(600); }
  a.send({ t: 'leave' }); await sleep(200);
  for (const c of [a, b, b.rejoined]) if (c) try { c.ws.close(); } catch (_) {}
  return fin && fin.phase;
}

(async () => {
  const n = Number(process.argv[3] || 6);
  console.log(`플레이 시뮬레이션 → ${URL} (방 ${n}개)`);
  const res = await Promise.all(Array.from({ length: n }, (_, i) => room(i).catch(e => problems.push(`${i}: 터짐 ${e.message}`))));
  console.log('방 결과:', res.join(', '));
  console.log(problems.length ? `문제 ${problems.length}건:\n - ` + problems.join('\n - ') : '문제 없음');
  process.exit(problems.length ? 1 : 0);
})();
