const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);

const calls = [], bitmaps = [];
const context = () => new Proxy({}, { get(target, key) {
  if (key in target) return target[key];
  if (key === 'measureText') return text => ({ width: text.length * parseFloat(target.font) });
  if (key === 'getTransform') return () => ({ a: 1, b: 0 });
  if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
  return (...args) => calls.push([key, ...args]);
} });
global.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; this.ctx = context(); bitmaps.push(this); }
  getContext() { return this.ctx; }
};
global.window = { addEventListener() {} };
global.devicePixelRatio = 1;
global.requestAnimationFrame = () => 1;
global.ResizeObserver = class { observe() {} };
const ctx = context(), canvas = { getContext: () => ctx, addEventListener() {}, getBoundingClientRect: () => ({ width: 1000, height: 600 }) };
const { BackgroundCache } = require('../src/background-cache.ts');
const { RenderCache } = require('../src/render-cache.ts');
const { drawEntities } = require('../src/draw.ts');
const { drawRoundhouseArt } = require('../src/roundhouse-art.ts');
const { drawOrbitalArt } = require('../src/orbital-art.ts');
const { orbitalLock } = require('../src/data/orbital-lock.ts');
const { drawMapOverlay } = require('../src/map-art.ts');
const { visibleArt } = require('../src/art-visibility.ts');
const { Game } = require('../src/game.ts');
const { LanView } = require('../src/lan/view.ts');

const backgrounds = new BackgroundCache(200, 100), stages = [{}, {}, {}];
let painted = 0;
const draw = stage => backgrounds.draw(ctx, stage, 'test', { x: 0, y: 0, width: 10, height: 10, density: 1 }, () => painted++);
draw(stages[0]); const first = bitmaps.at(-1);
draw(stages[1]); const second = bitmaps.at(-1);
draw(stages[0]); draw(stages[2]);
assert.equal(painted, 3, 'a recent map reuses its background');
assert.equal(first.width, 10, 'least recently used eviction preserves the active map');
assert.equal(second.width, 1, 'eviction releases the pixel backing store');
draw(stages[1]); assert.equal(painted, 4, 'evicted maps regenerate safely');
const capped = new BackgroundCache();
capped.draw(ctx, {}, 'large', { x: 0, y: -30, width: 200, height: 335, density: 36 }, () => {});
assert.ok(bitmaps.at(-1).width * bitmaps.at(-1).height <= 16 * 1024 * 1024, 'large custom backgrounds stay within the per-image budget');
capped.draw(ctx, {}, 'express', { x: 0, y: -30, width: 64, height: 183, density: 36 }, () => {});
assert.deepEqual([bitmaps.at(-1).width, bitmaps.at(-1).height], [2304, 6588], 'the normal express map retains its original resolution');
console.log('PASS shared background pixel budget, LRU eviction and normal-map quality');

const orbitalContext = context(); orbitalContext.getTransform = () => ({ a: 80, b: 0 });
const largeOrbital = { ...orbitalLock, width: 200, goalY: 300 };
const orbitalStart = bitmaps.length;
for (let frame = 0; frame < 5; frame++) {
  drawOrbitalArt(orbitalContext, largeOrbital, 1);
  drawOrbitalArt(orbitalContext, largeOrbital, 2);
  drawOrbitalArt(ctx, largeOrbital, 2);
}
assert.equal(bitmaps.length - orbitalStart, 3, 'both main orbital layers and the minimap coexist without per-frame eviction');
drawOrbitalArt(orbitalContext, orbitalLock, 1);
assert.deepEqual([bitmaps.at(-1).width, bitmaps.at(-1).height], [1632, 3024], 'normal orbital backgrounds retain their original resolution');
console.log('PASS maximum-size orbital layer working set and original normal-map resolution');

