const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.fetch = undefined;
const { dolphinRows, validateDolphins, dolphinPose, dolphinBounce, dolphinWave } = require('../src/dolphin.ts');
const { Race } = require('../src/race.ts'), { stages } = require('../src/data/maps.ts');
const { encodeScene, decodeScene } = require('../src/lan/protocol.ts');
const near = (a, b, message, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${message}: ${a} / ${b}`);
const stage = { title: 'Dolphin audit', width: 26, goalY: 100, zoomY: 95, entities: [] };
for (const map of [...stages, { ...stage, goalY: 20.345 }]) for (const count of [1, 3, 6]) for (const gap of [.5, 20, 100]) {
  const rows = dolphinRows(map, count, gap);
  assert.equal(validateDolphins({ enabled: true, rows, interval: 6 }, map).rows.length, count);
}
for (const value of [null, [], {}, { enabled: true, rows: [12], interval: 5 }, { enabled: true, rows: [12, 12], interval: 20 },
  { enabled: true, rows: [NaN], interval: 20 }, { enabled: true, rows: [101], interval: 20 },
  { enabled: true, rows: Array(7).fill(12), interval: 20 }, { enabled: true, rows: [12], interval: Infinity }])
  assert.throws(() => validateDolphins(value, stage));
const settings = { enabled: true, rows: [12, 32, 52], interval: 12 };
const scene = { type: 'scene', raceId: 'audit', revision: 1, stage, settings: { names: 'a', mapId: 0, order: 'asc', picks: 1, dolphins: settings }, entities: [], fixed: [], balls: [] };
assert.deepEqual(decodeScene(encodeScene(scene)).settings.dolphins, settings);
assert.equal(dolphinWave(settings, 12).wave, 1); near(dolphinWave(settings, 12).time, 0, 'configured wave interval');
for (const time of [0, .5, 1.5, 1.933, 3, 5.7]) {
  const a = dolphinPose(stage, 20, time), b = dolphinPose(stage, 20, time, -1);
  near(a.x + b.x, 26, 'mirrored dolphin positions'); near(a.y, b.y, 'mirrored dolphin heights');
}
const n = { x: -10 / Math.hypot(86, -10), y: -86 / Math.hypot(86, -10) }, tangent = { x: -n.y, y: n.x };
const pose = { x: 13, y: 20, angle: 0, direction: 1, waterY: 30 };
const ball = { x: 13 + 5 / 36 + n.x * .63, y: 20 + 5 / 36 + n.y * .63,
  vx: -n.x * 10 + tangent.x * 3, vy: -n.y * 10 + tangent.y * 3 };
const velocity = dolphinBounce(ball, pose, { vx: 0, vy: 0, omega: 0 }); assert.ok(velocity?.hit);
near(velocity.vx * n.x + velocity.vy * n.y, 5.5, 'normal reflection');
near(velocity.vx * tangent.x + velocity.vy * tangent.y, 3, 'tangential momentum');
assert.equal(dolphinBounce({ ...ball, y: ball.y + 20 }, { ...pose, y: 40 }, { vx: 0, vy: 0, omega: 0 }), undefined, 'submerged surfaces do not hit');
console.log('PASS dolphin settings bounds, interval, LAN wire round trip, mirror and collision reflection');
(async () => {
  const race = new Race(); await race.physics.init();
  let seed = 42; const random = Math.random;
  const resetSeed = () => { seed = 42; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const names = Array.from({ length: 100 }, (_, i) => String(i));
  const run = effect => { resetSeed(); race.prepare(stage, names, effect); race.startRace([1, 1]); for (let i = 0; i < 240; i++) race.advance(); return JSON.stringify(race.balls); };
  try {
    assert.equal(run(), run({ ...settings, enabled: false }), 'disabled dolphins preserve exact physics');
    race.prepare(stage, ['contact'], { enabled: true, rows: [20], interval: 20 }); race.startRace([1, 1]);
    race.elapsed = 2.9; const p = dolphinPose(stage, 20, 2.9);
    race.physics.placeMarble(0, p.x, p.y - .4); race.physics.setMarbleVelocity(0, 0, 10);
    let impacts = 0; const setVelocity = race.physics.setMarbleVelocity.bind(race.physics);
    race.physics.setMarbleVelocity = (...args) => { impacts++; setVelocity(...args); };
    race.advance(); assert.ok(impacts > 0, 'the real Box2D race receives the dolphin impact');
    assert.ok(race.physics.getMarbleVelocity(0).vy < 0, 'contact reflects downward velocity upward');
    for (const map of stages) {
      race.prepare(map, names, { enabled: true, rows: dolphinRows(map, 6, 20), interval: 6 }); race.startRace([1, 1]);
      for (let i = 0; i < (process.argv.includes('--finish') ? 60 * 650 : 720) && race.state === 'running'; i++) {
        race.advance();
        for (const b of race.balls) assert.ok([b.x, b.y, b.angle].every(Number.isFinite), `${map.title}: finite marble state`);
      }
      if (process.argv.includes('--finish')) assert.equal(race.state, 'finished', `${map.title}: race completes with dolphins`);
      console.log(`PASS integrated dolphin physics: ${map.title}, 100 marbles, 6 rows, 6-second interval, ${race.elapsed.toFixed(1)}s, ${race.finishReason ?? 'running'}`);
    }
  } finally { Math.random = random; race.physics.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
