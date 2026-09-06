const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
const { Game } = require('../src/game.ts');

// Exercise the actual event listeners without a browser or a physics world.
const events = new Map();
const windowEvents = new Map();
global.window = { addEventListener: (type, handler) => windowEvents.set(type, handler) };
let capturedPointer;
global.requestAnimationFrame = () => 1;
global.ResizeObserver = class {
  observe() {}
};
const canvas = {
  setPointerCapture: (id) => {
    capturedPointer = id;
  },
  getContext: () => ({}),
  addEventListener: (type, handler) => events.set(type, handler),
  getBoundingClientRect: () => ({ left: 100, top: 50 }),
};
const hover = new Game(canvas);
hover.minimap = { x: 16, y: 26, w: 130, h: 500, scale: 5 };
const point = (clientX, clientY, pointerType = 'mouse') => ({ clientX, clientY, pointerType });
events.get('pointermove')(point(141, 176));
assert.deepEqual(hover.manual, { x: 5, y: 20 }, 'hover must work without clicking');
events.get('pointermove')(point(166, 226));
assert.deepEqual(hover.manual, { x: 10, y: 30 }, 'camera target follows mouse movement');
events.get('pointermove')(point(500, 226));
assert.equal(hover.manual, null, 'leaving minimap returns to marble tracking');
events.get('pointermove')(point(141, 176));
events.get('pointerleave')(point(141, 176));
assert.equal(hover.manual, null, 'leaving canvas also returns to marble tracking');
events.get('pointerdown')(point(141, 176, 'touch'));
events.get('pointerleave')(point(141, 176, 'touch'));
assert.deepEqual(hover.manual, { x: 5, y: 20 }, 'touch tap stays selected');
hover.follow();
assert.equal(hover.manual, null);
console.log('PASS minimap hover, movement, exit and touch fallback');

// Holding the primary mouse button doubles simulation steps, not the saved speed.
const down = (button = 0, pointerType = 'mouse') =>
  events.get('pointerdown')({ ...point(141, 176, pointerType), button, pointerId: 7 });
const savedRender = hover.render;
const savedAdvance = hover.advance;
let steps = 0;
hover.render = () => {};
hover.advance = () => steps++;
hover.stage = { goalY: 100 };
hover.balls = [{ y: 0 }];
const tick = () => {
  steps = 0;
  hover.last = 1000;
  hover.accumulator = 0;
  hover.frame(1033.5);
  return steps;
};
down();
assert.equal(hover.fastForward, false, 'ready screen must not arm acceleration');
hover.state = 'running';
for (const speed of [0.5, 1, 2, 4]) {
  hover.speed = speed;
  const normal = tick();
  down();
  assert.equal(capturedPointer, 7, 'capture receives release even outside canvas');
  assert.equal(tick(), normal * 2);
  assert.equal(hover.speed, speed, 'configured speed stays unchanged');
  events.get('pointerup')();
  assert.equal(tick(), normal);
}
down(2);
assert.equal(hover.fastForward, false, 'right button must not accelerate');
down(0, 'touch');
assert.equal(hover.fastForward, false, 'touch must not accelerate');
for (const release of ['pointercancel', 'lostpointercapture']) {
  down();
  events.get(release)();
  assert.equal(hover.fastForward, false, release);
}
down();
windowEvents.get('blur')();
assert.equal(hover.fastForward, false, 'switching windows clears acceleration');
down();
events.get('pointermove')({ ...point(141, 176), buttons: 2 });
assert.equal(hover.fastForward, false, 'left release while right remains held clears acceleration');
down();
hover.pause();
assert.equal(hover.fastForward, false);
hover.pause();
assert.equal(hover.fastForward, false, 'resume must not retain acceleration');
hover.render = savedRender;
hover.advance = savedAdvance;
hover.speed = 1;
hover.state = 'ready';
hover.balls = [];
console.log('PASS held mouse acceleration, release, cancel, blur and unchanged base speed');

// Zoom changes only the camera; it must not change minimap picking or physics state.
let reportedZoom = 0,
  prevented = 0;
