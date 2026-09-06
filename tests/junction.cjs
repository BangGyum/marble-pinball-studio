const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
const { neonJunction: liveStage } = require('../src/data/neon-junction.ts');
// Fixed initial conditions isolate course geometry; randomized starts are audited separately.
const neonJunction = { ...liveStage, randomizeStart: false };
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
const { validateStage } = require('../src/model.ts');
global.fetch = undefined;
let seed = 123456;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
async function run() {
  validateStage(neonJunction);
  const physics = new Box2dPhysics();
  await physics.init();
  const solidEntities = neonJunction.entities.filter((e) => e.shape.solid);
  assert.equal(solidEntities.length, 2);
  const storedStage = validateStage(JSON.parse(JSON.stringify(neonJunction)));
  assert.equal(storedStage.entities.filter((e) => e.shape.solid).length, 2, 'solid walls survive map save/load');
  for (const points of [
    [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [2, 0],
      [1, 0.5],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
    [
      [0, 0],
      [2, 2],
      [0, 2],
      [2, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [0, 0],
      [1, 1],
      [0, 0],
    ],
  ]) {
    const bad = JSON.parse(JSON.stringify(neonJunction));
    bad.entities.find((e) => e.shape.solid).shape.points = points;
    assert.throws(() => validateStage(bad), 'unsafe filled polygon must be rejected');
  }
  physics.createStage(neonJunction);
  const solids = physics.entities.filter((e) => e.shape.solid);
  for (const [i, x] of [26.48, 39.52].entries()) {
    physics.vector.Set(x, 167.39);
    assert.ok(
      solids[i].body.GetFixtureList().TestPoint(physics.vector),
      'divider interior must have real collision coverage'
    );
  }
  physics.clear();
  console.log('PASS filled divider collision, save/load and invalid polygon validation');
  let shakes = 0;
  const shake = physics.shakeMarble.bind(physics);
  physics.shakeMarble = (id) => {
    shakes++;
    shake(id);
  };
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
  const usedPipes = new Set();
  for (const count of [1, 4, 8, 12, 30, 49]) {
    shakes = 0;
    game.prepare(
      neonJunction,
      Array.from({ length: count }, (_, i) => '참가자' + i)
    );
    const directRoutes = new Map(
      game.balls.map((ball) => [ball.id, Math.min(4, Math.max(0, Math.floor((ball.x - 9.25) / 1.45)))])
    );
    game.start([1, 1], false);
    const upper = new Map(),
      checkpoints = [];
    let first = 0;
    for (let tick = 0; tick < 60 * 100 && game.state === 'running'; tick++) {
      game.advance();
      for (const ball of game.balls) {
        if (ball.y > 8)
          assert.ok(ball.x >= -0.5 && ball.x <= 66.5, 'marble escaped the outer walls: ' + JSON.stringify(ball));
        if (ball.y >= 100 && !upper.has(ball.id))
          upper.set(ball.id, Math.min(4, Math.max(0, Math.floor((ball.x - 0.5) / 13))));
        if (ball.y >= 169 && !checkpoints.includes(ball.id)) checkpoints.push(ball.id);
      }
      if (!first && game.arrivals.length) first = game.elapsed;
    }
    assert.ok(game.elapsed < 60, 'the race must stay short, including the last marble');
    assert.equal(shakes, 0, 'the map must drain without automatic unsticking impulses');
    assert.equal(new Set(game.arrivals.map((b) => b.id)).size, count);
    assert.equal(game.winners[0].id, game.arrivals[0].id);
    if (count >= 4) {
      assert.ok(new Set(upper.values()).size >= 2, 'multiple pipes must be used');
      if (count >= 30)
        assert.ok(
          checkpoints.some((id, i) => game.arrivals[i].id !== id),
          'the final section must allow overtakes'
        );
    }
    if (count >= 30) {
      assert.ok(
        [...upper].some(([id, route]) => route !== directRoutes.get(id)),
        'mixing must change routes from initial alignment'
      );
      upper.forEach((route) => usedPipes.add(route));
      assert.ok(new Set(upper.values()).size >= 3, 'the mixer must distribute large groups across pipes');
    }
    console.log(
      'PASS neon junction: ' +
        count +
        ' marbles, first ' +
        first.toFixed(1) +
        's, all ' +
        game.elapsed.toFixed(1) +
        's, no stuck marbles'
    );
    assert.equal(game.state, 'finished', 'all marbles must finish');
  }
  assert.equal(usedPipes.size, 5, 'all five independent pipes must be reachable');
  for (const [x, y] of [
    [29, 174],
    [37, 174],
    [28.6, 167],
    [37.4, 167],
  ]) {
    game.prepare(neonJunction, ['재도전']);
    physics.clearMarbles();
    physics.createMarble(0, x, y);
    Object.assign(game.balls[0], { x, y });
    game.start([1, 1], false);
    let returnedToTop = false;
    let passedGap = y === 174;
    for (let tick = 0; tick < 60 * 60 && game.state === 'running'; tick++) {
      game.advance();
      const ball = game.balls[0];
      if (ball.y > 169.5 && (x < 33 ? ball.x < 29.3 : ball.x > 36.7)) passedGap = true;
      if (passedGap && ball.y < 166.4) returnedToTop = true;
    }
    assert.ok(passedGap, 'both funnel-side gaps must admit a marble from above');
    assert.ok(returnedToTop, 'a missed marble must be lifted to the jar entrance');
    assert.equal(game.state, 'finished', 'a returned marble must eventually reach the centre exit');
  }
  console.log('PASS both jar return channels lift missed marbles and feed the central exit');
  game.prepare(neonJunction, ['마름모 반사']);
  physics.clearMarbles();
  physics.createMarble(0, 32.65, 163);
  Object.assign(game.balls[0], { x: 32.65, y: 163 });
  game.start([1, 1], false);
  let bouncedUp = false,
    deflected = false,
    previousY = 163;
  for (let tick = 0; tick < 180; tick++) {
    game.advance();
    const ball = game.balls[0];
    if (ball.y < previousY - 0.01) bouncedUp = true;
    if (Math.abs(ball.x - 32.65) > 0.5) deflected = true;
    previousY = ball.y;
  }
  assert.ok(bouncedUp && deflected, 'the entrance diamond must bounce a falling marble upward and sideways');
  console.log('PASS entrance diamond physically bounces and redirects a falling marble');
  physics.clearMarbles();
  physics.clear();
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
