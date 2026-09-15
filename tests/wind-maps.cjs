const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { headwindElevator } = require('../src/data/headwind-elevator.ts');
const { twinVortex } = require('../src/data/twin-vortex.ts');
const { gustFork } = require('../src/data/gust-fork.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
const { windPower, windTravel } = require('../src/wind-power.ts');

const requestedStage = process.argv[2];
const requestedCount = Number(process.argv[3]);
const stages = [headwindElevator, twinVortex, gustFork]
  .filter((stage) => !requestedStage || stage.title.includes(requestedStage));
const random = (initial) => {
  let seed = initial;
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
};
async function simulate(physics, stage, count, initial, limit = 120) {
  Math.random = random(initial);
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
  game.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
  assert.ok(game.balls.every((ball) => Math.abs(ball.x - (stage.spawnX ?? 12.85)) < 3),
    'every marble starts inside the map-specific inlet');
  game.start([Math.max(1, count - 1), count], false, 'desc');
  let first = 0, earlyLeader, late;
  const visits = new Set(), returned = new Set(), lifted = new Set();
  const bottomVisits = new Set(), bottomReturns = new Set();
  const depths = new Map();
  let minX = Infinity, maxX = -Infinity;
  while (game.state === 'running' && game.elapsed < limit) {
    game.advance();
    for (const ball of game.balls) if (!ball.rank) {
      minX = Math.min(minX, ball.x); maxX = Math.max(maxX, ball.x);
      const deepest = Math.max(depths.get(ball.id) ?? 0, ball.y);
      depths.set(ball.id, deepest);
      if (deepest - ball.y > 4) lifted.add(ball.id);
      if (stage.title === '돌풍 갈림길') {
        if (ball.y >= 58 && ball.x > 18 && ball.x < 33) bottomVisits.add(ball.id);
        if (bottomVisits.has(ball.id) && ball.y < 55) bottomReturns.add(ball.id);
        if (ball.x > 22 && ball.y > 40 && ball.y < 56 && !visits.has(ball.id)) {
          visits.add(ball.id);
        }
        // The rebuilt loop rejoins the splitter at y=28, below the upper fan chamber.
        if (visits.has(ball.id) && ball.y < 29) returned.add(ball.id);
      }
      if (stage.title === '쌍둥이 소용돌이') {
        if (ball.x < 11 && ball.y > 36) visits.add(ball.id);
        if (visits.has(ball.id) && ball.x > 12 && ball.y < 28) returned.add(ball.id);
      }
    }
    if (earlyLeader === undefined && game.elapsed > 2)
      earlyLeader = game.balls.reduce((a, b) => a.y > b.y ? a : b).id;
    if (!first && game.arrivals.length) first = game.elapsed;
    if (!late && game.elapsed >= 60)
      late = game.balls.filter((ball) => !ball.rank).slice(0, 5).map((ball) => ({ x: ball.x, y: ball.y }));
  }
  const result = {
    count, initial, first, finish: game.elapsed, arrived: game.arrivals.length,
    leaderWon: game.arrivals[0]?.id === earlyLeader,
    lifted: lifted.size, loopVisits: visits.size, loopReturns: returned.size,
    minX, maxX, late, bottomReturns: bottomReturns.size,
  };
  if (game.state === 'finished')
    assert.deepEqual(game.winners.map((ball) => ball.id), game.arrivals.slice(-Math.min(count, 2)).map((ball) => ball.id),
      'DESC 2 selects exactly the last two arrivals (one with a single participant)');
  if (game.arrivals.length !== count)
    result.remaining = game.balls.filter((ball) => !ball.rank).slice(0, 5).map((ball) => ({ x: ball.x, y: ball.y }));
  physics.clearMarbles();
  physics.clear();
  assert.equal(physics.windZones.length, 0, 'changing maps clears every wind zone');
  return result;
}

(async () => {
  let raw;
  const storage = { setItem: (_, value) => raw = value, getItem: () => raw };
  saveMaps(storage, stages.map((stage, i) => ({ id: String(i), stage })));
  assert.deepEqual(readSavedMaps(storage).map((map) => map.stage.windZones), stages.map((stage) => stage.windZones));
  assert.deepEqual(readSavedMaps(storage).map((map) => map.stage.spawnX), stages.map((stage) => stage.spawnX));
  stages.forEach(validateStage);
  assert.throws(() => validateStage({ ...headwindElevator, windZones: [{ type: 'directional', x: 1, y: 1,
    width: 2, height: 2, velocityX: Infinity, velocityY: 0 }] }));
  for (const invalid of [{ period: 0 }, { pulse: 2 }, { dutyCycle: 0 }, { dutyCycle: 1.1 },
    { fan: { x: NaN, y: 0, radius: 2 } }, { fan: { x: 1, y: 1, radius: 2, front: 'yes' } }])
    assert.throws(() => validateStage({ ...headwindElevator, windZones: [{ ...headwindElevator.windZones[0], ...invalid }] }));
  assert.throws(() => validateStage({ ...twinVortex, spawnX: twinVortex.width + 1 }));
  const timedFan = { ...headwindElevator.windZones[0], period: 8, phase: 0, pulse: 1, dutyCycle: 0.5 };
  assert.equal(windPower(timedFan, 2), 1, 'fan reaches full thrust');
  assert.equal(windPower(timedFan, 6), 0, 'fan provides a genuine coast interval');
  assert.ok(Math.abs(windTravel(timedFan, 4) - windTravel(timedFan, 8)) < 1e-9,
    'fan animation stops during the same interval as its physical thrust');
  for (const wind of [timedFan, { ...timedFan, phase: -2 }, headwindElevator.windZones[0]])
    for (const t of [0.1, 2, 5, 10])
      assert.ok(Math.abs((windTravel(wind, t + 0.0001) - windTravel(wind, t)) / 0.0001 - windPower(wind, t)) < 0.001,
        'visual airflow speed follows the actual physical wind power');

  const physics = new Box2dPhysics();
  await physics.init();

  for (const stage of stages) {
    const results = [];
    for (const count of (requestedCount ? [requestedCount] : [1, 28, 100, 300]))
      for (const seed of (count === 28 ? [123456, 271828, 314159, 161803, 577215, 141421] : [123456, 271828, 314159]))
        results.push(await simulate(physics, stage, count, seed));
    console.log(stage.title, JSON.stringify(results));
    for (const result of results) {
      assert.equal(result.arrived, result.count, `${stage.title}: ${result.arrived}/${result.count} arrived`);
      assert.ok(result.first >= 3, `${stage.title}: first arrival was too fast (${result.first}s)`);
      assert.ok(result.finish < 100, `${stage.title}: race took too long (${result.finish}s)`);
      assert.ok(result.minX > 2 && result.maxX < stage.width, `${stage.title}: a marble escaped the outer walls`);
    }
    const packRuns = results.filter((result) => result.count === 28);
    if (packRuns.length) {
      assert.ok(packRuns.every((result) => result.finish >= 18), `${stage.title}: the pack race finished too quickly`);
      assert.ok(packRuns.every((result) => result.finish < 80), `${stage.title}: the pack race took too long`);
      assert.ok(packRuns.some((result) => !result.leaderWon), `${stage.title}: the early leader always wins`);
      assert.ok(packRuns.every((result) => result.lifted > 0), `${stage.title}: wind must visibly lift the marbles`);
      if (stage.title === '쌍둥이 소용돌이')
        assert.ok(packRuns.every((result) => result.loopReturns > 0 && result.loopVisits < result.count),
          'both the shortcut and a complete return through the loop must be used');
      if (stage.title === '돌풍 갈림길') {
        const bottomReturnRate = packRuns.reduce((sum, result) => sum + result.bottomReturns, 0)
          / packRuns.reduce((sum, result) => sum + result.count, 0);
        assert.ok(bottomReturnRate >= 0.35 && bottomReturnRate <= 0.65,
          `the bottom gust should lift roughly half the pack (${bottomReturnRate})`);
        assert.ok(packRuns.every((result) => result.loopVisits > 0 && result.loopVisits < result.count),
          'the rotating splitter must feed both routes');
        // With a random splitter phase, a pack may reach the loop during its coast interval.
        // Require repeatable returns across most rounds, not a forced return in every race.
        assert.ok(packRuns.filter((result) => result.loopReturns > 0).length > packRuns.length / 2,
          'the gust loop must return marbles in a majority of independently seeded races');
      }
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
