const assert = require('node:assert/strict');
const fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );

const context = () =>
  new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'measureText') return (text) => ({ width: text.length * 8 });
        if (key === 'getTransform') return () => ({ a: 50, b: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
    }
  );
const canvas = () => ({
  getContext: () => context(),
  addEventListener() {},
  getBoundingClientRect: () => ({ width: 1000, height: 600, left: 0, top: 0 }),
});
global.window = { addEventListener() {} };
global.document = { querySelector: () => null };
global.devicePixelRatio = 1;
global.requestAnimationFrame = () => 1;
global.ResizeObserver = class {
  observe() {}
};
global.fetch = undefined;
const { Game } = require('../src/game.ts');
const { LanView } = require('../src/lan/view.ts');
const { stages } = require('../src/data/maps.ts');
const { RenderResolution } = require('../src/render-resolution.ts');
const resolution = new RenderResolution();
for (let i = 0; i < 40; i++) resolution.sample(25, true, 1.75);
assert.equal(resolution.ratio(1.75), 1.5, 'sustained slow high-DPI frames reduce only the canvas pixel density');
for (let i = 0; i < 160; i++) resolution.sample(25, true, 1.75);
assert.equal(resolution.ratio(1.75), 1, 'automatic resolution has a one-device-pixel-per-CSS-pixel floor');
for (let i = 0; i < 1499; i++) resolution.sample(10, true, 1.75);
assert.equal(resolution.ratio(1.75), 1, 'brief recovery cannot repeatedly allocate different resolution sprites');
resolution.sample(10, true, 1.75);
assert.equal(resolution.ratio(1.75), 1.25, 'fifteen stable seconds restore quality one step at a time');
const idleResolution = new RenderResolution();
for (let i = 0; i < 200; i++) idleResolution.sample(25, false, 2);
idleResolution.sample(1000, true, 2);
assert.equal(idleResolution.ratio(2), 2, 'idle, recording and suspended-tab intervals never lower quality');
for (const hz of [60, 120, 144]) {
  const fast = new RenderResolution();
  for (let i = 0; i < hz * 5; i++) fast.sample(1000 / hz, true, 2);
  assert.equal(fast.ratio(2), 2, 'stable supported refresh rates retain full resolution');
}
console.log('PASS sustained-load pixel density, quality floor, slow recovery and idle/recording/background safeguards');
const realPerformance = global.performance,
  realRandom = Math.random;
let clock = 1000;
global.performance = { now: () => clock };

// A 6ms physics allowance can start a second step and consume the entire 120Hz frame.
function busyFrame(hz, stepCost = 3.2, renderCost = 2.2) {
  const game = new Game(canvas());
  game.state = 'running';
  game.speed = 4;
  game.fastForward = true;
  game.finishSlowdown = () => 1;
  game.last = 1000;
  let steps = 0,
    renders = 0;
  game.advance = () => {
    steps++;
    clock += stepCost;
  };
  game.render = () => {
    renders++;
    clock += renderCost;
  };
  clock = 1000;
  game.frame(1000 + 1000 / hz);
  return { steps, renders, work: clock - 1000, remaining: game.accumulator };
}
for (const hz of [120, 144]) {
  const result = busyFrame(hz);
  assert.ok(result.work < 1000 / hz, `${hz}Hz must yield time to rendering; used ${result.work.toFixed(1)}ms`);
  assert.equal(result.steps, 1, 'one expensive step still advances, but no second one starts');
  assert.equal(result.renders, 1);
  assert.ok(result.remaining < 2 / 60, 'only one pending step may carry into the next frame');
}
assert.equal(busyFrame(60).steps, 1, 'do not start a second step estimated to exceed the 6ms physics allowance');
assert.equal(busyFrame(60, 2.4).steps, 2, 'cheap steps still catch up within the same physics allowance');
assert.equal(busyFrame(10).steps, 1, 'a delayed callback must not increase the 6ms ceiling');
assert.ok(busyFrame(120, 2.8, 4.5).work < 1000 / 120, 'reserve the next step cost before using the render allowance');
console.log('PASS predictive 60/120/144Hz physics budgets, cheap-step catch-up and delayed-callback limits');

const jitterGame = new Game(canvas());
jitterGame.state = 'running';
jitterGame.last = 1000;
jitterGame.finishSlowdown = () => 1;
let jitterSteps = 0,
  jitterNow = 1000;
jitterGame.advance = () => {
  jitterSteps++;
  clock += 4;
};
jitterGame.render = () => {
  clock += 1;
};
for (let i = 0; i < 120; i++) {
  jitterNow += [16.4, 17][i % 2];
  clock = jitterNow;
  jitterGame.frame(jitterNow);
}
assert.ok(jitterSteps >= 119, 'sub-millisecond RAF jitter must not drop whole physics steps at normal speed');
assert.ok(jitterGame.accumulator < 2 / 60, 'jitter recovery remains bounded to one pending step');
console.log('PASS expensive normal-speed steps retain simulation time through sub-millisecond frame jitter');

