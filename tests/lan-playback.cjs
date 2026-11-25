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

// Render at 120 Hz while the 60 Hz physics server sends spring-race poses every 25 ms.
const springPlayback = new SnapshotPlayback();
const springDelays = [];
let previousPose = 0;
for (let tick = 0; tick <= 360; tick++) {
  const now = (tick * 1000) / 120;
  if (tick % 3 === 0) springPlayback.push(frame(Math.floor(tick / 2) / 60, tick + 1), now);
  const pose = springPlayback.sample(now).elapsed;
  if (tick > 120) {
    springDelays.push(now / 1000 - pose);
    assert.ok(pose > previousPose, 'no frozen render frames on a steady spring connection');
    assert.ok(pose <= Math.floor((tick - (tick % 3)) / 2) / 60, 'never predict ahead of a collision');
  }
  previousPose = pose;
}
assert.ok(quantile(springDelays, 0.95) < 0.06, 'steady spring playback stays within 60 ms of server time');

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
    'quadraticCurveTo',
    'closePath',
    'stroke',
    'setLineDash',
    'arc',
    'ellipse',
    'fill',
    'fillText',
    'strokeText',
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
const launcherView = new LanView(canvas);
launcherView.setScene({
  ...scene,
  balls: [0, 1, 2].map((id) => ({ id, name: String(id), color: '#fff' })),
});
const launcherBefore = {
  ...frame(3.8, 1),
  balls: [
    [0, 27.864, 20.179, 0, 0],
    [1, 27.688, 19.674, 0, 0],
    [2, 10, 8, 0, 0],
  ],
};
const launcherAfter = {
  ...frame(3.85, 2),
  launcherGuides: [0],
  balls: [
    [0, 27.874, 20.603, 0, 0],
    [1, 28.035, 20.129, 0, 0],
    [2, 16, 8, 0, 0],
  ],
};
launcherView.playback.sample = () => ({ before: launcherBefore, after: launcherAfter, t: 2 / 3, elapsed: 3.833 });
launcherView.draw(200);
const [guided, neighbour, outside] = launcherView.balls;
assert.equal(guided.y, launcherAfter.balls[0][2]);
assert.ok(
  Math.hypot(guided.x - neighbour.x, guided.y - neighbour.y) >= 0.5,
  'LAN playback must not overlap a loaded marble'
);
assert.equal(outside.x, 14, 'marbles outside the loading chamber still interpolate');
console.log('PASS actual LAN launcher playback keeps the guide clear and still interpolates distant marbles');
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
const peerSpring = { id: 'other-player', ownerName: '데일', x: 13, y: 20, direction: 0 };
for (const springs of [[peerSpring], [{ ...peerSpring, activatedAt: 0.2 }], []]) {
  metadataView.setSpringLayout({ type: 'spring-layout', raceId: scene.raceId, springs });
  assert.equal(
    metadataView.playback.sample(250)?.elapsed,
    timelineBeforePlacement,
    'placement, activation and removal all preserve the interpolation cursor'
  );
}
metadataView.push(frame(0.3, 3, 'running', 300));
assert.ok(
  metadataView.playback.sample(300).elapsed >= timelineBeforePlacement,
  'frames continue on the same timeline after personal spring changes'
);
metadataView.setScene({ ...structuredClone(scene), raceId: 'next-race', revision: 3 });
assert.equal(metadataView.playback.sample(300), undefined, 'a genuinely new race still clears old frames');
console.log('PASS spring placement metadata preserves playback while a new race resets it');

