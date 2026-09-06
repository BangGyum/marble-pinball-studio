const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { cascade } = require('../src/data/cascade.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
const { validateStage } = require('../src/model.ts');
global.fetch = undefined;
let seed = 74521;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
(async () => {
  validateStage(JSON.parse(JSON.stringify(cascade)));
  const physics = new Box2dPhysics(); await physics.init();
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
  let shakes = 0;
  const shake = physics.shakeMarble.bind(physics);
  physics.shakeMarble = id => { shakes++; shake(id); };
  const wins = Array(14).fill(0), last = Array(14).fill(0);
  let min = Infinity, max = 0;
  for (let round = 0; round < 106; round++) {
    const count = round < 6 ? [1, 4, 8, 12, 30, 49][round] : 14;
    shakes = 0;
    game.prepare(cascade, Array.from({length: count}, (_, i) => '참가자' + i));
    game.start([1, 1], false);
    while (game.state === 'running' && game.elapsed < 65) {
      game.advance();
      for (const b of game.balls) assert.ok(b.x >= 0.5 && b.x <= 25.5, 'escaped side wall');
    }
    assert.equal(game.arrivals.length, count, 'all marbles must finish');
    assert.equal(shakes, 0, 'must drain without unsticking');
    min = Math.min(min, game.elapsed); max = Math.max(max, game.elapsed);
    if (round < 6) console.log('PASS cascade', count, game.elapsed.toFixed(1) + 's');
    else { wins[game.arrivals[0].id]++; last[game.arrivals[count - 1].id]++; }
  }
  console.log(JSON.stringify({ rounds: 100, count: 14, firstByInput: wins, lastByInput: last, finishSeconds: [min, max] }));
})().catch(e => { console.error(e); process.exitCode = 1; });
