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

const { neonJunction } = require('../src/data/neon-junction.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
const { validateStage } = require('../src/model.ts');
global.fetch = undefined;
async function run() {
  const physics = new Box2dPhysics();
  await physics.init();
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {} });
  const original = JSON.stringify(neonJunction);
  const names = Array.from({ length: 49 }, (_, i) => String(i));
  game.prepare(neonJunction, names);
  const first = game.balls.map((b) => [b.x, b.y]);
  const phases = physics.getEntities().map((e) => (e.shape.type === 'box' ? e.shape.rotation : null));
  for (let i = 0; i < game.balls.length; i++) {
    const b = game.balls[i];
    assert.ok(Math.abs(b.x - (10.1 + (i % 10) * 0.61)) <= 0.04);
    assert.ok(Math.abs(b.y - (5 - Math.floor(i / 10) * 0.62)) <= 0.04);
    for (let j = 0; j < i; j++)
      assert.ok(Math.hypot(b.x - game.balls[j].x, b.y - game.balls[j].y) > 0.5, 'marbles must not overlap');
  }
  physics.start();
  const velocities = Object.values(physics.marbleMap).map((body) => body.GetLinearVelocity());
  assert.ok(velocities.every((v) => Math.abs(v.get_x()) <= 3 && Math.abs(v.get_y()) <= 1));
  assert.ok(velocities.some((v) => Math.abs(v.get_x()) > 0.01));
  game.prepare(neonJunction, names);
  assert.notDeepEqual(
    game.balls.map((b) => [b.x, b.y]),
    first
  );
  const next = physics.getEntities();
  assert.ok(next.some((e, i) => e.y < 28 && e.shape.type === 'box' && e.shape.rotation !== phases[i]));
  next.forEach((e, i) => {
    if (e.y >= 28 && e.shape.type === 'box')
      assert.equal(e.shape.rotation, phases[i], 'finish paddles retain their designed phase');
  });
  assert.equal(JSON.stringify(neonJunction), original, 'randomization must not mutate saved map definitions');
  game.prepare({ ...neonJunction, randomizeStart: false }, names);
  assert.equal(game.balls[0].x, 10.1);
  assert.equal(game.balls[0].y, 5);
  physics.start();
  assert.ok(
    Object.values(physics.marbleMap).every(
      (b) => b.GetLinearVelocity().get_x() === 0 && b.GetLinearVelocity().get_y() === 0
    )
  );
  assert.throws(() => validateStage({ ...neonJunction, randomizeStart: 'yes' }));
  physics.clearMarbles();
  physics.clear();
  console.log('PASS launch spacing, velocity bounds, phase variation, reset, map immutability and legacy behavior');
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
