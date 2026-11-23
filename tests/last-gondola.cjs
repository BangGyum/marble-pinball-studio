const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { lastGondola: stage } = require('../src/data/last-gondola.ts');
const { validateStage } = require('../src/model.ts');
const index = stage.entities.findIndex((e) => e.shape.gondola);
const device = stage.entities[index];

(async () => {
  assert.deepEqual(validateStage(JSON.parse(JSON.stringify(stage))), stage);
  assert.throws(() => validateStage({ ...stage, entities: [{ ...device, type: 'static' }] }));
  const race = new Race();
  await race.physics.init();
  const random = Math.random;
  try {
    // Send three marbles into a parked two-seat car, then offer a fourth after its return.
    race.prepare({ ...stage, entities: [device] }, ['a', 'b', 'c', 'd']);
    race.startRace([1, 1]);
    const p = race.physics,
      { x, y } = device.position;
    for (let i = 0; i < 3; i++) p.placeMarble(i, x + (i - 1) * 0.58, y + 0.9);
    let moved = false;
    for (let frame = 0; frame < 300; frame++) {
      p.step(1 / 60);
      const car = p.getEntities()[0];
      if (car.x > x + 7 && car.x < x + 9 && !moved) {
        moved = true;
        assert.ok([0, 1].every((id) => Math.abs(p.getMarblePosition(id).y - car.y - 1.12) < 0.002));
        assert.ok(p.getMarblePosition(2).y > y + 2);
      }
    }
    assert.ok(moved);
    assert.ok(Math.abs(p.getEntities()[0].x - x) < 0.001);
    p.placeMarble(3, x, y + 0.9);
    for (let i = 0; i < 125; i++) p.step(1 / 60);
    assert.ok(p.getMarblePosition(3).x > x + 8, 'the returned cabin takes a single passenger');
    p.removeMarble(3);
    for (let i = 0; i < 150; i++) p.step(1 / 60);
    const firstBoardings = Array(20).fill(0);
    let overtakingRaces = 0,
      expressWins = 0,
      shortcutTotal = 0,
      outerTotal = 0;
    for (const count of [1, 2, 14, 20, 50])
      for (let trial = 0; trial < (count === 20 ? 100 : 3); trial++) {
        let seed = (Math.imul(trial + 1, 2654435761) + 16941) >>> 0;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        race.prepare(
          stage,
          Array.from({ length: count }, (_, i) => String(i))
        );
        race.startRace([count, count], 'desc');
        const riding = new Set(),
          approach = new Map(),
          routes = new Map();
        let firstCabinCrossing;
        while (race.state === 'running' && race.elapsed < 45) {
          race.advance();
          for (const b of race.balls) {
            if (b.rank) continue;
            if (b.py < 24 && b.y >= 24) {
              const car = p.getEntities()[index];
              if (Math.abs(Math.abs(b.x - car.x) - 0.38) < 0.001 && Math.abs(b.y - car.y - 1.12) < 0.001) {
                riding.add(b.id);
                firstCabinCrossing ??= race.elapsed;
                if (count === 20 && race.elapsed === firstCabinCrossing) firstBoardings[b.id]++;
              }
            }
            if (b.py < 32 && b.y >= 32 && b.x < 24.1 && !approach.has(b.id)) approach.set(b.id, race.elapsed);
            // At this depth the express shaft is on the right, the bridge drop in the middle, and the hairpin on the left.
            if (b.py < 40 && b.y >= 40 && !routes.has(b.id))
              routes.set(b.id, b.x > 24.1 ? 'express' : b.x > 7 ? 'drop' : 'outer');
          }
        }
        assert.equal(race.finishReason, 'arrived');
        assert.equal(race.rescues, 0);
        assert.equal(race.arrivals.length, count);
        assert.equal(routes.size, count);
        if (count !== 20) continue;
        const drop = [],
          outer = [];
        for (const b of race.arrivals) {
          assert.equal(routes.get(b.id) === 'express', riding.has(b.id), 'express finish only after a cabin ride');
          if (!riding.has(b.id)) {
            assert.ok(approach.has(b.id), 'bypass marbles pass the approach before the bridge');
            (routes.get(b.id) === 'drop' ? drop : outer).push(b);
          }
        }
        if (routes.get(race.arrivals[0].id) === 'express') expressWins++;
        if (drop.some((b) => outer.some((a) => approach.get(b.id) > approach.get(a.id) + 0.1 && b.rank < a.rank)))
          overtakingRaces++;
        shortcutTotal += drop.length;
        outerTotal += outer.length;
      }
    const seats = firstBoardings.reduce((a, b) => a + b, 0);
    const lowerRowShare = firstBoardings.slice(0, 10).reduce((a, b) => a + b, 0) / seats;
    assert.ok(
      Math.min(...firstBoardings) > 0 && Math.max(...firstBoardings) <= 20,
      'every slot can take the first cabin'
    );
    assert.ok(lowerRowShare >= 0.4 && lowerRowShare <= 0.6, 'both rows compete for the first departure');
    assert.ok(expressWins >= 70 && expressWins <= 95, 'the gondola wins most races and the ordinary route can beat it');
    assert.ok(overtakingRaces >= 70, 'the bridge shortcut overturns the approach order in most races');
    console.log('PASS two-seat capacity, return, lone passenger, rider removal, reset and 1–50 marble finishes');
    console.log({ firstBoardings, expressWins, overtakingRaces, shortcutTotal, outerTotal });
  } finally {
    Math.random = random;
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
