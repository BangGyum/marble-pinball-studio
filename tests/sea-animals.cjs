const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
global.fetch = undefined;
const { animalWaves, animalPoses } = require('../src/sea-animals.ts');
const { validateDolphins, dolphinRows, DOLPHIN_DURATION, dolphinBounce } = require('../src/dolphin.ts');
const { mantaPose } = require('../src/manta.ts');
const { mantaContact, MANTA_OUTLINE } = require('../src/manta-hitbox.ts');
const { SeaAnimalRenderer } = require('../src/sea-animal-render.ts');
const { Race } = require('../src/race.ts'),
  { stages } = require('../src/data/maps.ts');
const { encodeScene, decodeScene } = require('../src/lan/protocol.ts');
const stage = { title: 'Sea effects audit', width: 26, goalY: 100, zoomY: 95, entities: [] };
const dolphin = { enabled: true, rows: [32], interval: 7, size: 150, speed: 0.5 };
const manta = { enabled: true, rows: [18, 42], interval: 11, size: 80, speed: 1.3 };
const settings = { ...dolphin, manta };
assert.deepEqual(validateDolphins(dolphin, stage), dolphin, 'legacy settings retain their exact shape');
const copy = validateDolphins(settings, stage);
copy.manta.rows[0] = 19;
assert.equal(settings.manta.rows[0], 18, 'settings copy owns both row arrays');
for (const invalid of [
  null,
  {},
  { ...manta, rows: [18, 18] },
  { ...manta, size: 201 },
  { ...manta, speed: 0 },
  { ...manta, interval: 4 },
  { ...manta, manta },
  { ...manta, unknown: true },
])
  assert.throws(() => validateDolphins({ ...dolphin, manta: invalid }, stage));
const wire = {
  type: 'scene',
  raceId: 'sea',
  revision: 1,
  stage,
  settings: { names: 'a', mapId: 0, order: 'asc', picks: 1, dolphins: settings },
  entities: [],
  fixed: [],
  balls: [],
};
assert.deepEqual(decodeScene(encodeScene(wire)).settings.dolphins, settings);
for (let wave = 0; wave < 20; wave++) {
  const at = Math.floor(wave / 2) * 18 + (wave % 2 ? 7 : 0),
    latest = animalWaves(settings, at).at(-1);
  assert.equal(latest.wave, wave);
  assert.equal(latest.kind, wave % 2 ? 'manta' : 'dolphin');
  assert.equal(latest.time, 0);
  assert.deepEqual(
    animalWaves(settings, at),
    animalWaves(JSON.parse(JSON.stringify(settings)), at),
    'late viewer reconstructs the same waves'
  );
}
assert.equal(animalWaves({ ...settings, enabled: false }, 11).at(-1).kind, 'manta');
assert.deepEqual(animalWaves({ ...dolphin, enabled: false }, 20), []);
assert.equal(
  animalWaves(settings, 8).find((w) => w.kind === 'dolphin').wave,
  0,
  'slow older dolphin completes its traversal'
);
assert.equal(animalWaves(settings, 8).find((w) => w.kind === 'manta').time, 1.3, 'manta uses its own speed');
const preview = animalWaves(settings, 10 + 0.1, true);
assert.equal(preview.at(-1).kind, 'manta', 'preview alternates after the first full slow traversal');
for (const kind of ['dolphin', 'manta'])
  for (const speed of [0.5, 1, 1.5])
    for (const mantaSpeed of [0.5, 1, 1.5]) {
      const renderer = new SeaAnimalRenderer();
      renderer.kind = kind;
      const options = { ...dolphin, speed, manta: { ...manta, speed: mantaSpeed } };
      assert.equal(renderer.previewTime(options, 12.3, false), 12.3, 'animated preview keeps the shared clock');
      const selected = animalWaves(options, renderer.previewTime(options, 12.3, true), true);
      assert.equal(selected.length, 1, 'reduced motion shows the edited species only');
      assert.equal(selected[0].kind, kind);
      assert.ok(
        Math.abs(selected[0].time - DOLPHIN_DURATION / 2) < 1e-9,
        'static preview centers the selected species at every speed'
      );
      options.enabled = false;
      const solo = animalWaves(options, renderer.previewTime(options, 12.3, true), true);
      assert.equal(solo[0].kind, 'manta', 'manta-only settings do not need a previously selected manta tab');
      assert.ok(Math.abs(solo[0].time - DOLPHIN_DURATION / 2) < 1e-9);
    }
