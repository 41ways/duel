'use strict';
/**
 * 결투 — Node 서버 (로컬 개발 · 테스트용)
 *  - 정적 파일(public/) + WebSocket. 판은 game.js 가 쥐고 여기는 전달만 한다.
 *  - 실제 서비스는 Cloudflare(worker.js)에서 같은 game.js 로 돈다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { rooms, handle, disconnect, sweepRooms, selfCheck } = require('./game');

const PORT = process.env.PORT || 8850;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let file;
  try { file = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (_) { res.writeHead(400).end('bad request'); return; }

  if (file === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  }

  if (file === '/') file = '/index.html';
  const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403).end('forbidden'); return; }

  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('없는 페이지입니다'); return; }
    const type = MIME[path.extname(full)] || 'application/octet-stream';
    // 영상은 앞으로 되감아 다시 틀 수 있게 일부분 요청(Range)에 답한다
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? +range[1] : buf.length - +range[2];
      const end = range[1] && range[2] ? Math.min(+range[2], buf.length - 1) : buf.length - 1;
      if (start >= buf.length || start > end) { res.writeHead(416, { 'content-range': `bytes */${buf.length}` }).end(); return; }
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${buf.length}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-cache' });
      res.end(buf.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') return;
    try { handle(ws, msg); } catch (e) { console.error('handle error', e); }
  });
  ws.on('close', () => disconnect(ws));
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
  sweepRooms();
}, 30_000);

server.listen(PORT, () => {
  selfCheck();
  console.log(`결투 서버 → http://localhost:${PORT}`);
});
