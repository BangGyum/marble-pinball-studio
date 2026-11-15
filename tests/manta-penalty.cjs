const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f
  );
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { animalPoses } = require('../src/sea-animals.ts');
const { mantaMouthContains, MANTA_SPRITE_RECT: rect, MANTA_SPRITE_WIDTH: width } = require('../src/manta-hitbox.ts');
const { drawMantaPenalty, MANTA_PENALTY_SECONDS } = require('../src/manta-penalty.ts');
const { setSceneTheme } = require('../src/scene-theme.ts');
const stage = { title: 'Capture audit', width: 40, goalY: 200, entities: [] };
const options = { enabled: false, rows: [20], interval: 5, manta: { enabled: true, rows: [20], interval: 5 } };
function mouth(pose, px = 1560, py = 455) {
  const x = ((px - rect[0] - rect[2] / 2) * width) / rect[2],
    y = ((py - rect[1] - rect[3] / 2) * width) / rect[2];
  return {
    x: pose.x + pose.direction * pose.scale * (Math.cos(pose.angle) * x - Math.sin(pose.angle) * y),
    y: pose.y + pose.scale * (Math.sin(pose.angle) * x + Math.cos(pose.angle) * y),
  };
}
for (const scale of [1.5, 3, 6])
  for (const direction of [-1, 1])
    for (const angle of [-1, 0, 1]) {
      const p = { x: 20, y: 20, scale, direction, angle };
      assert.ok(mantaMouthContains(mouth(p), p), 'open pocket captures at every supported size and direction');
      for (const pixel of [
        [1390, 455],
        [1750, 455],
        [1300, 300],
        [1000, 100],
      ])
        assert.equal(mantaMouthContains(mouth(p, ...pixel), p), false, 'body, wings and exterior do not capture');
    }
for (const theme of ['dark', 'beige'])
  for (const reduced of [false, true]) {
    setSceneTheme(theme);
    const calls = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_, key) =>
          (...args) =>
            calls.push([key, ...args]),
        set: () => true,
      }
    );
    assert.equal(drawMantaPenalty(ctx, 1, 2, undefined, 0, 32, reduced), undefined);
    assert.equal(calls.length, 0);
    assert.ok(drawMantaPenalty(ctx, 1, 2, 0, 0.4, 32, reduced).amount > 0);
    assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === '꿀꺽!'));
    calls.length = 0;
    assert.equal(drawMantaPenalty(ctx, 1, 2, 0, 1.1, 32, reduced), undefined);
    assert.equal(calls.filter((c) => c[0] === 'fill').length, 3);
    calls.length = 0;
    drawMantaPenalty(ctx, 1, 2, 0, MANTA_PENALTY_SECONDS, 32, reduced);
    assert.equal(calls.length, 0, 'expired penalties leave no animation work');
  }
setSceneTheme('dark');
(async () => {
  const race = new Race();
  await race.physics.init();
  try {
    race.prepare(stage, ['a'], options);
    race.startRace([1, 1]);
    race.elapsed = 1.2;
    const p = animalPoses(options, stage, race.elapsed, 1 / 240)[0].p,
      pos = mouth(p);
    race.physics.placeMarble(0, pos.x, pos.y);
    Object.assign(race.balls[0], pos, { px: pos.x, py: pos.y });
    race.stepDolphins(1 / 240, race.elapsed);
    const at = race.balls[0].mantaCaughtAt;
    assert.equal(at, 1.2);
    for (let i = 0; i < 45; i++) race.advance();
    assert.ok(
      Math.hypot(race.balls[0].x - pos.x, race.balls[0].y - pos.y) < 0.05,
      'hold never carries the marble with the manta'
    );
    race.physics.setMarbleVelocity(0, 20, 0);
    race.stepDolphins(1 / 60, at + 0.79);
    assert.equal(race.physics.getMarbleSpeed(0), 0, 'hold lasts 0.8 simulation seconds');
    race.physics.setMarbleVelocity(0, 20, 0);
    race.stepDolphins(1 / 60, at + 0.81);
    assert.ok(race.physics.getMarbleVelocity(0).vx > 18, 'release restores motion without a launch impulse');
    race.physics.setMarbleVelocity(0, 20, 0);
    for (let i = 0; i < 60; i++) race.stepDolphins(1 / 60, at + 0.85 + i / 60);
    assert.ok(race.physics.getMarbleVelocity(0).vx < 5, 'stun gradually reduces momentum');
    race.physics.setMarbleVelocity(0, 20, 0);
    race.stepDolphins(1 / 60, at + 2.8);
    assert.equal(race.balls[0].mantaCaughtAt, undefined);
    assert.equal(race.physics.getMarbleVelocity(0).vx, 20, 'normal motion returns after 2.8 seconds');
    for (const time of [4, 6.2]) {
      const next = mouth(animalPoses(options, stage, time, 1 / 240)[0].p);
      race.physics.placeMarble(0, next.x, next.y);
      race.stepDolphins(1 / 240, time);
      assert.equal(
        race.balls[0].mantaCaughtAt,
        time === 4 ? undefined : time,
        'the same wave cannot capture twice; a new wave can'
      );
    }
    race.balls[0].mantaCaughtAt = 8.5;
    race.physics.setMarbleVelocity(0, 20, 0);
    assert.equal(animalPoses(options, stage, 9.4, 1 / 60).length, 0);
    race.stepDolphins(1 / 60, 9.4);
    assert.ok(race.physics.getMarbleVelocity(0).vx < 20, 'stun continues between animal waves');
    race.prepare(stage, ['new'], options);
    assert.equal(race.balls[0].mantaCaughtAt, undefined);
    assert.equal(race.mantaCaughtWaves.size, 0, 'a new map clears capture immunity');
    console.log(
      'PASS mouth-only capture, 0.8s hold, 2s stun, no teleport, release/reset and dark/beige/reduced-motion cues'
    );
  } finally {
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
