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
  const lastGateAt = new Map();
  const jet = new Set(),
    wheel = new Set(),
    landing = new Set();
  const physics = race.physics,
    B = physics.Box2D;
  const bodyIds = new Map(Object.entries(physics.marbleMap).map(([id, body]) => [B.getPointer(body), Number(id)]));
  const devices = physics.entities.flatMap((e) => {
    if (e.shape.boostSpeed) return [[e, jet]];
    if (e.spin) return [[e, wheel]];
    if (e.sliding) return [[e, landing]];
    return [];
  });
  let first = 0,
    maxSpread = 0;
  while (race.state === 'running' && race.elapsed < 85) {
    race.advance();
    for (const [e, hits] of devices) {
      let edge = e.body.GetContactList();
      while (B.getPointer(edge)) {
        const id = bodyIds.get(B.getPointer(edge.other));
        if (id !== undefined && edge.contact.IsTouching()) hits.add(id);
        edge = edge.next;
      }
    }
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
        if (i === gates.length - 1) lastGateAt.set(b.id, race.elapsed);
      }
      if (b.px > 24 && b.x <= 24 && b.y > 20 && b.y < 28) {
        const y = b.py + ((b.y - b.py) * (b.px - 24)) / (b.px - b.x);
        lanes[y < 24.3 ? 0 : 1].add(b.id);
      }
      if (b.py < 74.85 && b.y >= 74.85) {
        assert.ok(b.x < 11.3 && lastGateAt.has(b.id), 'leaves the upper bend of the S on the left');
        lastBends[0].add(b.id);
      }
      if (b.py < 82.2 && b.y >= 82.2) {
        assert.ok(
          b.x > 14.7 && lastBends[0].has(b.id),
          'exits via the gap or the outside landing after the upper bend'
        );
        lastBends[1].add(b.id);
      }
    }
    if (top >= 9) maxSpread = Math.max(maxSpread, bottom - top);
  }
  const fmt = (n) => n.toFixed(2);
  // A pass counts only if the overtaken marble cleared the last lock at least a quarter-second earlier.
  const overtakers = race.arrivals.filter((b, i) =>
    race.arrivals.slice(i + 1).some((other) => lastGateAt.get(b.id) - lastGateAt.get(other.id) >= 0.25)
  ).length;
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
    'jet / wheel / outside landing / final overtakers',
    [jet.size, wheel.size, landing.size, overtakers],
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
  assert.ok(maxSpread <= 18, 'pack stays within one and a half reaches after entering the water: ' + maxSpread);
  assert.ok(race.elapsed - first <= 6, 'first/last finish gap');
  assert.ok(first >= 40 && race.elapsed < 55, 'full length course with a bounded finish');
  assert.equal(new Set([...lanes[0], ...lanes[1]]).size, count, 'every marble takes a return lane');
  if (count >= 100) {
    for (const hits of [jet, wheel, landing])
      assert.ok(hits.size > 0 && hits.size < count, 'each device has riders and a bypass');
    assert.ok(overtakers >= count * 0.1, 'the finishing sprint changes the order after the last lock');
    assert.ok(
      lanes.every((ids) => ids.size >= count * 0.1),
      'both sides of the island carry traffic'
    );
  }
}

(async () => {
  assert.deepEqual(validateStage(tidalLocks), tidalLocks);
  const race = new Race(),
    originalRandom = Math.random;
  await race.physics.init();
  try {
    run(race, 1, 77);
    for (const count of [4, 12]) for (const seed of [77, 527, 1337]) run(race, count, seed);
    for (const count of [100, 300]) for (const seed of [77, 527, 1337, 4242, 9011]) run(race, count, seed);
  } finally {
    Math.random = originalRandom;
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
