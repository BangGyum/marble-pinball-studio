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
const { tidalLocks } = require('../src/data/tidal-locks.ts');
const { validateStage } = require('../src/model.ts');
const gates = tidalLocks.entities.filter((e) => e.props.timedGate);

function run(race, count, initial) {
  let seed = initial;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  race.prepare(
    tidalLocks,
    Array.from({ length: count }, (_, i) => String(i))
  );
  race.startRace([count, count], 'desc');
  const passages = gates.map(() => new Set());
  const approached = gates.map(() => new Map());
  const maxWait = gates.map(() => 0);
  const passagesAt = gates.map(() => []);
  const lanes = [new Set(), new Set()];
  const lastBends = [new Set(), new Set()];
  let first = 0,
    maxSpread = 0;
  while (race.state === 'running' && race.elapsed < 85) {
    race.advance();
    if (!first && race.arrivals.length) first = race.elapsed;
    let top = Infinity,
      bottom = -Infinity;
    for (const b of race.balls) {
      assert.ok(b.x >= 1 && b.x <= 37 && b.y >= -22, 'marble left the canal');
      top = Math.min(top, b.y);
      bottom = Math.max(bottom, Math.min(b.y, tidalLocks.goalY));
      if (b.rank) continue;
      for (const [i, gate] of gates.entries()) {
        if (passages[i].has(b.id)) continue;
        const y = gate.position.y;
        if (b.x >= 26 && b.y >= y - 4 && b.y <= y + 0.5 && !approached[i].has(b.id))
          approached[i].set(b.id, race.elapsed);
        if (b.py >= y + 0.65 || b.y < y + 0.65) continue;
        assert.ok(approached[i].has(b.id) && b.x >= 27.7, 'passed through the open end of the lock');
        assert.ok(i === 0 || passages[i - 1].has(b.id), 'locks are visited in order');
        assert.ok(race.elapsed >= gate.props.timedGate.releaseAfter, 'the closed leaf holds the pack');
        const since = Math.max(approached[i].get(b.id), gate.props.timedGate.releaseAfter);
        maxWait[i] = Math.max(maxWait[i], race.elapsed - since);
        passages[i].add(b.id);
        passagesAt[i].push(race.elapsed);
      }
      if (b.px > 24 && b.x <= 24 && b.y > 20 && b.y < 28) {
        const y = b.py + ((b.y - b.py) * (b.px - 24)) / (b.px - b.x);
        lanes[y < 24.3 ? 0 : 1].add(b.id);
      }
      if (b.py < 74.85 && b.y >= 74.85) {
        assert.ok(b.x < 11.3 && passages[2].has(b.id), 'leaves the upper bend of the S on the left');
        lastBends[0].add(b.id);
      }
      if (b.py < 81.85 && b.y >= 81.85) {
        assert.ok(b.x > 25.7 && lastBends[0].has(b.id), 'leaves the lower bend of the S on the right');
        lastBends[1].add(b.id);
      }
    }
    if (top >= 9) maxSpread = Math.max(maxSpread, bottom - top);
  }
  const fmt = (n) => n.toFixed(2);
  console.log(
    count,
    initial,
    'first/last',
    fmt(first),
    fmt(race.elapsed),
    'gap',
    fmt(race.elapsed - first),
    'max depth spread',
    fmt(maxSpread),
    'locks',
    passagesAt.map((times) => (times.length ? [fmt(times[0]), fmt(times.at(-1))] : [])),
    'longest open transit',
    maxWait.map(fmt),
    'lanes',
    lanes.map((ids) => ids.size),
    'rescues',
    race.rescues
  );
  assert.equal(race.finishReason, 'arrived');
  assert.equal(race.arrivals.length, count);
  assert.equal(race.rescues, 0);
  for (const pass of [...passages, ...lastBends]) assert.equal(pass.size, count);
  assert.ok(
    maxWait.every((seconds) => seconds < 3.5),
    'no marble lingers at an open lock'
  );
  assert.ok(maxSpread <= 18, 'pack stays within one and a half reaches after entering the water');
  assert.ok(race.elapsed - first <= 6, 'first/last finish gap');
  assert.ok(first >= 40 && race.elapsed < 55, 'full length course with a bounded finish');
  assert.equal(new Set([...lanes[0], ...lanes[1]]).size, count, 'every marble takes a return lane');
  if (count >= 100)
    assert.ok(
      lanes.every((ids) => ids.size >= count * 0.1),
      'both sides of the island carry traffic'
    );
}

(async () => {
  assert.deepEqual(validateStage(tidalLocks), tidalLocks);
  const race = new Race(),
    originalRandom = Math.random;
  await race.physics.init();
  try {
    for (const count of [1, 12]) run(race, count, 77);
    for (const count of [100, 300]) for (const seed of [77, 527, 1337, 4242, 9011]) run(race, count, seed);
  } finally {
    Math.random = originalRandom;
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
