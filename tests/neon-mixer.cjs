const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const { neonMixer } = require('../src/data/neon-mixer.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { Game } = require('../src/game.ts');
const { validateStage } = require('../src/model.ts');
global.fetch = undefined;

function boundary(points, y) {
  const i = points.findIndex(p => p[1] >= y);
  if (i <= 0) return points[0][0];
  const [a, b] = [points[i - 1], points[i]];
  return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
}
(async () => {
  validateStage(neonMixer);
  const rotors = neonMixer.entities.filter(e => e.type === 'kinematic');
  assert.equal(rotors.length, 9);
  assert.ok(rotors.every(e => Math.abs(e.props.angularVelocity) >= 6));
  const physics = new Box2dPhysics();
  await physics.init();
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
  const walls = neonMixer.entities.filter(e => e.shape.type === 'polyline');
  let hit = new Set(), moving = [];
  const step = physics.world.Step.bind(physics.world);
  physics.world.Step = (...args) => {
    step(...args);
    moving.forEach((e, i) => {
      let edge = e.body.GetContactList();
      while (physics.Box2D.getPointer(edge)) {
        if (edge.contact.IsTouching()) hit.add(i);
        edge = edge.next;
      }
    });
  };
  let shakes = 0;
  const shake = physics.shakeMarble.bind(physics);
  physics.shakeMarble = id => { shakes++; shake(id); };
  for (const count of [1, 12, 40, 200, 300]) {
    for (const initialSeed of [912463, 271828, 314159]) {
      let seed = initialSeed;
      Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
      shakes = 0;
      game.prepare(neonMixer, Array.from({ length: count }, (_, i) => '참가자 ' + i));
      hit = new Set();
      moving = physics.entities.filter(e => e.shape.type === 'box');
      game.start([1, 1], false);
      let first = 0;
      while (game.state === 'running' && game.elapsed < 60) {
        game.advance();
        if (!first && game.arrivals.length) first = game.elapsed;
        for (const b of game.balls) {
          if (b.rank) continue;
          assert.ok(b.x >= boundary(walls[0].shape.points, b.y) - 0.02 &&
            b.x <= boundary(walls[1].shape.points, b.y) + 0.02, `escaped: ${count}/${initialSeed} at ${b.x},${b.y}`);
        }
      }
      console.log(JSON.stringify({ count, seed: initialSeed, first: +first.toFixed(2), finish: +game.elapsed.toFixed(2), arrived: game.arrivals.length, shakes, rotorsHit: hit.size }));
      assert.equal(game.arrivals.length, count, 'all marbles must drain through the finish');
      assert.equal(shakes, 0, 'the compact course must drain without automatic unsticking');
      assert.ok(game.elapsed < 45, 'the extra mixing chamber must still drain promptly');
      if (count >= 40) assert.ok(hit.size >= 4, 'the race must interact with multiple rotor tiers');
      if (count >= 200) assert.equal(hit.size, 9, 'dense races must engage every mixing rotor');
    }
  }
  physics.clearMarbles(); physics.clear();
  // Seeded regression against a straight chute, not a guarantee of equal winning odds.
  const mixingPhysics = new Box2dPhysics();
  await mixingPhysics.init();
  game.physics = mixingPhysics;
  const rows = [0, 0, 0, 0];
  let leaderWins = 0;
  for (let round = 0; round < 60; round++) {
    let seed = 123456 + round * 7919;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    game.prepare(neonMixer, Array.from({ length: 40 }, (_, i) => String(i)));
    game.start([1, 1], false);
    let leader, winner;
    while (game.state === 'running' && game.elapsed < 60) {
      game.advance();
      if (leader === undefined) {
        const lead = game.balls.reduce((a, b) => a.y > b.y ? a : b);
        if (lead.y > 20) leader = lead.id;
      }
      if (winner === undefined && game.arrivals.length) {
        winner = game.arrivals[0].id;
        rows[Math.floor(winner / 10)]++;
        if (winner === leader) leaderWins++;
        if (round >= 3) break;
      }
    }
    assert.notEqual(winner, undefined, 'each mixing trial must produce a winner');
  }
  console.log(JSON.stringify({ mixingTrials: 60, startingRowWins: rows, leaderWins }));
  assert.ok(rows[0] <= 36, 'the front row must not dominate the sample');
  assert.ok(rows[2] + rows[3] >= 12, 'the back half must have opportunities to overtake');
  assert.ok(leaderWins <= 12, 'the leader before the mixing chamber must regularly change');
  mixingPhysics.clearMarbles(); mixingPhysics.clear();
  console.log('PASS neon mixer: fast rotating pairs, containment, short races and no stalls');
})().catch(error => { console.error(error); process.exitCode = 1; });