const ball = { id: 0, name: '한글 이름', color: '#fff', x: 0, y: 0 }, cache = new RenderCache();
let count = bitmaps.length;
for (let scale = 24; scale <= 48; scale += .25) cache.drawBall(ctx, ball, scale, 2);
assert.ok(bitmaps.length - count <= 5, '97 continuous zoom samples reuse marble and label buckets');
for (const scale of [24, 48, 60, 90]) {
  cache.drawBall(ctx, ball, scale, 2);
  const label = calls.at(-1), font = Math.min(17, Math.max(12, scale * .24));
  const rasterFont = parseFloat(label[1].ctx.font);
  const factor = label[4] / (label[1].width / 2) * scale;
  assert.ok(Math.abs(rasterFont * factor - font) < 1e-10, 'label CSS font size follows the original clamp exactly');
}
console.log('PASS continuous zoom cache reuse and unchanged 12–17px label sizing');

const zoomContext = context(), glowDraws = [];
for (const method of ['stroke', 'fill', 'fillRect', 'strokeRect', 'fillText']) {
  zoomContext[method] = () => glowDraws.push(zoomContext.shadowBlur);
}
const zoomEntities = [
  { type: 'polyline', points: [[0, 0], [4, 0]], rotation: 0 },
  { type: 'circle', radius: 1 },
  { type: 'box', width: 2, height: 1, rotation: 0 },
  { type: 'box', width: 2, height: 1, rotation: 0, spring: { direction: 0, distance: 1 } },
  { type: 'box', width: 2, height: 1, rotation: 0, boostSpeed: 20 },
].map(shape => ({ x: 0, y: 0, angle: 0, life: -1, shape }));
drawEntities(zoomContext, zoomEntities, 14, -1, true, undefined, true);
assert.ok(glowDraws.length > 0 && glowDraws.every(blur => blur === 0), 'zoomed-out walls and devices avoid live shadow blur');
const wideDrawCount = glowDraws.length;
glowDraws.length = 0;
drawEntities(zoomContext, zoomEntities, 40, -1, true, undefined, true);
assert.equal(glowDraws.length, wideDrawCount, 'zooming out retains the wall and device geometry');
assert.ok(glowDraws.some(blur => blur > 0), 'close views retain the original glow');
console.log('PASS distant-view glow reduction with unchanged geometry and close-view glow');

const orbitalEntities = orbitalLock.entities.map(e => ({ x: e.position.x, y: e.position.y, angle: 0, life: -1, shape: e.shape }));
const orbitalGeometry = JSON.stringify(orbitalLock);
const railStrokes = [];
const railContext = () => {
  const c = context(), saved = [];
  let path = [], outsideCore = false;
  c.save = () => saved.push(outsideCore);
  c.restore = () => { outsideCore = saved.pop(); };
  c.beginPath = () => { path = []; };
  for (const method of ['moveTo', 'lineTo', 'arc', 'rect']) c[method] = (...args) => path.push([method, ...args]);
  c.clip = rule => {
    if (rule === 'evenodd' && path.some(p => p[0] === 'arc' && p[1] === 32 && p[2] === 40 && p[3] === 8)) outsideCore = true;
  };
  c.stroke = () => {
    const tip = path.find(p => p[0] === 'moveTo' && (p[1] === 30 || p[1] === 34) && p[2] === 46.7);
    // Deck shadows may enter the core; the two wall strokes must not.
    if (tip && !path.some(p => p[0] === 'lineTo' && p[1] === 64 - tip[1] && p[2] === 46.7)) railStrokes.push(outsideCore);
  };
  return c;
};
for (const scale of [40, 2]) {
  for (const cached of [false, true]) {
    const start = railStrokes.length, originalCanvas = global.OffscreenCanvas;
    try {
      global.OffscreenCanvas = cached ? class {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return railContext(); }
      } : undefined;
      const railCtx = railContext(), stage = { ...orbitalLock };
      new RenderCache().drawMinimap(railCtx, stage, orbitalEntities, scale, 1);
      drawMapOverlay(railCtx, stage, orbitalEntities, scale, cached);
      assert.ok(railStrokes.length > start, 'exit walls remain visible outside the core');
      assert.ok(railStrokes.slice(start).every(Boolean), 'main view and minimap never draw exit wall tips inside the pass-through core');
    } finally { global.OffscreenCanvas = originalCanvas; }
  }
}
assert.equal(JSON.stringify(orbitalLock), orbitalGeometry, 'clipping scenery preserves the collision geometry and bridge entry');
console.log('PASS orbital exit wall clipping in cached and fallback views with unchanged physics geometry');

