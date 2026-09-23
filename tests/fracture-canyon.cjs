const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { fractureCanyon: stage } = require('../src/data/fracture-canyon.ts');
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
  saveMaps(storage, [{ id: 'canyon', stage }]);
  assert.deepEqual(readSavedMaps(storage)[0].stage, stage, 'canyon art, boosts and hatch survive storage');
  const race = new Race(); await race.physics.init();
  const physics = race.physics, B = physics.Box2D, random = Math.random, results = [];
  const contactIds = new Set();
  try {
    for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 40])) {
      for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456, 271828, 314159, 161803, 57721, 141421])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        race.startRace([Math.max(1, count - 1), count], 'desc');
        let first = 0, steps = 0, escaped = 0, shakes = 0;
        const left = new Set(), right = new Set(), bridges = new Set(), boosts = new Set(), escapeSamples = [];
        const shake = physics.shakeMarble.bind(physics), start = performance.now();
        physics.shakeMarble = id => { shakes++; shake(id); };
        while (race.state === 'running' && race.elapsed < 65) {
          race.advance(); steps++;
          if (!first && race.arrivals.length) first = race.elapsed;
          for (const ball of race.balls) if (!ball.rank) {
            const [outer, ...islands] = stage.art.contours;
            if ((!inside(ball, outer) && !near(ball, outer)) || islands.some(p => inside(ball, p) && !near(ball, p))) {
              escaped++; if (escapeSamples.length < 5) escapeSamples.push([ball.id, +ball.x.toFixed(2), +ball.y.toFixed(2)]);
            }
            if (ball.y > 27 && ball.y < 75) {
              if (ball.x < 18) left.add(ball.id);
              if (ball.x > 48) right.add(ball.id);
            }
          }
          if (steps % 3 === 0) for (const [index, e] of physics.entities.entries()) {
            const s = e.shape;
            const isBridge = s.type === 'polyline' && s.points.length === 2 && Math.abs(s.points[1][0] - s.points[0][0]) > 12;
            if (!isBridge && !s.boostSpeed && !e.timedGate) continue;
            let edge = e.body.GetContactList();
            while (B.getPointer(edge)) {
              if (edge.contact.IsTouching() && edge.other.GetType() === B.b2_dynamicBody) {
                contactIds.add(index);
                if (isBridge) bridges.add(index);
                if (s.boostSpeed) boosts.add(index);
              }
              edge = edge.next;
            }
          }
        }
        physics.shakeMarble = shake;
        const result = { count, seed: initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2),
          arrived: race.arrivals.length, escaped, escapeSamples, left: left.size, right: right.size,
          bridges: bridges.size, bridgeIds: [...bridges], boosts: boosts.size, boostIds: [...boosts], shakes, msPerStep: +((performance.now() - start) / steps).toFixed(2),
          remaining: race.balls.filter(b => !b.rank).map(b => [b.id, +b.x.toFixed(2), +b.y.toFixed(2)]) };
        results.push(result); console.log(JSON.stringify(result));
        assert.equal(escaped, 0, 'no marble may tunnel into rock or outside the canyon');
        assert.equal(race.arrivals.length, count, 'every marble finishes without timeout or teleport');
        assert.ok(first > 5 && race.elapsed < 60, 'race duration stays playable');
        assert.ok(race.arrivals.every(b => b.x > 29 && b.x < 35), 'all arrivals cross the open finish chute');
      }
    }
    if (!process.argv[3] && results.some(r => r.count >= 20)) {
      const packs = results.filter(r => r.count >= 20);
      assert.ok(packs.every(r => r.left && r.right), 'both chasms must carry marbles');
      assert.ok(packs.some(r => r.bridges >= 3), 'crossing bridges must be used');
      assert.ok(packs.some(r => r.boosts >= 2), 'boosters must lie on real marble paths');
      const hatchIndex = stage.entities.findIndex(e => e.props.timedGate);
      assert.ok(contactIds.has(hatchIndex), 'the opening bridge must affect the race');
      for (const [index, entity] of stage.entities.entries()) if (entity.shape.boostSpeed !== undefined)
        assert.ok(contactIds.has(index), 'every boost pad, including the spring, must meet real marble paths: ' + index);
    }
    console.log('PASS canyon containment, both routes, bridges, boosters, finish and saved-map compatibility');
  } finally { Math.random = random; physics.clearMarbles(); physics.clear(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
