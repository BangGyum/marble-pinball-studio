const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file
  );
const { SnapshotPlayback } = require('../src/lan/playback.ts');
const { legacyElapsed } = require('./legacy-lan-playback.ts');
const frame = (elapsed, seq, state = 'running', time = elapsed * 1000, playbackRate = 1) => ({
  type: 'frame',
  raceId: 'race',
  revision: 1,
  seq,
  time,
  elapsed,
  state,
  balls: [[0, elapsed * 10, 5, elapsed * 2, 0]],
  angles: [elapsed * 3],
  winners: [],
  connected: 1,
  speed: 1,
  playbackRate,
});
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
function exercise(hz, clockRate = 1, playbackRate = 1) {
  const playback = new SnapshotPlayback(),
    packets = [];
  for (let wall = 0, seq = 1; wall < 20000; seq++) {
    wall += [50, 58, 65, 52][seq % 4];
    const elapsed = Math.floor((wall * clockRate) / (1000 / 60)) / 60;
    packets.push({
      now: wall + [4, 18, 3, 10][seq % 4] + 50000,
      frame: frame(elapsed, seq, 'running', wall + 100000, playbackRate),
    });
  }
  let next = 0,
    previous,
    previousOld,
    received = 0,
    frames = [];
  const speeds = [],
    oldSpeeds = [],
    delays = [];
  for (let now = 50000; now < 69000; now += 1000 / hz) {
    while (next < packets.length && packets[next].now <= now) {
      const packet = packets[next++];
      playback.push(packet.frame, packet.now);
      frames.push(packet.frame);
      if (frames.length > 8) frames.shift();
      received = packet.now;
    }
    const sample = playback.sample(now);
    if (!sample) continue;
    const old = legacyElapsed(frames, received, now);
    if (previous !== undefined && now > 53000) {
      speeds.push((sample.elapsed - previous) * hz);
      oldSpeeds.push((old - previousOld) * hz);
      delays.push(((now - 50000) / 1000) * clockRate - sample.elapsed);
      assert.ok(sample.elapsed >= previous - 1e-10, 'a new packet never moves playback backwards');
    }
    assert.ok(sample.t >= 0 && sample.t <= 1);
    assert.ok(sample.elapsed <= frames.at(-1).elapsed, 'never extrapolate through obstacles without server data');
    previous = sample.elapsed;
    previousOld = old;
  }
  assert.ok(
    quantile(speeds, 0.05) > clockRate - 0.025 * playbackRate &&
      quantile(speeds, 0.95) < clockRate + 0.025 * playbackRate,
    `${hz}Hz stable playback: ${quantile(speeds, 0.05)}..${quantile(speeds, 0.95)}`
  );
  assert.ok(quantile(delays, 0.95) / clockRate < 0.2, 'smoothing must not build up spectator wall-clock latency');
  if (clockRate === 1) {
    const oldSpread = quantile(oldSpeeds, 0.95) - quantile(oldSpeeds, 0.05);
    const spread = quantile(speeds, 0.95) - quantile(speeds, 0.05);
    assert.ok(oldSpread > 0.3, 'fixture reproduces the original speed oscillation');
    assert.ok(spread < oldSpread / 10, 'at least 90% less speed oscillation');
    console.log(
      `PASS ${hz}Hz jitter: old ${quantile(oldSpeeds, 0.05).toFixed(3)}–${quantile(oldSpeeds, 0.95).toFixed(3)}x, new ${quantile(speeds, 0.05).toFixed(3)}–${quantile(speeds, 0.95).toFixed(3)}x`
    );
  }
}
for (const hz of [30, 60, 120, 144]) exercise(hz);
exercise(60, 0.98);
for (const rate of [0.225, 0.45, 0.5, 2, 4, 8]) exercise(60, rate, rate);
console.log('PASS restored 0.5/2/4x speed, held 8x acceleration and finish slow motion');

const changing = new SnapshotPlayback(),
  changes = [1, 4, 0.45, 2, 8, 1],
  packets = [];
