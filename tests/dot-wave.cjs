const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename
  );
global.fetch = undefined;

const { Race } = require('../src/race.ts');
const { dotWave } = require('../src/data/dot-wave.ts');
const { validateStage } = require('../src/model.ts');

async function main() {
  assert.deepEqual(validateStage(dotWave), dotWave);
  const pins = dotWave.entities.filter((e) => e.shape.type === 'circle');
  const lower = pins.filter((e) => e.position.y >= 50);
  assert.ok(lower.length > 0);
  let gap = Infinity;
  for (const a of lower) {
    for (const b of pins) {
      if (a === b) continue;
      const distance = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      gap = Math.min(gap, distance - a.shape.radius - b.shape.radius);
    }
  }
  console.log('Lower field minimum edge-to-edge gap:', gap.toFixed(2), 'world units');
  assert.ok(gap >= 2, 'lower pin openings must fit at least four marble diameters');
  const race = new Race();
  await race.physics.init();
  const random = Math.random;
  const shakeMarble = race.physics.shakeMarble.bind(race.physics);
  let shakes = 0;
  race.physics.shakeMarble = (id) => {
    shakes++;
    shakeMarble(id);
  };
  const auditSeed = Math.imul(121, 0x9e3779b9) >>> 0;
  try {
    for (const count of [100, 300]) {
      const seeds = [11, 37, 79, 127, 193, auditSeed];
      // This seed previously held a 300-marble pack at the second right-side bend.
      if (count === 300) seeds.push(2329671447);
      for (const seed of seeds) {
        shakes = 0;
        let state = seed;
        Math.random = () => {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          return state / 4294967296;
        };
        race.prepare(
          dotWave,
          Array.from({ length: count }, (_, i) => String(i + 1))
        );
        race.startRace([count, count], 'desc');
        // Measure time spent inside a one-marble-diameter neighborhood, including jitter in a jam.
        const anchors = race.balls.map((b) => ({ x: b.x, y: b.y, at: 0 }));
        const atMidfield = [];
        let longest = 0;
        let rightDelay = 0;
        while (race.state === 'running' && race.elapsed < 90) {
          race.advance();
          for (const b of race.balls) {
            if (b.y >= 48) atMidfield[b.id] ??= b.x;
            if (b.rank || b.y < 7) continue;
            const a = anchors[b.id];
            if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) {
              a.x = b.x;
              a.y = b.y;
              a.at = race.elapsed;
            }
            const delay = race.elapsed - a.at;
            longest = Math.max(longest, delay);
            if (a.x >= 32 && a.y >= 28 && a.y < 46) rightDelay = Math.max(rightDelay, delay);
          }
        }
        const label = count + ' marbles, seed ' + seed;
        console.log(
          label,
          race.finishReason,
          race.arrivals.length,
          race.elapsed.toFixed(2),
          's, longest pause',
          longest.toFixed(2),
          's'
        );
        assert.equal(race.finishReason, 'arrived', label);
        assert.equal(race.arrivals.length, count, label);
        assert.ok(
          race.arrivals.every((b) => b.y >= dotWave.goalY),
          label
        );
        assert.equal(race.rescues, 0, label);
        assert.equal(shakes, 0, label + ': no marble should need a nudge to get off a pin');
        const leaderX = atMidfield[race.arrivals[0].id];
        assert.ok(leaderX >= 3.8 && leaderX < 34.2, label + ': the winner should pass through the waves');
        assert.ok(longest < 3, label + ': a marble should clear the pins on its own');
        if (count === 300) assert.ok(rightDelay < 1.2, label + ': marbles should clear the right bends promptly');
      }
    }
  } finally {
    Math.random = random;
    race.physics.dispose();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
