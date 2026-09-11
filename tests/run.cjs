const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText,
    filename
  );
const {
  parseNames,
  winningRange,
  validateStage,
  blankStage,
  saveMaps,
  readSavedMaps,
  MAPS_KEY,
} = require('../src/model.ts');
const { stages } = require('../src/data/maps.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
const { Recorder } = require('../src/recorder.ts');
// Emscripten 7 predates Node's built-in fetch; use its filesystem loader in Node.
global.fetch = undefined;
let seed = 123456;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
async function run() {
  assert.deepEqual(parseNames(' 하나, 둘,,\n셋*3 '), ['하나', '둘', '셋', '셋', '셋']);
  assert.deepEqual(parseNames(''), []);
  assert.throws(() => parseNames('이름*301'));
  assert.throws(() => parseNames('이름*0'));
  assert.deepEqual(winningRange('asc', 4, 1), [1, 1]);
  assert.deepEqual(winningRange('desc', 4, 1), [4, 4]);
  assert.deepEqual(winningRange('asc', 10, 3), [1, 3]);
  assert.deepEqual(winningRange('desc', 10, 3), [8, 10]);
  assert.deepEqual(winningRange('asc', 4, 4), [1, 4]);
  assert.deepEqual(winningRange('desc', 4, 4), [1, 4]);
  assert.deepEqual(winningRange('desc', 300, 300), [1, 300]);
  for (const picks of [0, -1, 1.5, 5, NaN]) assert.throws(() => winningRange('asc', 4, picks));
  assert.throws(() => winningRange('desc', 0, 1));
  assert.throws(() => winningRange('invalid', 4, 1));
  const values = new Map();
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const custom = blankStage();
  custom.entities.push({
    position: { x: 13, y: 15 },
    type: 'kinematic',
    shape: { type: 'box', width: 2, height: 0.15, rotation: 0.2 },
    props: { density: 1, restitution: 0.8, angularVelocity: 1.5 },
  });
  saveMaps(storage, [{ id: 'custom-1', stage: custom }]);
  assert.deepEqual(readSavedMaps(storage), [{ id: 'custom-1', stage: custom }]);
  const restored = readSavedMaps(storage);
  restored[0].stage.title = '수정';
  assert.notEqual(readSavedMaps(storage)[0].stage.title, '수정');
  assert.throws(() => validateStage({ ...custom, goalY: Infinity }));
  assert.throws(() => validateStage({ ...custom, entities: [{}] }));
  assert.throws(() =>
    saveMaps(
      {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
      [{ id: 'x', stage: custom }]
    )
  );
  saveMaps(storage, [{ id: 'wide', stage: { ...custom, width: 66 } }]);
  assert.equal(readSavedMaps(storage)[0].stage.width, 66, 'saved wide maps preserve width');
  for (const width of [0, -1, 201, Infinity, '66']) assert.throws(() => validateStage({ ...custom, width }));
  values.set(MAPS_KEY, 'broken');
  assert.throws(() => readSavedMaps(storage));
  stages.forEach(validateStage);
  assert.equal(stages[0].title, '네온 믹서', 'the neon mixer must stay first in the built-in map list');
  console.log('PASS input, winner rules, map validation and storage round-trip');
  const physics = new Box2dPhysics();
  await physics.init();
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    physics,
    state: 'ready',
    arrivals: [],
    balls: [],
    speed: 1,
    range: [1, 1],
    elapsed: 0,
    recording: false,
    recorder: new Recorder(),
    render: () => {},
    onFinish: () => {},
  });
  for (const [mapIndex, stage] of [...stages, custom].entries()) {
    game.prepare(
      stage,
      Array.from({ length: 12 }, (_, i) => `참가자${i + 1}`)
    );
    assert.equal(game.winnerAt, 0, 'preparing a race resets the celebration');
    const initial = game.balls.map((b) => ({ ...b }));
    for (let i = 0; i < 30; i++) physics.step(1 / 60);
    assert.ok(
      game.balls.every((b, i) => Math.abs(physics.getMarblePosition(b.id).y - initial[i].y) < 0.0001),
      'waiting marbles must not move'
    );
    let winners = [];
    game.onFinish = (value) => (winners = value);
    game.start([1, 12], false);
    for (let tick = 0; tick < 60 * 240 && game.state === 'running'; tick++) game.advance();
    assert.equal(
      game.state,
      'finished',
      `map ${mapIndex}: ${game.arrivals.length}/12 finished; remaining ${JSON.stringify(game.balls.filter((b) => !b.rank).map((b) => ({ x: b.x, y: b.y })))}`
    );
    assert.equal(winners.length, 12);
    assert.equal(new Set(winners.map((b) => b.id)).size, 12);
    assert.deepEqual(
      winners.map((b) => b.rank),
      Array.from({ length: 12 }, (_, i) => i + 1)
    );
    console.log(`PASS physics map ${mapIndex + 1}: all 12 marbles finished at ${game.elapsed.toFixed(1)}s`);
  }
  game.prepare(custom, ['A', 'B', 'C']);
  game.start([2, 2], false);
  let result;
  game.onFinish = (w) => (result = w);
  for (let tick = 0; tick < 60 * 120 && game.state === 'running'; tick++) game.advance();
  assert.equal(result?.length, 1);
  assert.equal(result[0].rank, 2);
  game.prepare(custom, ['A', 'B']);
  game.start([1, 1], false);
  game.pause();
  assert.equal(game.state, 'paused');
  game.pause();
  assert.equal(game.state, 'running');
  const disposable = blankStage();
  disposable.entities.push({
    position: { x: 10.1, y: 5.4 },
    type: 'static',
    shape: { type: 'circle', radius: 0.4 },
    props: { density: 1, restitution: 1, angularVelocity: 0, life: 1 },
  });
  for (let i = 0; i < 20; i++) {
    game.prepare(disposable, ['A']);
    game.start([1, 1], false);
    game.advance();
    game.prepare(custom, ['A']);
    game.start([1, 1], false);
    game.advance();
  }
  physics.clearMarbles();
  physics.clear();
  console.log('PASS rank selection, pause/resume, repeated reset and destructible obstacles');
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
