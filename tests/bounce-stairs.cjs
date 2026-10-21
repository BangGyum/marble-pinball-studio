const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { MarbleElasticity } = require('../src/marble-elasticity.ts');
const { bounceStairs: stage } = require('../src/data/bounce-stairs.ts');
const { stages } = require('../src/data/maps.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');

(async () => {
  assert.deepEqual(validateStage(stage), stage);
  assert.equal(stages.at(-1), stage, 'the new map is registered without changing existing built-in IDs');
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  saveMaps(storage, [{ id: 'bounce-stairs', stage }]);
  assert.deepEqual(readSavedMaps(storage)[0].stage, stage);

  const race = new Race(); await race.physics.init();
  const physics = race.physics, B = physics.Box2D, random = Math.random;
  const elasticity = new MarbleElasticity();
  let padBodies, marbleBodies, hits;
  const listener = new B.JSContactListener();
  listener.BeginContact = pointer => {
    const contact = B.wrapPointer(pointer, B.b2Contact);
    const a = B.getPointer(contact.GetFixtureA().GetBody());
    const b = B.getPointer(contact.GetFixtureB().GetBody());
    for (const [pad, marble] of [[a, b], [b, a]]) {
      const index = padBodies.get(pad), id = marbleBodies.get(marble);
      if (index !== undefined && id !== undefined) hits[index].add(id);
    }
  };
  listener.EndContact = () => {}; listener.PreSolve = () => {}; listener.PostSolve = () => {};
  physics.world.SetContactListener(listener);
  try {
    for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 100, 300])) {
      for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456, 271828, 314159])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        padBodies = new Map(physics.entities.slice(2).map((entity, i) => [B.getPointer(entity.body), i]));
        marbleBodies = new Map(Object.entries(physics.marbleMap).map(([id, body]) => [B.getPointer(body), Number(id)]));
        hits = Array.from({ length: 5 }, () => new Set());
        elasticity.reset();
        race.startRace([1, count]);
        let escaped = 0, first = 0;
        const squashed = new Set();
        while (race.state === 'running' && race.elapsed < 100) {
          race.advance();
          if (!first && race.arrivals.length) first = race.elapsed;
          const now = race.elapsed * 1000;
          for (const ball of race.balls) if (!ball.rank) {
            if (ball.y > 20 && ball.y < 123 && (ball.x < 3.6 || ball.x > 44.4)) escaped++;
            elasticity.sample(ball.id, ball.x, ball.y, race.elapsed, now);
            if (ball.y > 20 && ball.y < 123 && elasticity.effect(ball.id, now)) squashed.add(ball.id);
          }
        }
        const result = { count, seed: initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2),
          arrived: race.arrivals.length, reason: race.finishReason, escaped, rescues: race.rescues,
          hits: hits.map(ids => ids.size), squashed: squashed.size,
          remaining: race.balls.filter(ball => !ball.rank).slice(0, 5).map(ball => [ball.id, ball.x, ball.y]) };
        console.log(JSON.stringify(result));
        assert.equal(race.finishReason, 'arrived', 'every marble must reach the goal naturally');
        assert.equal(race.arrivals.length, count);
        assert.equal(escaped, 0, 'marbles stay between the outer rails');
        assert.equal(race.rescues, 0, 'no marble is restored after crossing a wall');
        assert.ok(hits.every(ids => ids.size > 0), 'all five rebound pads receive a marble');
        assert.ok(squashed.size >= Math.ceil(count * 0.9), 'most marbles visibly deform from real impacts');
        assert.ok(first > 4 && race.elapsed < 75, 'the course is visible but does not stall');
      }
    }
    if (!process.argv[2]) {
      physics.world.SetContactListener(null);
      const first = Array(20).fill(0), last = Array(20).fill(0), trials = 160;
      for (let trial = 0; trial < trials; trial++) {
        let seed = 0x9e3779b9 ^ trial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: 20 }, (_, i) => String(i)));
        race.startRace([1, 20]);
        while (race.state === 'running' && race.elapsed < 100) race.advance();
        assert.equal(race.finishReason, 'arrived', 'every fairness trial finishes naturally');
        first[race.arrivals[0].id]++;
        last[race.arrivals.at(-1).id]++;
      }
      assert.ok(Math.max(...first, ...last) <= trials * 0.1,
        'no starting slot exceeds about 10% first- or last-place probability');
      console.log(JSON.stringify({ fairnessTrials: trials, maxFirst: Math.max(...first), maxLast: Math.max(...last) }));
    }
  } finally {
    Math.random = random;
    physics.world.SetContactListener(null);
    physics.clearMarbles(); physics.clear();
  }
  console.log('PASS bounce stairs registration, storage, rebound pads, squash, completion and starting-slot fairness');
})().catch(error => { console.error(error); process.exitCode = 1; });