let elapsed = 0;
for (let wall = 0, seq = 1; wall <= changes.length * 3000; wall += 50, seq++) {
  if (wall) elapsed += 0.05 * changes[Math.min(changes.length - 1, Math.floor((wall - 1) / 3000))];
  const rate = changes[Math.min(changes.length - 1, Math.floor(wall / 3000))];
  packets.push({ now: wall + [4, 18, 3, 10][seq % 4], frame: frame(elapsed, seq, 'running', wall, rate) });
}
let nextPacket = 0,
  lastElapsed,
  frozen = 0,
  longestFreeze = 0;
for (let now = 0; now < changes.length * 3000; now += 1000 / 60) {
  while (nextPacket < packets.length && packets[nextPacket].now <= now) {
    const packet = packets[nextPacket++];
    changing.push(packet.frame, packet.now);
  }
  const sample = changing.sample(now);
  if (!sample) continue;
  if (now > 1000 && lastElapsed !== undefined) {
    assert.ok(sample.elapsed >= lastElapsed - 1e-10, 'speed changes never reverse playback');
    frozen = sample.elapsed === lastElapsed ? frozen + 1 : 0;
    longestFreeze = Math.max(longestFreeze, frozen);
  }
  lastElapsed = sample.elapsed;
}
assert.ok(
  longestFreeze <= 1,
  'changing host speed or entering finish slow motion must not stall buffered playback: ' + longestFreeze + ' frames'
);
console.log('PASS live speed transitions and finish slow motion without playback stalls');

const playback = new SnapshotPlayback();
playback.push(frame(0, 1, 'ready'), 0);
assert.equal(playback.sample(0).elapsed, 0);
assert.equal(playback.sample(500).elapsed, 0);
playback.push(frame(0, 2), 500);
for (let i = 1; i <= 20; i++) {
  playback.push(frame(i * 0.05, i + 2), 500 + i * 50);
  playback.sample(500 + i * 50);
}
playback.push(frame(1, 23, 'paused'), 1501);
assert.equal(playback.sample(1800).elapsed, 1, 'pause drains the buffer and stops at the authoritative position');
assert.equal(playback.sample(2300).elapsed, 1);
playback.push(frame(0.5, 22), 2301);
assert.equal(playback.sample(2310).elapsed, 1, 'out-of-order packets cannot rewind');
playback.push(frame(1, 24), 2400);
assert.equal(playback.sample(2400).elapsed, 1);
for (let i = 1; i <= 5; i++) {
  playback.push(frame(1 + i * 0.05, 24 + i), 2400 + i * 50);
  playback.sample(2400 + i * 50);
}
const beforeLoss = playback.sample(2650).elapsed;
assert.equal(playback.sample(2950).elapsed, 1.25, 'packet loss freezes at the last known position');
playback.push(frame(1.6, 31), 3000);
assert.ok(playback.sample(3000).elapsed >= beforeLoss, 'packet loss recovery never reverses playback');
playback.push(frame(8, 200), 9400);
assert.ok(playback.sample(9400).elapsed >= 7.8, 'returning from a suspended tab catches up without slow-motion replay');
playback.push(frame(8.1, 201, 'finished'), 9500);
assert.equal(playback.sample(9800).elapsed, 8.1, 'finish reaches the exact final sample');
playback.reset();
playback.push(frame(0, 1, 'ready'), 10000);
assert.equal(playback.sample(10000).elapsed, 0, 'new scene clears the previous timeline');
console.log(
  'PASS startup, 2% clock drift, pause/resume, duplicate times, stale packets, loss, background recovery, finish and reset'
);

