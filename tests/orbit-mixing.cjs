const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { neonOrbit } = require('../src/data/neon-orbit.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
(async () => {
  // Reference the original steady-flow layout to measure whether mixing actually improves.
  const original = structuredClone(neonOrbit);
  delete original.vortex.gust;
  original.entities = original.entities.filter(e => e.shape.type !== 'box' &&
    (e.shape.type !== 'circle' || (e.position.x === 20 && e.position.y === 25)));
  const results = [];
  for (const stage of [original, neonOrbit]) {
    const physics = new Box2dPhysics(); await physics.init();
    const game = Object.create(Game.prototype);
    Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
    const result = { firstTotal: 0, leaderWins: 0, liftedFrames: 0, frontWins: 0 };
    for (let round = 0; round < 24; round++) {
      let seed = 123456 + round * 7919;
      Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
      game.prepare(stage, Array.from({ length: 28 }, (_, i) => String(i)));
      game.start([1, 1], false);
      let leader;
      while (!game.arrivals.length && game.elapsed < 60) {
        game.advance();
        const lead = game.balls.reduce((a, b) => a.y > b.y ? a : b);
        if (leader === undefined && lead.y > 20) leader = lead.id;
        for (const ball of game.balls) if (!ball.rank && ball.y > 15 &&
          physics.marbleMap[ball.id].GetLinearVelocity().y < -5) result.liftedFrames++;
      }
      assert.ok(game.arrivals.length, 'each trial must produce a winner');
      result.firstTotal += game.elapsed;
      result.leaderWins += +(game.arrivals[0].id === leader);
      result.frontWins += +(game.arrivals[0].id < 10);
    }
    physics.clearMarbles(); physics.clear();
    results.push(result);
  }
  console.log(JSON.stringify({ trials: 24, before: results[0], after: results[1] }));
  assert.ok(results[1].liftedFrames > results[0].liftedFrames * 2, 'the pack must recirculate substantially more');
  assert.ok(results[1].firstTotal > results[0].firstTotal * 1.15, 'the first arrival must not simply drain straight through');
  assert.ok(results[1].leaderWins < results[0].leaderWins / 2, 'early leaders must regularly be overtaken');
})().catch(e => { console.error(e); process.exitCode = 1; });
