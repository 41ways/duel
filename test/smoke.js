'use strict';
/**
 * 떠 있는 서버에 붙어서 한 판의 뼈대를 확인한다.
 *   node test/smoke.js http://127.0.0.1:8850
 *   node test/smoke.js https://duel.41ways.workers.dev
 * 방 만들기 · 들어가기 · 봇 · 시작 · 신호 · 쏘기 · 판정까지.
 */
const assert = require('assert');
const WebSocket = require('ws');

const BASE = (process.argv[2] || 'http://127.0.0.1:8850').replace(/\/$/, '');
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function open() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    ws.inbox = [];
    ws.on('message', raw => ws.inbox.push(JSON.parse(raw)));
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}
const tx = (ws, o) => ws.send(JSON.stringify(o));
async function waitFor(ws, pred, ms = 8000, what = '') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const m of ws.inbox) if (pred(m)) return m;
    await sleep(20);
  }
  throw new Error('안 옴: ' + what);
}

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); }
}

(async () => {
  console.log('결투 연결 확인 → ' + BASE);
  let a, b;
  await check('화면 파일 · 이미지', async () => {
    const html = await fetch(BASE + '/').then(r => r.text());
    assert.ok(html.includes('결투'));
    for (const f of ['/style.css', '/duel.js', '/west.js', '/samurai.js', '/app.js', '/sound.js', '/img/plate.jpg', '/img/back.png', '/img/back_arm.png', '/img/gun1_far.png', '/img/gun4_bust.png', '/img/poster.png', '/img/wood.jpg', '/img/back_down.png', '/img/back_dead.png', '/img/poster_blank.png', '/img/grunge.png', '/img/poster_hole.png', '/img/board.png', '/img/mode_west_bg.jpg', '/img/mode_samurai_man.png']) {
      assert.strictEqual((await fetch(BASE + f)).status, 200, f);
    }
  });
  await check('상태 확인', async () => assert.strictEqual((await fetch(BASE + '/healthz').then(r => r.json())).ok, true));

  await check('방 · 들어가기 · 봇 · 시작', async () => {
    a = await open(); b = await open();
    tx(a, { t: 'create', name: '시험가' });
    const { code } = await waitFor(a, m => m.t === 'joined');
    tx(b, { t: 'join', code, name: '시험나' });
    await waitFor(a, m => m.t === 'state' && m.players.length === 2);
    tx(a, { t: 'addBot', level: 'easy' });
    await waitFor(a, m => m.t === 'state' && m.players.length === 3);
    tx(a, { t: 'start' });
    await waitFor(b, m => m.t === 'ev' && m.ev.k === 'round', 5000, 'round');
  });

  await check('열린 방 목록', async () => {
    const v = await open(), c = await open();
    tx(v, { t: 'rooms' });
    await waitFor(v, m => m.t === 'rooms');
    tx(c, { t: 'create', name: '목록시험' });
    const { code } = await waitFor(c, m => m.t === 'joined');
    await waitFor(v, m => m.t === 'rooms' && m.list.some(r => r.code === code && r.host === '목록시험'), 3000, '목록에 새 방');
    tx(c, { t: 'leave' }); c.close(); v.close();
  });

  await check('채팅 · 방장 넘기기', async () => {
    const c = await open(), d = await open();
    tx(c, { t: 'create', name: '방장' });
    const { code } = await waitFor(c, m => m.t === 'joined');
    tx(d, { t: 'join', code, name: '손님' });
    const st = await waitFor(c, m => m.t === 'state' && m.players.length === 2);
    tx(d, { t: 'chat', text: '안녕' });
    await waitFor(c, m => m.t === 'chat' && m.text === '안녕' && m.name === '손님');
    const guest = st.players.find(p => p.name === '손님');
    tx(c, { t: 'host', id: guest.id });
    await waitFor(d, m => m.t === 'state' && m.hostId === guest.id);
    for (const w of [c, d]) { tx(w, { t: 'leave' }); w.close(); }
  });

  await check('한 기기에서 같이 — 자리 추가 · 대신 쏘기', async () => {
    const c = await open();
    tx(c, { t: 'create', name: '주인' });
    await waitFor(c, m => m.t === 'joined');
    tx(c, { t: 'addLocal' });
    const st = await waitFor(c, m => m.t === 'state' && m.players.length === 2);
    const seat = st.players.find(p => p.local);
    assert.ok(seat && seat.owner === st.meId, '같은 기기 자리');
    tx(c, { t: 'start' });
    const sig = await waitFor(c, m => m.t === 'ev' && m.ev.k === 'signal', 20000, 'signal');
    tx(c, { t: 'shoot', r: sig.ev.r, ms: 180, pid: seat.id });
    tx(c, { t: 'shoot', r: sig.ev.r, ms: 300 });
    const res = await waitFor(c, m => m.t === 'ev' && m.ev.k === 'result', 5000, 'result');
    assert.deepStrictEqual(res.ev.win, [seat.id]);
    tx(c, { t: 'leave' }); c.close();
  });

  await check('신호 → 쏘기 → 판정', async () => {
    // 앞 시험의 판과 섞이지 않게 새 방에서 둘이
    const c = await open(), d = await open();
    tx(c, { t: 'create', name: '빠른손' });
    const { code } = await waitFor(c, m => m.t === 'joined');
    tx(d, { t: 'join', code, name: '느린손' });
    await waitFor(c, m => m.t === 'state' && m.players.length === 2);
    tx(c, { t: 'cfg', cfg: { decoys: false } });
    tx(c, { t: 'start' });
    const sig = await waitFor(c, m => m.t === 'ev' && m.ev.k === 'signal', 30000, 'signal');
    tx(c, { t: 'shoot', r: sig.ev.r, ms: 150 });
    tx(d, { t: 'shoot', r: sig.ev.r, ms: 400 });
    const res = await waitFor(d, m => m.t === 'ev' && m.ev.k === 'result', 5000, 'result');
    const fast = res.ev.rows.find(r => r.st === 'ok' && r.ms === 150);
    assert.ok(fast && res.ev.win.includes(fast.id), '150ms 가 이겨야 함 ' + JSON.stringify(res.ev.rows));
    for (const w of [c, d]) { tx(w, { t: 'leave' }); w.close(); }
  });

  for (const w of [a, b]) { try { tx(w, { t: 'leave' }); w.close(); } catch (_) {} }
  console.log(`\n${pass}개 통과${fail ? `, ${fail}개 실패` : ''}`);
  process.exit(fail ? 1 : 0);
})();