hover.onZoomChange = (value) => (reportedZoom = value);
const wheel = (deltaY, deltaMode = 0, ctrlKey = false) => ({
  deltaY,
  deltaMode,
  ctrlKey,
  preventDefault: () => prevented++,
});
events.get('wheel')(wheel(-100));
assert.ok(hover.zoom > 1, 'scrolling up zooms in');
assert.equal(reportedZoom, hover.zoom);
events.get('wheel')(wheel(100));
assert.ok(Math.abs(hover.zoom - 1) < 1e-12, 'reverse wheel restores scale');
events.get('wheel')(wheel(-100, 0, true));
assert.equal(prevented, 2, 'Ctrl+wheel remains available for browser zoom');
hover.setZoom(100);
assert.equal(hover.zoom, 3);
hover.setZoom(0);
assert.equal(hover.zoom, 0.35);
hover.setZoom(NaN);
assert.equal(hover.zoom, 0.35);
hover.setZoom(1);
events.get('wheel')(wheel(-2, 1));
const lineZoom = hover.zoom;
hover.setZoom(1);
events.get('wheel')(wheel(-32));
assert.equal(hover.zoom, lineZoom, 'line and pixel wheel deltas use equivalent scale');
hover.setZoom(2);
events.get('pointermove')(point(166, 226));
assert.deepEqual(hover.manual, { x: 10, y: 30 }, 'zoom must not alter minimap coordinates');
const rectangles = [];
hover.ctx = new Proxy({}, { get: (_, key) => (key === 'strokeRect' ? (...args) => rectangles.push(args) : () => {}) });
hover.physics.getEntities = () => [];
hover.stage = { goalY: 100 };
for (const state of ['ready', 'running', 'paused', 'finished']) {
  hover.state = state;
  hover.setZoom(1);
  const normalScale = hover.viewScale();
  hover.renderMinimap();
  const normalViewport = rectangles.at(-2);
  hover.setZoom(2);
  assert.equal(hover.viewScale(), normalScale * 2);
  hover.renderMinimap();
  const zoomedViewport = rectangles.at(-2);
  assert.equal(zoomedViewport[2], normalViewport[2] / 2, 'minimap viewport width reflects zoom');
  assert.equal(zoomedViewport[3], normalViewport[3] / 2, 'minimap viewport height reflects zoom');
  assert.equal(hover.state, state, 'zoom does not change the race state');
}
hover.stage = { goalY: 186, width: 66 };
hover.renderMinimap();
assert.equal(hover.minimap.w / hover.minimap.scale, 66);
const mini = hover.minimap;
events.get('pointermove')(point(100 + mini.x + 60 * mini.scale, 50 + mini.y + 100 * mini.scale));
assert.ok(Math.abs(hover.manual.x - 60) < 1e-9, 'wide minimap reaches the rightmost pipe');
assert.ok(Math.abs(hover.manual.y - 100) < 1e-9);
console.log('PASS zoom, wide-map minimap bounds and picking, browser zoom and race state');

// Browser order during the panel transition: animation frame, layout/ResizeObserver, paint.
// Assigning either canvas dimension clears its bitmap, even when the value is unchanged.
let notifyResize,
  bitmapHasScene = false,
  bitmapWrites = 0;
const size = { left: 0, top: 0, width: 1000, height: 300 };
let pixelWidth = 1000,
  pixelHeight = 300;
const context = new Proxy(
  {},
  {
    get: (_, key) => () => {
      if (key === 'fill' || key === 'stroke') bitmapHasScene = true;
    },
  }
);
const resizingCanvas = {
  getContext: () => context,
  addEventListener() {},
  getBoundingClientRect: () => size,
  get width() {
    return pixelWidth;
  },
  set width(value) {
    pixelWidth = value;
    bitmapHasScene = false;
    bitmapWrites++;
  },
  get height() {
    return pixelHeight;
  },
  set height(value) {
    pixelHeight = value;
    bitmapHasScene = false;
    bitmapWrites++;
  },
};
global.ResizeObserver = class {
  constructor(callback) {
    notifyResize = callback;
  }
  observe() {}
};
global.devicePixelRatio = 1;
const resizing = new Game(resizingCanvas);
resizing.stage = { goalY: 84 };
resizing.balls = [{ id: 0, name: 'A', color: '#65efda', x: 12, y: 5, angle: 0, stuck: 0 }];
resizing.physics.getEntities = () => [];
resizing.physics.start = () => {};
notifyResize();
resizing.render();
assert.ok(bitmapHasScene, 'the initial scene is drawn');
resizing.start([1, 1], false);
for (const height of [320, 355.4, 380, 415, 490.25, 500]) {
  resizing.render(); // RAF draws before the browser delivers the next resize observation.
  size.height = height;
  notifyResize();
  assert.ok(bitmapHasScene, 'resizing after RAF must not expose an empty bitmap at paint');
  resizing.render();
  assert.equal(pixelHeight, Math.round(height));
  assert.ok(bitmapHasScene, 'the resized bitmap must be painted in the same render');
}
const writesBeforeRepeat = bitmapWrites;
for (let i = 0; i < 4; i++) {
  notifyResize();
  resizing.render();
}
assert.equal(bitmapWrites, writesBeforeRepeat, 'unchanged sizes must not reset the bitmap');
resizing.pause();
size.width = 800;
size.height = 360;
notifyResize();
assert.ok(bitmapHasScene, 'resizing while paused must also retain the scene');
resizing.render();
assert.equal(pixelWidth, 800);
assert.equal(pixelHeight, 360);
assert.equal(resizing.state, 'paused');
global.devicePixelRatio = 2;
resizing.render();
assert.equal(pixelWidth, 1600);
assert.equal(pixelHeight, 720);
assert.ok(bitmapHasScene, 'pixel density changes must resize and redraw together');
console.log('PASS start/panel resize paint ordering, unchanged sizes, pause and pixel density');

