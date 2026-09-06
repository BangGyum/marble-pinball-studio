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

const { pipelineRun } = require('../src/data/pipeline-run.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
const { validateStage } = require('../src/model.ts');

global.fetch = undefined;
let seed = 912463;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

(async () => {
  validateStage(JSON.parse(JSON.stringify(pipelineRun)));
  const physics = new Box2dPhysics();
  await physics.init();
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
  let shakes = 0;
  const shake = physics.shakeMarble.bind(physics);
  physics.shakeMarble = (id) => {
    shakes++;
    shake(id);
  };

  for (const count of [1, 4, 12, 30, 49]) {
    shakes = 0;
    game.prepare(
      pipelineRun,
      Array.from({ length: count }, (_, index) => '참가자' + index)
    );
    const initialOrder = game.balls.map((ball) => ball.id);
    game.start([1, 1], false);
    while (game.state === 'running' && game.elapsed < 65) {
      game.advance();
      for (const ball of game.balls) {
        if (!ball.rank) assert.ok(ball.x >= 0 && ball.x <= pipelineRun.width, 'marble escaped the pipe');
      }
    }
    assert.equal(game.arrivals.length, count, 'all marbles must finish');
    assert.equal(shakes, 0, 'the pipe must drain without automatic unsticking');
    assert.ok(game.elapsed < 65, 'the pipe race must stay short');
    if (count >= 12)
      assert.notDeepEqual(
        game.arrivals.map((ball) => ball.id),
        initialOrder,
        'the obstacles must change the running order'
      );
    console.log(
      'PASS neon pipeline: ' + count + ' marbles, all ' + game.elapsed.toFixed(1) + 's, no escapes or stalls'
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