const roundhouse = { title: 'Test', width: 48, goalY: 100 };
calls.length = 0; drawRoundhouseArt(ctx, roundhouse);
assert.ok(!calls.some(call => call[0] === 'drawImage'), 'roundhouse scenery retains its original vector drawing');
assert.equal(calls.filter(call => call[0] === 'fillText').length, 8, 'roundhouse lettering remains sharp at the current zoom');
const entity = { x: 100, y: 100, angle: 0, life: -1, shape: { type: 'circle', radius: 1, color: '#fff' } };
const view = { left: 0, top: 0, right: 10, bottom: 10 }, artStage = { art: { style: 'crossway' } };
calls.length = 0; drawMapOverlay(ctx, artStage, [entity], 30, true, view);
assert.ok(!calls.some(call => call[0] === 'arc'), 'main-view offscreen devices are culled');
drawMapOverlay(ctx, artStage, [entity], 2);
assert.ok(calls.some(call => call[0] === 'arc'), 'minimap still draws every device');
assert.equal(visibleArt({ ...entity, x: 12, y: 5 }, view), true, 'decorative rims near the viewport remain visible');
assert.equal(visibleArt({ ...entity, x: 50, y: 5, angle: Math.PI, shape: { type: 'polyline', points: [[-45, 0], [45, 0]] } }, view), true,
  'a rotated long device crossing the viewport is retained');
console.log('PASS vector roundhouse art, overlay culling and full minimaps');

for (const type of [Game, LanView]) {
  const renderer = new type(canvas); renderer.state = 'ready';
  let draws = 0; renderer[type === Game ? 'render' : 'draw'] = () => draws++;
  for (let now = 0; now < 1000; now += 1000 / 60) renderer.frame(now);
  assert.ok(draws <= 10, type.name + ' limits static screens to 10fps');
  const before = draws;
  renderer.setZoom(1.2); renderer.frame(1001);
  assert.equal(draws, before + 1, 'zoom input immediately repaints');
  renderer.cameraMoving = true; renderer.frame(1002);
  assert.equal(draws, before + 2, 'camera convergence keeps full cadence');
  renderer.cameraMoving = false; renderer.recording = true; renderer.frame(1003);
  assert.equal(draws, before + 3, 'recording preserves full cadence');
  renderer.recording = false; renderer.winnerAt = 1000;
  if (type === Game) renderer.winners = [ball];
  renderer.frame(1004);
  assert.equal(draws, before + 4, 'celebration preserves full cadence');
}
const game = new Game(canvas); game.stage = { title: 'Test', goalY: 100, entities: [] };
let entityReads = 0; game.physics.getEntities = () => { entityReads++; return []; };
game.render(); assert.equal(entityReads, 1, 'spring status calculation reuses the rendered entity snapshot');
console.log('PASS idle cadence, immediate input, camera, recording, celebration and single entity read');

const scene = { raceId: 'r', revision: 1, stage: { title: 'Test', goalY: 100, entities: [] },
  entities: [{ ...entity, x: 10, y: 20 }], fixed: [false], balls: [{ id: 0, name: 'A', color: '#fff' }],
  settings: { order: 'asc', picks: 1 } };
const frame = { raceId: 'r', revision: 1, seq: 1, elapsed: 0, state: 'ready',
  balls: [[0, 10, 5, 0, 0]], angles: [0], positions: [[0, 12, 20]], winners: [] };
const lan = new LanView(canvas); lan.setScene(scene); lan.push(frame);
lan.draw(0); const entities = lan.entities, item = entities[0], positions = lan.positions.get(frame);
lan.draw(16);
assert.equal(lan.entities, entities); assert.equal(lan.entities[0], item);
assert.equal(lan.positions.get(frame), positions, 'position lookup is cached once per network frame');
lan.push({ ...frame, seq: 2, positions: undefined }); lan.draw(32);
assert.equal(item.x, 10, 'omitted translations return reusable entities to their scene origin');
assert.equal(scene.entities[0].x, 10, 'render interpolation never mutates the network scene');
console.log('PASS LAN entity reuse, per-frame lookup caching and translation reset');
