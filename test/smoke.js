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
    for (const f of ['/style.css', '/duel.js', '/west.js', '/app.js', '/sound.js', '/img/plate.jpg', '/img/back.png', '/img/back_arm.png', '/img/gun1_far.png', '/img/gun4_bust.png']) {
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

  await check('신호 → 쏘기 → 판정', async () => {
    const sig = await waitFor(a, m => m.t === 'ev' && m.ev.k === 'signal', 20000, 'signal');
    tx(a, { t: 'shoot', r: sig.ev.r, ms: 150 });
    tx(b, { t: 'shoot', r: sig.ev.r, ms: 400 });
    const res = await waitFor(b, m => m.t === 'ev' && m.ev.k === 'result', 5000, 'result');
    const me = res.ev.rows.find(r => r.st === 'ok' && r.ms === 150);
    assert.ok(me && res.ev.win.includes(me.id), '150ms 가 이겨야 함');
  });

  for (const w of [a, b]) { try { tx(w, { t: 'leave' }); w.close(); } catch (_) {} }
  console.log(`\n${pass}개 통과${fail ? `, ${fail}개 실패` : ''}`);
  process.exit(fail ? 1 : 0);
})();
