const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { infiniteFunnel: stage, funnel } = require('../src/data/infinite-funnel.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');

(async () => {
  assert.deepEqual(validateStage(stage), stage);
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  saveMaps(storage, [{ id: 'funnel', stage }]);
  assert.deepEqual(readSavedMaps(storage)[0].stage, stage, 'spiral and bridge survive map export/reload');
  const race = new Race(); await race.physics.init();
  const random = Math.random;
  try {
    for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 100, 300])) {
      for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456, 271828, 314159])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        race.startRace([1, count]);
        const turns = new Map(), previous = new Map(), bridge = new Set(), costs = [];
        let first = 0, escaped = 0;
        const escapeSamples = [];
        while (race.state === 'running' && race.elapsed < 100) {
          const start = performance.now(); race.advance(); costs.push(performance.now() - start);
          for (const ball of race.balls) if (!ball.rank) {
            const dx = ball.x - funnel.x, dy = ball.y - funnel.y, r = Math.hypot(dx, dy);
            if (ball.onBridge) {
              bridge.add(ball.id);
              if (ball.x < 29.35 || ball.x > 34.65 || ball.y < 41.65) {
                escaped++;
                if (escapeSamples.length < 5) escapeSamples.push([ball.id, ball.x, ball.y, 'outlet']);
              }
            } else {
              if (r < 30.8 && ball.y > 15) {
                const a = Math.atan2(dy, dx), before = previous.get(ball.id);
                if (before !== undefined) turns.set(ball.id, (turns.get(ball.id) ?? 0) + Math.atan2(Math.sin(a - before), Math.cos(a - before)));
                previous.set(ball.id, a);
              }
              const inInlet = ball.x >= 15.7 && ball.x <= 33 && ball.y <= 18;
              if (!inInlet) {
                const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
                let distance = Infinity;
                for (let lap = 0; lap < 4; lap++) {
                  const t = (a / (Math.PI * 2) + lap) / 4;
                  distance = Math.min(distance, Math.abs(r - (funnel.outer + (funnel.inner - funnel.outer) * t)));
                }
                // Past the open spiral tip, the core extends to the innermost rail at this angle.
                const coreRadius = funnel.outer + (funnel.inner - funnel.outer) * (3 + a / (Math.PI * 2)) / 4 - funnel.halfWidth;
                if (r > coreRadius + .12 && distance > funnel.halfWidth + .12) {
                  escaped++;
                  if (escapeSamples.length < 5) escapeSamples.push([ball.id, ball.x, ball.y, distance]);
                }
              }
            }
          }
          if (!first && race.arrivals.length) first = race.elapsed;
        }
        costs.sort((a, b) => a - b);
        const result = { count, seed: initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2), arrived: race.arrivals.length,
          reason: race.finishReason, bridge: bridge.size, escaped, escapeSamples, rescues: race.rescues,
          minTurns: +(Math.min(...turns.values()) / (Math.PI * 2)).toFixed(2),
          stepP95Ms: +costs[Math.floor(costs.length * .95)].toFixed(2),
          remaining: race.balls.filter(b => !b.rank).slice(0, 5).map(b => [b.id, +b.x.toFixed(2), +b.y.toFixed(2)]) };
        console.log(JSON.stringify(result));
        assert.equal(race.finishReason, 'arrived', 'every marble finishes naturally, without timeout ranking');
        assert.equal(race.arrivals.length, count);
        assert.equal(bridge.size, count, 'every marble exits through the core');
        assert.equal(escaped, 0, 'all marbles stay in the spiral corridor or the isolated outlet');
        assert.ok(result.minTurns > 3.5, 'no shortcut through the spiral walls');
        assert.ok(first > 15 && race.elapsed < 70, 'four turns without an overlong race');
      }
    }
  } finally { Math.random = random; race.physics.clearMarbles(); race.physics.clear(); }
  console.log('PASS infinite funnel storage, four-turn route, isolated outlet and natural completion');
})().catch(error => { console.error(error); process.exitCode = 1; });