const nativeTimeout = global.setTimeout;
for (const range of [
  [1, 1],
  [2, 2],
  [1, 2],
  [3, 3],
  [2, 3],
]) {
  let tick = 0,
    finishCalls = 0,
    recordingStops = 0;
  const scheduled = [];
  const removed = [];
  global.setTimeout = (callback) => {
    scheduled.push(callback);
    return 1;
  };
  const race = Object.create(Game.prototype);
  Object.assign(race, {
    state: 'running',
    elapsed: 0,
    range,
    stage: { goalY: 10 },
    balls: ['A', 'B', 'C'].map((name, id) => ({ id, name, x: id, y: 0, angle: 0, stuck: 0 })),
    arrivals: [],
    winners: [],
    recording: true,
    recorder: { stop: () => recordingStops++ },
    physics: {
      step: () => tick++,
      getMarblePosition: (id) => ({ x: id, y: tick > id ? 11 : tick, angle: 0 }),
      removeMarble: (id) => removed.push(id),
    },
    onFinish: (winners) => {
      finishCalls++;
      assert.deepEqual(
        winners.map((b) => b.rank),
        Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i)
      );
    },
  });
  const announceAt = range[1] === 3 ? Math.max(1, range[0] - 1) : range[1];
  let celebrationStamp;
  for (let i = 1; i <= 3; i++) {
    race.advance();
    if (i === announceAt) {
      celebrationStamp = race.winnerAt;
      assert.equal(typeof celebrationStamp, 'number', 'celebration starts when every selected winner is known');
    }
    if (i > announceAt) assert.equal(race.winnerAt, celebrationStamp, 'celebration does not restart as others finish');
    assert.equal(race.arrivals.length, i);
    assert.equal(race.winners.length, i >= announceAt ? range[1] - range[0] + 1 : 0);
    if (i < 3 && range[1] === 3 && i >= announceAt) {
      assert.deepEqual(
        race.winners.map((b) => b.id),
        range[0] === 2 ? [1, 2] : [2]
      );
      assert.equal(race.balls[2].rank, undefined, 'last moving marble must not be marked as arrived');
      assert.ok(race.winners.includes(race.balls[2]), 'ranks update from the live winner without changing membership');
      assert.equal(race.winners.at(-1).id, race.balls[2].id);
      assert.deepEqual(
        removed,
        Array.from({ length: i }, (_, id) => id),
        'remaining winners stay in the physics world'
      );
    }
    if (i < 3) {
      assert.equal(race.state, 'running', 'winner selection must not stop the remaining marbles');
      assert.equal(finishCalls, 0);
      assert.equal(scheduled.length, 0, 'recording must continue after winner selection');
    }
  }
  assert.equal(race.state, 'finished');
  assert.equal(finishCalls, 1);
  assert.deepEqual(removed, [0, 1, 2]);
  assert.equal(scheduled.length, 1);
  assert.equal(recordingStops, 0);
  scheduled[0]();
  assert.equal(recordingStops, 1);
  assert.equal(race.recording, false);
}
global.setTimeout = nativeTimeout;
console.log('PASS selected remaining count triggers celebration, with live ranks and continued physics/recording');
