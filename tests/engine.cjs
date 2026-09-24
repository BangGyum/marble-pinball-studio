const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.fetch = undefined;
const { WallGuard } = require('../src/wall-guard.ts');
const { Race } = require('../src/race.ts');
const { Game } = require('../src/game.ts');
const { stages } = require('../src/data/maps.ts');

const wall = (points, extra = {}) => ({ position: { x: 0, y: 0 }, type: 'static',
  shape: { type: 'polyline', rotation: 0, points, ...extra }, props: { density: 1, restitution: 0, angularVelocity: 0 } });

// Wall guard: only a slow straight move through a static wall of the same layer counts.
{
  const guard = new WallGuard({ title: 'g', goalY: 100, zoomY: 95, entities: [
    wall([[5, 0], [5, 10]]),
    { ...wall([[20, 0], [20, 10]]), position: { x: 1, y: 2 } },
    wall([[30, 0], [30, 10]], { collisionLayer: 2 }),
    wall([[40, 0], [40, 10]], { sensor: true }),
    { ...wall([[50, 0], [50, 10]]), type: 'kinematic' },
    { ...wall([[60, 0], [60, 10]]), props: { density: 1, restitution: 0, angularVelocity: 0, life: 1 } },
    { position: { x: 70, y: 5 }, type: 'static', shape: { type: 'box', width: 1, height: 0.2, rotation: Math.PI / 2 },
      props: { density: 1, restitution: 0, angularVelocity: 0 } },
  ] });
  assert.equal(guard.crosses(4.8, 5, 5.2, 5, 1), true, 'moving through a wall is detected');
  assert.equal(guard.crosses(4.6, 5, 4.9, 5.2, 1), false, 'approaching a wall is not a crossing');
  assert.equal(guard.crosses(4.8, 10, 5.2, 10, 1), false, 'grazing a wall end is not a crossing');
  assert.equal(guard.crosses(4.7, 5, 5.3, 5.5, 1), false, 'fast moves are left to continuous collision');
  assert.equal(guard.crosses(20.8, 6, 21.2, 6, 1), true, 'wall positions offset their points');
  assert.equal(guard.crosses(19.8, 6, 20.2, 6, 1), false);
  assert.equal(guard.crosses(29.8, 5, 30.2, 5, 1), false, 'other collision layers are ignored');
  assert.equal(guard.crosses(29.8, 5, 30.2, 5, 2), true);
  for (const x of [40, 50, 60]) assert.equal(guard.crosses(x - 0.2, 5, x + 0.2, 5, 1), false, 'sensors, moving and breakable walls are ignored');
  assert.equal(guard.crosses(69.7, 5, 70, 5, 1), true, 'rotated reflector boxes are walls too');
  console.log('PASS wall guard crossing, grazing, speed, offset, layers, ignored walls and boxes');
}

// Race with scripted physics: positions come from a per-ball function of time.
function scripted(stage, paths, speeds = () => 1) {
  const race = new Race();
  const placed = [], shaken = [];
  let time = 0;
  const overrides = new Map();
  race.physics = {
    clearMarbles() {}, clear() {}, createStage() {}, createMarble() {}, start() {}, removeMarble() {},
    step: (dt) => { time += dt; },
    getMarblePosition: (id) => overrides.get(id) ?? { ...paths[id](time), angle: 0 },
    getMarbleSpeed: (id) => speeds(id, time),
    placeMarble: (id, x, y) => { placed.push([id, x, y]); overrides.set(id, { x, y, angle: 0 }); },
    shakeMarble: (id) => shaken.push([id, time]),
  };
  Math.random = () => 0.5;
  race.prepare(stage, paths.map((_, i) => String(i)));
  race.balls.sort((a, b) => a.id - b.id);
  race.startRace([1, 1], 'asc');
  const run = (seconds) => { while (race.state === 'running' && race.elapsed < seconds) race.advance(); };
  return { race, placed, shaken, run };
}
const open = { title: 'open', goalY: 100, zoomY: 95, entities: [] };
const arrives = (t) => ({ x: 2, y: Math.min(101, 5 + t * 40) });

