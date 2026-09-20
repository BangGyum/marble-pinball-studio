const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { zigzagRapids: stage } = require('../src/data/zigzag-rapids.ts');
const { Race } = require('../src/race.ts');
const { validateStage, readSavedMaps, saveMaps } = require('../src/model.ts');
const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
saveMaps(storage, [{ id: 'rapids', stage }]);
assert.deepEqual(readSavedMaps(storage)[0].stage.art, stage.art, 'art survives export/save/restore');
assert.deepEqual(readSavedMaps(storage)[0].stage.entities, stage.entities, 'moving devices survive save/restore');
const seesaw = stage.entities.find(e => e.props.oscillation);
for (const oscillation of [null, { amplitude: 2, period: 3 }, { amplitude: 0.5, period: 0 }])
  assert.throws(() => validateStage({ ...stage, entities: [{ ...seesaw, props: { ...seesaw.props, oscillation } }] }));
for (const art of [null, { style: 'other', contours: [] }, { style: 'rapids', contours: [[[NaN, 0], [1, 1], [2, 2]]] }])
  assert.throws(() => validateStage({ ...stage, art }));
assert.throws(() => validateStage({ ...stage, art: { ...stage.art, arrows: [[0, 0, Infinity]] } }));
const inside = (ball, points) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > ball.y) !== (b[1] > ball.y) &&
      ball.x < (b[0] - a[0]) * (ball.y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
const nearEdge = (ball, points) => points.some((b, i) => {
  if (!i) return false;
  const a = points[i - 1], dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((ball.x - a[0]) * dx + (ball.y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(ball.x - a[0] - dx * t, ball.y - a[1] - dy * t) < 0.08;
});

(async () => {
  const race = new Race(); await race.physics.init();
  const physics = race.physics, B = physics.Box2D;
  physics.createStage(stage);
  const swinging = physics.entities.filter(e => e.oscillation);
  const angles = swinging.map(() => []);
  for (let frame = 0; frame < 360; frame++) {
    physics.step(1 / 60);
    swinging.forEach((e, i) => {
      const angle = e.body.GetAngle();
      assert.ok(Math.abs(angle) <= e.oscillation.amplitude + 0.001, 'devices cannot rotate beyond their swing limits');
      angles[i].push(angle);
    });
  }
  angles.forEach(values => assert.ok(Math.min(...values) < -0.4 && Math.max(...values) > 0.4, 'devices swing both ways'));
  physics.clear();
  physics.createStage(stage); physics.step(1 / 60);
  physics.entities.filter(e => e.oscillation).forEach(e => assert.ok(Math.abs(e.body.GetAngle()) < 0.03, 'new race resets swing phase'));
  physics.clear();
  let obstacles = [], hits = [], bodies = new Map(), shakes = 0;
  const step = physics.world.Step.bind(physics.world);
  physics.world.Step = (...args) => {
    step(...args);
    obstacles.forEach((e, i) => {
      let contact = e.body.GetContactList();
      while (B.getPointer(contact)) {
        const id = bodies.get(B.getPointer(contact.other));
        if (id !== undefined && contact.contact.IsTouching()) hits[i].add(id);
        contact = contact.next;
      }
    });
  };
  const shake = physics.shakeMarble.bind(physics);
  physics.shakeMarble = id => { shakes++; shake(id); };
  const totalHits = stage.entities.filter(e => e.shape.type !== 'polyline' || e.shape.solid).map(() => 0);
  let total = 0, roundsWithBothRoutes = 0, packRounds = 0;
  for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 4, 14, 28, 49])) {
    for (const initial of [123456, 271828, 314159]) {
      let seed = initial;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
      obstacles = physics.entities.filter(e => e.shape.type !== 'polyline' || e.shape.solid);
      hits = obstacles.map(() => new Set()); shakes = 0;
      bodies = new Map(Object.entries(physics.marbleMap).map(([id, body]) => [B.getPointer(body), Number(id)]));
      race.startRace([1, 1]);
      const shortcut = new Set(), longRoute = new Set(), shortcut2 = new Set(), longRoute2 = new Set();
      const leftPipe = new Set();
      while (race.state === 'running' && race.elapsed < 80) {
        race.advance();
        for (const ball of race.balls) if (!ball.rank) {
          assert.ok(ball.x > 2 && ball.x < 46, 'marble escaped the map');
          if (ball.y >= 140) leftPipe.add(ball.id);
          if (!leftPipe.has(ball.id) && ball.y > 7 && ball.y < 136) {
            const [outer, hole, , hole2] = stage.art.contours;
            assert.ok((inside(ball, outer) && !inside(ball, hole) && !inside(ball, hole2)) ||
              nearEdge(ball, outer) || nearEdge(ball, hole) || nearEdge(ball, hole2),
              `marble crossed a curved bank or the bypass divider: ${ball.x}, ${ball.y}`);
          }
          if (ball.y > 55 && ball.y < 60) {
            if (ball.x > 23.5 && ball.x < 26.5) shortcut.add(ball.id);
            else if (ball.x < 18) longRoute.add(ball.id);
          }
          if (ball.y > 106 && ball.y < 111) {
            if (ball.x > 23.5 && ball.x < 26.5) shortcut2.add(ball.id);
            else if (ball.x < 18) longRoute2.add(ball.id);
          }
          if (ball.y > 144) assert.ok(inside(ball, stage.art.contours[2]) || nearEdge(ball, stage.art.contours[2]),
            `the rotating square must not push marbles through the funnel: ${ball.x}, ${ball.y}`);
        }
      }
      console.log(JSON.stringify({ count, initial, arrived: race.arrivals.length, seconds: +race.elapsed.toFixed(2),
        shortcut: shortcut.size, longRoute: longRoute.size, shortcut2: shortcut2.size, longRoute2: longRoute2.size,
        hits: hits.map(h => h.size), shakes,
        remaining: race.balls.filter(b => !b.rank).slice(0, 5).map(b => [b.x, b.y]) }));
      assert.equal(race.arrivals.length, count, 'every marble must finish within 80 seconds');
      assert.ok(race.elapsed < 65, 'the extended rapids must stay brisk');
      assert.ok(race.arrivals.every(b => b.x > 26 && b.x < 28), 'every finish must pass through the right-shifted cup outlet');
      if (count >= 14) {
        assert.ok(shortcut2.size, 'the second shortcut must carry marbles in pack races');
        total += count; hits.forEach((hit, i) => totalHits[i] += hit.size);
        packRounds++; if (shortcut.size && longRoute.size) roundsWithBothRoutes++;
      }
    }
  }
  if (packRounds) {
    assert.ok(roundsWithBothRoutes >= packRounds * 0.75, 'both the long slide and shortcut must see regular use');
    totalHits.forEach(hit => assert.ok(hit / total >= 0.05, 'every obstacle must hit passing marbles'));
  }
  physics.clearMarbles(); physics.clear();
})().catch(error => { console.error(error); process.exitCode = 1; });