for (const direction of [-1, 1]) {
  let turns = 0,
    previousSign = 0;
  for (let i = 1; i < 435; i++) {
    const a = mantaPose(stage, 32, (i - 1) / 100, direction),
      b = mantaPose(stage, 32, i / 100, direction),
      sign = Math.sign(b.y - a.y);
    if (previousSign && sign !== previousSign) turns++;
    previousSign = sign;
    assert.ok([b.x, b.y, b.angle].every(Number.isFinite));
    assert.ok(Math.abs(b.angle) < 0.35, 'manta banks gently instead of making dolphin jumps');
  }
  assert.equal(turns, 6, 'three smooth zigzags per traversal');
}
for (const at of [0, 1.2, 2.175, 4.35]) {
  const a = mantaPose(stage, 32, at),
    b = mantaPose(stage, 32, at, -1);
  assert.ok(Math.abs(a.x + b.x - stage.width) < 1e-9);
  assert.equal(a.y, b.y);
}
for (const [at, expected, count] of [
  [2, 'dolphin', 1],
  [8.5, 'manta', 2],
]) {
  const translations = [],
    clips = [];
  const ctx = new Proxy(
    {
      getTransform: () => ({ a: 1, b: 0 }),
      translate: (x, y) => translations.push({ x, y }),
      clip: () => clips.push(1),
    },
    { get: (o, key) => (key in o ? o[key] : () => {}) }
  );
  const renderer = new SeaAnimalRenderer();
  renderer.draw(ctx, stage, { ...settings, speed: 1 }, at, { left: -100, right: 100, top: -100, bottom: 100 });
  assert.equal(translations.length, count);
  assert.equal(clips.length, expected === 'dolphin' ? count : 0, 'manta is not clipped at the dolphin waterline');
}
console.log(
  'PASS separate options, legacy/LAN shape, alternating and overlapping waves, deterministic clocks, zigzag and render parity'
);
(async () => {
  const race = new Race();
  await race.physics.init();
  try {
    let samples = 0;
    for (const size of [50, 100, 200])
      for (const speed of [0.5, 1, 1.5])
        for (const wave of [0, 1]) {
          const effect = {
              enabled: false,
              rows: [32],
              interval: 5,
              manta: { enabled: true, rows: [32], interval: 12, size, speed },
            },
            dt = 1 / 240,
            at = wave * 12 + DOLPHIN_DURATION / (2 * speed),
            { p, motion } = animalPoses(effect, stage, at, dt)[0],
            [x, y] = MANTA_OUTLINE.reduce((a, b) => (b[0] > a[0] ? b : a)),
            position = {
              x: p.x + p.direction * p.scale * (Math.cos(p.angle) * x - Math.sin(p.angle) * y),
              y: p.y + p.scale * (Math.sin(p.angle) * x + Math.cos(p.angle) * y),
            },
            edge = mantaContact(position, p);
          position.x += edge.normalX * 0.24;
          position.y += edge.normalY * 0.24;
          const contact = mantaContact(position, p);
          assert.ok(contact);
          race.prepare(stage, ['manta contact'], effect);
          race.startRace([1, 1]);
          race.physics.placeMarble(0, position.x, position.y);
          race.physics.setMarbleVelocity(
            0,
            motion.vx - motion.omega * contact.ry - contact.normalX * 10,
            motion.vy + motion.omega * contact.rx - contact.normalY * 10
          );
          const actualPosition = race.physics.getMarblePosition(0),
            actualContact = mantaContact(actualPosition, p);
          const expected = dolphinBounce(
            { ...actualPosition, ...race.physics.getMarbleVelocity(0) },
            p,
            motion,
            true,
            actualContact
          );
          assert.ok(expected?.hit);
          race.stepDolphins(dt, at);
          const actual = race.physics.getMarbleVelocity(0);
          assert.ok(Math.abs(actual.vx - expected.vx) < 1e-4 && Math.abs(actual.vy - expected.vy) < 1e-4);
          assert.ok(race.dolphinContacts.has(`manta:${wave}:0:0`));
          samples++;
        }
    console.log(`PASS ${samples} actual Box2D manta reflections across sizes, speeds and directions`);
    const names = Array.from({ length: 100 }, (_, i) => String(i));
    for (const map of stages)
      for (const alternating of [false, true]) {
        const rows = dolphinRows(map, 6, 20);
        race.prepare(map, names, {
          enabled: alternating,
          rows,
          interval: 5,
          manta: { enabled: true, rows, interval: 5, size: 100, speed: 1 },
        });
        race.startRace([1, 1]);
        for (let i = 0; i < 720 && race.state === 'running'; i++) {
          race.advance();
          for (const b of race.balls) assert.ok([b.x, b.y, b.angle].every(Number.isFinite));
        }
      }
    console.log(
      `PASS ${stages.length * 2} real-map runs, 100 marbles / 6 rows, manta-only and alternating for 12 seconds`
    );
  } finally {
    race.physics.dispose();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