// Verify that the actual canvas renderer uses the same timeline and wall-time camera smoothing.
const { LanView } = require('../src/lan/view.ts');
const { encodeScene, decodeScene } = require('../src/lan/protocol.ts');
global.devicePixelRatio = 1;
global.window = { addEventListener() {} };
global.requestAnimationFrame = () => 1;
global.ResizeObserver = class {
  observe() {}
};
const noop = () => {};
const ctx = Object.fromEntries(
  [
    'setTransform',
    'fillRect',
    'save',
    'restore',
    'translate',
    'rotate',
    'scale',
    'beginPath',
    'moveTo',
    'lineTo',
    'stroke',
    'setLineDash',
    'arc',
    'ellipse',
    'fill',
    'fillText',
    'rect',
    'clip',
    'strokeRect',
  ].map((key) => [key, noop])
);
ctx.createRadialGradient = () => ({ addColorStop: noop });
ctx.createLinearGradient = () => ({ addColorStop: noop });
const canvas = { getContext: () => ctx, addEventListener: noop };
const scene = {
  type: 'scene',
  raceId: 'race',
  revision: 1,
  stage: { title: 'Test', goalY: 100, entities: [] },
  settings: { names: 'A', mapId: 0, order: 'desc', picks: 1 },
  entities: [],
  fixed: [],
  balls: [{ id: 0, name: 'A', color: '#fff' }],
};
const movingView = new LanView(canvas);
movingView.setScene(scene);
movingView.playback.push(frame(0, 1), 0);
movingView.playback.push({ ...frame(0.2, 2), balls: [[0, 2, 5, 0.4, 1]], bridgeIds: [0] }, 200);
movingView.draw(200);
assert.ok(Math.abs(movingView.balls[0].x - 0.8) < 1e-10, 'renderer interpolates positions on simulation time');
assert.ok(Math.abs(movingView.balls[0].angle - 0.16) < 1e-10, 'rotation uses the same interpolation time');
assert.equal(movingView.balls[0].rank, undefined, 'arrival is not rendered ahead of the interpolated position');
assert.equal(movingView.balls[0].onBridge, false, 'bridge membership is not shown ahead of the interpolated entry');
movingView.draw(350);
assert.equal(movingView.balls[0].rank, 1);
assert.equal(movingView.balls[0].onBridge, true, 'authoritative bridge membership reaches the renderer');
movingView.playback.reset();
movingView.playback.push(frame(0.4, 3, 'paused'), 400);
movingView.draw(400);
assert.equal(movingView.balls[0].onBridge, false, 'omitted bridge state clears stale upper-floor membership');
function cameraAt(hz) {
  const view = new LanView(canvas);
  view.setScene(scene);
  view.focusedBallId = 0;
  view.playback.push(frame(1, 1, 'paused'), 1000);
  view.draw(1000);
  view.camera = { x: 0, y: 0 };
  for (let i = 1; i <= hz / 2; i++) view.draw(1000 + (i * 1000) / hz);
  assert.equal(view.balls[0].x, 10);
  assert.equal(view.balls[0].angle, 2);
  assert.equal(view.focusedBallId, 0);
  return view.camera.x;
}
const camera60 = cameraAt(60);
for (const hz of [30, 120, 144])
  assert.ok(Math.abs(cameraAt(hz) - camera60) < 1e-8, 'camera follow speed does not depend on refresh rate');
console.log('PASS actual LAN renderer interpolation, selected marble and refresh-independent camera');

const metadataView = new LanView(canvas);
metadataView.setScene(scene);
metadataView.push(frame(0, 1, 'running', 0));
metadataView.push(frame(0.2, 2, 'running', 200));
metadataView.playback.sample(200);
const timelineBeforePlacement = metadataView.playback.sample(250).elapsed;
metadataView.setScene({
  ...structuredClone(scene),
  revision: 2,
  placedSprings: [{ id: 'other-player', x: 13, y: 20, direction: 0 }],
});
const timelineAfterPlacement = metadataView.playback.sample(250);
assert.ok(timelineAfterPlacement, 'another player placing a spring cannot clear the visible race');
assert.equal(
  timelineAfterPlacement.elapsed,
  timelineBeforePlacement,
  'placement-only updates preserve the interpolation cursor'
);
metadataView.push({ ...frame(0.3, 3, 'running', 300), revision: 2 });
assert.ok(
  metadataView.playback.sample(300).elapsed >= timelineBeforePlacement,
  'new-revision frames continue on the same timeline'
);
metadataView.setScene({ ...structuredClone(scene), raceId: 'next-race', revision: 3 });
assert.equal(metadataView.playback.sample(300), undefined, 'a genuinely new race still clears old frames');
console.log('PASS spring placement metadata preserves playback while a new race resets it');

