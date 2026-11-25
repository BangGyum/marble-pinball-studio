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

async function verifyCrowdedStations() {
  const race = new Race();
  const physics = race.physics;
  const random = Math.random;
  await physics.init();
  try {
    const bridge = {
      entry: { x: 35, y: 7, width: 1.5, height: 1 },
      deck: [
        [3, 5],
        [39, 5],
        [39, 65],
        [3, 65],
      ],
    };
    for (const layer of [1, 2]) {
      const layered = validateStage({
        title: 'Layered gondola',
        width: 40,
        goalY: 70,
        exitBridge: bridge,
        entities: [{ ...device, shape: { ...device.shape, collisionLayer: layer } }],
      });
      for (const marbleLayer of [1, 2]) {
        race.prepare(layered, ['rider']);
        race.startRace([1, 1]);
        if (marbleLayer === 2) {
          physics.placeMarble(0, bridge.entry.x, bridge.entry.y);
          physics.step(1 / 60);
        }
        physics.placeMarble(0, device.position.x, device.position.y + 0.95);
        physics.setMarbleVelocity(0, 0, 0.5);
        physics.step(1 / 60);
        assert.equal(!physics.marbleBodies[0].IsEnabled(), layer === marbleLayer);
      }
    }
    console.log('PASS gondolas board marbles only on their own collision layer');
    for (const count of [100, 300]) {
      for (const initial of [77, 527, 1337]) {
        let seed = initial;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        race.prepare(
          stage,
          Array.from({ length: count }, (_, id) => String(id))
        );
        race.startRace([count - 1, count], 'desc');
        const car = physics.gondolas[0];
        const ids = new Map(Object.entries(physics.marbleMap).map(([id, body]) => [body, Number(id)]));
        const boarded = new Set();
        const unloaded = new Map();
        const leftStation = new Set();
        const express = new Set();
        const label = `${count} marbles / seed ${initial}`;
        while (race.state === 'running' && race.elapsed < 50) {
          const before = car.seats.filter(Boolean);
          race.advance();
          const seats = car.seats.filter(Boolean);
          assert.ok(seats.length <= 2, label);
          for (const body of seats) boarded.add(ids.get(body));
          for (const body of before) {
            if (seats.includes(body)) continue;
            const id = ids.get(body);
            const { x, y } = race.balls[id];
            assert.ok(body.IsEnabled() && x > 25 && x < 29 && y > 25 && y < 28, label + ' unload inside the station');
            unloaded.set(id, race.elapsed);
          }
          for (const ball of race.balls) {
            if (ball.rank) continue;
            assert.ok(ball.x >= 0.55 && ball.x <= 31.45 && ball.y >= -20 && ball.y <= 54, label + ' stays on the map');
            if (ball.py < 28.85 && ball.y >= 28.85 && unloaded.has(ball.id) && !leftStation.has(ball.id)) {
              assert.ok(race.elapsed - unloaded.get(ball.id) < 2, label + ' clears the arrival station promptly');
              leftStation.add(ball.id);
            }
            if (ball.py < 40 && ball.y >= 40 && ball.x > 24.1 && unloaded.has(ball.id)) {
              express.add(ball.id);
            }
          }
        }
        assert.equal(race.finishReason, 'arrived', label);
        assert.equal(race.arrivals.length, count, label);
        assert.equal(race.rescues, 0, label + ' solid approach holds against crowd pressure');
        assert.ok(boarded.size >= 2, label);
        assert.deepEqual(new Set(unloaded.keys()), boarded, label + ' all riders unload');
        assert.deepEqual(leftStation, boarded, label + ' no riders remain at the station');
        assert.deepEqual(express, boarded, label + ' all riders reach the express exit');
      }
    }
    console.log('PASS 100/300 marbles across three seeds: safe approach, boarding, unloading and full finishes');
  } finally {
    Math.random = random;
    physics.dispose();
  }
}

(async () => {
  assert.deepEqual(validateStage(JSON.parse(JSON.stringify(stage))), stage);
  assert.throws(() => validateStage({ ...stage, entities: [{ ...device, type: 'static' }] }));
  await verifyCrowdedStations();
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
    race.prepare(stage, ['bypass rebound']);
    race.startRace([1, 1]);
    p.placeMarble(0, 22.35, 26.4);
    p.setMarbleVelocity(0, 7.85, -1.5);
    let routeX;
    while (race.state === 'running' && race.elapsed < 20) {
      race.advance();
      const ball = race.balls[0];
      if (ball.py < 40 && ball.y >= 40) routeX ??= ball.x;
    }
    assert.equal(race.finishReason, 'arrived');
    assert.ok(routeX < 24.1, 'an upward bounce on the bypass must stay out of the gondola exit');
    assert.equal(race.rescues, 0);
    console.log('PASS bypass rebound stays on the ordinary route without a wall rescue');

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
