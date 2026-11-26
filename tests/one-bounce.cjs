const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { validateStage } = require('../src/model.ts');
const { oneBounce: stage, reboundPad } = require('../src/data/one-bounce.ts');

// A score alone cannot distinguish a bank shot from a fall into the return lane.
// Stop the contact trace at the two lips, before the narrowing cup touches the marble.
const rimY = (x) => 17 + ((x - 0.8) * 2.7) / 6.4;
(async () => {
  assert.deepEqual(validateStage(JSON.parse(JSON.stringify(stage))), stage);
  const race = new Race();
  const physics = race.physics;
  await physics.init();
  const box = physics.Box2D;
  const listener = new box.JSContactListener();
  const random = Math.random;
  const shots = new Map();
  const pad = stage.entities.indexOf(reboundPad);
  let boardBodies = new Map(),
    marbleBodies = new Map();
  listener.BeginContact = (ptr) => {
    const contact = box.wrapPointer(ptr, box.b2Contact);
    const a = box.getPointer(contact.GetFixtureA().GetBody()),
      b = box.getPointer(contact.GetFixtureB().GetBody());
    const shot = shots.get(marbleBodies.get(a) ?? marbleBodies.get(b));
    const surface = boardBodies.get(a) ?? boardBodies.get(b);
    if (shot && !shot.inCup && surface !== undefined) shot.hits.push(surface);
  };
  listener.EndContact = listener.PreSolve = listener.PostSolve = () => {};
  physics.world.SetContactListener(listener);
  try {
    for (const count of [1, 8, 20, 40, 100, 300]) {
      let direct = 0,
        bank = 0,
        total = 0,
        retries = 0;
      const seeds = count === 300 ? [77] : [77, 527, 1337];
      for (const initial of seeds) {
        let seed = initial;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        shots.clear();
        race.prepare(
          stage,
          Array.from({ length: count }, (_, i) => String(i))
        );
        race.startRace([count, count], 'desc');
        boardBodies = new Map(physics.entities.map((e, i) => [box.getPointer(e.body), i]));
        marbleBodies = new Map(
          Object.entries(physics.marbleMap).map(([id, body]) => [box.getPointer(body), Number(id)])
        );
        const clearedFeed = new Set();
        const funnelSamples = race.balls.map((b) => ({ x: b.x, y: b.y, movedAt: 0 }));
        let longestFunnelPause = 0;
        const timeLimit = count === 300 ? 265 : count === 100 ? 125 : 155;
        while (race.state === 'running' && race.elapsed < timeLimit) {
          const launcher = physics.launchers[0],
            held = launcher.loaded?.body;
          race.advance();
          if (held && !launcher.loaded) {
            const id = marbleBodies.get(box.getPointer(held));
            const { vx, vy } = physics.getMarbleVelocity(id);
            if (shots.has(id)) retries++;
            shots.set(id, { angle: (Math.atan2(-vy, -vx) * 180) / Math.PI, hits: [], inCup: false });
          }
          for (const ball of race.balls) {
            if (count === 300 && race.elapsed < 90 && ball.y >= 15.5) clearedFeed.add(ball.id);
            if ((count === 100 || count === 300) && !ball.rank) {
              const sample = funnelSamples[ball.id];
              if (Math.hypot(ball.x - sample.x, ball.y - sample.y) > 0.5) {
                sample.x = ball.x;
                sample.y = ball.y;
                sample.movedAt = race.elapsed;
              }
              // Jitter against the right guide can keep the engine's exact stillness timer at zero.
              if (sample.x > 25 && sample.x < 31 && sample.y > 16 && sample.y < 20.5)
                longestFunnelPause = Math.max(longestFunnelPause, race.elapsed - sample.movedAt);
            }
            const shot = shots.get(ball.id);
            if (
              shot &&
              !shot.inCup &&
              ball.py < rimY(ball.px) &&
              ball.y >= rimY(ball.x) &&
              ball.x > 0.8 &&
              ball.x < 7.2
            ) {
              shot.inCup = true;
            }
          }
        }
        if (count === 300) assert.ok(clearedFeed.size >= 195, 'crowded marbles keep flowing through the upper ramps');
        assert.equal(race.finishReason, 'arrived', count + ' marbles must finish within ' + timeLimit + 's');
        assert.equal(race.rescues, 0, 'even misses must return under their own physics');
        assert.equal(shots.size, count, 'all marbles must use the launcher');
        assert.ok(longestFunnelPause < 30, 'the guide must keep queued marbles moving');
        for (const shot of shots.values()) {
          assert.ok(shot.inCup, 'every final shot passes through the receiver mouth');
          if (shot.hits.length === 1 && shot.hits[0] === pad && shot.angle < 15) bank++;
          if (!shot.hits.length && shot.angle > 15) direct++;
        }
        total += race.arrivals.length;
      }
      if (count >= 8) {
        assert.ok(bank > 0 && direct > 0, 'both low single-bounce and high direct finishes must be playable');
        assert.ok(retries > 0, 'missed shots must cycle back into the barrel');
      }
      console.log(
        'PASS',
        count,
        `marbles × ${seeds.length} races:`,
        total,
        'arrivals,',
        bank,
        'low bank shots,',
        direct,
        'high direct shots,',
        retries,
        'relaunches'
      );
    }
    race.prepare(stage, ['off-ramp marble']);
    race.startRace([1, 1]);
    physics.placeMarble(0, 18, 16.6);
    physics.setMarbleVelocity(0, -8.05, 0.85);
    const launcher = physics.launchers[0];
    let fired = false;
    while (race.state === 'running' && race.elapsed < 20 && !fired) {
      const held = launcher.loaded;
      race.advance();
      fired = !!held && !launcher.loaded;
    }
    assert.ok(fired, 'a marble deflected off the feed ramp must return to the launcher before reaching the cup');
    console.log('PASS stray feed marble misses the pad edge and returns to the launcher');
  } finally {
    Math.random = random;
    physics.world.SetContactListener(0);
    box.destroy(listener);
    physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
