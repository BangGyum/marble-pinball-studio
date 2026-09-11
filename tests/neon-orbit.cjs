const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { neonOrbit } = require('../src/data/neon-orbit.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
(async () => {
  let raw;
  const storage = { setItem: (_, v) => raw = v, getItem: () => raw };
  saveMaps(storage, [{ id: 'orbit', stage: neonOrbit }]);
  assert.deepEqual(readSavedMaps(storage)[0].stage.vortex, neonOrbit.vortex);
  assert.throws(() => validateStage({ ...neonOrbit, vortex: { ...neonOrbit.vortex, speed: Infinity } }));
  assert.throws(() => validateStage({ ...neonOrbit, vortex: { ...neonOrbit.vortex, gust: 2 } }));
  const physics = new Box2dPhysics(); await physics.init();
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
  for (const count of [1, 28, 100, 300]) for (const initial of [123456, 271828, 314159]) {
    let seed = initial;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    game.prepare(neonOrbit, Array.from({ length: count }, (_, i) => String(i)));
    assert.equal(physics.windTime, 0, 'preparing a new race resets the gust cycle');
    game.start([1, 1], false);
    let first = 0, upward = 0;
    while (game.state === 'running' && game.elapsed < 120) {
      game.advance();
      if (!first && game.arrivals.length) first = game.elapsed;
      for (const ball of game.balls) if (!ball.rank) {
        assert.ok(ball.x > 4 && ball.x < 36 && ball.y > -35, `escape ${count}/${initial}: ${ball.x},${ball.y}`);
        if (ball.y > 15 && physics.marbleMap[ball.id].GetLinearVelocity().y < -5) upward++;
      }
    }
    console.log({ count, initial, first, finish: game.elapsed, arrived: game.arrivals.length, upward });
    if (game.arrivals.length !== count) console.log(game.balls.filter(b => !b.rank).slice(0, 3));
    assert.equal(game.arrivals.length, count);
    if (count >= 28) assert.ok(upward > count * 10, 'circulating wind must lift the pack rather than only drain downward');
  }
  physics.clearMarbles(); physics.clear();
  assert.equal(physics.vortex, undefined, 'changing maps must clear the wind');
})().catch(e => { console.error(e); process.exitCode = 1; });
