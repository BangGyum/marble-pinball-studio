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
const { zigzagRapids } = require('../src/data/zigzag-rapids.ts');
const { neonCrossway } = require('../src/data/neon-crossway.ts');
const { pipelineRun } = require('../src/data/pipeline-run.ts');
const { desireJar } = require('../src/data/desire-jar.ts');

async function verifyPack(stage, initial, limit) {
  const race = new Race();
  await race.physics.init();
  const random = Math.random;
  try {
    let seed = initial;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    race.prepare(
      stage,
      Array.from({ length: 300 }, (_, i) => String(i + 1))
    );
    race.startRace([299, 300], 'desc');
    while (race.state === 'running' && race.elapsed < limit) race.advance();
    assert.equal(race.finishReason, 'arrived', `${stage.title}: every marble must finish within ${limit}s`);
    assert.equal(race.arrivals.length, 300);
    assert.equal(race.rescues, 0, `${stage.title}: the walls must contain packed marbles`);
    console.log(`PASS ${stage.title}: 300 marbles, seed ${initial}, ${race.elapsed.toFixed(2)}s`);
  } finally {
    Math.random = random;
    race.physics.dispose();
  }
}

async function verifyPipelineRoller() {
  const race = new Race();
  await race.physics.init();
  const physics = race.physics;
  try {
    physics.createStage(pipelineRun);
    physics.createMarble(0, 5.25, 140.68);
    physics.start();
    for (let i = 0; i < 180; i++) physics.step(1 / 60);
    assert.ok(physics.getMarblePosition(0).y > 146, 'a resting marble must clear the pipeline bend');
    console.log('PASS pipeline roller releases a resting marble');
  } finally {
    physics.dispose();
  }
}

(async () => {
  await verifyPipelineRoller();
  await verifyPack(zigzagRapids, 123456, 70);
  await verifyPack(neonCrossway, 123456, 65);
  await verifyPack(neonCrossway, 271828, 65);
  await verifyPack(desireJar, 123456, 125);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
