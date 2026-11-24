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
const { exportMap, validateStage } = require('../src/model.ts');
const { encodeScene, decodeScene } = require('../src/lan/protocol.ts');
const fixture = require('./fixtures/water-channel.json');
const stage = validateStage(fixture.stage);
const right = { x: 1, y: 9, width: 28, depth: 12, current: 7 };

function verifyMapData() {
  assert.deepEqual(JSON.parse(exportMap(stage)), fixture);
  const wire = encodeScene({ stage, settings: { stage }, entities: [] });
  assert.deepEqual(decodeScene(JSON.parse(JSON.stringify(wire))).settings.stage.waterZones, stage.waterZones);
  for (const invalid of [
    null,
    [null],
    [{ ...right, depth: 0 }],
    [{ ...right, current: Infinity }],
    Array(31).fill(right),
  ])
    assert.throws(() => validateStage({ ...stage, waterZones: invalid }), /물 구역/);
}

function verifyForces(race) {
  const p = race.physics;
  function sample(zones, x = 12, y = 12, steps = 1, vy = 0) {
    race.prepare({ ...stage, entities: [], waterZones: zones }, ['공']);
    race.startRace([1, 1]);
    p.placeMarble(0, x, y);
    p.setMarbleVelocity(0, 0, vy);
    for (let i = 0; i < steps; i++) p.step(1 / 60);
    return p.getMarbleVelocity(0);
  }
  const full = sample([right]),
    half = sample([right], 12, 9),
    dry = sample(undefined);
  assert.ok(dry.vx === 0 && dry.vy > half.vy && half.vy > full.vy && full.vy > 0);
  assert.ok(full.vx > half.vx && half.vx > 0);
  assert.deepEqual(sample([right, right]), full);
  const opposing = sample([right, { ...right, current: -7 }]);
  assert.ok(Math.abs(opposing.vx) < 1e-6 && Math.abs(opposing.vy - full.vy) < 1e-6);
  const left = sample([{ ...right, current: -7 }], 12, 12, 30, 8);
  assert.ok(left.vx < -3 && left.vy < sample([], 12, 12, 30, 8).vy);
  for (const [x, y] of [
    [12, 8],
    [12, 22],
    [0.5, 12],
    [29.5, 12],
  ])
    assert.deepEqual(sample([right], x, y), dry);
  // Leave the water without reloading the stage: neither drag nor buoyancy may linger.
  sample([right], 12, 12, 12);
  p.placeMarble(0, 12, 22);
  p.step(1 / 60);
  assert.deepEqual(p.getMarbleVelocity(0), dry);
  console.log('PASS water map import/export, LAN scene, immersion, currents, drag, overlap and exit');
}

function verifyRace(race, count, seed) {
  const originalRandom = Math.random;
  let state = seed;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  try {
    race.prepare(
      stage,
      Array.from({ length: count }, (_, i) => String(i))
    );
    race.startRace([count, count], 'desc');
    const entered = new Set(),
      throughGate = new Set(),
      throughExit = new Set();
    while (race.state === 'running' && race.elapsed < 45) {
      race.advance();
      for (const b of race.balls) {
        if (b.rank) continue;
        assert.ok(b.x > 1 && b.x < 29 && b.y > -22);
        if (b.py < 9 && b.y >= 9) entered.add(b.id);
        if (b.py < 16 && b.y >= 16) {
          assert.ok(race.elapsed >= 7 && b.x > 23, 'waits for the gate and leaves through the right opening');
          throughGate.add(b.id);
        }
        if (b.py < 25 && b.y >= 25) {
          assert.ok(b.x < 7.3, 'returns through the left opening on the lower level');
          throughExit.add(b.id);
        }
      }
    }
    const label = count + ' marbles / seed ' + seed;
    assert.equal(race.finishReason, 'arrived', label + ': ' + race.arrivals.length + ' arrivals');
    assert.equal(race.arrivals.length, count);
    for (const ids of [entered, throughGate, throughExit]) assert.equal(ids.size, count, label);
    assert.equal(race.rescues, 0, label);
    console.log(
      'PASS ' + label + ': all cleared both channels and gate in ' + race.elapsed.toFixed(2) + 's, 0 wall rescues'
    );
  } finally {
    Math.random = originalRandom;
  }
}

(async () => {
  verifyMapData();
  const race = new Race();
  await race.physics.init();
  try {
    verifyForces(race);
    for (const count of [100, 300]) for (const seed of [77, 527, 1337]) verifyRace(race, count, seed);
  } finally {
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
