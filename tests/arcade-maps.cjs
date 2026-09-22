const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { pinballCascade } = require('../src/data/pinball-cascade.ts');
const { chaosClocktower } = require('../src/data/chaos-clocktower.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
const inside = (ball, points) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > ball.y) !== (b[1] > ball.y) &&
      ball.x < (b[0] - a[0]) * (ball.y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};

(async () => {
  const race = new Race(); await race.physics.init();
  const physics = race.physics, B = physics.Box2D;
  const slide = pinballCascade.entities.find(e => e.props.sliding);
  for (const sliding of [null, { ...slide.props.sliding, amplitude: Infinity },
    { ...slide.props.sliding, period: 0 }, { ...slide.props.sliding, phase: '0' }])
    assert.throws(() => validateStage({ ...pinballCascade, entities: [{ ...slide, props: { ...slide.props, sliding } }] }));
  for (const props of [{ ...slide.props, angularVelocity: 1 }, { ...slide.props, oscillation: { amplitude: 0.5, period: 2 } }])
    assert.throws(() => validateStage({ ...pinballCascade, entities: [{ ...slide, props }] }));
  const platform = { ...slide, position: { x: 12, y: 10 },
    shape: { type: 'box', width: 3, height: 0.3, rotation: 0 },
    props: { ...slide.props, sliding: { amplitude: 2, period: 4, phase: 0 } } };
  physics.createStage({ title: 'Slide', entities: [platform] });
  physics.createMarble(0, 12, 8); physics.start();
  for (let step = 1; step <= 240; step++) {
    physics.step(1 / 60);
    assert.ok(Math.abs(physics.getEntities()[0].x - (12 + 2 * Math.sin(step / 60 * Math.PI / 2))) < 0.001,
      'physical and rendered platform positions follow the same continuous motion');
    assert.ok(physics.getMarblePosition(0).y < 10, 'the moving platform must carry a marble without tunnelling');
  }
  physics.clearMarbles(); physics.clear();
  console.log('PASS sliding platform validation, solver motion, collision and displayed position');

  const results = [];
  for (const stage of [pinballCascade, chaosClocktower].filter((_, i) => !process.argv[2] || Number(process.argv[2]) === i + 1)) {
    const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    saveMaps(storage, [{ id: stage.title, stage }]);
    assert.deepEqual(readSavedMaps(storage)[0].stage, stage, 'new devices and art survive editor JSON storage');
    for (const count of (process.argv[3] ? [Number(process.argv[3])] : [1, 9, 28, 100, 200, 300])) {
      for (const initial of (process.argv[4] ? [Number(process.argv[4])] : [123456, 271828, 314159])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        const initialXs = physics.getEntities().map(e => e.x);
        race.startRace([Math.max(1, count - 1), count], 'desc');
        let first = 0, earlyLeader, escaped = 0, shakes = 0, step = 0;
        const lifted = new Set(), left = new Set(), right = new Set(), depth = new Map(), hits = new Map();
        const shake = physics.shakeMarble.bind(physics);
        physics.shakeMarble = id => { shakes++; shake(id); };
        const bodyIds = new Map(Object.entries(physics.marbleMap).map(([id, body]) => [B.getPointer(body), Number(id)]));
        const start = performance.now();
        while (race.state === 'running' && race.elapsed < 100) {
          race.advance(); step++;
          for (const ball of race.balls) if (!ball.rank) {
            if (!inside(ball, stage.art.contours[0])) escaped++;
            depth.set(ball.id, Math.max(depth.get(ball.id) ?? ball.y, ball.y));
            if (depth.get(ball.id) - ball.y > 2.5) lifted.add(ball.id);
            if (ball.y > 20 && ball.y < 75) (ball.x < 24 ? left : right).add(ball.id);
          }
          if (step % 6 === 0) for (const e of physics.entities) if (e.oscillation || e.spinCycle) {
            const key = `${e.x},${e.y}`, touched = hits.get(key) ?? new Set();
            let edge = e.body.GetContactList();
            while (B.getPointer(edge)) {
              if (edge.contact.IsTouching() && bodyIds.has(B.getPointer(edge.other))) touched.add(bodyIds.get(B.getPointer(edge.other)));
              edge = edge.next;
            }
            hits.set(key, touched);
          }
          if (earlyLeader === undefined && race.elapsed >= 3) earlyLeader = race.balls.reduce((a, b) => a.y > b.y ? a : b).id;
          if (!first && race.arrivals.length) first = race.elapsed;
        }
        physics.shakeMarble = shake;
        const result = { map: stage.title, count, seed: initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2),
          arrived: race.arrivals.length, escaped, shakes, lifted: lifted.size, left: left.size, right: right.size,
          leaderWon: race.arrivals[0]?.id === earlyLeader, hits: [...hits].map(([key, ids]) => [key, ids.size]),
          msPerStep: +((performance.now() - start) / step).toFixed(2),
          remaining: race.balls.filter(b => !b.rank).slice(0, 5).map(b => [b.x, b.y]) };
        console.log(JSON.stringify(result)); results.push(result);
        assert.equal(result.escaped, 0, 'every marble must stay within the real course walls');
        assert.equal(result.arrived, count, 'all marbles must finish, without a forced timeout');
        assert.ok(first >= 6 && race.elapsed < 80, 'race must mix the pack then drain in a bounded time');
        assert.ok(race.arrivals.every(b => Math.abs(b.x - 24) < (stage === pinballCascade ? 3 : 4)), 'finish must be through the actual outlet');
        race.prepare(stage, ['reset']);
        assert.deepEqual(physics.getEntities().map(e => e.x), initialXs, 'reset restores sliding platforms to their initial phase');
      }
    }
  }
  for (const stage of [pinballCascade, chaosClocktower]) {
    const packs = results.filter(r => r.map === stage.title && r.count === 28);
    if (packs.length >= 3) {
      assert.ok(packs.some(r => !r.leaderWon), 'the early leader must not always win');
      assert.ok(packs.every(r => r.lifted > 0 && r.left > 0 && r.right > 0), 'both sides and upward mixing must be used');
      assert.ok(packs[0].hits.every((_, i) => packs.some(r => r.hits[i][1] > 0)), 'every flipper/rotor must interact with real marbles');
    }
  }
  physics.clearMarbles(); physics.clear();
  console.log('PASS arcade maps storage, containment, finish times, real device contacts and overtakes');
})().catch(error => { console.error(error); process.exitCode = 1; });
