const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
global.fetch = undefined;
const {
  dolphinRows,
  validateDolphins,
  dolphinPose,
  dolphinScale,
  dolphinBounce,
  dolphinWave,
  dolphinWaves,
  DOLPHIN_DURATION,
  DOLPHIN_SWIM,
  DOLPHIN_WIDTH,
} = require('../src/dolphin.ts');
const { Race } = require('../src/race.ts'),
  { stages } = require('../src/data/maps.ts');
const { encodeScene, decodeScene } = require('../src/lan/protocol.ts');
const near = (a, b, message, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${message}: ${a} / ${b}`);
const stage = { title: 'Dolphin audit', width: 26, goalY: 100, zoomY: 95, entities: [] };
const midpoint = DOLPHIN_DURATION / 2;
assert.equal(validateDolphins(undefined, stage).interval, 5, 'default appearances are five seconds apart');
assert.equal(
  dolphinScale({ enabled: true, rows: [12], interval: 5 }),
  3,
  '100% has a three-times-larger physical base'
);
for (const map of [...stages, { ...stage, goalY: 20.345 }])
  for (const count of [1, 3, 6])
    for (const gap of [0.5, 20, 100]) {
      const rows = dolphinRows(map, count, gap);
      assert.equal(validateDolphins({ enabled: true, rows, interval: 5 }, map).rows.length, count);
    }
for (const value of [
  null,
  [],
  {},
  { enabled: true, rows: [12], interval: 4.99 },
  { enabled: true, rows: [12, 12], interval: 20 },
  { enabled: true, rows: [NaN], interval: 20 },
  { enabled: true, rows: [101], interval: 20 },
  { enabled: true, rows: Array(7).fill(12), interval: 20 },
  { enabled: true, rows: [12], interval: Infinity },
])
  assert.throws(() => validateDolphins(value, stage));
const settings = { enabled: true, rows: [12, 32, 52], interval: 12 };
const speeds = Array.from({ length: 11 }, (_, i) => (i + 5) / 10);
for (const speed of speeds) assert.equal(validateDolphins({ ...settings, speed }, stage).speed, speed);
for (const speed of [0.49, 1.51, NaN, Infinity, '1', null])
  assert.throws(() => validateDolphins({ ...settings, speed }, stage));
assert.equal(validateDolphins({ ...settings, size: 150 }, stage).size, 150, 'dolphin size is accepted in settings');
for (const size of [49, 201, NaN, Infinity, '100']) assert.throws(() => validateDolphins({ ...settings, size }, stage));
const scene = {
  type: 'scene',
  raceId: 'audit',
  revision: 1,
  stage,
  settings: { names: 'a', mapId: 0, order: 'asc', picks: 1, dolphins: settings },
  entities: [],
  fixed: [],
  balls: [],
};
assert.deepEqual(decodeScene(encodeScene(scene)).settings.dolphins, settings);
scene.settings.dolphins = { ...settings, size: 200, speed: 0.5 };
assert.deepEqual(
  decodeScene(encodeScene(scene)).settings.dolphins,
  scene.settings.dolphins,
  'LAN wire preserves size and speed'
);
assert.equal(dolphinScale(settings), 3);
assert.equal(dolphinScale({ ...settings, size: 50 }), 1.5);
assert.equal(dolphinWave(settings, 12).wave, 1);
near(dolphinWave(settings, 12).time, 0, 'configured wave interval');
assert.ok(
  dolphinWave({ ...settings, interval: 120 }, 15, true).time < DOLPHIN_DURATION,
  'preview repeats during a long actual appearance interval'
);
assert.equal(dolphinWave({ ...settings, interval: 120 }, 15).wave, 0, 'preview does not change actual race timing');
assert.equal(dolphinWave({ ...settings, interval: 5 }, 5).wave, 1, 'five-second appearances repeat on time');
assert.ok(DOLPHIN_DURATION + 0.65 <= 5 + 1e-9, 'a full traversal and splash finish before the next default appearance');
for (const speed of speeds) {
  const effect = { ...settings, rows: [32], speed };
  near(dolphinWaves(effect, 2)[0].time, 2 * speed, 'travel clock follows the dolphin speed');
  assert.equal(dolphinWave(effect, 12).wave, 1, 'appearance interval stays in race seconds');
  const previewPeriod = (DOLPHIN_DURATION + 0.65) / speed;
  assert.equal(dolphinWave(effect, previewPeriod, true).wave, 1, 'preview completes each traversal before repeating');
  near(dolphinWaves(effect, previewPeriod + 1, true)[0].time, speed, 'preview uses the same speed');
}
const overlapping = { ...settings, rows: [32], interval: 5, speed: 0.5 };
assert.deepEqual(
  dolphinWaves(overlapping, 6),
  [
    { wave: 0, time: 3 },
    { wave: 1, time: 0.5 },
  ],
  'a slow dolphin finishes its traversal while the next five-second appearance begins'
);
assert.ok(
  dolphinWaves(overlapping, 10).every((w) => w.wave > 0),
  'completed waves leave no stale dolphins'
);
{
  const { DolphinRenderer } = require('../src/dolphin-render.ts'),
    translations = [];
  const ctx = new Proxy(
    { getTransform: () => ({ a: 1, b: 0 }), translate: (x, y) => translations.push({ x, y }) },
    { get: (o, key) => (key in o ? o[key] : () => {}) }
  );
  const renderer = new DolphinRenderer();
  renderer.draw(ctx, stage, overlapping, 6, { left: -30, right: 60, top: -20, bottom: 120 });
  assert.equal(translations.length, 2, 'both slow waves are drawn');
  dolphinWaves(overlapping, 6).forEach(({ wave, time }, i) => {
    const pose = dolphinPose(stage, 32, time, wave % 2 ? -1 : 1);
    near(translations[i].x, pose.x, 'drawing and collision share horizontal position');
    near(translations[i].y, pose.y, 'drawing and collision share jump phase');
  });
  const cachedEvents = renderer.events;
  for (let i = 0; i < 120; i++)
    renderer.draw(ctx, stage, { ...overlapping, speed: i % 2 ? 0.5 : 1.5 }, i / 60, {
      left: -30,
      right: 60,
      top: -20,
      bottom: 120,
    });
  assert.equal(
    renderer.events,
    cachedEvents,
    'speed changes reuse splash geometry instead of rebuilding it every frame'
  );
}
const period = DOLPHIN_DURATION / 3;
assert.ok(period * DOLPHIN_SWIM <= 0.15, 'the submerged turn returns to the next jump immediately');
for (const scale of [1.5, 3, 6])
  for (const hop of [0, 1]) {
    const landing = (hop + 1 - DOLPHIN_SWIM / 2) * period,
      launch = (hop + 1 + DOLPHIN_SWIM / 2) * period;
    const a = dolphinPose(stage, 32, landing, 1, scale),
      b = dolphinPose(stage, 32, launch, 1, scale);
    near(a.y, 32, 'landing meets the waterline');
    near(b.y, 32, 'next launch meets the same waterline');
    assert.ok(
      b.x - a.x < DOLPHIN_WIDTH * scale * 0.2,
      'submerged horizontal travel is a small fraction of the body length'
    );
    for (const at of [landing, launch]) {
      const h = 1e-5,
        left = dolphinPose(stage, 32, at - h, 1, scale),
        p = dolphinPose(stage, 32, at, 1, scale),
        right = dolphinPose(stage, 32, at + h, 1, scale);
      near((p.y - left.y) / h, (right.y - p.y) / h, 'waterline velocity stays continuous', 0.05);
      near(left.angle, right.angle, 'body pitch does not snap at the waterline', 0.002);
      const before = dolphinPose(stage, 32, at - 2 * h, 1, scale),
        after = dolphinPose(stage, 32, at + 2 * h, 1, scale);
      near(
        (p.y - 2 * left.y + before.y) / (h * h),
        (after.y - 2 * right.y + p.y) / (h * h),
        'waterline acceleration stays continuous',
        1
      );
    }
  }
for (const time of [0, 0.5, 1.5, 1.933, 3, 5.7]) {
  const a = dolphinPose(stage, 20, time),
    b = dolphinPose(stage, 20, time, -1);
  near(a.x + b.x, 26, 'mirrored dolphin positions');
  near(a.y, b.y, 'mirrored dolphin heights');
}
// The straight upper-back edge in the source outline runs from pixel (1170,225) to (1273,227).
const surfacePoint = { x: ((1221.5 - 53 - 1675 / 2) * 4) / 1675, y: ((226 - 102 - 626 / 2) * 4) / 1675 };
const n = { x: 2 / Math.hypot(103, 2), y: -103 / Math.hypot(103, 2) },
  tangent = { x: -n.y, y: n.x };
const pose = { x: 13, y: 20, angle: 0, direction: 1, waterY: 30 };
const ball = {
  x: 13 + surfacePoint.x + n.x * 0.24,
  y: 20 + surfacePoint.y + n.y * 0.24,
  vx: -n.x * 10 + tangent.x * 3,
  vy: -n.y * 10 + tangent.y * 3,
};
const velocity = dolphinBounce(ball, pose, { vx: 0, vy: 0, omega: 0 });
assert.ok(velocity?.hit);
near(velocity.vx * n.x + velocity.vy * n.y, 5.5, 'normal reflection');
near(velocity.vx * tangent.x + velocity.vy * tangent.y, 3, 'tangential momentum');
const sustained = dolphinBounce(ball, pose, { vx: 0, vy: 0, omega: 0 }, false);
near(sustained.vx * n.x + sustained.vy * n.y, 0, 'sustained contact removes inward motion without another bounce');
near(sustained.vx * tangent.x + sustained.vy * tangent.y, 3, 'sustained contact preserves tangential momentum');
const fastWall = { vx: n.x * 40, vy: n.y * 40, omega: 0 };
for (const initialImpact of [true, false]) {
  const pushed = dolphinBounce({ ...ball, vx: 0, vy: 0 }, pose, fastWall, initialImpact);
  assert.ok(
    (pushed.vx - fastWall.vx) * n.x + (pushed.vy - fastWall.vy) * n.y >= -1e-6,
    'the speed limit must not leave the marble moving into a faster dolphin'
  );
  const rapidTurn = dolphinBounce(
    { ...ball, vx: 0, vy: 0 },
    pose,
    { vx: n.x * 120, vy: n.y * 120, omega: 0 },
    initialImpact
  );
  assert.ok(
    Math.hypot(rapidTurn.vx, rapidTurn.vy) <= 60 + 1e-6,
    'fast waterline turns cannot launch a marble at an unbounded speed'
  );
}
assert.equal(
  dolphinBounce({ ...ball, y: ball.y + 20 }, { ...pose, y: 40 }, { vx: 0, vy: 0, omega: 0 }),
  undefined,
  'submerged surfaces do not hit'
);
for (const scale of [1.5, 3, 6]) {
  const point = { ...ball, x: 13 + surfacePoint.x * scale + n.x * 0.24, y: 20 + surfacePoint.y * scale + n.y * 0.24 };
  const result = dolphinBounce(point, { ...pose, scale }, { vx: 0, vy: 0, omega: 0 });
  assert.ok(result?.hit);
  near(result.vx * n.x + result.vy * n.y, 5.5, 'scaled surface has the same normal reflection');
  assert.equal(
    dolphinBounce(
      { ...point, x: point.x + n.x * 0.02, y: point.y + n.y * 0.02 },
      { ...pose, scale },
      { vx: 0, vy: 0, omega: 0 }
    ),
    undefined,
    'ball radius stays .25 at every dolphin size'
  );
  const small = dolphinPose(stage, 20, midpoint, 1, scale),
    mirrored = dolphinPose(stage, 20, midpoint, -1, scale);
  near(small.x + mirrored.x, 26, 'scaled mirrored paths');
  near(20 - small.y, 2.5 * scale, 'scaled jump height');
}
console.log(
  'PASS dolphin size/bounds, legacy default, actual/preview timing, LAN wire, mirror and scaled collision reflection'
);
(async () => {
  const race = new Race();
  await race.physics.init();
  let seed = 42;
  const random = Math.random;
  const resetSeed = () => {
    seed = 42;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  };
  const names = Array.from({ length: 100 }, (_, i) => String(i));
  const run = async (effect) => {
    resetSeed();
    const sample = new Race();
    await sample.physics.init();
    try {
      sample.prepare(stage, names, effect);
      sample.startRace([1, 1]);
      for (let i = 0; i < 240; i++) sample.advance();
      return JSON.stringify(sample.balls);
    } finally {
      sample.physics.dispose();
    }
  };
  try {
    assert.ok(
      (await run()) === (await run({ ...settings, enabled: false })),
      'disabled dolphins preserve exact physics'
    );
    assert.ok(
      (await run(settings)) === (await run({ ...settings, size: 100 })),
      'legacy and explicit 100% sizes preserve exact physics'
    );
    assert.ok(
      (await run(settings)) === (await run({ ...settings, speed: 1 })),
      'legacy and explicit 1x speeds preserve exact physics'
    );
    for (const speed of speeds)
      for (const wave of [0, 1]) {
        const effect = { enabled: true, rows: [32], interval: 12, speed },
          dt = 1 / 240,
          direction = wave ? -1 : 1;
        const at = wave * effect.interval + midpoint / speed;
        const before = dolphinPose(stage, 32, midpoint, direction),
          p = dolphinPose(stage, 32, midpoint + dt * speed, direction);
        const motion = {
          vx: (p.x - before.x) / dt,
          vy: (p.y - before.y) / dt,
          omega: (direction * Math.atan2(Math.sin(p.angle - before.angle), Math.cos(p.angle - before.angle))) / dt,
        };
        const local = { x: surfacePoint.x * p.scale + n.x * 0.24, y: surfacePoint.y * p.scale + n.y * 0.24 };
        const position = {
          x: p.x + direction * (Math.cos(p.angle) * local.x - Math.sin(p.angle) * local.y),
          y: p.y + Math.sin(p.angle) * local.x + Math.cos(p.angle) * local.y,
        };
        race.prepare(stage, ['speed contact'], effect);
        race.startRace([1, 1]);
        race.physics.placeMarble(0, position.x, position.y);
        race.physics.setMarbleVelocity(0, 0, 30);
        const expected = dolphinBounce({ ...position, ...race.physics.getMarbleVelocity(0) }, p, motion);
        assert.ok(expected?.hit, 'the test marble approaches the moving dolphin');
        race.stepDolphins(dt, at);
        const actual = race.physics.getMarbleVelocity(0);
        near(actual.vx, expected.vx, 'horizontal bounce uses the selected real-time speed', 1e-4);
        near(actual.vy, expected.vy, 'vertical bounce uses the selected real-time speed', 1e-4);
        assert.ok(race.dolphinContacts.has(`${wave}:0:0`), 'each appearance tracks its own contact');
      }
    {
      const effect = { enabled: true, rows: [32], interval: 5, speed: 0.5 },
        dt = 1 / 240,
        at = 6;
      const p = dolphinPose(stage, 32, at * effect.speed + dt * effect.speed);
      const local = { x: surfacePoint.x * p.scale + n.x * 0.24, y: surfacePoint.y * p.scale + n.y * 0.24 };
      race.prepare(stage, ['older wave contact'], effect);
      race.startRace([1, 1]);
      race.physics.placeMarble(
        0,
        p.x + Math.cos(p.angle) * local.x - Math.sin(p.angle) * local.y,
        p.y + Math.sin(p.angle) * local.x + Math.cos(p.angle) * local.y
      );
      race.physics.setMarbleVelocity(0, 0, 30);
      race.stepDolphins(dt, at);
      assert.ok(
        race.dolphinContacts.has('0:0:0'),
        'the older slow dolphin remains collidable after the next appearance starts'
      );
    }
    console.log(
      'PASS real-speed reflection at every 0.1x step from 0.5 to 1.5x in both directions and collidable overlapping slow waves'
    );
    // A separating overlap must not consume the first impact when a real roof reflects the ball back.
    for (const direction of [1, -1]) {
      const effect = { enabled: true, rows: [32], interval: 5, size: 100 },
        scale = dolphinScale(effect);
      const time = midpoint + (direction === -1 ? effect.interval : 0),
        dt = 1 / 240;
      const p = dolphinPose(stage, 32, midpoint + dt, direction, scale);
      const local = { x: surfacePoint.x * scale + n.x * 0.24, y: surfacePoint.y * scale + n.y * 0.24 };
      const position = {
        x: p.x + direction * (Math.cos(p.angle) * local.x - Math.sin(p.angle) * local.y),
        y: p.y + Math.sin(p.angle) * local.x + Math.cos(p.angle) * local.y,
      };
      const roof = {
        type: 'static',
        position: { x: position.x, y: position.y - 0.31 },
        shape: { type: 'box', width: 6, height: 0.05, rotation: 0 },
        props: { density: 1, restitution: 1, angularVelocity: 0 },
      };
      race.prepare({ ...stage, entities: [roof] }, ['roof contact'], effect);
      race.startRace([1, 1]);
      race.elapsed = time;
      race.physics.placeMarble(0, position.x, position.y);
      race.physics.setMarbleVelocity(0, direction * 11.5, -10);
      const original = race.stepDolphins,
        samples = [];
      race.stepDolphins = function (dt, elapsed) {
        const { time } = dolphinWave(effect, elapsed),
          before = dolphinPose(stage, 32, time, direction, scale);
        const pose = dolphinPose(stage, 32, time + dt, direction, scale);
        const motion = {
          vx: (pose.x - before.x) / dt,
          vy: (pose.y - before.y) / dt,
          omega:
            (direction * Math.atan2(Math.sin(pose.angle - before.angle), Math.cos(pose.angle - before.angle))) / dt,
        };
        const velocity = this.physics.getMarbleVelocity(0),
          position = this.physics.getMarblePosition(0);
        const prior = this.dolphinContacts.has(`${dolphinWave(effect, elapsed).wave}:0:0`);
        const expected = dolphinBounce({ ...position, ...velocity }, pose, motion, !prior);
        original.call(this, dt, elapsed);
        samples.push({ prior, expected, velocity, after: this.physics.getMarbleVelocity(0) });
      };
      try {
        for (let i = 0; i < 3; i++) race.advance();
      } finally {
        race.stepDolphins = original;
      }
      assert.equal(samples[0].expected.hit, false, 'the initial overlap is separating');
      const incoming = samples.find((sample) => sample.expected?.hit);
      assert.ok(incoming, 'the real roof reflects the marble into the dolphin');
      assert.equal(incoming.prior, false, 'a separating-only overlap never locks the first impact');
      near(incoming.after.vx, incoming.expected.vx, 'first incoming contact reflects horizontal velocity', 1e-5);
      near(incoming.after.vy, incoming.expected.vy, 'first incoming contact reflects vertical velocity', 1e-5);
      const repeated = samples.filter((sample) => sample.prior && sample.expected);
      assert.ok(repeated.length, 'the impact remains tracked while the surfaces overlap');
      for (const sample of repeated) {
        const expected = sample.expected.hit ? sample.expected : sample.velocity;
        near(sample.after.vx, expected.vx, 'sustained contact applies only the inward-velocity constraint', 1e-5);
        near(sample.after.vy, expected.vy, 'sustained contact applies no repeated restitution', 1e-5);
      }
    }
    console.log('PASS first dolphin impact after a real roof rebound and single restitution in both directions');
    {
      const effect = { enabled: true, rows: [32], interval: 5, size: 100 },
        dt = 1 / 240,
        scale = dolphinScale(effect);
      const a = dolphinPose(stage, 32, midpoint, 1, scale),
        p = dolphinPose(stage, 32, midpoint + dt, 1, scale);
      const local = { x: surfacePoint.x * scale + n.x * 0.24, y: surfacePoint.y * scale + n.y * 0.24 };
      const position = {
        x: p.x + Math.cos(p.angle) * local.x - Math.sin(p.angle) * local.y,
        y: p.y + Math.sin(p.angle) * local.x + Math.cos(p.angle) * local.y,
      };
      const nx = Math.cos(p.angle) * n.x - Math.sin(p.angle) * n.y,
        ny = Math.sin(p.angle) * n.x + Math.cos(p.angle) * n.y;
      const rx = position.x - p.x - nx * 0.24,
        ry = position.y - p.y - ny * 0.24;
      const omega = Math.atan2(Math.sin(p.angle - a.angle), Math.cos(p.angle - a.angle)) / dt;
      const wall = { vx: (p.x - a.x) / dt - omega * ry, vy: (p.y - a.y) / dt + omega * rx };
      race.prepare(stage, ['continuous contact'], effect);
      race.startRace([1, 1]);
      race.physics.placeMarble(0, position.x, position.y);
      race.physics.setMarbleVelocity(0, 0, 10);
      race.stepDolphins(dt, midpoint);
      assert.ok(race.dolphinContacts.has('0:0:0'), 'the initial bounce is tracked');
      for (let i = 0; i < 3; i++) {
        // Another force may push the ball inward again before it separates from the dolphin.
        race.physics.setMarbleVelocity(0, wall.vx - nx * 2, wall.vy - ny * 2);
        const before = race.physics.getMarblePosition(0);
        race.stepDolphins(dt, midpoint);
        const v = race.physics.getMarbleVelocity(0);
        near(
          (v.vx - wall.vx) * nx + (v.vy - wall.vy) * ny,
          0,
          'continued contact stops inward motion without another launch',
          1e-5
        );
        assert.deepEqual(
          race.physics.getMarblePosition(0),
          before,
          'dolphin contact never teleports a ball through map walls'
        );
      }
      console.log(
        'PASS sustained dolphin contact prevents inward motion without repeated restitution or teleportation'
      );
    }
    race.prepare(stage, ['contact'], { enabled: true, rows: [20], interval: 20 });
    race.startRace([1, 1]);
    race.elapsed = midpoint;
    const p = dolphinPose(stage, 20, midpoint + 1 / 240),
      contactScale = dolphinScale(race.dolphins);
    const contactX = surfacePoint.x * contactScale + n.x * 0.24,
      contactY = surfacePoint.y * contactScale + n.y * 0.24;
    race.physics.placeMarble(
      0,
      p.x + Math.cos(p.angle) * contactX - Math.sin(p.angle) * contactY,
      p.y + Math.sin(p.angle) * contactX + Math.cos(p.angle) * contactY
    );
    race.physics.setMarbleVelocity(0, 0, 30);
    let impacts = 0;
    const setVelocity = race.physics.setMarbleVelocity.bind(race.physics);
    race.physics.setMarbleVelocity = (...args) => {
      impacts++;
      setVelocity(...args);
    };
    race.advance();
    assert.ok(impacts > 0, 'the real Box2D race receives the dolphin impact');
    assert.ok(race.physics.getMarbleVelocity(0).vy < 0, 'contact reflects downward velocity upward');
    race.prepare(stage, ['large contact'], { enabled: true, rows: [20], interval: 20, size: 200 });
    race.startRace([1, 1]);
    race.elapsed = midpoint;
    const scale = dolphinScale({ size: 200 }),
      large = dolphinPose(stage, 20, midpoint, 1, scale);
    race.physics.placeMarble(0, large.x + 1.55 * scale, large.y);
    race.physics.setMarbleVelocity(0, -10, 0);
    impacts = 0;
    race.advance();
    assert.ok(impacts > 0, 'large dolphin contacts beyond the original 3-unit broad phase are included');
    {
      const effect = { enabled: true, rows: [20], interval: 5, size: 200 },
        dt = 1 / 240;
      race.prepare(stage, names, effect);
      race.startRace([1, 100]);
      const p = dolphinPose(stage, 20, midpoint + dt, 1, dolphinScale(effect));
      const x = (((400.5 - 53 - 1675 / 2) * 4) / 1675) * p.scale,
        y = (((650.5 - 102 - 626 / 2) * 4) / 1675) * p.scale;
      const position = {
        x: p.x + Math.cos(p.angle) * x - Math.sin(p.angle) * y,
        y: p.y + Math.sin(p.angle) * x + Math.cos(p.angle) * y,
      };
      assert.equal(
        dolphinBounce({ ...position, vx: 0, vy: 0 }, p, { vx: 0, vy: 0, omega: 0 }),
        undefined,
        'the transparent tail gap lies inside the broad phase but outside the real outline'
      );
      for (const ball of race.balls) race.physics.placeMarble(ball.id, position.x, position.y);
      const velocity = race.physics.getMarbleVelocity.bind(race.physics);
      let reads = 0;
      race.physics.getMarbleVelocity = (id) => {
        reads++;
        return velocity(id);
      };
      try {
        race.stepDolphins(dt, midpoint);
      } finally {
        race.physics.getMarbleVelocity = velocity;
      }
      assert.equal(reads, 0, '100 marbles in transparent space do not read WASM velocities or create contacts');
      assert.equal(race.dolphinContacts.size, 0);
      console.log('PASS dolphin broad-phase misses avoid all 100 unnecessary WASM velocity reads');
    }
    {
      const canyon = stages.find((map) => map.title === '균열 협곡');
      race.prepare(canyon, ['upward rebound']);
      race.physics.start();
      race.physics.placeMarble(0, 55, 78);
      race.physics.setMarbleVelocity(0, 2, -20);
      let minY = 78;
      for (let i = 0; i < 30; i++) {
        race.physics.step(1 / 60);
        minY = Math.min(minY, race.physics.getMarblePosition(0).y);
      }
      assert.ok(
        minY > 75.5,
        'an upward dolphin rebound cannot enter the dead-end pocket behind the lower canyon guide'
      );
    }
    console.log('PASS upward canyon rebounds stay outside the closed guide pocket');
    for (const speed of process.argv.includes('--speeds') ? [0.5, 1, 1.5] : [1])
      for (const size of process.argv.includes('--sizes') ? [50, 100, 200] : [100])
        for (const map of stages) {
          race.prepare(map, names, { enabled: true, rows: dolphinRows(map, 6, 20), interval: 5, size, speed });
          race.startRace([1, 1]);
          for (let i = 0; i < (process.argv.includes('--finish') ? 60 * 650 : 720) && race.state === 'running'; i++) {
            race.advance();
            for (const b of race.balls)
              assert.ok([b.x, b.y, b.angle].every(Number.isFinite), `${map.title}: finite marble state`);
          }
          if (process.argv.includes('--finish'))
            assert.equal(race.state, 'finished', `${map.title}: race completes with dolphins`);
          console.log(
            `PASS integrated dolphin physics: ${map.title}, size ${size}%, speed ${speed}x, 100 marbles, 6 rows, 5-second interval, ${race.elapsed.toFixed(1)}s, ${race.finishReason ?? 'running'}`
          );
        }
  } finally {
    Math.random = random;
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
