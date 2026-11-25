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
const { bubbleMine: stage } = require('../src/data/bubble-mine.ts');
const { minePose } = require('../src/bubble-mine.ts');
const { validateStage } = require('../src/model.ts');
const { WallGuard } = require('../src/wall-guard.ts');

const [leftRail, rightRail] = stage.entities.slice(-2).map((entity) => entity.shape.points);

function boundaryX(points, y) {
  const next = points.findIndex(([, height]) => height >= y);
  if (next === 0) return points[0][0];
  if (next === -1) return points.at(-1)[0];
  const [x0, y0] = points[next - 1];
  const [x1, y1] = points[next];
  return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
}

(async () => {
  const race = new Race();
  const random = Math.random;
  await race.physics.init();
  try {
    assert.deepEqual(validateStage(JSON.parse(JSON.stringify(stage))), stage);
    race.prepare(stage, ['fast', 'first']);
    race.startRace([1, 1]);
    const physics = race.physics;
    const contact = minePose(stage.bubbleMine, 0).bubble;
    physics.placeMarble(0, contact.x - 0.586, contact.y);
    physics.placeMarble(1, contact.x + 0.571, contact.y);
    physics.setMarbleVelocity(0, 15, -11);
    physics.setMarbleVelocity(1, -2, -11);
    physics.step(1 / 60);
    assert.ok(physics.isBubblePassenger(1), 'earlier rim contact wins even if a later marble ends up closer');
    physics.placeMarble(0, contact.x, contact.y);
    physics.step(1 / 60);
    assert.ok(
      physics.isBubblePassenger(1) && !physics.isBubblePassenger(0) && physics.marbleMap[0].IsEnabled(),
      'direct overlap with an occupied bubble cannot replace the rider or take a second one'
    );
    const walls = new WallGuard(stage);
    let rides = 0,
      wallPasses = 0,
      shortRoute = 0,
      outerRoute = 0;
    for (const [count, trials] of [
      [20, 100],
      [4, 50],
      [48, 12],
      [100, 5],
      [300, 5],
    ]) {
      for (let trial = 1; trial <= trials; trial++) {
        let seed = Math.imul(trial, 2654435761) >>> 0;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        race.prepare(
          stage,
          Array.from({ length: count }, (_, i) => String(i))
        );
        race.startRace([count, count], 'desc');
        const drops = new Set(),
          pastGate = new Set(),
          passengers = new Set(),
          seated = new Set(),
          unloaded = new Set();
        let rider;
        while (race.state === 'running' && race.elapsed < 50) {
          race.advance();
          const pose = minePose(stage.bubbleMine, race.elapsed);
          const held = race.balls.filter((b) => !b.rank && race.physics.isBubblePassenger(b.id));
          assert.ok(held.length <= 1);
          const ball = held[0];
          for (const b of race.balls) {
            assert.ok(
              b.x >= boundaryX(leftRail, b.y) - 0.02 && b.x <= boundaryX(rightRail, b.y) + 0.02 && b.y >= -20,
              `marble ${b.id} left the mine at (${b.x.toFixed(2)}, ${b.y.toFixed(2)}) in the ${count}-marble race ${trial}`
            );
            if (b !== ball && !b.rank) assert.ok(b.stuck < 2, 'a marble in the normal route stopped for 2 seconds');
            if (b === ball || b.rank || pastGate.has(b.id) || b.py >= 21 || b.y < 21) continue;
            pastGate.add(b.id);
            if (b.x >= 8) shortRoute++;
            else outerRoute++;
          }
          if (rider !== undefined && !ball) {
            const released = race.balls[rider];
            assert.ok(released.x > 28 && released.y > 41 && race.physics.marbleMap[rider].IsEnabled());
            unloaded.add(rider);
          }
          rider = ball?.id;
          if (!ball) continue;
          passengers.add(ball.id);
          if (pose.rising && walls.crosses(ball.px, ball.py, ball.x, ball.y, 1)) wallPasses++;
          if (pose.falling) {
            assert.ok(Math.abs(ball.x - pose.cart.x) < 0.001);
            if (drops.has(ball.id)) assert.ok(ball.y >= ball.py - 0.001);
            assert.ok(Math.abs(ball.y - (pose.bubble.y + 1.8 * pose.dropProgress ** 2)) < 0.001);
            drops.add(ball.id);
          } else if (!pose.rising && pose.tilt === 0) {
            assert.ok(Math.hypot(ball.x - pose.cart.x, ball.y - pose.cart.y) < 0.001);
            seated.add(ball.id);
          }
        }
        assert.equal(race.finishReason, 'arrived');
        assert.equal(race.arrivals.length, count);
        assert.equal(race.rescues, 0);
        assert.deepEqual(drops, passengers);
        assert.deepEqual(seated, passengers);
        assert.deepEqual(unloaded, passengers);
        assert.ok(passengers.size > 0, `empty race: ${count} marbles, trial ${trial}`);
        assert.ok(passengers.size < count);
        rides += passengers.size;
      }
    }
    assert.ok(rides > 30 && wallPasses > 0);
    assert.ok(shortRoute > 0 && outerRoute > 0, 'both sides of the tipping bridge carry marbles');
    console.log(
      'PASS 100 x 20, 50 x 4, 12 x 48, 5 x 100, and 5 x 300 marbles:',
      rides,
      'captures, centered drops, cart rides and releases;',
      wallPasses,
      'intentional rail crossings; all finished without going out or requiring rescue. Short/outer route counts:',
      shortRoute,
      outerRoute
    );
  } finally {
    Math.random = random;
    race.physics.dispose();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