{
  // A still marble that nudges cannot free is ranked by depth once devices can no longer help.
  const { race, shaken, run } = scripted(open, [arrives, () => ({ x: 10, y: 50 })]);
  run(59);
  assert.equal(race.state, 'running', 'a wedged marble gets a full minute of nudges first');
  assert.ok(shaken.length >= 8);
  run(70);
  assert.equal(race.state, 'finished');
  assert.equal(race.finishReason, 'stalled');
  assert.ok(race.elapsed > 60 && race.elapsed < 61.5, `wedged marble finishes the race at ${race.elapsed}`);
  assert.deepEqual(race.arrivals.map((b) => b.id), [0, 1]);
  assert.equal(race.winners[0].id, 0);
}
{
  // Timed gates that release later may hold a marble still on purpose.
  const gate = { position: { x: 0, y: 0 }, type: 'kinematic', shape: { type: 'box', width: 1, height: 0.1, rotation: 0 },
    props: { density: 1, restitution: 0, angularVelocity: 0, timedGate: { period: 10, openFor: 2, phase: 0, angle: 1, releaseAfter: 100 } } };
  const { race, run } = scripted({ ...open, entities: [gate] }, [arrives, () => ({ x: 10, y: 50 })]);
  run(159);
  assert.equal(race.state, 'running', 'a permanent gate release is always awaited');
  run(170);
  assert.equal(race.finishReason, 'stalled');
  assert.ok(race.elapsed > 160 && race.elapsed < 161.5);
}
{
  // A marble circling forever never stops, so only the long race-wide limit can end it.
  const circle = (t) => ({ x: 10 + Math.cos(t * 3), y: 50 + Math.sin(t * 3) });
  const { race, shaken, run } = scripted(open, [arrives, circle]);
  run(299);
  assert.equal(race.state, 'running', 'a moving marble may take minutes to leave a mixing bowl');
  assert.equal(shaken.length, 0);
  run(310);
  assert.equal(race.finishReason, 'stalled');
  assert.ok(race.elapsed > 302 && race.elapsed < 303.5, `circling marble ends the race at ${race.elapsed}`);
}
{
  // Normal races are untouched and report that every marble arrived.
  const { race, run } = scripted(open, [arrives, (t) => ({ x: 4, y: Math.min(101, 5 + t * 10) })]);
  run(60);
  assert.equal(race.finishReason, 'arrived');
  assert.equal(race.rescues, 0);
}
{
  // A marble squeezed through a wall returns to its last position on the correct side.
  const stage = { ...open, entities: [wall([[5, 0], [5, 100]])] };
  const through = (t) => ({ x: t < 0.5 ? 4.8 : 5.2, y: 20 });
  const slow = scripted(stage, [arrives, through]);
  slow.run(0.6);
  assert.equal(slow.race.rescues, 1);
  assert.deepEqual(slow.placed, [[1, 4.8, 20]]);
  assert.equal(slow.race.balls[1].x, 4.8, 'the rescued marble keeps its previous position');
  const fast = scripted(stage, [arrives, through], () => 50);
  fast.run(0.6);
  assert.equal(fast.race.rescues, 0, 'fast marbles are left to continuous collision');
  console.log('PASS wedged and circling stall finishes, gate holds, normal finish and wall rescue');
}

// Previously stuck marbles must get a new trapping window after resuming motion.
{
  const moving = t => t < 40 ? { x: 10, y: 50 } : { x: 10 + 2 * Math.sin(t), y: 49 };
  const { race, run } = scripted(open, [moving]);
  run(39); assert.ok(race.balls[0].shakes >= 8);
  run(70);
  assert.equal(race.state, 'running', 'resumed lateral motion must not be force-ranked at 60s');
  assert.equal(race.balls[0].shakes, 0, 'old nudges are discarded even across momentary turning points');
  run(310);
  assert.equal(race.finishReason, 'stalled', 'the independent five-minute depth timeout still ends endless loops');
}
{
  const movesThenStops = t => t < 40 ? { x: 10, y: 50 }
    : t < 70 ? { x: 10 + (t - 40), y: 49 } : { x: 40, y: 49 };
  const { race, run } = scripted(open, [movesThenStops]);
  run(129); assert.equal(race.state, 'running', 'a new stop must get its own full trapping window');
  run(133); assert.equal(race.finishReason, 'stalled');
  assert.ok(race.elapsed > 129 && race.elapsed < 133);
}
{
  // A brief displacement from a nudge does not erase a genuinely trapped marble's history.
  const jostles = t => ({ x: t >= 50 && t < 50.5 ? 10 + Math.sin((t - 50) * Math.PI * 2) * 0.1 : 10, y: 50 });
  const { race, run } = scripted(open, [jostles]);
  run(70); assert.equal(race.finishReason, 'stalled');
  assert.ok(race.elapsed < 62);
}
{
  // Marbles wedged at different times bounce after their nudges out of phase; that must not block the stall finish.
  let shaken = [];
  const pocket = (id) => (t) => {
    const x = 10 + id * 2, wedgedAt = 1 + (id - 1) * 1.4;
    if (t < wedgedAt) return { x, y: 50 - (wedgedAt - t) * 3 };
    const bouncing = shaken.some(([i, at]) => i === id && t - at < 1.5);
    return bouncing ? { x: x + 0.05 * Math.sin(t * 25), y: 50 - 0.1 * Math.abs(Math.sin(t * 5)) } : { x, y: 50 };
  };
  const pockets = scripted(open, [arrives, pocket(1), pocket(2), pocket(3), pocket(4)]);
  shaken = pockets.shaken;
  pockets.run(80);
  assert.equal(pockets.race.finishReason, 'stalled');
  assert.ok(pockets.race.elapsed < 70, `four wedged marbles end the race at ${pockets.race.elapsed}`);
}
console.log('PASS resumed motion, turning points, fresh trapping window, brief nudges and out-of-phase wedges');

