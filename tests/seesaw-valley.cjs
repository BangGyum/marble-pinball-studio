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
const { seesawValley: stage } = require('../src/data/seesaw-valley.ts');
const { validateStage } = require('../src/model.ts');

(async () => {
  assert.deepEqual(validateStage(stage), stage);
  const pivots = [...new Map(stage.entities.filter((e) => e.props.oscillation).map((e) => [e.position.y, e])).values()];
  const routes = pivots.map(() => [0, 0]);
  let entrants = 0,
    rejoined = 0,
    passedRivals = 0,
    placesGained = 0;
  const race = new Race();
  await race.physics.init();
  const random = Math.random;
  try {
    // Drop onto the same spot once during each phase to isolate the door from race traffic.
    for (const [startTime, shouldEnter] of [
      [2, false],
      [5.95, true],
    ]) {
      race.prepare(stage, ['probe']);
      race.startRace([1, 1], 'asc');
      for (let frame = 0; frame < Math.round(startTime * 60); frame++) race.advance();
      race.physics.placeMarble(0, 24.2, 52.55);
      Object.assign(race.balls[0], { x: 24.2, y: 52.55 });
      race.physics.setMarbleVelocity(0, 0, 5);
      let entered = false;
      for (let frame = 0; frame < 90; frame++) {
        race.advance();
        entered ||= Boolean(race.balls[0].onBridge);
      }
      assert.equal(entered, shouldEnter, 'only an open door admits a marble dropped above the shortcut');
    }
    for (const count of [1, 20, 40]) {
      for (const initial of [127, 991, 2027]) {
        let seed = initial;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        race.prepare(
          stage,
          Array.from({ length: count }, (_, i) => String(i))
        );
        race.startRace([count, count], 'desc');
        const entered = new Map();
        const exited = new Set();
        while (race.state === 'running' && race.elapsed < 120) {
          race.advance();
          for (const ball of race.balls) {
            assert.ok(ball.x >= 1.98 && ball.x <= 44.02, 'ball stays inside the cabinet');
            if (ball.onBridge && !entered.has(ball.id)) {
              entered.set(
                ball.id,
                new Set(race.balls.filter((other) => !other.rank && other.y > ball.y).map((other) => other.id))
              );
              entrants++;
            }
            if (entered.has(ball.id) && !ball.onBridge && !exited.has(ball.id)) {
              assert.ok(ball.y >= stage.exitBridge.transfers[0].exit.y - 0.75, 'returns below the fourth seesaw');
              exited.add(ball.id);
              rejoined++;
              const overtaken = race.balls.filter(
                (other) => entered.get(ball.id).has(other.id) && !other.rank && other.y < ball.y
              );
              if (overtaken.length) passedRivals++;
              placesGained += overtaken.length;
            }
            pivots.forEach(({ position }, i) => {
              const level = position.y + 6;
              if (ball.py < level && ball.y >= level) routes[i][Number(ball.x > position.x)]++;
            });
          }
        }
        console.log(count, initial, race.elapsed.toFixed(2), race.arrivals.length, race.finishReason, race.rescues);
        if (race.finishReason !== 'arrived') console.log(race.racing().map(({ x, y }) => [x, y]));
        assert.equal(race.finishReason, 'arrived');
        assert.equal(race.arrivals.length, count);
        assert.equal(race.rescues, 0);
        assert.ok(
          race.arrivals.every((ball) => ball.x > 19 && ball.x < 27),
          'finish through the funnel'
        );
      }
    }
    console.log({ entrants, rejoined, passedRivals, placesGained });
    assert.ok(entrants > 0 && entrants < 183, 'both shortcut and regular routes are used');
    assert.equal(rejoined, entrants);
    assert.ok(passedRivals > 0, 'shortcut users pass rivals during transit');
    console.log('Left/right crossings at each tier:', routes);
    assert.ok(routes.every(([left, right]) => left > 0 && right > 0));
  } finally {
    Math.random = random;
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
