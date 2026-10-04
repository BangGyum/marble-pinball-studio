const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);

global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { stages } = require('../src/data/maps.ts');
const { desireJar } = require('../src/data/desire-jar.ts');

(async () => {
  const race = new Race(); await race.physics.init();
  try {
    // Reproduce the map-switching order that let paddles squeeze marbles through the lower rim.
    for (const stage of [stages[0], desireJar]) for (const initial of [123456, 271828, 314159]) {
      let seed = initial;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      race.prepare(stage, Array.from({ length: 100 }, (_, i) => String(i + 1)));
      race.startRace([99, 100], 'desc');
      while (race.state === 'running' && race.elapsed < 600) race.advance();
      assert.equal(race.finishReason, 'arrived', `${stage.title}, seed ${initial}: no forced finish`);
      assert.equal(race.arrivals.length, 100);
      if (stage === desireJar) {
        const escaped = race.arrivals.filter(b => b.y < stage.goalY || b.x < 12 || b.x > 14);
        assert.deepEqual(escaped.map(b => ({ id: b.id, x: b.x, y: b.y })), [],
          `seed ${initial}: every marble must finish through the central outlet`);
        assert.equal(race.rescues, 0, 'the physical rim contains marbles without wall-guard recovery');
        console.log(`PASS 욕망의 항아리: 100 marbles, seed ${initial}, central outlet only, ${race.elapsed.toFixed(2)}s`);
      }
    }
  } finally {
    race.physics.dispose();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
