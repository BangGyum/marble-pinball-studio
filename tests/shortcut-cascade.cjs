const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f
  );
global.fetch = undefined;
const { Race } = require('../src/race.ts'),
  { shortcutCascade: stage } = require('../src/data/shortcut-cascade.ts');
const { validateStage } = require('../src/model.ts');
(async () => {
  assert.deepEqual(validateStage(stage), stage);
  const race = new Race();
  await race.physics.init();
  const random = Math.random;
  try {
    for (const count of [20, 40])
      for (const active of [false, true])
        for (const initial of [12345, 271828, 314159]) {
          let seed = initial;
          Math.random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          race.prepare(
            stage,
            Array.from({ length: count }, (_, i) => String(i))
          );
          race.startRace([count - 1, count], 'desc');
          race.springCooldowns.now = () => race.elapsed * 1000;
          let escaped = 0,
            shortcut = 0;
          while (race.state === 'running' && race.elapsed < 100) {
            if (active)
              stage.entities.forEach((e, i) => {
                if (e.shape.spring) race.activateSpring(i);
              });
            race.advance();
            for (const b of race.balls) if (!b.rank && (b.x < 2.7 || b.x > 41.3 || b.y < -28.3)) escaped++;
            for (const b of race.balls) if (!b.rank && b.y > 18 && b.y < 23 && b.x > 20 && b.x < 25) shortcut++;
          }
          const result = {
            count,
            active,
            seed: initial,
            time: race.elapsed,
            arrived: race.arrivals.length,
            rescues: race.rescues,
            escaped,
            shortcut,
          };
          console.log(JSON.stringify(result));
          assert.equal(result.arrived, count);
          assert.equal(result.rescues, 0);
          assert.equal(result.escaped, 0);
          assert.equal(race.finishReason, 'arrived');
        }
  } finally {
    Math.random = random;
    race.physics.clearMarbles();
    race.physics.clear();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
