const assert = require('node:assert/strict');
const fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { desireJar } = require('../src/data/desire-jar.ts');
const { orbitingGate } = require('../src/data/orbiting-gate.ts');
const { dolphinRows } = require('../src/dolphin.ts');
const props = { density: 1, restitution: 0, angularVelocity: 0 };
const edge = (points, extra = {}) => ({ type: 'polyline', rotation: 0, points, ...extra });
const open = (entities) => ({ title: 'Animal wall regression', width: 40, goalY: 200, zoomY: 195, entities });

(async () => {
  const paddles = desireJar.entities.filter((e) => e.type === 'kinematic' && e.position.y > 60);
  for (let i = 0; i < paddles.length; i++)
    for (let j = i + 1; j < paddles.length; j++) {
      const a = paddles[i],
        b = paddles[j];
      assert.ok(
        Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) >=
          Math.hypot(a.shape.width, a.shape.height) + Math.hypot(b.shape.width, b.shape.height) + 0.55,
        'return paddles leave room for a 0.5-wide marble throughout their rotation'
      );
    }
  const race = new Race();
  await race.physics.init();
  const physics = race.physics,
    B = physics.Box2D,
    random = Math.random;
  try {
    physics.createStage({ ...orbitingGate, windZones: [] });
    physics.createMarble(0, 32, -31.5);
    physics.start();
    physics.setMarbleVelocity(0, 0, -60);
    for (let step = 0; step < 6; step++) {
      physics.step(1 / 60, () => {});
      assert.ok(physics.getMarblePosition(0).y >= -31.8, 'a strong rebound stays below the spawn chimney roof');
    }
    console.log('PASS upward manta-speed rebound cannot escape above the spawn chimney');
    for (const [kind, halfWidth, halfHeight, spin] of [
      ['edge', 0.28, 40, 0],
      ['edge', 0.26, 40, 0],
      ['box', 0.28, 40, 0],
      ['moving', 0.28, 40, 0],
      ['moving', 6, 12, 2],
      ['moving', 6, 12, 6],
      ['paddle', 6, 12, 2],
      ['paddle', 6, 12, 6],
      ['sliding', 6, 12, 0],
    ]) {
      let seed = 77123;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const cx = 20,
        cy = 48;
      const entities =
        kind === 'box'
          ? [
              [-halfWidth - 0.0025, 0, 0.0025, halfHeight + 0.005],
              [halfWidth + 0.0025, 0, 0.0025, halfHeight + 0.005],
              [0, -halfHeight - 0.0025, halfWidth + 0.005, 0.0025],
              [0, halfHeight + 0.0025, halfWidth + 0.005, 0.0025],
            ].map(([x, y, width, height]) => ({
              position: { x: cx + x, y: cy + y },
              type: 'static',
              shape: { type: 'box', width, height, rotation: 0 },
              props,
            }))
          : [
              {
                position: { x: cx, y: cy },
                type: kind === 'moving' ? 'kinematic' : 'static',
                shape: edge([
                  [-halfWidth, -halfHeight],
                  [halfWidth, -halfHeight],
                  [halfWidth, halfHeight],
                  [-halfWidth, halfHeight],
                  [-halfWidth, -halfHeight],
                ]),
                props: { ...props, angularVelocity: kind === 'moving' ? spin : 0 },
              },
            ];
      if (kind === 'paddle' || kind === 'sliding')
        entities.push({
          position: { x: cx, y: cy },
          type: 'kinematic',
          shape: {
            type: 'box',
            width: kind === 'paddle' ? 5.5 : 0.1,
            height: kind === 'paddle' ? 0.15 : 8,
            rotation: 0,
          },
          props: {
            ...props,
            angularVelocity: spin,
            ...(kind === 'sliding' ? { sliding: { amplitude: 5.5, period: 2, phase: 0, direction: 0 } } : {}),
          },
        });
      const rows = [12, 26, 40, 54, 68, 82];
      race.prepare(
        open(entities),
        Array.from({ length: 100 }, (_, i) => String(i)),
        {
          enabled: false,
          rows,
          interval: 5,
          manta: { enabled: true, rows, interval: 5, size: 200, speed: 1.5 },
        }
      );
      const columns = kind === 'sliding' ? 8 : Math.max(1, Math.floor((2 * halfWidth - 0.54) / 0.61) + 1),
        countRows = Math.ceil(100 / columns);
      for (const ball of race.balls) {
        const x =
            kind === 'sliding'
              ? cx + (ball.id % 8 < 4 ? -1 : 1) * (1 + (ball.id % 4) * 0.61)
              : cx + ((ball.id % columns) - (columns - 1) / 2) * 0.61,
          y = cy + (kind === 'paddle' ? 6 : 0) + (Math.floor(ball.id / columns) - (countRows - 1) / 2) * 0.61;
        physics.placeMarble(ball.id, x, y);
        Object.assign(ball, { x, y, px: x, py: y });
        if (kind === 'paddle' || kind === 'sliding') {
          physics.vector.Set(x, y);
          assert.equal(
            physics.entities[1].body.GetFixtureList().TestPoint(physics.vector),
            false,
            'test starts outside the moving obstacle'
          );
        }
      }
      race.startRace([1, 1]);
      let impacts = 0;
      const setter = physics.setMarbleVelocity.bind(physics);
      physics.setMarbleVelocity = (...args) => {
        impacts++;
        return setter(...args);
      };
      try {
        for (let step = 0; step < 480; step++) {
          race.advance();
          const angle = physics.getEntities()[0].angle,
            cos = Math.cos(angle),
            sin = Math.sin(angle);
          for (const ball of race.balls) {
            const dx = ball.x - cx,
              dy = ball.y - cy,
              x = kind === 'box' ? dx : dx * cos + dy * sin,
              y = kind === 'box' ? dy : -dx * sin + dy * cos;
            assert.ok(
              Math.abs(x) <= halfWidth + 0.03 && Math.abs(y) <= halfHeight + 0.03,
              `${kind} ${halfWidth}/${spin}: ball ${ball.id} escaped at ${race.elapsed}s (${x},${y})`
            );
            if (kind === 'paddle' || kind === 'sliding') {
              physics.vector.Set(ball.x, ball.y);
              assert.equal(
                physics.entities[1].body.GetFixtureList().TestPoint(physics.vector),
                false,
                `${kind}: ball ${ball.id} center (${ball.x},${ball.y}) stays outside the solid obstacle at ${race.elapsed}s, obstacle x=${physics.getEntities()[1].x}`
              );
            }
          }
        }
      } finally {
        physics.setMarbleVelocity = setter;
      }
      assert.ok(impacts > 0, 'the real moving manta hits the packed marbles');
    }
    console.log('PASS 100-marble manta containment in nine thin/static/kinematic/rotating/sliding wall cases');

    for (const [initial, size, speed, count] of [
      [18391, 100, 1, 3],
      [459817, 100, 1, 3],
      [18391, 200, 0.5, 6],
      [459817, 200, 1.5, 6],
    ]) {
      let seed = initial + 77;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const rows = dolphinRows(desireJar, count, 20);
      race.prepare(
        desireJar,
        Array.from({ length: 100 }, (_, i) => String(i)),
        {
          enabled: false,
          rows,
          interval: 5,
          manta: { enabled: true, rows, interval: 5, size, speed },
        }
      );
      race.startRace([99, 100], 'desc');
      const guard = physics.guardMapCrossings.bind(physics);
      physics.guardMapCrossings = () => {
        guard();
        for (const body of physics.marbleBodies) {
          const p = body.GetPosition();
          for (const e of physics.movingEntities) {
            const q = e.body.GetPosition();
            if (Math.hypot(p.x - q.x, p.y - q.y) > e.sweepRadius) continue;
            assert.equal(
              e.body.GetFixtureList().TestPoint(p),
              false,
              `jar seed ${initial}, ${size}%/${speed}x: marble stays outside paddles at ${physics.motionTime}s`
            );
          }
        }
      };
      try {
        for (let step = 0; step < 2400 && race.state === 'running'; step++) race.advance();
      } finally {
        physics.guardMapCrossings = guard;
      }
    }
    console.log('PASS jar paddle clearance and four 40-second, 100-marble manta overlap regressions');

    for (const initial of [18391, 459817]) {
      let seed = initial + 18 * 77;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const rows = dolphinRows(orbitingGate, 6, 20);
      race.prepare(
        orbitingGate,
        Array.from({ length: 100 }, (_, i) => String(i)),
        {
          enabled: false,
          rows,
          interval: 5,
          manta: { enabled: true, rows, interval: 5, size: 200, speed: 1.5 },
        }
      );
      race.startRace([99, 100], 'desc');
      for (let step = 0; step < 10800 && race.state === 'running'; step++) {
        race.advance();
        for (const ball of race.balls)
          assert.ok(
            ball.x >= 0 && ball.x <= orbitingGate.width && ball.y >= -32 && ball.y <= orbitingGate.goalY,
            `gate seed ${initial}: marble ${ball.id} stays inside the course at ${race.elapsed}s`
          );
      }
      assert.equal(race.finishReason, 'arrived', `gate seed ${initial}: no forced ranking with maximum manta settings`);
      assert.equal(race.arrivals.length, 100);
    }
    console.log('PASS two maximum-manta gate races: 100 real arrivals without escaping or forced ranking');

    physics.clearMarbles();
    physics.clear();
    physics.createStage(
      open([
        {
          position: { x: 0, y: 0 },
          type: 'static',
          shape: edge([
            [0, -5],
            [0, 5],
          ]),
          props,
        },
        {
          position: { x: -0.6, y: 0 },
          type: 'kinematic',
          shape: { type: 'box', width: 0.005, height: 2, rotation: 0 },
          props: { ...props, sliding: { amplitude: 1, period: 0.2, phase: 0, direction: 0 } },
        },
      ])
    );
    physics.vector.Set(0, 0);
    physics.world.SetGravity(physics.vector);
    physics.createMarble(0, -0.26, 0);
    physics.start();
    for (let step = 0; step < 120; step++) {
      physics.step(1 / 60, () => {});
      assert.ok(
        physics.getMarblePosition(0).x <= 0.03,
        'moving-object recovery cannot carry the marble through a fixed wall'
      );
    }
    console.log('PASS moving-obstacle recovery respects neighbouring fixed walls');

    for (const shape of [
      edge([
        [0, -4],
        [0, 4],
      ]),
      { type: 'box', width: 0.005, height: 4, rotation: 0 },
      { type: 'circle', radius: 0.1 },
      edge(
        [
          [-0.1, -4],
          [0.1, -4],
          [0.1, 4],
          [-0.1, 4],
          [-0.1, -4],
        ],
        { solid: true }
      ),
    ]) {
      physics.clearMarbles();
      physics.clear();
      physics.createStage(open([{ position: { x: 0, y: 0 }, type: 'static', shape, props }]));
      physics.vector.Set(0, 0);
      physics.world.SetGravity(physics.vector);
      physics.createMarble(0, -1, 0);
      physics.start();
      for (let step = 0; step < 12; step++) {
        physics.step(1 / 60, () => physics.setMarbleVelocity(0, 60, 0));
        assert.ok(physics.getMarblePosition(0).x < -0.2, `${shape.type} blocks sustained external impulses`);
      }
    }
    for (const extra of [{ sensor: true }, { collisionLayer: 2 }]) {
      physics.clearMarbles();
      physics.clear();
      physics.createStage(
        open([
          {
            position: { x: 0, y: 0 },
            type: 'static',
            shape: edge(
              [
                [0, -4],
                [0, 4],
              ],
              extra
            ),
            props,
          },
        ])
      );
      physics.createMarble(0, -1, 0);
      physics.start();
      for (let step = 0; step < 4; step++) physics.step(1 / 60, () => physics.setMarbleVelocity(0, 60, 0));
      assert.ok(physics.getMarblePosition(0).x > 1, 'sensors and the other collision layer remain passable');
    }
    physics.clearMarbles();
    physics.clear();
    assert.equal(Object.keys(B.getCache(B.b2Vec2)).length, 1, 'borrowed sweep vectors are released on reset');
    assert.equal(physics.entityBodies.size, 0);
    assert.equal(physics.movingEntities.length, 0);
    physics.dispose();
    assert.equal(Object.keys(B.getCache(B.JSRayCastCallback)).length, 0, 'native sweep callback is destroyed');
    assert.equal(Object.keys(B.getCache(B.b2Vec2)).length, 0);
    console.log('PASS edge/box/circle/solid blocking, sensor/layer exceptions and sweep cleanup');
  } finally {
    Math.random = random;
    physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
