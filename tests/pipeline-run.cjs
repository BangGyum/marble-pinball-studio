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
  assert.equal(pipelineRun.goalY, 231, 'the pipeline finish must be 1.5 times the original 154-unit length');
  assert.ok(
    pipelineRun.entities
      .filter((entity) => entity.shape.type !== 'polyline')
      .every((entity) => entity.position.y < 157),
    'the extended pipeline must contain only curved pipe walls, without bouncers or rotors'
  );
  const leftWallPoints = pipelineRun.entities[0].shape.points;
  const guide = leftWallPoints.filter(([, y]) => y >= 220 && y <= 226);
  assert.deepEqual(
    guide.map(([, y]) => y),
    [220, 224, 226],
    'the busiest extended-wall section must have one short pointed guide'
  );
  assert.ok(
    guide[1][0] > Math.max(guide[0][0], guide[2][0]) + 1,
    'the guide must form a visible inward point with an outward-facing exit'
  );
  const physics = new Box2dPhysics();
  await physics.init();
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
  let bumpers = [],
    hits = [],
    bodies = new Map();
  const step = physics.world.Step.bind(physics.world);
  physics.world.Step = (...args) => {
    step(...args);
    bumpers.forEach((bumper, index) => {
      let edge = bumper.body.GetContactList();
      while (physics.Box2D.getPointer(edge)) {
        if (edge.contact.IsTouching()) {
          const id = bodies.get(physics.Box2D.getPointer(edge.other));
          if (id !== undefined) hits[index].add(id);
        }
        edge = edge.next;
      }
    });
  };
  let shakes = 0;
  const shake = physics.shakeMarble.bind(physics);
  physics.shakeMarble = (id) => {
    shakes++;
    shake(id);
  };

  const walls = pipelineRun.entities.filter((e) => e.shape.type === 'polyline');
  const wallX = (points, y) => {
    const index = points.findIndex((p) => p[1] >= y);
    if (index <= 0) return points[0][0];
    const [ax, ay] = points[index - 1],
      [bx, by] = points[index];
    return ax + ((bx - ax) * (y - ay)) / (by - ay);
  };
  const totalHits = pipelineRun.entities.filter((e) => e.shape.type === 'circle').map(() => 0);
  let totalMarbles = 0;
  for (const count of [1, 4, 12, 30, 49, ...Array(12).fill(14), 49, 49, 49]) {
    shakes = 0;
    game.prepare(
      pipelineRun,
      Array.from({ length: count }, (_, index) => '참가자' + index)
    );
    const initialOrder = game.balls.map((ball) => ball.id);
    bumpers = physics.entities.filter((entity) => entity.shape.type === 'circle');
    hits = bumpers.map(() => new Set());
    bodies = new Map(
      Object.entries(physics.marbleMap).map(([id, body]) => [physics.Box2D.getPointer(body), Number(id)])
    );
    game.start([1, 1], false);
    while (game.state === 'running' && game.elapsed < 65) {
      game.advance();
      for (const ball of game.balls) {
        if (!ball.rank) {
          assert.ok(
            ball.x >= wallX(walls[0].shape.points, ball.y) - 0.02 &&
              ball.x <= wallX(walls[1].shape.points, ball.y) + 0.02,
            'marble escaped the actual pipe walls'
          );
        }
      }
    }
    assert.equal(game.arrivals.length, count, 'all marbles must finish');
    hits.forEach((hit, i) => {
      totalHits[i] += hit.size;
      if (count >= 12) assert.ok(hit.size >= Math.ceil(count * 0.1), 'every bumper must contact passing marbles');
    });
    totalMarbles += count;
    assert.equal(shakes, 0, 'the pipe must drain without automatic unsticking');
    assert.ok(game.elapsed < 65, 'the pipe race must stay short');
    if (count >= 12)
      assert.notDeepEqual(
        game.arrivals.map((ball) => ball.id),
        initialOrder,
        'the obstacles must change the running order'
      );
    console.log(
      'PASS neon pipeline: ' +
        count +
        ' marbles, all ' +
        game.elapsed.toFixed(1) +
        's, bumper contacts ' +
        hits.map((hit) => hit.size).join('/') +
        ', no escapes or stalls'
    );
  }
  totalHits.forEach((hit) =>
    assert.ok(hit / totalMarbles >= 0.25, 'each bumper must affect a meaningful share of marbles')
  );
  physics.clearMarbles();
  physics.clear();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
