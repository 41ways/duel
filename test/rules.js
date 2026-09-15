'use strict';
/** 판정 규칙과 한 판 흐름 — 시계를 가짜로 돌려서 확인한다 */
const assert = require('assert');
const D = require('../public/duel.js');

let pass = 0;
function check(name, fn) { fn(); pass++; console.log('  ✓ ' + name); }

/* 가짜 시계 */
function clock() {
  let now = 0, seq = 0;
  const q = new Map();
  return {
    set: (f, ms) => { const h = ++seq; q.set(h, { at: now + ms, f }); return h; },
    clear: h => q.delete(h),
    run(until) {
      for (;;) {
        let best = null;
        for (const [h, t] of q) if (t.at <= until && (!best || t.at < best[1].at)) best = [h, t];
        if (!best) break;
        q.delete(best[0]); now = best[1].at; best[1].f();
      }
      now = until;
    },
    get now() { return now; },
  };
}

const row = (id, st, ms, move) => ({ id, st, ms, move });

console.log('판정');
check('서부 — 가장 빠른 사람', () => {
  const r = D.resolveWest([row(1, 'ok', 300), row(2, 'ok', 220), row(3, 'early')], 'points');
  assert.deepStrictEqual(r.win, [2]);
  assert.deepStrictEqual(r.out, []);
});
check('서부 — 같은 기록은 둘 다 승', () => {
  assert.deepStrictEqual(D.resolveWest([row(1, 'ok', 250), row(2, 'ok', 250)], 'points').win, [1, 2]);
});
check('서바이벌 — 오발한 사람만 탈락', () => {
  const r = D.resolveWest([row(1, 'ok', 300), row(2, 'ok', 400), row(3, 'early')], 'survival');
  assert.deepStrictEqual(r.out, [3]);
});
check('서바이벌 — 다 잘 쏘면 꼴찌 탈락', () => {
  assert.deepStrictEqual(D.resolveWest([row(1, 'ok', 300), row(2, 'ok', 400), row(3, 'ok', 250)], 'survival').out, [2]);
});
check('서바이벌 — 다 틀리면 아무도 안 떨어짐', () => {
  assert.deepStrictEqual(D.resolveWest([row(1, 'early'), row(2, 'late')], 'survival').out, []);
});
check('0.1초 미만은 부정출발', () => {
  assert.strictEqual(D.classify({ ms: 80 }, 'west').st, 'jump');
  assert.strictEqual(D.classify({ ms: 1600 }, 'west').st, 'late');
});
check('사무라이 상성', () => {
  assert.deepStrictEqual(D.resolveSamurai([row(1, 'ok', 400, 'light'), row(2, 'ok', 200, 'heavy')]).win, [1]);
  assert.deepStrictEqual(D.resolveSamurai([row(1, 'ok', 200, 'light'), row(2, 'ok', 400, 'guard')]).win, [2]);
  assert.deepStrictEqual(D.resolveSamurai([row(1, 'ok', 400, 'heavy'), row(2, 'ok', 200, 'guard')]).win, [1]);
});
check('사무라이 — 같은 기술은 빠른 쪽, 둘 다 방어는 무승부', () => {
  assert.deepStrictEqual(D.resolveSamurai([row(1, 'ok', 300, 'heavy'), row(2, 'ok', 250, 'heavy')]).win, [2]);
  assert.deepStrictEqual(D.resolveSamurai([row(1, 'ok', 300, 'guard'), row(2, 'ok', 250, 'guard')]).win, []);
});
check('사무라이 — 먼저 움직이면 짐, 가만있으면 공격에 맞음', () => {
  assert.deepStrictEqual(D.resolveSamurai([row(1, 'early'), row(2, 'late')]).win, [2]);
  assert.deepStrictEqual(D.resolveSamurai([row(1, 'late'), row(2, 'ok', 500, 'light')]).win, [2]);
  assert.deepStrictEqual(D.resolveSamurai([row(1, 'late'), row(2, 'ok', 500, 'guard')]).win, []);
});

console.log('흐름');
function game(cfg, players) {
  const c = clock(), evs = [];
  const d = new D.Duel(cfg, players, { set: c.set, clear: c.clear, emit: e => evs.push(e) });
  return { c, d, evs, last: k => evs.filter(e => e.k === k).pop() };
}

check('신호 전에 누르면 오발, 신호 뒤 빠른 사람이 점수', () => {
  const g = game({ mode: 'west', target: 3 }, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  g.d.start();
  g.c.run(D.T.first + D.T.introFirst.west + 10);
  assert.strictEqual(g.d.phase, 'wait');
  assert.ok(g.d.input(3, { r: 1 }));
  assert.ok(g.last('early').id === 3);
  assert.ok(!g.d.input(3, { r: 1, ms: 200 }), '두 번은 못 쏜다');
  for (let i = 0; i < 100 && g.d.phase !== 'signal'; i++) g.c.run(g.c.now + 100);
  assert.strictEqual(g.d.phase, 'signal');
  g.d.input(1, { r: 1, ms: 310 });
  g.d.input(2, { r: 1, ms: 240 });
  const res = g.last('result');
  assert.deepStrictEqual(res.win, [2]);
  assert.strictEqual(res.scores[2], 1);
});

check('먼저 3점이면 끝', () => {
  const g = game({ mode: 'west', target: 3 }, [{ id: 1 }, { id: 2 }]);
  g.d.start();
  for (let r = 1; r <= 3; r++) {
    while (g.d.phase !== 'signal') g.c.run(g.c.now + 100);
    g.d.input(1, { r, ms: 200 }); g.d.input(2, { r, ms: 300 });
  }
  assert.strictEqual(g.last('result').over, true);
  g.c.run(g.c.now + D.T.result.west + 10);
  assert.strictEqual(g.last('over').winnerId, 1);
});

check('서바이벌 — 봇끼리 끝까지 간다', () => {
  const g = game({ mode: 'west', rule: 'survival' }, [1, 2, 3, 4].map(id => ({ id, bot: true, level: 'hard' })));
  g.d.start();
  g.c.run(10 * 60_000);
  assert.ok(g.last('over'), '끝나지 않음');
  assert.strictEqual(g.d.alive.size, 1);
});

check('사무라이 — 먼저 움직이면 그 자리에서 판정', () => {
  const g = game({ mode: 'samurai' }, [{ id: 1 }, { id: 2 }]);
  g.d.start();
  g.c.run(D.T.first + D.T.introFirst.samurai + 10);
  g.d.input(1, { r: 1, move: 'light' });
  assert.deepStrictEqual(g.last('result').win, [2]);
});

check('사람이 나가서 하나 남으면 끝', () => {
  const g = game({ mode: 'west' }, [{ id: 1 }, { id: 2 }]);
  g.d.start();
  g.c.run(D.T.first + D.T.introFirst.west + 10);
  g.d.forfeit(1);
  g.c.run(g.c.now + 10);
  assert.strictEqual(g.last('over').winnerId, 2);
});

check('거짓 신호 끄면 decoy 가 안 나온다', () => {
  const g = game({ mode: 'west', decoys: false }, [1, 2].map(id => ({ id, bot: true, level: 'hard' })));
  g.d.start();
  g.c.run(5 * 60_000);
  assert.strictEqual(g.evs.filter(e => e.k === 'decoy').length, 0);
  assert.strictEqual(D.normCfg({}).decoys, true);
});

console.log(`\n${pass}개 통과`);
