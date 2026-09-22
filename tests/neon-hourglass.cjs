const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { neonHourglass: stage } = require('../src/data/neon-hourglass.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
const inside = (ball, points) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > ball.y) !== (b[1] > ball.y) && ball.x < (b[0] - a[0]) * (ball.y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
const near = (ball, points) => points.some((a, i) => {
  const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((ball.x - a[0]) * dx + (ball.y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ball.x - a[0] - t * dx, ball.y - a[1] - t * dy) < 0.3;
});
(async () => {
  assert.deepEqual(validateStage(stage), stage);
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  saveMaps(storage, [{ id: 'hourglass', stage }]);
  assert.deepEqual(readSavedMaps(storage)[0].stage, stage, 'hourglass scenery, hinges and bypass survive editor storage');
  const race = new Race(); await race.physics.init();
  const physics = race.physics, B = physics.Box2D, random = Math.random;
  const results = [];
  try {
    for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 100, 300])) {
      for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456, 271828, 314159])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        race.startRace([Math.max(1, count - 1), count], 'desc');
        let first = 0, escaped = 0, steps = 0, shakes = 0, earlyLeader;
        const bypass = new Set(), left = new Set(), right = new Set(), gates = new Set(), escapeSamples = [], lateSamples = [];
        const shake = physics.shakeMarble.bind(physics), start = performance.now();
        physics.shakeMarble = id => { shakes++; shake(id); };
        while (race.state === 'running' && race.elapsed < 90) {
          race.advance(); steps++;
          if (!first && race.arrivals.length) first = race.elapsed;
          for (const ball of race.balls) if (!ball.rank) {
            const [outer, ...islands] = stage.art.contours;
            if ((!inside(ball, outer) && !near(ball, outer)) || islands.some(p => inside(ball, p) && !near(ball, p))) {
              escaped++; if (escapeSamples.length < 6) escapeSamples.push([ball.id, +ball.x.toFixed(2), +ball.y.toFixed(2)]);
            }
            if (ball.x > 48 && ball.y > 33 && ball.y < 49) bypass.add(ball.id);
            if (ball.y > 65 && ball.y < 77) (ball.x < 32 ? left : right).add(ball.id);
          }
          if (steps % 6 === 0) for (const [index, entity] of physics.entities.entries()) if (entity.timedGate || entity.oscillation) {
            let edge = entity.body.GetContactList();
            while (B.getPointer(edge)) {
              if (edge.contact.IsTouching() && edge.other.GetType() === B.b2_dynamicBody) gates.add(index);
              edge = edge.next;
            }
          }
          if (earlyLeader === undefined && race.elapsed >= 2) earlyLeader = race.balls.reduce((a, b) => a.y > b.y ? a : b).id;
          if (steps >= 2400 && steps % 600 === 0) lateSamples.push([Math.round(race.elapsed),
            race.balls.filter(b => !b.rank).slice(0, 8).map(b => [b.id, +b.x.toFixed(2), +b.y.toFixed(2)])]);
        }
        physics.shakeMarble = shake;
        const result = { count, seed: initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2), arrived: race.arrivals.length,
          escaped, escapeSamples, bypass: bypass.size, left: left.size, right: right.size, devices: gates.size, shakes,
          leaderWon: race.arrivals[0]?.id === earlyLeader,
          msPerStep: +((performance.now() - start) / steps).toFixed(2),
          remaining: race.balls.filter(b => !b.rank).slice(0, 8).map(b => [b.id, +b.x.toFixed(2), +b.y.toFixed(2)]) };
        results.push(result); console.log(JSON.stringify(result));
        if (race.elapsed >= 65) console.log('Delayed marbles:', JSON.stringify(lateSamples));
        assert.equal(result.escaped, 0, 'marbles must stay within the actual hourglass walls and bypass');
        assert.equal(result.arrived, count, 'every marble must finish without a timeout or teleport');
        assert.ok(first >= 8 && race.elapsed < 65, 'gate buildup and release must give a bounded, playable race');
        assert.ok(race.arrivals.every(b => b.x > 21.3 && b.x < 42.7), 'both chutes rejoin at the actual finish');
      }
    }
    const packs = results.filter(r => r.count >= 20);
    if (packs.length >= 3) {
      assert.ok(packs.some(r => r.bypass > 0), 'the right bypass must carry real marbles');
      assert.ok(packs.every(r => r.left > 0 && r.right > 0), 'both final chutes must be used');
      assert.ok(packs.some(r => !r.leaderWon), 'the early leader must not always win');
      assert.ok(packs.some(r => r.devices === 5), 'both shutter pairs and the sweeping paddle must interact with marbles');
    }
    console.log('PASS hourglass storage, containment, releases, bypass, split finish and overtakes');
  } finally { Math.random = random; physics.clearMarbles(); physics.clear(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