// Translations use the same buffered samples as marbles, including returning to the scene origin.
ctx.rotate = noop;
const slideShape = { type: 'box', width: 3, height: 0.3, rotation: 0, color: '#b579ff' };
const slideView = new LanView(canvas);
slideView.setScene({ ...scene, entities: [{ x: 10, y: 30, angle: 0, shape: slideShape, life: -1 }], fixed: [false] });
let drawnEntities;
slideView.renderMinimap = (entities) => {
  drawnEntities = entities;
};
slideView.playback.push({ ...frame(0, 1), positions: [[0, 12, 30]] }, 0);
slideView.playback.push({ ...frame(0.2, 2), positions: [[0, 16, 30]] }, 200);
slideView.draw(200);
assert.ok(Math.abs(drawnEntities[0].x - 13.6) < 1e-9, 'platforms interpolate on the same time as the marbles');
slideView.playback.push(frame(0.4, 3, 'paused'), 400);
slideView.draw(600);
assert.equal(drawnEntities[0].x, 10, 'omitted translation returns to scene position instead of leaving a stale offset');
slideView.draw(900);
assert.equal(drawnEntities[0].x, 10, 'paused platforms stay still');
console.log('PASS actual renderer sliding platform interpolation and pause');

const bufferedSlide = new LanView(canvas);
const slideScene = { ...scene, entities: [{ x: 10, y: 30, angle: 0, shape: slideShape, life: -1 }], fixed: [false] };
bufferedSlide.setScene(slideScene);
let renderedX;
bufferedSlide.renderMinimap = (entities) => {
  renderedX = entities[0].x;
};
bufferedSlide.playback.push({ ...frame(0, 1), positions: [[0, 12, 30]] }, 0);
bufferedSlide.playback.push({ ...frame(0.2, 2), positions: [[0, 16, 30]] }, 200);
bufferedSlide.draw(200);
const priorX = renderedX;
bufferedSlide.setScene({
  ...structuredClone(slideScene),
  revision: 2,
  placedSprings: [{ id: 'other', x: 13, y: 40, direction: 0 }],
});
bufferedSlide.draw(200);
assert.equal(renderedX, priorX, 'metadata updates preserve moving-device coordinates and buffered origins');
bufferedSlide.setScene({ ...slideScene, revision: 3, entities: [{ ...slideScene.entities[0], x: 11 }] });
assert.equal(bufferedSlide.playback.sample(200), undefined, 'changed physical origins still invalidate the old buffer');
console.log('PASS moving-device continuity across spring previews and invalidation on real geometry changes');

const pointerHandlers = {},
  windowHandlers = {},
  windowListeners = [],
  boosts = [],
  captures = [];
global.window = {
  addEventListener: (name, callback, options) => {
    windowHandlers[name] = callback;
    windowListeners.push({ name, callback, capture: options === true || !!options?.capture });
  },
};
const interactiveCanvas = {
  ...canvas,
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 1000, height: 600 }),
  addEventListener: (name, callback) => {
    pointerHandlers[name] = callback;
  },
  setPointerCapture: (id) => captures.push(id),
};
const interactive = new LanView(interactiveCanvas);
interactive.setScene(scene);
interactive.playback.push(frame(0, 1, 'ready'), 0);
interactive.draw(0);
interactive.onBoost = (active) => boosts.push(active);
const map = interactive.minimap;
const pointer = {
  clientX: 10 + map.x + map.w / 2,
  clientY: 20 + map.y + map.h / 2,
  pointerType: 'mouse',
  pointerId: 7,
  button: 0,
  buttons: 0,
};
pointerHandlers.pointermove(pointer);
assert.deepEqual(interactive.manual, { x: 13, y: 50 }, 'hovering the minimap restores original camera navigation');
pointerHandlers.pointerleave(pointer);
assert.equal(interactive.manual, null, 'mouse leave resumes automatic following');
pointerHandlers.pointerdown({ ...pointer, pointerType: 'touch' });
pointerHandlers.pointerleave({ ...pointer, pointerType: 'touch' });
assert.equal(interactive.manual.y, 50, 'touch selection remains until follow or another tap');
interactive.follow();
assert.equal(interactive.manual, null);
interactive.state = 'running';
boosts.length = 0;
pointerHandlers.pointerdown(pointer);
assert.deepEqual(boosts, [], 'viewer clicks never accelerate the shared race');
interactive.canControl = true;
pointerHandlers.pointerdown(pointer);
assert.deepEqual(boosts, [true]);
assert.deepEqual(captures, [7]);
for (const release of ['pointerup', 'lostpointercapture', 'pointercancel']) {
  pointerHandlers[release](pointer);
  assert.equal(boosts.at(-1), false, release + ' releases acceleration');
}
assert.equal(interactive.manual, null);
windowHandlers.blur();
assert.equal(boosts.at(-1), false, 'switching windows releases acceleration');
let prevented = false;
pointerHandlers.wheel({
  deltaY: -100,
  deltaMode: 0,
  ctrlKey: false,
  preventDefault() {
    prevented = true;
  },
});
assert.ok(prevented && interactive.zoom > 1);
interactive.setZoom(1);
assert.equal(interactive.zoom, 1);
pointerHandlers.wheel({
  deltaY: -100,
  ctrlKey: true,
  preventDefault() {
    throw new Error('browser zoom must remain available');
  },
});
assert.equal(interactive.zoom, 1);
console.log(
  'PASS restored minimap hover/touch/follow, host-only mouse acceleration, release/cancel/blur and wheel zoom'
);

