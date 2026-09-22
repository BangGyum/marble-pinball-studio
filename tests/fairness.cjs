const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;

const { Race } = require('../src/race.ts');
const { stages } = require('../src/data/maps.ts');
const trials = Math.max(1, Number(process.argv[2] || 1000));
const requestedMap = process.argv.slice(3).join(' ');
const limitSeconds = Math.max(60, Number(process.env.FAIRNESS_LIMIT || 180));
const selected = stages.filter((stage) => !requestedMap || stage.title.includes(requestedMap));
const makeRandom = (initial) => {
  let seed = initial >>> 0;
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
};

(async () => {
  const race = new Race();
  await race.physics.init();
  const output = [];
  for (const [mapIndex, stage] of selected.entries()) {
    const last = Array(20).fill(0), secondLast = Array(20).fill(0), finishes = [], incomplete = [];
    for (let trial = 0; trial < trials; trial++) {
      // Offset each map so the same random stream cannot line up with a map's geometry.
      Math.random = makeRandom(0x9e3779b9 ^ (mapIndex * 0x45d9f3b) ^ trial);
      race.prepare(stage, Array.from({ length: 20 }, (_, i) => String(i)));
      race.startRace([19, 20], 'desc');
      let steps = 0;
      while (race.state === 'running' && steps++ < limitSeconds * 60) race.advance();
      if (race.arrivals.length !== 20) {
        incomplete.push({ trial: trial + 1, arrived: race.arrivals.length, seconds: +race.elapsed.toFixed(2) });
        continue;
      }
      const finishOrder = race.arrivals.map((ball) => ball.id);
      last[finishOrder[19]]++;
      secondLast[finishOrder[18]]++;
      finishes.push(race.elapsed);
      if ((trial + 1) % 100 === 0) console.error(`${stage.title}: ${trial + 1}/${trials}`);
    }
    const completed = trials - incomplete.length;
    const pct = (values) => values.map((count) => +(count * 100 / Math.max(1, completed)).toFixed(2));
    output.push({
      map: stage.title,
      trials, completed, incomplete: incomplete.length, limitSeconds,
      last: pct(last),
      secondLast: pct(secondLast),
      finishSeconds: finishes.length ? [+Math.min(...finishes).toFixed(2), +Math.max(...finishes).toFixed(2)] : [],
    });
    console.log(JSON.stringify(output.at(-1)));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