async function actualRace(stage, hz, speed) {
  let seed = 123456;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  clock = 1000;
  // Compare fresh native worlds; retain only the process handlers that predate this module.
  const handlers = new Map(
    ['uncaughtException', 'unhandledRejection'].map((name) => [name, new Set(process.listeners(name))])
  );
  const game = new Game(canvas());
  await game.init(
    stage,
    Array.from({ length: 100 }, (_, i) => 'Ball ' + i)
  );
  try {
    let renders = 0,
      steps = 0,
      intermediate = 0;
    const render = game.render.bind(game),
      advance = game.advance.bind(game);
    game.render = () => {
      renders++;
      if (game.stepped && game.accumulator > 1e-8 && game.accumulator < 1 / 60 - 1e-8) intermediate++;
      render();
    };
    game.advance = () => {
      steps++;
      advance();
    };
    game.speed = speed;
    game.start([1, 1], false);
    game.frame(clock);
    // The tiny endpoint margin avoids asking binary floating point to land exactly on 1/60.
    for (let i = 1; i <= hz * 2; i++) {
      clock = 1000 + (i * 1000) / hz + (i === hz * 2 ? 1e-6 : 0);
      game.frame(clock);
    }
    assert.equal(renders, hz * 2 + 1, `${hz}Hz renders every running callback`);
    assert.equal(steps, 120 * speed, `${hz}Hz at ${speed}x keeps fixed 60Hz simulation time`);
    if (hz > 60 && speed === 1) assert.ok(intermediate >= 100, 'high refresh frames interpolate between physics steps');
    const state = game.balls.map((b) => ({ ...game.physics.getMarblePosition(b.id), rank: b.rank }));
    const beforePause = steps;
    game.pause();
    clock += 1000;
    game.frame(clock);
    assert.equal(steps, beforePause, 'pause never advances physics');
    game.pause();
    clock += 1000 / hz;
    game.frame(clock);
    assert.ok(steps - beforePause <= Math.ceil((60 * speed) / hz), 'resume must not catch up paused wall time');
    game.setVisible(false);
    clock += 1000;
    game.frame(clock);
    const beforeReturn = steps;
    game.setVisible(true);
    clock += 1000 / hz;
    game.frame(clock);
    assert.equal(steps, beforeReturn, 'returning from an editor does not catch up hidden wall time');
    return state;
  } finally {
    game.physics.dispose();
    for (const [name, existing] of handlers)
      for (const listener of process.listeners(name))
        if (!existing.has(listener)) process.removeListener(name, listener);
  }
}

function lanFrames(hz) {
  const view = new LanView(canvas());
  const balls = Array.from({ length: 100 }, (_, id) => ({ id, name: 'Ball ' + id, color: '#fff' }));
  view.setScene({
    type: 'scene',
    raceId: 'refresh',
    revision: 1,
    stage: { title: 'Refresh', goalY: 300, zoomY: 295, entities: [] },
    balls,
    entities: [],
    fixed: [],
    settings: { names: '100 balls', mapId: 0, order: 'asc', picks: 1 },
  });
  let packet = 0,
    draws = 0,
    moving = 0,
    previous;
  const draw = view.draw.bind(view);
  view.draw = (now) => {
    draws++;
    draw(now);
  };
  for (let i = 0; i <= hz * 2; i++) {
    clock = 1000 + (i * 1000) / hz;
    while (packet * 50 <= (i * 1000) / hz + 1e-6) {
      const elapsed = packet * 0.05;
      view.push({
        type: 'frame',
        raceId: 'refresh',
        revision: 1,
        seq: packet++,
        time: 0,
        elapsed,
        state: 'running',
        balls: balls.map((b) => [b.id, 10, 5 + elapsed * 2, 0, 0]),
        angles: [],
        winners: [],
        connected: 1,
        speed: 1,
        playbackRate: 1,
      });
    }
    view.frame(clock);
    if (i > hz / 2 && view.balls[0].y > previous) moving++;
    previous = view.balls[0].y;
  }
  assert.equal(draws, hz * 2 + 1, 'LAN also draws every running callback');
  assert.ok(moving >= hz, '20Hz LAN snapshots produce distinct intermediate high-refresh positions');
  return view.balls[0].y;
}

(async () => {
  try {
    for (const title of ['네온 분기점', '스위치백 익스프레스', '회전 차고지', '끝없는 나선', '쌍둥이 와류']) {
      const stage = stages.find((s) => s.title === title);
      for (const speed of [1, 4]) {
        const baseline = await actualRace(stage, 60, speed);
        for (const hz of [120, 144])
          assert.deepEqual(
            await actualRace(stage, hz, speed),
            baseline,
            `${title} ${speed}x: display rate must not change the 100 native marble poses`
          );
      }
      console.log(
        `PASS ${title}: 100 WASM marbles at 60/120/144Hz, 1/4x, identical poses and pause/visibility recovery`
      );
    }
    const at60 = lanFrames(60);
    for (const hz of [120, 144])
      assert.ok(Math.abs(lanFrames(hz) - at60) < 0.02, 'LAN playback speed is refresh independent');
    console.log('PASS 100-ball LAN renders and interpolates at 120/144Hz without increasing packet frequency');
  } finally {
    global.performance = realPerformance;
    Math.random = realRandom;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
