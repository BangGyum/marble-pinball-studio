const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { twinFunnel: stage, twinBowls } = require('../src/data/twin-funnel.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
function inTrack(x, y, points) {
  let inside = false, distance = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
    if ((a[1] > y) !== (b[1] > y) && x < dx * (y - a[1]) / dy + a[0]) inside = !inside;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return inside || distance < .12;
}

(async () => {
  assert.deepEqual(validateStage(stage), stage);
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  saveMaps(storage, [{ id: 'twin', stage }]);
  assert.deepEqual(readSavedMaps(storage)[0].stage, stage);
  for (const transfers of [null, {}, Array(11).fill(stage.exitBridge.transfers[0]), [null],
    [{ ...stage.exitBridge.transfers[0], exit: { x: 54, y: 67, width: NaN, height: 1 } }]]) {
    assert.throws(() => validateStage({ ...stage, exitBridge: { ...stage.exitBridge, transfers } }));
  }
  const race = new Race(); await race.physics.init();
  const random = Math.random;
  try {
    for (const count of process.argv[2] ? [+process.argv[2]] : [1, 20, 100, 300]) {
      for (const initial of process.argv[3] ? [+process.argv[3]] : [123456, 271828, 314159]) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        race.startRace([1, count]);
        const phases = new Map(), turns = [new Map(), new Map()], previous = [new Map(), new Map()];
        let escaped = 0;
        const transferSamples = new Map(), escapeSamples = [];
        while (race.state === 'running' && race.elapsed < 100) {
          race.advance();
          for (const ball of race.balls) if (!ball.rank) {
            let phase = phases.get(ball.id) ?? 0;
            if (phase === 0 && ball.onBridge) phase = 1;
            else if (phase === 1 && !ball.onBridge) phase = 2;
            else if (phase === 2 && ball.onBridge) phase = 3;
            phases.set(ball.id, phase);
            if (phase === 1 && !inTrack(ball.x, ball.y, stage.exitBridge.transfers[0].deck)) {
              escaped++;
              if (escapeSamples.length < 6) escapeSamples.push({ id: ball.id, time: race.elapsed, x: ball.x, y: ball.y, before: transferSamples.get(ball.id)?.slice() });
            }
            if (phase === 1) {
              const samples = transferSamples.get(ball.id) ?? [];
              if (ball.y < 72) samples.push([+ball.x.toFixed(2), +ball.y.toFixed(2)]);
              if (samples.length > 12) samples.shift();
              transferSamples.set(ball.id, samples);
            }
            if (phase === 3 && (ball.x < 39.35 || ball.x > 44.65 || ball.y < 93.65)) escaped++;
            if (phase === 0 || phase === 2) {
              const index = phase / 2, bowl = twinBowls[index];
              const r = Math.hypot(ball.x - bowl.x, ball.y - bowl.y);
              const angle = ((Math.atan2(ball.y - bowl.y, ball.x - bowl.x) + Math.PI / 2) * bowl.direction + 2 * Math.PI) % (2 * Math.PI);
              const coreRadius = 23 - 18 * (1 + angle / (2 * Math.PI)) / 2 - 1.7;
              let inSpiral = false;
              for (let lap = 0; lap < 2; lap++) {
                const center = 23 - 18 * (lap + angle / (2 * Math.PI)) / 2;
                if (Math.abs(r - center) <= 1.82) inSpiral = true;
              }
              const inInlet = ball.y <= bowl.y - 21 && inTrack(ball.x, ball.y, stage.art.contours[index]);
              if (r > coreRadius + .12 && !inSpiral && !inInlet) {
                escaped++;
                if (escapeSamples.length < 6) escapeSamples.push({ id: ball.id, phase, x: ball.x, y: ball.y });
              }
              if (r < 24.8 && ball.y > bowl.y - 23) {
                const angle = Math.atan2(ball.y - bowl.y, ball.x - bowl.x), before = previous[index].get(ball.id);
                if (before !== undefined) turns[index].set(ball.id, (turns[index].get(ball.id) ?? 0) + bowl.direction * Math.atan2(Math.sin(angle - before), Math.cos(angle - before)));
                previous[index].set(ball.id, angle);
              }
            }
          }
        }
        const result = { count, seed: initial, finish: +race.elapsed.toFixed(2), arrived: race.arrivals.length,
          reason: race.finishReason, phases: [0, 1, 2, 3].map(p => [...phases.values()].filter(v => v === p).length),
          turns: turns.map(t => +(Math.min(...t.values()) / (2 * Math.PI)).toFixed(2)), escaped, rescues: race.rescues,
          remaining: race.balls.filter(b => !b.rank).slice(0, 8).map(b => [b.id, +b.x.toFixed(2), +b.y.toFixed(2), b.onBridge]) };
        console.log(JSON.stringify(result));
        if (escapeSamples.length) console.log(JSON.stringify(escapeSamples));
        if (result.phases[3] !== count) console.log('Incomplete routes', JSON.stringify([...phases].filter(([, phase]) => phase !== 3).map(([id, phase]) => ({ id, phase, samples: transferSamples.get(id) }))));
        assert.equal(race.finishReason, 'arrived');
        assert.equal(race.arrivals.length, count);
        assert.equal(result.phases[3], count, 'every marble transfers, returns to the lower bowl, then exits its core');
        assert.ok(result.turns.every(t => t > 1.5), 'both spirals are traversed in opposite directions without shortcuts');
        assert.equal(escaped, 0);
        assert.equal(race.rescues, 0);
      }
    }
  } finally { Math.random = random; race.physics.clearMarbles(); race.physics.clear(); }
  console.log('PASS twin funnel storage, opposite spirals, bridge return and natural completion');
})().catch(error => { console.error(error); process.exitCode = 1; });
