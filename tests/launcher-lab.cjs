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
const { launcherLab } = require('../src/data/launcher-lab.ts');
const { BARREL_TILT, BARREL_LENGTH, LAUNCH_SPEED, marbleLauncher } = require('../src/marble-launcher.ts');
const { validateStage } = require('../src/model.ts');

(async () => {
  const race = new Race();
  await race.physics.init();
  const random = Math.random;
  try {
    const device = marbleLauncher(18, 16);
    const stage = { title: 'launcher', goalY: 40, zoomY: 35, entities: [device] };
    assert.deepEqual(validateStage(JSON.parse(JSON.stringify(stage))), stage);
    assert.throws(() => validateStage({ ...stage, entities: [{ ...device, type: 'static' }] }));
    assert.deepEqual(validateStage(launcherLab), launcherLab);
    const physics = race.physics;
    for (const phase of [0, 61, 100]) {
      race.prepare(stage, ['probe']);
      race.startRace([1, 1], 'asc');
      for (let i = 0; i < phase; i++) physics.step(1 / 60);
      physics.placeMarble(0, 18, 16);
      let fired = false;
      for (let i = 0; i < 45; i++) {
        physics.step(1 / 60);
        const { vx, vy } = physics.getMarbleVelocity(0);
        if (vx > -8) continue;
        const angle = BARREL_TILT + physics.getEntities()[0].angle;
        const pos = physics.getMarblePosition(0);
        assert.ok(Math.abs(vx + Math.cos(angle) * LAUNCH_SPEED) < 0.001);
        assert.ok(Math.abs(vy + Math.sin(angle) * LAUNCH_SPEED) < 0.001);
        assert.ok(Math.abs(pos.x - (18 - BARREL_LENGTH * Math.cos(angle))) < 0.001);
        assert.ok(Math.abs(pos.y - (16 - BARREL_LENGTH * Math.sin(angle))) < 0.001);
        fired = true;
        break;
      }
      assert.ok(fired, 'the ball must exit the visible muzzle at the current aiming angle');
    }
    race.prepare(stage, ['reset']);
    race.startRace([1, 1], 'asc');
    physics.placeMarble(0, 18, 16);
    for (let i = 0; i < 10; i++) physics.step(1 / 60);
    physics.removeMarble(0);
    for (let i = 0; i < 50; i++) physics.step(1 / 60);
    console.log('PASS moving muzzle position and velocity, occupied-device cleanup and map serialization');

    for (const [x, y] of [
      [31.63, 14.94],
      [29.15, 13.19],
    ]) {
      race.prepare(launcherLab, ['return-lip probe']);
      race.startRace([1, 1]);
      physics.placeMarble(0, x, y);
      Object.assign(race.balls[0], { x, y });
      physics.setMarbleVelocity(0, 0, 0);
      for (let frame = 0; frame < 180; frame++) race.advance();
      assert.ok(race.balls[0].x < 28 && race.balls[0].y > 15, 'the return lip releases a resting marble to the feed');
    }
    console.log('PASS returning marbles clear the sloped wind lip from both former resting points');

    for (const count of [1, 20, 40]) {
      for (const initial of [77, 527, 1337]) {
        let seed = initial;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        race.prepare(
          launcherLab,
          Array.from({ length: count }, (_, i) => String(i))
        );
        race.startRace([count, count], 'desc');
        const fired = new Set(),
          retrying = new Set(),
          refired = new Set();
        while (race.state === 'running' && race.elapsed < 140) {
          race.advance();
          for (const ball of race.balls) {
            if (ball.rank) continue;
            if (ball.x > 30.5 && ball.y > 26 && fired.has(ball.id)) retrying.add(ball.id);
            if (ball.x > 23.9 && ball.x < 25.4 && physics.getMarbleVelocity(ball.id).vx < -10) {
              fired.add(ball.id);
              if (retrying.has(ball.id)) refired.add(ball.id);
            }
          }
        }
        assert.equal(race.finishReason, 'arrived', 'every marble finishes through the scoring shaft');
        assert.equal(fired.size, count, 'no marble bypasses the launcher');
        assert.ok(race.arrivals.every((b) => b.x > 2.6 && b.x < 4.2));
        assert.equal(race.rescues, 0, 'the loading tray stays clear of the barrel');
        assert.deepEqual(refired, retrying, 'the lift returns every missed marble for another shot');
        if (count > 1) assert.ok(refired.size > 0);
      }
    }
    console.log('PASS full races with 1, 20 and 40 marbles, misses, reloading and physical finishes');
  } finally {
    Math.random = random;
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