// Drawing blends the last two physics steps; camera easing does not depend on the refresh rate.
{
  const calls = [];
  const context = new Proxy({}, { get: (_, key) => (...args) => {
    calls.push([key, ...args]);
    if (key === 'createRadialGradient') return { addColorStop() {} };
  } });
  global.window = { addEventListener() {} };
  global.devicePixelRatio = 1;
  global.requestAnimationFrame = () => 1;
  global.ResizeObserver = class { observe() {} };
  const canvas = { width: 800, height: 600, getContext: () => context, addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const game = new Game(canvas);
  game.resize();
  game.physics.getEntities = (blend) => { calls.push(['blend', blend]); return []; };
  game.stage = { title: 't', goalY: 100, zoomY: 95 };
  game.balls = [{ id: 0, name: 'A', color: '#ffffff', x: 10, y: 20, px: 10, py: 10, angle: 0, stuck: 0 }];
  game.state = 'running';
  game.accumulator = 0.5 / 60;
  game.stepped = true;
  game.manual = { x: 10, y: 15 };
  game.render();
  assert.deepEqual(calls.find((c) => c[0] === 'blend'), ['blend', 0.5], 'obstacles blend with the same fraction');
  assert.ok(Math.abs(calls.find((c) => c[0] === 'strokeText')[3] - 15.55) < 1e-9, 'the marble is drawn half-way between steps');
  calls.length = 0;
  game.stepped = false;
  game.render();
  assert.ok(Math.abs(calls.find((c) => c[0] === 'strokeText')[3] - 20.55) < 1e-9, 'right after a resume the latest step is drawn');
  game.manual = null;

  const realPerformance = global.performance;
  const settle = (hz) => {
    let now = 1000;
    global.performance = { now: () => now };
    game.camera = { x: 10, y: 0 };
    game.balls[0] = { ...game.balls[0], y: 100, py: 100 };
    game.lastRender = now;
    for (let i = 0; i < hz / 4; i++) { now += 1000 / hz; game.render(); }
    return game.camera.y;
  };
  const at60 = settle(60), at144 = settle(144);
  global.performance = realPerformance;
  assert.ok(Math.abs(at60 - at144) < 0.5, `camera after 0.25s: 60Hz ${at60.toFixed(2)} vs 144Hz ${at144.toFixed(2)}`);
  assert.ok(Math.abs(at60 - 100 * (1 - 0.87 ** 15)) < 0.01, 'the 60Hz easing is unchanged');
  console.log('PASS step blending for marbles and obstacles, resume and refresh-independent camera');
}

// Regression: on this seed a marble wedges beside the canyon's right bank and HEAD never finished.
(async () => {
  const canyon = stages.find((stage) => stage.title === '균열 협곡');
  const race = new Race();
  await race.physics.init();
  let seed = (0x9e3779b9 ^ (2 * 0x45d9f3b)) >>> 0;
  Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  race.prepare(canyon, Array.from({ length: 100 }, (_, i) => String(i)));
  race.startRace([1, 2], 'asc');
  while (race.state === 'running' && race.elapsed < 400) race.advance();
  assert.equal(race.state, 'finished', 'a wedged marble must not keep the draw running forever');
  assert.equal(race.finishReason, 'stalled');
  assert.equal(race.arrivals.length, 100);
  assert.ok(race.elapsed < 200, `finished at ${race.elapsed.toFixed(1)}s`);
  race.physics.clearMarbles(); race.physics.clear();
  console.log(`PASS wedged canyon marble ends the draw at ${race.elapsed.toFixed(1)}s`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
