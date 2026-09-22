const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { orbitalLock: stage } = require('../src/data/orbital-lock.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
const { timedGateAngle } = require('../src/timed-gate.ts');
const { orbitalTransfers } = require('../src/data/orbital-lock.ts');
const { drawOrbitalArt } = require('../src/orbital-art.ts');
const { bridgeBallOpacity } = require('../src/map-art.ts');
const inside = (ball, points) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > ball.y) !== (b[1] > ball.y) && ball.x < (b[0] - a[0]) * (ball.y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
const near = (ball, points, margin = 0.3) => points.some((a, i) => {
  const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((ball.x - a[0]) * dx + (ball.y - a[1]) * dy) / Math.max(0.000001, dx * dx + dy * dy)));
  return Math.hypot(ball.x - (a[0] + t * dx), ball.y - (a[1] + t * dy)) <= margin;
});

(async () => {
  const originalCanvas = global.OffscreenCanvas;
  let textures = 0, resolution = 8, blits = 0;
  const context = () => new Proxy({ getTransform: () => ({ a: resolution, b: 0 }),
    drawImage: () => blits++, createLinearGradient: () => ({ addColorStop() {} }) },
    { get: (target, key) => target[key] ?? (() => {}) });
  global.OffscreenCanvas = class { constructor() { textures++; } getContext() { return context(); } };
  try {
    const ctx = context();
    drawOrbitalArt(ctx, stage); drawOrbitalArt(ctx, stage);
    assert.equal(textures, 1, 'unchanged scenery is drawn from one cached texture');
    assert.equal(blits, 2);
    resolution = 16; drawOrbitalArt(ctx, stage);
    assert.equal(textures, 2, 'zoom changes refresh the texture');
    drawOrbitalArt(ctx, { ...stage }); assert.equal(textures, 3, 'new map identity invalidates scenery');
    global.OffscreenCanvas = undefined; drawOrbitalArt(ctx, stage);
    assert.equal(blits, 4, 'browsers without offscreen canvas use the vector fallback');
    global.OffscreenCanvas = class { constructor() { textures++; } getContext() { return context(); } };
    drawOrbitalArt(ctx, stage, 2);
    resolution = 8; drawOrbitalArt(ctx, stage, 2);
    resolution = 16; drawOrbitalArt(ctx, stage, 2);
    assert.equal(textures, 5, 'main view and minimap reuse their bridge textures without rebuilding every frame');
  } finally { global.OffscreenCanvas = originalCanvas; }
  const crossing = { x: 32, y: 55.5 };
  assert.ok(bridgeBallOpacity(stage, crossing) < 0.3, 'lower orbit leaves a faint silhouette under the bridge');
  assert.equal(bridgeBallOpacity(stage, { ...crossing, onBridge: true }), 1, 'upper marble stays fully visible at the identical crossing');
  assert.equal(bridgeBallOpacity(stage, { x: 29.5, y: 55.5 }), 1, 'marble is visible outside the underpass');
  assert.equal(bridgeBallOpacity(stage, { x: 32, y: 47 }), 1, 'open entry does not hide an approaching marble');
  assert.equal(bridgeBallOpacity({ title: 'Flat' }, crossing), 1, 'flat maps keep their existing appearance');
  assert.deepEqual(validateStage(stage), stage);
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saveMaps(storage, [{ id: 'orbital', stage }]);
  assert.deepEqual(readSavedMaps(storage)[0].stage, stage);
  for (const innerRadius of [-1, 28.3, Infinity, '2'])
    assert.throws(() => validateStage({ ...stage, windZones: [{ ...stage.windZones[0], innerRadius }] }));
  for (const exitBridge of [null, {}, { ...stage.exitBridge, entry: { ...stage.exitBridge.entry, width: 0 } }, { ...stage.exitBridge, deck: [] }])
    assert.throws(() => validateStage({ ...stage, exitBridge }));
  assert.throws(() => validateStage({ ...stage, exitBridge: undefined }));
  assert.throws(() => validateStage({ ...stage, entities: [{ ...stage.entities[0], shape: { ...stage.entities[0].shape, collisionLayer: 3 } }] }));
  const gateEntity = stage.entities.find(e => e.props.timedGate), gate = gateEntity.props.timedGate;
  for (const releaseAfter of [0, 181, Infinity, null, '20'])
    assert.throws(() => validateStage({ ...stage, entities: [{ ...gateEntity, props: { ...gateEntity.props, timedGate: { ...gate, releaseAfter } } }] }));
  for (const angle of [-1.4, 1.4]) {
    const settings = { ...gate, angle };
    assert.ok(Math.abs(timedGateAngle(settings, gate.releaseAfter + 0.001) - timedGateAngle(settings, gate.releaseAfter)) < 0.01);
    for (let time = gate.releaseAfter + 0.6; time < 100; time += 0.25)
      assert.ok(Math.abs(timedGateAngle(settings, time) - angle) < 0.00001, 'released gates stay physically open');
  }
  const race = new Race(); await race.physics.init();
  const physics = race.physics, random = Math.random;
  const platform = (y, collisionLayer) => ({ position: { x: 13, y }, type: 'static',
    shape: { type: 'box', width: 12, height: 0.2, rotation: 0, collisionLayer },
    props: { density: 1, restitution: 0, angularVelocity: 0 } });
  const bridgeTest = { title: 'Bridge', goalY: 25, zoomY: 20,
    exitBridge: { entry: { x: 8, y: 7, width: 2, height: 1 }, deck: [[7, 6], [9, 6], [9, 16], [7, 16]] },
    entities: [platform(5, 2), platform(10, 1), platform(14, 2)] };
  physics.createStage(bridgeTest); physics.createMarble(0, 8, 3); physics.createMarble(1, 12, 3); physics.start();
  for (let i = 0; i < 180; i++) physics.step(1 / 60);
  assert.ok(Math.abs(physics.getMarblePosition(0).y - 13.55) < 0.03, 'bridge entrant passes ground floor and lands on bridge floor');
  assert.ok(Math.abs(physics.getMarblePosition(1).y - 9.55) < 0.03, 'non-entrant passes bridge ceiling and lands on ground floor');
  assert.equal(physics.marbleMap[0].GetFixtureList().GetFilterData().categoryBits, 2);
  assert.equal(physics.marbleMap[1].GetFixtureList().GetFilterData().categoryBits, 1);
  physics.clearMarbles(); physics.clear();
  assert.ok(stage.entities.some(e => e.shape.type === 'circle' && e.shape.sensor === true), 'orbital hinge caps are decorative sensors, not blocking bumps');
  physics.createStage({ title: 'Annular wind', entities: [], windZones: [{ type: 'vortex', x: 10, y: 10, radius: 10, innerRadius: 6, speed: 20, radial: 0 }] });
  physics.createMarble(0, 11, 10); physics.createMarble(1, 18, 10); physics.start(); physics.step(1 / 60);
  assert.ok(Math.abs(physics.marbleMap[0].GetLinearVelocity().y - 1 / 6) < 0.001, 'annular wind leaves its inner hole untouched');
  assert.ok(physics.marbleMap[1].GetLinearVelocity().y > 0.5, 'annular wind acts on the orbit');
  console.log('PASS bridge collision isolation, annular wind, smooth permanent gate release and storage');
  for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 100, 300])) {
    for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456, 271828, 314159])) {
      let seed = initial;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
      race.startRace([Math.max(1, count - 1), count], 'desc');
      let first = 0, steps = 0, escaped = 0, maxGateStill = 0;
      const escapeSamples = [];
      const entered = new Set(), core = new Set(), bridge = new Set(), start = performance.now();
      const gateStill = new Map(), previous = new Map();
      while (race.state === 'running' && race.elapsed < 120) {
        race.advance(); steps++;
        for (const ball of race.balls) if (!ball.rank) {
          const radius = Math.hypot(ball.x - 32, ball.y - 40), body = physics.marbleMap[ball.id];
          const before = previous.get(ball.id), movement = before === undefined ? 1 : Math.hypot(ball.x - before.x, ball.y - before.y);
          previous.set(ball.id, { x: ball.x, y: ball.y });
          const atOuterGate = Math.hypot(ball.x - 42.5, ball.y - 20) < 4.8 && ball.x > 37 && ball.y < 27;
          const gateFrames = atOuterGate && movement < 0.006 ? (gateStill.get(ball.id) ?? 0) + 1 : 0;
          gateStill.set(ball.id, gateFrames); maxGateStill = Math.max(maxGateStill, gateFrames);
          if (physics.bridgeBodies.has(body)) {
            assert.equal(ball.onBridge, true, 'rendered upper floor follows the physical collision layer');
            bridge.add(ball.id);
            if (!inside(ball, stage.exitBridge.deck) && !near(ball, stage.exitBridge.deck)) { escaped++; if (escapeSamples.length < 5) escapeSamples.push([ball.x, ball.y, 'bridge']); }
          } else {
            if (radius < 18) entered.add(ball.id); if (radius < 8) core.add(ball.id);
            const inCourse = radius < 8.1 || (radius > 12.9 && radius < 18.1) || (radius > 22.9 && radius < 28.1) ||
              orbitalTransfers.some(p => inside(ball, p)) || (ball.y < 12.4 && ball.x >= 25.9 && ball.x <= 38.1) ||
              (ball.y >= 46.7 && ball.y < 48.3 && ball.x >= 30 && ball.x <= 34);
            if (!inCourse) { escaped++; if (escapeSamples.length < 5) escapeSamples.push([ball.x, ball.y, radius, 'orbit']); }
          }
        }
        if (!first && race.arrivals.length) first = race.elapsed;
      }
      const result = { count, seed: initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2), arrived: race.arrivals.length,
        entered: entered.size, core: core.size, bridge: bridge.size, escaped, escapeSamples,
        maxGateStillSeconds: +(maxGateStill / 60).toFixed(2), msPerStep: +((performance.now() - start) / steps).toFixed(2),
        remaining: race.balls.filter(b => !b.rank).slice(0, 12).map(b => [b.id, +b.x.toFixed(2), +b.y.toFixed(2), bridge.has(b.id)]) };
      console.log(JSON.stringify(result));
      assert.equal(result.arrived, count, 'every marble must finish without a forced timeout');
      assert.equal(escaped, 0, 'every marble remains inside its physical track, including at crossings');
      if (count <= 20) assert.ok(result.maxGateStillSeconds < 2, 'the outer gate hub must not trap a marble');
      assert.equal(entered.size, count); assert.equal(core.size, count); assert.equal(bridge.size, count);
      assert.ok(first >= 8 && race.elapsed < 80, 'mix the pack without an overlong race');
      assert.ok(race.arrivals.every(b => b.x > 27 && b.x < 34), 'finish only through the S-shaped outlet');
    }
  }
  Math.random = random; physics.clearMarbles(); physics.clear();
  assert.equal(physics.bridgeBodies.size, 0, 'reset clears bridge membership');
  console.log('PASS orbital storage, validation, three-stage route, bridge entry and full completion');
})().catch(error => { console.error(error); process.exitCode = 1; });