interactive.springConnected = true;
interactive.personalSpring = { state: 'available' };
interactive.canControl = false;
const placed = [],
  used = [];
interactive.onPlaceSpring = (value) => placed.push(value);
interactive.onUseSpring = () => used.push(true);
interactive.beginSpringPlacement();
interactive.draw(1000);
const springPointer = (x, y, pointerType = 'mouse') => ({
  ...pointer,
  clientX: 10 + interactive.springView.x + x * interactive.springView.scale,
  clientY: 20 + interactive.springView.y + y * interactive.springView.scale,
  pointerType,
  preventDefault() {},
});
pointerHandlers.pointerdown(springPointer(13, 40, 'touch'));
assert.deepEqual(interactive.springPlacement.origin, { x: 13, y: 40 });
pointerHandlers.pointerdown({ ...springPointer(16, 40, 'touch'), isPrimary: false });
assert.equal(placed.length, 0, 'a second finger cannot accidentally confirm the placement');
pointerHandlers.pointermove({ ...springPointer(1, 1, 'touch'), isPrimary: false });
assert.deepEqual(interactive.springPlacement.pointer, { x: 13, y: 38 }, 'a second finger cannot rotate the preview');
const overviewScale = interactive.springView.scale;
interactive.draw(1010);
assert.ok(interactive.springView.scale > overviewScale, 'direction step magnifies the selected location on long maps');
pointerHandlers.pointerdown(springPointer(16, 40, 'touch'));
assert.equal(placed.length, 1);
assert.deepEqual(placed[0], { x: 13, y: 40, direction: 0 }, 'two touch taps select position then direction');
assert.equal(interactive.springPlacement.active, false);
interactive.beginSpringPlacement();
windowHandlers.keydown({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
assert.equal(interactive.springPlacement.active, false, 'Escape cancels without spending a spring');
interactive.personalSpring = { state: 'placed', id: 'mine' };
global.document = { querySelector: () => null };
const space = (repeat = false, tagName = 'CANVAS') =>
  windowHandlers.keydown({
    code: 'Space',
    repeat,
    target: { tagName },
    preventDefault() {},
    stopImmediatePropagation() {},
  });
space();
space(true);
space(false, 'TEXTAREA');
assert.equal(used.length, 1, 'Space fires once, ignores key repeat and typing');
interactive.springControls.selected = 0;
space();
assert.equal(used.length, 1, 'an explicitly selected map spring retains its existing Space control');
interactive.springControls.selected = -1;
interactive.state = 'paused';
space();
interactive.state = 'running';
interactive.springConnected = false;
space();
assert.equal(used.length, 1, 'pause and disconnect cannot fire');
console.log('PASS actual LAN two-tap touch placement, cancel, Space priority, repeat/typing/pause/offline guards');

interactive.springConnected = true;
interactive.personalSpring = { state: 'available' };
interactive.beginSpringPlacement();
interactive.springPlacement.choose({ x: 13, y: 40 });
interactive.setScene({
  ...structuredClone(scene),
  revision: 2,
  placedSprings: [{ id: 'another', x: 13, y: 20, direction: 0 }],
});
assert.deepEqual(
  interactive.springPlacement.origin,
  { x: 13, y: 40 },
  'another player placing a spring does not cancel an unfinished direction choice'
);
interactive.setScene({ ...structuredClone(scene), raceId: 'replacement-race', revision: 3 });
assert.equal(interactive.springPlacement.active, false, 'map/reset switches discard the old placement draft');
assert.equal(interactive.personalSpring, undefined, 'old inventory is cleared until the next authoritative frame');
interactive.push({
  ...frame(0, 10, 'ready'),
  raceId: 'replacement-race',
  revision: 3,
  personalSpring: { state: 'available' },
});
interactive.beginSpringPlacement();
interactive.push({
  ...frame(1, 11, 'finished'),
  raceId: 'replacement-race',
  revision: 3,
  personalSpring: { state: 'available' },
});
assert.equal(interactive.springPlacement.active, false, 'race finish cancels an unfinished placement');
assert.equal(placed.length, 1, 'cancelled drafts never submit an extra placement');
console.log('PASS other-player updates, mid-draft map/reset changes and finish without unwanted placement');

interactive.push({
  ...frame(0, 12, 'running'),
  raceId: 'replacement-race',
  revision: 3,
  personalSpring: { state: 'available' },
});
interactive.beginSpringPlacement();
interactive.springPlacement.choose({ x: 13, y: 40 });
interactive.push({
  ...frame(0.1, 13, 'running'),
  raceId: 'replacement-race',
  revision: 3,
  personalSpring: { state: 'placed', id: 'shared-session' },
});
assert.equal(
  interactive.springPlacement.active,
  false,
  'another tab in the same session committing placement cancels this draft'
);
assert.equal(placed.length, 1, 'same-session draft cancellation does not submit a second placement');
interactive.push({ ...frame(0.2, 99, 'running'), raceId: 'old-race', revision: 3, personalSpring: { state: 'used' } });
interactive.push({
  ...frame(0.2, 99, 'running'),
  raceId: 'replacement-race',
  revision: 2,
  personalSpring: { state: 'used' },
});
assert.deepEqual(
  interactive.personalSpring,
  { state: 'placed', id: 'shared-session' },
  'stale race/revision frames cannot overwrite current inventory'
);
console.log('PASS same-session competing drafts and stale inventory-frame rejection');

const mapSpringShape = {
  type: 'box',
  width: 1,
  height: 0.1,
  rotation: 0,
  spring: { distance: 1, direction: -Math.PI / 2 },
};
const springScene = {
  ...scene,
  raceId: 'selected-spring',
  stage: {
    ...scene.stage,
    entities: [
      {
        position: { x: 13, y: 20 },
        type: 'kinematic',
        shape: mapSpringShape,
        props: { density: 1, restitution: 0.8, angularVelocity: 0 },
      },
    ],
  },
  entities: [{ x: 13, y: 20, angle: 0, life: -1, shape: mapSpringShape }],
  fixed: [false],
  placedSprings: [],
};
const receiveScene = (value) => interactive.setScene(decodeScene(JSON.parse(JSON.stringify(encodeScene(value)))));
ctx.measureText = (text) => ({ width: text.length * 7 });
const drawSpringControls = () =>
  interactive.springControls.draw(ctx, interactive.entities, 0, 0, 1, 600, interactive.scene.stage);
const selectMapSpring = () => {
  drawSpringControls();
  assert.equal(interactive.springControls.select({ button: 0, pointerType: 'mouse', clientX: 23, clientY: 40 }), true);
};
const dispatchSpace = () => {
  const event = {
    key: ' ',
    code: 'Space',
    repeat: false,
    target: { tagName: 'CANVAS' },
    preventDefault() {},
    stopImmediatePropagation() {
      this.stopped = true;
    },
  };
  for (const listener of windowListeners
    .filter(({ name }) => name === 'keydown')
    .sort((a, b) => Number(b.capture) - Number(a.capture))) {
    listener.callback(event);
    if (event.stopped) break;
  }
};
receiveScene(springScene);
interactive.state = 'running';
interactive.springConnected = true;
interactive.personalSpring = { state: 'placed', id: 'mine' };
const mapUses = [],
  personalUsesBefore = used.length;
interactive.onSpring = (index) => mapUses.push(index);
selectMapSpring();
dispatchSpace();
assert.deepEqual(mapUses, [0]);
assert.equal(used.length, personalUsesBefore);
interactive.springControls.setStatuses([[0, 4900, false]]);
const selectedShape = interactive.entities[0].shape;
for (let revision = 2; revision <= 4; revision++) {
  receiveScene({
    ...springScene,
    revision,
    placedSprings: [{ id: 'another-player', x: 18, y: 25, direction: 0 }],
  });
  assert.notEqual(interactive.entities[0].shape, selectedShape, 'wire decoding replaces shape references');
  assert.equal(interactive.springControls.selected, 0, 'placement updates retain the selected map spring immediately');
  dispatchSpace();
  assert.equal(mapUses.length, 1, 'placement updates cannot clear the selected spring cooldown');
  assert.equal(used.length, personalUsesBefore, 'Space before the next draw cannot spend the personal spring');
  drawSpringControls();
  assert.equal(interactive.springControls.selected, 0, 'the next draw retains selection with the new shape reference');
}
interactive.springControls.setStatuses([[0, 0, true]]);
dispatchSpace();
assert.equal(mapUses.length, 1, 'the selected piston still waits for physical return');
interactive.springControls.setStatuses([[0, 0, false]]);
dispatchSpace();
assert.deepEqual(mapUses, [0, 0], 'Space continues activating the chosen map spring after placement updates');
assert.equal(used.length, personalUsesBefore, 'the one-use personal spring remains untouched');
receiveScene({ ...springScene, revision: 5, entities: [{ ...springScene.entities[0], x: 14 }] });
assert.equal(interactive.springControls.selected, -1, 'real device changes still invalidate the old selection');
receiveScene({ ...springScene, revision: 6 });
selectMapSpring();
receiveScene({ ...springScene, raceId: 'next-spring-race', revision: 7 });
assert.equal(interactive.springControls.selected, -1, 'a new race clears selection even with identical devices');
console.log(
  'PASS selected map spring, cooldown and Space target survive decoded placement updates before and after draw'
);

const clientSource = ts.createSourceFile(
  'client.ts',
  fs.readFileSync('src/lan/client.ts', 'utf8'),
  ts.ScriptTarget.ES2022
);
function findMessageHandler(node) {
  if (ts.isBinaryExpression(node) && node.left.getText(clientSource) === 'socket.onmessage') return node.right;
  return ts.forEachChild(node, findMessageHandler);
}
const clientHandler = findMessageHandler(clientSource);
assert.ok(clientHandler);
const rulesScene = {
  ...scene,
  settings: { ...scene.settings, names: 'A,B,C,D', order: 'asc' },
  balls: Array.from({ length: 4 }, (_, id) => ({ id, name: String(id), color: '#fff' })),
};
const rulesUI = vm.createContext({
  scene: rulesScene,
  identity: { role: 'viewer' },
  pendingPreparations: 0,
  inputTimer: undefined,
  decodeScene,
  view: { setScene() {} },
  dolphinPanel: { setStage() {} },
  validateDolphins: () => ({}),
  order: { value: 'asc' },
  preferredPicks: 1,
  updatePicks(count) {
    rulesUI.displayedPicks = Math.min(count, rulesUI.preferredPicks);
  },
});
const receiveRules = vm.runInContext(
  ts.transpileModule(`const receive = ${clientHandler.getText(clientSource)}; receive;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  rulesUI
);
const rulesUpdate = { ...rulesScene, revision: 2, settings: { ...rulesScene.settings, order: 'desc', picks: 3 } };
receiveRules({ data: JSON.stringify(encodeScene(rulesUpdate)) });
assert.equal(rulesUI.order.value, 'desc', 'all clients display winner-direction changes without a new race');
assert.equal(rulesUI.displayedPicks, 3, 'all clients display winner-count changes without a new race');
rulesUI.order.value = 'asc';
rulesUI.preferredPicks = 1;
receiveRules({ data: JSON.stringify(encodeScene({ ...rulesUpdate, revision: 3, placedSprings: [] })) });
assert.equal(rulesUI.order.value, 'asc', 'unrelated placement updates do not overwrite a pending winner-rule edit');
assert.equal(rulesUI.preferredPicks, 1);
console.log(
  'PASS actual LAN client synchronizes changed winner rules and retains edits during unrelated scene updates'
);