const strokeView = new LanView(canvas);
strokeView.setScene(scene);
strokeView.setSpringLayout({
  type: 'spring-layout',
  raceId: scene.raceId,
  springs: [{ ...peerSpring, x: 8, y: 5, activatedAt: 0 }],
});
strokeView.push(frame(0, 1, 'running', 0, 4));
strokeView.push(frame(0.8, 2, 'running', 200, 4));
const springLabels = [];
strokeView.cache.drawBall = () => true; // Observe only the spring owner labels.
ctx.strokeText = (label) => springLabels.push(label);
strokeView.draw(200);
assert.deepEqual(springLabels.splice(0), [peerSpring.ownerName], 'stroke is still visible on the buffered 4x timeline');
const replacement = { ...peerSpring, id: 'replacement', ownerName: '연두', x: 8, y: 5, placedAt: 0.8 };
strokeView.setSpringLayout({ type: 'spring-layout', raceId: scene.raceId, springs: [replacement] });
strokeView.draw(210);
assert.deepEqual(springLabels.splice(0), [peerSpring.ownerName], 'a newer layout must not cut off the return stroke');
strokeView.draw(400);
assert.deepEqual(springLabels, [replacement.ownerName], 'only the new owner is drawn after the position is reused');
ctx.strokeText = noop;
console.log('PASS a peer layout update at 4x preserves the return stroke until its displayed expiry');

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
bufferedSlide.setSpringLayout({
  type: 'spring-layout',
  raceId: slideScene.raceId,
  springs: [{ ...peerSpring, y: 40 }],
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
interactive.setZoom(2);
pointerHandlers.pointermove({ ...pointer, clientY: 20 + interactive.minimap.y + interactive.minimap.scale * 75 });
interactive.draw(1005);
assert.equal(interactive.manual.y, 75, 'placement minimap hover reaches the bottom of a tall map');
pointerHandlers.pointermove(springPointer(13, 75));
interactive.draw(1006);
assert.equal(interactive.camera.y, 75, 'leaving the minimap keeps the chosen camera instead of jumping to marbles');
const panStart = springPointer(13, 75, 'touch'),
  cameraBeforePan = { ...interactive.camera },
  panScale = interactive.springView.scale;
pointerHandlers.pointerdown(panStart);
pointerHandlers.pointermove({ ...panStart, clientX: panStart.clientX + 60, clientY: panStart.clientY + 90 });
pointerHandlers.pointerup({ ...panStart, clientX: panStart.clientX + 60, clientY: panStart.clientY + 90 });
interactive.draw(1007);
assert.equal(interactive.springPlacement.origin, undefined, 'dragging pans without placing a spring');
assert.ok(Math.abs(interactive.camera.y - (cameraBeforePan.y - 90 / panScale)) < 1e-10);
assert.equal(boosts.at(-1), false, 'placement panning never accelerates the shared race');
interactive.follow();
interactive.draw(1008);
assert.equal(
  interactive.camera.y,
  interactive.balls[0].y,
  'follow returns to the marbles without cancelling placement'
);
pointerHandlers.pointermove({ ...pointer, clientY: 20 + interactive.minimap.y + interactive.minimap.scale * 75 });
interactive.draw(1009);
const tapSpring = (point) => {
  pointerHandlers.pointerdown(point);
  pointerHandlers.pointerup(point);
};
tapSpring(springPointer(13, 75, 'touch'));
assert.deepEqual(interactive.springPlacement.origin, { x: 13, y: 75 });
pointerHandlers.pointerdown({ ...springPointer(16, 75, 'touch'), isPrimary: false });
assert.equal(placed.length, 0, 'a second finger cannot accidentally confirm the placement');
pointerHandlers.pointermove({ ...springPointer(1, 1, 'touch'), isPrimary: false });
assert.deepEqual(interactive.springPlacement.pointer, { x: 13, y: 73 }, 'a second finger cannot rotate the preview');
const overviewScale = interactive.springView.scale;
interactive.draw(1010);
assert.equal(interactive.springView.scale, overviewScale, 'choosing the origin keeps the user zoom and camera');
tapSpring(springPointer(16, 75, 'touch'));
assert.equal(placed.length, 1);
assert.deepEqual(placed[0], { x: 13, y: 75, direction: 0 }, 'two touch taps select position then direction');
assert.equal(interactive.springPlacement.active, true, 'submitting keeps the draft until the server accepts');
assert.deepEqual(interactive.springPlacement.origin, { x: 13, y: 75 });
assert.ok(interactive.manual, 'the camera stays on the selected location');
interactive.push({ ...frame(0.05, 2), personalSpring: { state: 'available' } });
assert.ok(interactive.springPlacement.active, 'rejected placement retains the draft for retry');
interactive.push({ ...frame(0.1, 3), personalSpring: { state: 'placed', id: 'mine' } });
assert.equal(interactive.springPlacement.active, false);
assert.equal(interactive.manual, null, 'acceptance resumes automatic tracking');
interactive.personalSpring = { state: 'available' };
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
interactive.setSpringLayout({ type: 'spring-layout', raceId: scene.raceId, springs: [peerSpring] });
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
};
const receiveScene = (value) => interactive.setScene(decodeScene(JSON.parse(JSON.stringify(encodeScene(value)))));
ctx.measureText = (text) => ({ width: text.length * 7 });
const drawSpringControls = () =>
  interactive.springControls.draw(ctx, interactive.entities, 0, 0, 1, 600, interactive.scene.stage);
const selectMapSpring = () => {
  drawSpringControls();
  assert.equal(interactive.springControls.select({ button: 0, pointerType: 'mouse', clientX: 23, clientY: 40 }), true);
};
const dispatchSpace = (target = { tagName: 'CANVAS' }, repeat = false) => {
  const event = {
    key: ' ',
    code: 'Space',
    repeat,
    target,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
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
  return event.defaultPrevented;
};
receiveScene(springScene);
interactive.state = 'running';
interactive.springConnected = true;
interactive.personalSpring = { state: 'placed', id: 'mine' };
const handle = { tagName: 'BUTTON', id: 'panel-toggle' };
const usesBeforeHandle = used.length;
assert.equal(dispatchSpace(handle), true, 'running Space on settings suppresses the native button click');
assert.equal(used.length, usesBeforeHandle + 1, 'the host fires the placed spring from settings focus');
assert.equal(dispatchSpace(handle, true), true);
assert.equal(used.length, usesBeforeHandle + 1, 'holding Space cannot send a second spring command');
interactive.personalSpring = { state: 'used' };
assert.equal(dispatchSpace(handle), true, 'an empty inventory cannot turn Space into a settings click');
interactive.state = 'paused';
assert.equal(dispatchSpace(handle), false, 'settings retains normal keyboard activation outside a running race');
interactive.state = 'running';
interactive.personalSpring = { state: 'placed', id: 'mine' };
for (const tagName of ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']) assert.equal(dispatchSpace({ tagName }), false);
assert.equal(used.length, usesBeforeHandle + 1);
const mapUses = [],
  personalUsesBefore = used.length;
interactive.onSpring = (index) => mapUses.push(index);
selectMapSpring();
assert.equal(dispatchSpace(handle), true);
assert.deepEqual(mapUses, [0]);
assert.equal(used.length, personalUsesBefore);
interactive.springControls.setStatuses([[0, 4900, false]]);
const selectedShape = interactive.entities[0].shape;
for (let revision = 2; revision <= 4; revision++) {
  receiveScene({ ...springScene, revision });
  assert.notEqual(interactive.entities[0].shape, selectedShape, 'wire decoding replaces shape references');
  interactive.setSpringLayout({
    type: 'spring-layout',
    raceId: springScene.raceId,
    springs: [{ ...peerSpring, x: 18, y: 25, activatedAt: 1 }],
  });
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
receiveRules({ data: JSON.stringify(encodeScene({ ...rulesUpdate, revision: 3 })) });
assert.equal(rulesUI.order.value, 'asc', 'unrelated placement updates do not overwrite a pending winner-rule edit');
assert.equal(rulesUI.preferredPicks, 1);
console.log(
  'PASS actual LAN client synchronizes changed winner rules and retains edits during unrelated scene updates'
);

// A spring snapshot must update the controls even inside the rankings' 200 ms interval.
let springUpdates = 0;
Object.assign(rulesUI, {
  frame: {
    ...frame(1, 10),
    raceId: rulesUI.scene.raceId,
    revision: rulesUI.scene.revision,
    personalSpring: { state: 'available' },
  },
  performance: { now: () => 125 },
  uiUpdate: 100,
  updatePersonalSpring: () => springUpdates++,
  updateRaceUI: () => assert.fail('spring-only updates must not rebuild rankings'),
});
rulesUI.view.push = () => {};
for (const [index, state] of ['placed', 'used'].entries()) {
  rulesUI.view.springPending = { state };
  const snapshot = { ...rulesUI.frame, seq: 11 + index, personalSpring: { state, id: 'mine' } };
  receiveRules({ data: JSON.stringify(snapshot) });
  assert.equal(rulesUI.view.springPending, undefined);
  assert.equal(springUpdates, index + 1);
}
console.log('PASS spring inventory changes immediately update buttons without refreshing the rankings');

// Confirmation returns to the race view. Interrupted gestures leave the placement view in place.
interactive.setScene({ ...scene, raceId: 'placement-edge-cases', revision: 1 });
interactive.state = 'ready';
interactive.springConnected = true;
interactive.personalSpring = { state: 'available' };
interactive.playback.push({ ...frame(0, 1, 'ready'), raceId: 'placement-edge-cases' }, 2000);
const edgePlacements = [];
interactive.onPlaceSpring = (value) => edgePlacements.push(value);
interactive.beginSpringPlacement();
interactive.draw(2000);
pointerHandlers.pointermove({ ...pointer, clientY: 20 + interactive.minimap.y + interactive.minimap.scale * 75 });
interactive.draw(2010);
const inspectedZoom = interactive.zoom;
tapSpring(springPointer(13, 75));
tapSpring(springPointer(13, 72));
interactive.push({
  ...frame(0, 2, 'ready'),
  raceId: 'placement-edge-cases',
  personalSpring: { state: 'placed', id: 'mine' },
});
interactive.draw(2020);
assert.equal(edgePlacements.length, 1);
assert.deepEqual(interactive.camera, interactive.readyCamera, 'confirmation in ready returns to the start view');
assert.equal(interactive.zoom, inspectedZoom, 'confirmation keeps the chosen zoom');

interactive.personalSpring = { state: 'available' };
interactive.beginSpringPlacement();
interactive.draw(2030);
pointerHandlers.pointermove({ ...pointer, clientY: 20 + interactive.minimap.y + interactive.minimap.scale * 75 });
interactive.draw(2031);
const interrupted = springPointer(13, 75);
pointerHandlers.pointerdown(interrupted);
windowHandlers.blur();
pointerHandlers.pointerup(interrupted);
assert.equal(interactive.springPlacement.origin, undefined, 'window blur cancels a pending tap');
pointerHandlers.pointerdown(interrupted);
pointerHandlers.pointerup({ ...interrupted, clientY: interrupted.clientY + 90 });
assert.equal(interactive.springPlacement.origin, undefined, 'a fast drag with no move event cannot place on release');
const cameraBeforeCancel = { ...interactive.camera };
pointerHandlers.pointerdown(interrupted);
pointerHandlers.pointercancel(interrupted);
interactive.draw(2040);
assert.deepEqual(interactive.camera, cameraBeforeCancel, 'touch cancellation keeps the inspected camera');
assert.equal(interactive.springPlacement.origin, undefined);
console.log('PASS confirmed placement camera/scale and interrupted or coalesced gesture safety');
pointerHandlers.pointerdown(interrupted);
interactive.setZoom(1.44);
pointerHandlers.pointerup(interrupted);
assert.equal(
  interactive.springPlacement.origin,
  undefined,
  'zooming during a pending tap cannot confirm stale coordinates'
);
pointerHandlers.pointerdown(interrupted);
pointerHandlers.pointerup({ ...interrupted, button: 2 });
assert.equal(interactive.springPlacement.origin, undefined, 'secondary-button release cannot confirm a primary tap');

let cameraCases = 0;
for (const [mapWidth, goalY, circular] of [
  [26, 60],
  [66, 176],
  [200, 300],
  [48, 128, true],
]) {
  for (const width of [360, 1000])
    for (const zoom of [0.35, 1.44, 3])
      for (const state of ['ready', 'running', 'paused']) {
        const cameraScene = {
          ...scene,
          raceId: 'camera-case-' + cameraCases,
          stage: {
            title: 'Camera bounds',
            width: mapWidth,
            goalY,
            entities: [],
            ...(circular ? { goalArea: { x: mapWidth / 2, y: goalY - 3, radius: 1 } } : {}),
          },
          settings: { ...scene.settings, names: 'A, B' },
          balls: [...scene.balls, { id: 1, name: 'B', color: '#ddd' }],
        };
        const rearY = goalY * 0.2;
        const cameraFrame = {
          ...frame(0, 1, state),
          raceId: cameraScene.raceId,
          balls: [
            [0, mapWidth / 2, goalY * 0.55, 0, 0],
            [1, mapWidth / 2, rearY, 0, 0],
          ],
        };
        interactive.setScene(cameraScene);
        interactive.width = width;
        interactive.height = 600;
        interactive.state = state;
        interactive.personalSpring = { state: 'available' };
        interactive.playback.push(cameraFrame, 3000);
        interactive.setZoom(zoom);
        interactive.beginSpringPlacement();
        interactive.draw(3000);
        const target = { x: mapWidth / 2, y: goalY * 0.8 };
        pointerHandlers.pointermove({
          ...pointer,
          clientX: 10 + interactive.minimap.x + target.x * interactive.minimap.scale,
          clientY: 20 + interactive.minimap.y + target.y * interactive.minimap.scale,
        });
        interactive.draw(3010);
        tapSpring(springPointer(target.x, target.y, 'touch'));
        interactive.draw(3020);
        const beforeUpdate = { ...interactive.camera };
        interactive.setSpringLayout({
          type: 'spring-layout',
          raceId: cameraScene.raceId,
          springs: [{ ...peerSpring, x: mapWidth / 2, y: goalY / 2 }],
        });
        interactive.setZoom(Math.min(3, zoom * 1.2));
        interactive.draw(3030);
        const zoomBeforeConfirm = interactive.zoom;
        assert.deepEqual(interactive.camera, beforeUpdate, 'peer placement keeps the chosen view during the draft');
        tapSpring(springPointer(target.x, target.y - 2, 'touch'));
        interactive.draw(3040);
        assert.ok(interactive.manual, 'submission preserves the inspected location');
        assert.equal(interactive.zoom, zoomBeforeConfirm);
        interactive.push({
          ...cameraFrame,
          seq: 2,
          revision: cameraScene.revision,
          personalSpring: { state: 'placed', id: 'own-spring' },
        });
        assert.equal(interactive.manual, null, 'server confirmation clears the placement view');
        for (let i = 1; i <= 100; i++) interactive.draw(3040 + (i * 1000) / 60);
        if (state === 'ready') assert.deepEqual(interactive.camera, interactive.readyCamera);
        else assert.ok(Math.abs(interactive.camera.y - rearY) < 0.001, 'the camera follows the last marble');
        const minimap = interactive.minimap;
        const inspect = {
          ...pointer,
          clientX: 10 + minimap.x + target.x * minimap.scale,
          clientY: 20 + minimap.y + target.y * minimap.scale,
        };
        pointerHandlers.pointermove(inspect);
        assert.ok(Math.abs(interactive.manual.y - target.y) < 1e-10, 'minimap navigation is available after placement');
        pointerHandlers.pointerleave(pointer);
        assert.equal(interactive.manual, null);
        cameraCases++;
      }
}
assert.equal(cameraCases, 72);
console.log('PASS 72 spring-placement camera cases across tall, wide, and circular maps');

interactive.setScene({ ...scene, raceId: 'stationary-wheel', revision: 1 });
interactive.width = 1000;
interactive.state = 'ready';
interactive.personalSpring = { state: 'available' };
interactive.playback.push({ ...frame(0, 1, 'ready'), raceId: 'stationary-wheel' }, 4000);
interactive.setZoom(1);
interactive.beginSpringPlacement();
interactive.draw(4000);
pointerHandlers.pointermove({ ...pointer, clientY: 20 + interactive.minimap.y + interactive.minimap.scale * 75 });
interactive.draw(4010);
tapSpring(springPointer(9, 77));
const stationaryCursor = springPointer(9.5, 77.5);
pointerHandlers.pointermove(stationaryCursor);
for (const deltaY of [-150, 150, -90, 90]) {
  pointerHandlers.wheel({ ...stationaryCursor, deltaY, deltaMode: 0, ctrlKey: false });
  interactive.draw(4020);
  const expectedPoint = interactive.springPoint(stationaryCursor),
    shownPoint = interactive.springPlacement.pointer;
  assert.ok(
    Math.hypot(shownPoint.x - expectedPoint.x, shownPoint.y - expectedPoint.y) < 1e-10,
    'wheel-only zoom keeps the direction preview under the stationary cursor'
  );
}
const previewPoint = interactive.springPlacement.pointer,
  previewOrigin = interactive.springPlacement.origin;
const previewDirection = Math.atan2(previewPoint.y - previewOrigin.y, previewPoint.x - previewOrigin.x);
tapSpring(stationaryCursor);
assert.ok(
  Math.abs(edgePlacements.at(-1).direction - previewDirection) < 1e-10,
  'stationary click installs the direction shown before clicking'
);
console.log('PASS stationary-cursor wheel zoom preview matches the final installed direction');

for (const primaryFirst of [true, false]) {
  const primary = { ...springPointer(9, 75, 'touch'), isPrimary: true, pointerId: 1 };
  const secondary = { ...primary, isPrimary: false, pointerId: 2, clientX: primary.clientX + 45 };
  const count = edgePlacements.length;
  interactive.setZoom(1);
  pointerHandlers.pointerdown(primary);
  pointerHandlers.pointerdown(secondary);
  pointerHandlers.pointermove({ ...secondary, clientX: secondary.clientX + 45 });
  assert.equal(interactive.zoom, 2);
  const [first, last] = primaryFirst ? [primary, secondary] : [secondary, primary];
  pointerHandlers.pointerup(first);
  pointerHandlers.lostpointercapture(first);
  pointerHandlers.pointerup(last);
  assert.equal(edgePlacements.length, count, 'pinch release cannot submit a spring');
  assert.equal(interactive.springPlacement.origin, previewOrigin);
}
console.log('PASS pinch zoom preserves the draft in either finger release order');

async function checkPlacementRetry() {
  const commandSource = clientSource.statements.find((node) => node.name?.getText(clientSource) === 'personalCommand');
  const errors = [];
  let attempts = 0;
  const submit = vm.runInNewContext(
    ts.transpileModule(commandSource.getText(clientSource) + '\npersonalCommand;', {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      view: interactive,
      updatePersonalSpring() {},
      message: (error) => error.message,
      toast: (error) => errors.push(error),
      async command() {
        if (++attempts === 1) throw new Error('overlap');
      },
    }
  );
  const origin = interactive.springPlacement.origin;
  const center = { ...interactive.manual };
  let response;
  interactive.onPlaceSpring = (placement) => {
    response = submit({ type: 'place-spring', ...placement });
  };
  tapSpring(stationaryCursor);
  await response;
  assert.deepEqual(errors, ['overlap']);
  assert.equal(interactive.springPending, undefined);
  assert.deepEqual(interactive.springPlacement.origin, origin);
  assert.deepEqual(interactive.manual, center);
  interactive.beginSpringPlacement();
  interactive.draw(4500);
  tapSpring(springPointer(13, 71));
  tapSpring(springPointer(13, 69));
  await response;
  assert.equal(attempts, 2);
  assert.equal(interactive.springPending.state, 'placed', 'ACK alone does not unlock a second placement');
  tapSpring(springPointer(13, 69));
  assert.equal(attempts, 2);
  console.log('PASS rejected placement preserves the camera and retries once from a new location');
}
checkPlacementRetry().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
