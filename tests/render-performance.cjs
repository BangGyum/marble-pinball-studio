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

const calls = [],
  bitmaps = [];
const context = () =>
  new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'measureText') return (text) => ({ width: text.length * parseFloat(target.font) });
        if (key === 'getTransform') return () => ({ a: 1, b: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
        return (...args) => calls.push([key, ...args]);
      },
    }
  );
global.OffscreenCanvas = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ctx = context();
    bitmaps.push(this);
  }
  getContext() {
    return this.ctx;
  }
};
global.window = { addEventListener() {} };
global.devicePixelRatio = 1;
global.requestAnimationFrame = () => 1;
global.ResizeObserver = class {
  observe() {}
};
const ctx = context(),
  canvas = {
    getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect: () => ({ width: 1000, height: 600 }),
  };
const { BackgroundCache } = require('../src/background-cache.ts');
const { RenderCache } = require('../src/render-cache.ts');
const { drawEntities } = require('../src/draw.ts');
const { drawRoundhouseArt } = require('../src/roundhouse-art.ts');
const { drawOrbitalArt } = require('../src/orbital-art.ts');
const { orbitalLock } = require('../src/data/orbital-lock.ts');
const { fractureCanyon } = require('../src/data/fracture-canyon.ts');
const { drawMapOverlay } = require('../src/map-art.ts');
const { setSceneTheme } = require('../src/scene-theme.ts');
const { visibleArt } = require('../src/art-visibility.ts');
const { Game } = require('../src/game.ts');
const { LanView } = require('../src/lan/view.ts');

// A settled preparation screen must not compete with the entry overlay for paints.
{
  const listen = window.addEventListener;
  let loaded;
  window.addEventListener = (type, handler, capture) => {
    if (type === 'load' && capture) loaded = handler;
  };
  const game = new Game(canvas);
  window.addEventListener = listen;
  game.state = 'ready';
  let paints = 0;
  game.render = () => paints++;
  for (let i = 0; i < 240; i++) game.frame(1000 + (i * 1000) / 60);
  assert.equal(paints, 1, 'ready screen paints once, then stays idle without changes');
  game.setZoom(0.8);
  game.frame(5100);
  assert.equal(paints, 2, 'zoom still repaints the preparation screen');
  game.renderCache.warming = true;
  game.frame(5120);
  assert.equal(paints, 3, 'unfinished sprites still warm at frame cadence');
  game.renderCache.warming = false;
  game.dolphins = { enabled: true };
  game.frame(5140);
  assert.equal(paints, 4, 'enabled animal preview remains animated');
  game.dolphins.enabled = false;
  loaded();
  game.frame(5160);
  assert.equal(paints, 5, 'late image loads refresh an otherwise idle screen');
  console.log('PASS idle preparation avoids periodic paints while zoom, warmup and animal preview remain live');
}

const canyonMini = new RenderCache(),
  canyonEntities = fractureCanyon.entities.map((e) => ({
    x: e.position.x,
    y: e.position.y,
    angle: 0,
    shape: e.shape,
    life: -1,
  }));
canyonMini.drawMinimap(ctx, fractureCanyon, canyonEntities, 2, 1);
const canyonPaints = () => calls.filter((call) => call[0] === 'fillText' && call[1] === 'CANYON').length;
assert.equal(canyonPaints(), 1, 'the canyon minimap paints the same rock scenery as the main view');
canyonMini.drawMinimap(ctx, fractureCanyon, canyonEntities, 2, 1);
assert.equal(canyonPaints(), 1, 'the static canyon minimap scenery is cached');

const backgrounds = new BackgroundCache(200, 100),
  stages = [{}, {}, {}];
let painted = 0;
const draw = (stage) =>
  backgrounds.draw(ctx, stage, 'test', { x: 0, y: 0, width: 10, height: 10, density: 1 }, () => painted++);
draw(stages[0]);
const first = bitmaps.at(-1);
draw(stages[1]);
const second = bitmaps.at(-1);
draw(stages[0]);
draw(stages[2]);
assert.equal(painted, 3, 'a recent map reuses its background');
assert.equal(first.width, 10, 'least recently used eviction preserves the active map');
assert.equal(second.width, 1, 'eviction releases the pixel backing store');
draw(stages[1]);
assert.equal(painted, 4, 'evicted maps regenerate safely');
const capped = new BackgroundCache();
capped.draw(ctx, {}, 'large', { x: 0, y: -30, width: 200, height: 335, density: 36 }, () => {});
assert.ok(
  bitmaps.at(-1).width * bitmaps.at(-1).height <= 16 * 1024 * 1024,
  'large custom backgrounds stay within the per-image budget'
);
capped.draw(ctx, {}, 'express', { x: 0, y: -30, width: 64, height: 183, density: 36 }, () => {});
assert.deepEqual(
  [bitmaps.at(-1).width, bitmaps.at(-1).height],
  [2304, 6588],
  'the normal express map retains its original resolution'
);
console.log('PASS shared background pixel budget, LRU eviction and normal-map quality');

const orbitalContext = context();
orbitalContext.getTransform = () => ({ a: 80, b: 0 });
const largeOrbital = { ...orbitalLock, width: 200, goalY: 300 };
const orbitalStart = bitmaps.length;
for (let frame = 0; frame < 5; frame++) {
  drawOrbitalArt(orbitalContext, largeOrbital, 1);
  drawOrbitalArt(orbitalContext, largeOrbital, 2);
  drawOrbitalArt(ctx, largeOrbital, 2);
}
assert.equal(
  bitmaps.length - orbitalStart,
  3,
  'both main orbital layers and the minimap coexist without per-frame eviction'
);
drawOrbitalArt(orbitalContext, orbitalLock, 1);
assert.deepEqual(
  [bitmaps.at(-1).width, bitmaps.at(-1).height],
  [1632, 3024],
  'normal orbital backgrounds retain their original resolution'
);
console.log('PASS maximum-size orbital layer working set and original normal-map resolution');

const ball = { id: 0, name: '한글 이름', color: '#fff', x: 0, y: 0 },
  cache = new RenderCache();
const count = bitmaps.length;
for (let scale = 24; scale <= 48; scale += 0.25) cache.drawBall(ctx, ball, scale, 2);
assert.ok(bitmaps.length - count <= 5, '97 continuous zoom samples reuse marble and label buckets');
for (const scale of [24, 48, 60, 90]) {
  cache.drawBall(ctx, ball, scale, 2);
  const label = calls.at(-1),
    font = Math.min(17, Math.max(12, scale * 0.24));
  const rasterFont = parseFloat(label[1].ctx.font);
  const factor = (label[4] / (label[1].width / 2)) * scale;
  assert.ok(Math.abs(rasterFont * factor - font) < 1e-10, 'label CSS font size follows the original clamp exactly');
}
console.log('PASS continuous zoom cache reuse and unchanged 12–17px label sizing');

const zoomContext = context(),
  glowDraws = [];
for (const method of ['stroke', 'fill', 'fillRect', 'strokeRect', 'fillText']) {
  zoomContext[method] = () => glowDraws.push(zoomContext.shadowBlur);
}
const zoomEntities = [
  {
    type: 'polyline',
    points: [
      [0, 0],
      [4, 0],
    ],
    rotation: 0,
  },
  { type: 'circle', radius: 1 },
  { type: 'box', width: 2, height: 1, rotation: 0 },
  { type: 'box', width: 2, height: 1, rotation: 0, spring: { direction: 0, distance: 1 } },
  { type: 'box', width: 2, height: 1, rotation: 0, boostSpeed: 20 },
].map((shape) => ({ x: 0, y: 0, angle: 0, life: -1, shape }));
drawEntities(zoomContext, zoomEntities, 14, -1, true, undefined, true);
assert.ok(
  glowDraws.length > 0 && glowDraws.every((blur) => blur === 0),
  'zoomed-out walls and devices avoid live shadow blur'
);
const wideDrawCount = glowDraws.length;
glowDraws.length = 0;
drawEntities(zoomContext, zoomEntities, 40, -1, true, undefined, true);
assert.equal(glowDraws.length, wideDrawCount, 'zooming out retains the wall and device geometry');
assert.ok(
  glowDraws.some((blur) => blur > 0),
  'close views retain the original glow'
);
console.log('PASS distant-view glow reduction with unchanged geometry and close-view glow');

const orbitalEntities = orbitalLock.entities.map((e) => ({
  x: e.position.x,
  y: e.position.y,
  angle: 0,
  life: -1,
  shape: e.shape,
}));
const orbitalGeometry = JSON.stringify(orbitalLock);
const railStrokes = [];
const railContext = () => {
  const c = context(),
    saved = [];
  let path = [],
    outsideCore = false;
  c.save = () => saved.push(outsideCore);
  c.restore = () => {
    outsideCore = saved.pop();
  };
  c.beginPath = () => {
    path = [];
  };
  for (const method of ['moveTo', 'lineTo', 'arc', 'rect']) c[method] = (...args) => path.push([method, ...args]);
  c.clip = (rule) => {
    if (rule === 'evenodd' && path.some((p) => p[0] === 'arc' && p[1] === 32 && p[2] === 40 && p[3] === 8))
      outsideCore = true;
  };
  c.stroke = () => {
    const tip = path.find((p) => p[0] === 'moveTo' && (p[1] === 30 || p[1] === 34) && p[2] === 46.7);
    // Deck shadows may enter the core; the two wall strokes must not.
    if (tip && !path.some((p) => p[0] === 'lineTo' && p[1] === 64 - tip[1] && p[2] === 46.7))
      railStrokes.push(outsideCore);
  };
  return c;
};
for (const scale of [40, 2]) {
  for (const cached of [false, true]) {
    const start = railStrokes.length,
      originalCanvas = global.OffscreenCanvas;
    try {
      global.OffscreenCanvas = cached
        ? class {
            constructor(width, height) {
              this.width = width;
              this.height = height;
            }
            getContext() {
              return railContext();
            }
          }
        : undefined;
      const railCtx = railContext(),
        stage = { ...orbitalLock };
      new RenderCache().drawMinimap(railCtx, stage, orbitalEntities, scale, 1);
      drawMapOverlay(railCtx, stage, orbitalEntities, scale, cached);
      assert.ok(railStrokes.length > start, 'exit walls remain visible outside the core');
      assert.ok(
        railStrokes.slice(start).every(Boolean),
        'main view and minimap never draw exit wall tips inside the pass-through core'
      );
    } finally {
      global.OffscreenCanvas = originalCanvas;
    }
  }
}
assert.equal(
  JSON.stringify(orbitalLock),
  orbitalGeometry,
  'clipping scenery preserves the collision geometry and bridge entry'
);
console.log('PASS orbital exit wall clipping in cached and fallback views with unchanged physics geometry');

for (const scale of [2, 14, 40]) {
  const stage = { ...orbitalLock },
    main = context();
  let liveMasks = 0;
  main.clip = (rule) => {
    if (rule === 'evenodd') liveMasks++;
  };
  const first = bitmaps.length;
  drawMapOverlay(main, stage, orbitalEntities, scale);
  const warmed = bitmaps.length;
  for (let frame = 0; frame < 120; frame++) drawMapOverlay(main, stage, orbitalEntities, scale);
  assert.equal(liveMasks, 0, 'the original exit mask is cached instead of rasterized on the game canvas each frame');
  assert.equal(bitmaps.length, warmed, 'main and minimap exit textures stay warm without new bitmaps');
  assert.ok(
    bitmaps.slice(first).reduce((pixels, bitmap) => pixels + bitmap.width * bitmap.height, 0) < 3 * 1024 * 1024,
    'exit textures cover the outlet instead of allocating the entire map'
  );
  const movedGate = orbitalEntities.map((e) =>
    e.shape.collisionLayer === 2 && e.shape.type === 'polyline' && e.shape.solid ? { ...e, x: 32, y: 40 } : e
  );
  drawMapOverlay(main, stage, movedGate, scale);
  assert.equal(liveMasks, 1, 'an edited moving gate entering the core still receives the original mask');
}
console.log('PASS warm orbital exit masks, bounded outlet textures and clipping for edited moving gates');

for (const theme of ['dark', 'beige']) {
  setSceneTheme(theme);
  for (const dpr of [1, 1.75, 2])
    for (const initialScale of [1.8, 14, 31.8, 515 / 13, 100]) {
      const stage = { ...orbitalLock };
      const sample = (scale) => {
        const main = context(),
          mini = context();
        main.getTransform = () => ({ a: scale * dpr, b: 0 });
        mini.getTransform = () => ({ a: 2 * dpr, b: 0 });
        drawOrbitalArt(main, stage);
        drawMapOverlay(main, stage, orbitalEntities, scale);
        drawMapOverlay(mini, stage, orbitalEntities, 2);
      };
      sample(initialScale);
      const first = bitmaps.length;
      for (let frame = 1; frame <= 120; frame++) sample(initialScale * (1 + frame / 600));
      assert.ok(bitmaps.length - first <= 8, 'continuous zoom must reuse outlet textures across nearby scales');
      const warmed = bitmaps.length;
      for (let frame = 120; frame >= 0; frame--) sample(initialScale * (1 + frame / 600));
      assert.equal(bitmaps.length, warmed, 'reverse zoom must reuse the warmed main-view and minimap textures');
    }
}
setSceneTheme('dark');
const glowStage = { ...orbitalLock };
for (const scale of [31.999, 32]) {
  const main = context();
  main.getTransform = () => ({ a: scale * 1.75, b: 0 });
  drawMapOverlay(main, glowStage, orbitalEntities, scale);
  assert.equal(bitmaps.at(-1).ctx.shadowBlur, scale < 32 ? 0 : 7, 'cached walls retain the 32px glow threshold');
}
console.log('PASS continuous and reverse orbital zoom across glow thresholds, themes, DPI and minimap scales');

drawOrbitalArt(ctx, { ...orbitalLock, goalY: 20 }, 2);
assert.ok(
  Number.isFinite(bitmaps.at(-1).width) && Number.isFinite(bitmaps.at(-1).height) && bitmaps.at(-1).height > 0,
  'shortened editor maps retain valid outlet texture dimensions'
);

const roundhouse = { title: 'Test', width: 48, goalY: 100 };
calls.length = 0;
drawRoundhouseArt(ctx, roundhouse);
assert.ok(!calls.some((call) => call[0] === 'drawImage'), 'roundhouse scenery retains its original vector drawing');
assert.equal(
  calls.filter((call) => call[0] === 'fillText').length,
  8,
  'roundhouse lettering remains sharp at the current zoom'
);
const entity = { x: 100, y: 100, angle: 0, life: -1, shape: { type: 'circle', radius: 1, color: '#fff' } };
const view = { left: 0, top: 0, right: 10, bottom: 10 },
  artStage = { art: { style: 'crossway' } };
calls.length = 0;
drawMapOverlay(ctx, artStage, [entity], 30, true, view);
assert.ok(!calls.some((call) => call[0] === 'arc'), 'main-view offscreen devices are culled');
drawMapOverlay(ctx, artStage, [entity], 2);
assert.ok(
  calls.some((call) => call[0] === 'arc'),
  'minimap still draws every device'
);
assert.equal(visibleArt({ ...entity, x: 12, y: 5 }, view), true, 'decorative rims near the viewport remain visible');
assert.equal(
  visibleArt(
    {
      ...entity,
      x: 50,
      y: 5,
      angle: Math.PI,
      shape: {
        type: 'polyline',
        points: [
          [-45, 0],
          [45, 0],
        ],
      },
    },
    view
  ),
  true,
  'a rotated long device crossing the viewport is retained'
);
console.log('PASS vector roundhouse art, overlay culling and full minimaps');

for (const type of [Game, LanView]) {
  const renderer = new type(canvas);
  renderer.state = 'ready';
  let draws = 0;
  renderer[type === Game ? 'render' : 'draw'] = () => draws++;
  for (let now = 0; now < 1000; now += 1000 / 60) renderer.frame(now);
  assert.ok(draws <= 10, type.name + ' limits static screens to 10fps');
  const before = draws;
  renderer.setZoom(1.2);
  renderer.frame(1001);
  assert.equal(draws, before + 1, 'zoom input immediately repaints');
  renderer.cameraMoving = true;
  renderer.frame(1002);
  assert.equal(draws, before + 2, 'camera convergence keeps full cadence');
  renderer.cameraMoving = false;
  renderer.recording = true;
  renderer.frame(1003);
  assert.equal(draws, before + 3, 'recording preserves full cadence');
  renderer.recording = false;
  renderer.winnerAt = 1000;
  if (type === Game) renderer.winners = [ball];
  renderer.frame(1004);
  assert.equal(draws, before + 4, 'celebration preserves full cadence');
}
const game = new Game(canvas);
game.stage = { title: 'Test', goalY: 100, entities: [] };
let entityReads = 0;
game.physics.getEntities = () => {
  entityReads++;
  return [];
};
game.render();
assert.equal(entityReads, 1, 'spring status calculation reuses the rendered entity snapshot');
console.log('PASS idle cadence, immediate input, camera, recording, celebration and single entity read');

const scene = {
  raceId: 'r',
  revision: 1,
  stage: { title: 'Test', goalY: 100, entities: [] },
  entities: [{ ...entity, x: 10, y: 20 }],
  fixed: [false],
  balls: [{ id: 0, name: 'A', color: '#fff' }],
  settings: { order: 'asc', picks: 1 },
};
const frame = {
  raceId: 'r',
  revision: 1,
  seq: 1,
  elapsed: 0,
  state: 'ready',
  balls: [[0, 10, 5, 0, 0]],
  angles: [0],
  positions: [[0, 12, 20]],
  winners: [],
};
const lan = new LanView(canvas);
lan.setScene(scene);
lan.push(frame);
lan.draw(0);
const entities = lan.entities,
  item = entities[0],
  positions = lan.positions.get(frame);
lan.draw(16);
assert.equal(lan.entities, entities);
assert.equal(lan.entities[0], item);
assert.equal(lan.positions.get(frame), positions, 'position lookup is cached once per network frame');
lan.push({ ...frame, seq: 2, positions: undefined });
lan.draw(32);
assert.equal(item.x, 10, 'omitted translations return reusable entities to their scene origin');
assert.equal(scene.entities[0].x, 10, 'render interpolation never mutates the network scene');
console.log('PASS LAN entity reuse, per-frame lookup caching and translation reset');

const motion = { matches: false };
global.matchMedia = () => motion;
try {
  const motionGame = new Game(canvas);
  motionGame.stage = { title: 'Test', goalY: 100, entities: [] };
  motionGame.physics.getEntities = () => [];
  motionGame.winners = [ball];
  motionGame.winnerAt = performance.now() - 400;
  calls.length = 0;
  motionGame.render();
  assert.ok(
    calls.some((call) => call[0] === 'fillRect' && call[1] === -2),
    'game starts with confetti enabled'
  );
  motion.matches = true;
  calls.length = 0;
  motionGame.render();
  assert.ok(!calls.some((call) => call[0] === 'fillRect' && call[1] === -2), 'game reads live reduced-motion setting');

  motion.matches = false;
  const motionLan = new LanView(canvas);
  motionLan.setScene({ ...scene, entities: [], fixed: [] });
  motionLan.push({ ...frame, state: 'finished', balls: [[0, 10, 5, 0, 1]], positions: [], angles: [], winners: [0] });
  motionLan.draw(1000);
  calls.length = 0;
  motionLan.draw(1400);
  assert.ok(
    calls.some((call) => call[0] === 'fillRect' && call[1] === -2),
    'LAN starts with confetti enabled'
  );
  motion.matches = true;
  calls.length = 0;
  motionLan.draw(1416);
  assert.ok(!calls.some((call) => call[0] === 'fillRect' && call[1] === -2), 'LAN reads live reduced-motion setting');
} finally {
  delete global.matchMedia;
}
console.log('PASS game and LAN celebration follow live reduced-motion changes');

const { infiniteFunnel } = require('../src/data/infinite-funnel.ts');
const { drawFunnelArt, drawFunnelEntryCue } = require('../src/funnel-art.ts');
calls.length = 0;
drawFunnelEntryCue(ctx, infiniteFunnel, 0.225, 40);
assert.equal(
  calls.filter((call) => call[0] === 'arc' && call[1] === 32 && call[2] === 44).length,
  1,
  'the first bridge entry gets one small ring around the drain'
);
calls.length = 0;
drawFunnelEntryCue(ctx, infiniteFunnel, 0.45, 40);
assert.equal(calls.length, 0, 'the drain ring ends after 450ms');

const cueScene = { ...scene, raceId: 'funnel-cue', stage: { ...infiniteFunnel }, entities: [], fixed: [] };
const cueView = new LanView(canvas);
cueView.setScene(cueScene);
cueView.push({ ...frame, raceId: 'funnel-cue', bridgeIds: [] });
cueView.draw(1000);
assert.equal(cueView.drainCueDone, false, 'the drain stays quiet before the first bridge entry');
cueView.push({ ...frame, raceId: 'funnel-cue', seq: 2, bridgeIds: [0] });
cueView.draw(1400);
assert.equal(cueView.drainCueAt, 1400, 'LAN plays the cue on the first bridge entry');
cueView.draw(1550);
assert.equal(cueView.drainCueAt, 1400, 'later frames cannot restart the cue');
cueView.setScene({ ...cueScene, raceId: 'next-race' });
assert.equal(cueView.drainCueDone, false, 'a new race can show its own first entry');
console.log('PASS one-shot funnel drain cue, finite lifetime and LAN race reset');

const funnelStart = bitmaps.length;
for (const scale of [40, 2]) {
  const target = context();
  target.getTransform = () => ({ a: scale, b: 0 });
  for (const layer of [1, 2]) {
    drawFunnelArt(target, infiniteFunnel, layer);
    if (layer === 2) {
      const [, , x, y, width, height] = calls.at(-1),
        inlet = infiniteFunnel.exitBridge.entry;
      assert.ok(
        x <= inlet.x - inlet.width / 2 &&
          x + width >= inlet.x + inlet.width / 2 &&
          y <= inlet.y - inlet.height / 2 &&
          y + height >= infiniteFunnel.goalY,
        'the outlet bitmap includes the central inlet and the entire connected chute at both zoom levels'
      );
    }
  }
}
assert.equal(bitmaps.length - funnelStart, 4, 'spiral and outlet have separate main-view and minimap textures');
calls.length = 0;
for (let frame = 0; frame < 100; frame++)
  for (const scale of [40, 2]) {
    const target = context();
    target.getTransform = () => ({ a: scale, b: 0 });
    for (const layer of [1, 2]) drawFunnelArt(target, infiniteFunnel, layer);
  }
assert.equal(bitmaps.length - funnelStart, 4, 'zoomed-out funnel does not allocate scenery every frame');
assert.ok(!calls.some((call) => call[0] === 'lineTo'), 'the long spiral is not rebuilt in warm frames');
assert.ok(
  bitmaps.slice(funnelStart).reduce((sum, image) => sum + image.width * image.height, 0) < 6 * 1024 * 1024,
  'both funnel layers and their minimaps stay below a 6MP combined footprint'
);
console.log('PASS funnel cached geometry, distant-view reuse and bounded texture footprint');

const groundOnlyFunnel = {
  ...infiniteFunnel,
  exitBridge: undefined,
  entities: infiniteFunnel.entities.filter((e) => e.shape.collisionLayer !== 2),
};
drawFunnelArt(context(), groundOnlyFunnel, 1);
let upperArc,
  solidUpperArc = 0;
const drainContext = context();
drainContext.beginPath = () => {
  upperArc = undefined;
};
drainContext.arc = (...args) => {
  upperArc = args;
};
drainContext.stroke = () => {
  if (upperArc?.[2] === 2.6 && drainContext.lineWidth >= 0.2) solidUpperArc++;
};
drawFunnelArt(drainContext, infiniteFunnel, 2, false);
assert.equal(solidUpperArc, 0, 'ground marbles never cross a solid-looking upper drain rail');
console.log('PASS saved ground-only funnel art and no false wall across the drain entrance');

const { twinFunnel } = require('../src/data/twin-funnel.ts');
const { drawTwinFunnelArt } = require('../src/twin-funnel-art.ts');
const twinStart = bitmaps.length;
for (const scale of [40, 2]) {
  const target = context();
  target.getTransform = () => ({ a: scale, b: 0 });
  for (const layer of [1, 2]) drawTwinFunnelArt(target, twinFunnel, layer);
}
assert.equal(bitmaps.length - twinStart, 4);
calls.length = 0;
for (let frame = 0; frame < 100; frame++)
  for (const scale of [40, 2]) {
    const target = context();
    target.getTransform = () => ({ a: scale, b: 0 });
    for (const layer of [1, 2]) drawTwinFunnelArt(target, twinFunnel, layer);
  }
assert.equal(bitmaps.length - twinStart, 4, 'distant twin funnels reuse all four textures');
assert.ok(!calls.some((call) => call[0] === 'lineTo'), 'neither spiral is rebuilt in warm frames');
assert.ok(bitmaps.slice(twinStart).reduce((sum, image) => sum + image.width * image.height, 0) < 9 * 1024 * 1024);
const { bridgeBallOpacity } = require('../src/map-art.ts');
assert.ok(
  bridgeBallOpacity(twinFunnel, { x: 40, y: 54 }) < 0.3,
  'ground marbles under the transfer remain faintly visible'
);
assert.equal(bridgeBallOpacity(twinFunnel, { x: 40, y: 54, onBridge: true }), 1);
console.log('PASS twin funnel cache reuse, bounded textures and transfer occlusion');

assert.equal(
  bridgeBallOpacity(twinFunnel, { x: 54, y: 67 }),
  1,
  'a marble returned to the lower floor is fully visible beyond the transfer end'
);
assert.ok(
  bridgeBallOpacity(twinFunnel, { x: 54, y: 66.5 }) < 0.3,
  'the part of the elevated deck before the return still occludes ground marbles'
);
calls.length = 0;
drawTwinFunnelArt(context(), twinFunnel, 2, false);
const returnCutout = calls.find((call) => call[0] === 'rect' && Math.abs(call[2] - 66.6) < 1e-9);
assert.ok(
  returnCutout &&
    returnCutout[1] < 51.4 &&
    returnCutout[1] + returnCutout[3] > 56.6 &&
    returnCutout[2] + returnCutout[4] > 69,
  'both protruding rail ends and the deck are clipped at the lower-floor return'
);
assert.ok(calls.some((call) => call[0] === 'clip' && call[1] === 'evenodd'));
console.log('PASS transfer return hides the protruding deck and rails without fading released marbles');

const originalOffscreen = global.OffscreenCanvas;
for (const stage of [infiniteFunnel, twinFunnel]) {
  const geometry = JSON.stringify(stage);
  const entities = stage.entities.map((e) => ({
    x: e.position.x,
    y: e.position.y,
    angle: 0,
    life: -1,
    shape: e.shape,
  }));
  const groundRails = stage.entities.filter((e) => e.shape.collisionLayer !== 2).map((e) => e.shape.points);
  for (const theme of ['dark', 'beige'])
    for (const width of [75, 125])
      for (const cached of [false, true]) {
        const strokes = [];
        const minimapContext = () => {
          const target = context();
          let path = [];
          target.beginPath = () => {
            path = [];
          };
          target.moveTo = (...point) => {
            path.push(point);
          };
          target.lineTo = (...point) => {
            path.push(point);
          };
          target.stroke = () => strokes.push(path.slice());
          return target;
        };
        try {
          setSceneTheme(theme);
          global.OffscreenCanvas = cached
            ? class extends originalOffscreen {
                constructor(w, h) {
                  super(w, h);
                  this.ctx = minimapContext();
                }
              }
            : undefined;
          const target = minimapContext(),
            cache = new RenderCache(),
            scale = width / stage.width,
            dpr = width === 75 ? 1 : 2;
          const before = bitmaps.length;
          cache.drawMinimap(target, stage, entities, scale, dpr);
          for (const points of groundRails)
            assert.ok(
              strokes.some((path) => JSON.stringify(path) === JSON.stringify(points)),
              `${stage.title}: every hidden spiral rail is visible in the ${theme} ${width}px ${cached ? 'cached' : 'fallback'} minimap`
            );
          if (cached) {
            assert.equal(bitmaps.length, before + 1, 'ground art goes directly into the existing minimap bitmap');
            assert.deepEqual(
              [bitmaps.at(-1).width, bitmaps.at(-1).height],
              [width * dpr, Math.ceil(stage.goalY * scale * dpr)],
              'desktop/mobile DPR raster sizes stay bounded'
            );
            const paints = strokes.length;
            for (let frame = 0; frame < 100; frame++) cache.drawMinimap(target, stage, entities, scale, dpr);
            assert.equal(strokes.length, paints, 'warm minimaps do not rebuild the spiral paths');
            assert.equal(bitmaps.length, before + 1, 'warm minimaps allocate no additional textures');
          }
        } finally {
          global.OffscreenCanvas = originalOffscreen;
          setSceneTheme('dark');
        }
      }
  for (const Type of [Game, LanView]) {
    const renderer = new Type(canvas);
    if (Type === Game) renderer.stage = stage;
    else
      renderer.setScene({
        raceId: 'minimap',
        revision: 1,
        stage,
        entities,
        fixed: entities.map(() => true),
        balls: [],
        settings: { order: 'asc', picks: 1 },
      });
    calls.length = 0;
    if (Type === Game) renderer.renderMinimap(entities);
    else renderer.renderMinimap(entities, 0, { x: 32, y: 44 });
    const spiralPoint = groundRails[0][30];
    assert.ok(
      calls.some((call) => call[0] === 'lineTo' && call[1] === spiralPoint[0] && call[2] === spiralPoint[1]),
      `${Type.name} draws the spiral through its actual minimap entry point`
    );
  }
  assert.equal(JSON.stringify(stage), geometry, 'minimap art never changes collision geometry');
}
console.log(
  'PASS both funnel minimaps show every rail in desktop/mobile themes, cache warm frames and Game/LAN entry points'
);

// Simulate costly browser bitmap allocation on the first 100-marble paint.
{
  const originalPerformance = global.performance,
    originalCanvas = global.OffscreenCanvas;
  let clock = 1000;
  global.performance = { now: () => clock };
  global.OffscreenCanvas = class extends originalCanvas {
    constructor(w, h) {
      super(w, h);
      clock += 0.6;
    }
  };
  try {
    const balls = Array.from({ length: 100 }, (_, id) => ({
      id,
      name: String(id),
      color: '#fff',
      x: 12,
      y: 4,
      angle: 0,
      stuck: 0,
    }));
    for (const type of [Game, LanView]) {
      const renderer = new type(canvas),
        stage = { title: 'Cold entry', goalY: 100, entities: [] };
      if (type === Game) {
        renderer.stage = stage;
        renderer.physics.getEntities = () => [];
        renderer.balls = balls;
        renderer.advance = () => assert.fail('warming a ready screen never advances physics');
      } else {
        renderer.setScene({ ...scene, stage, entities: [], fixed: [], balls });
        renderer.push({ ...frame, positions: [], balls: balls.map((b) => [b.id, b.x, b.y, 0, 0]), angles: [] });
      }
      const method = type === Game ? 'render' : 'draw',
        cache = type === Game ? renderer.renderCache : renderer.cache;
      const draw = renderer[method].bind(renderer);
      let renders = 0;
      renderer[method] = () => {
        renders++;
        draw(clock);
      };
      const before = bitmaps.length;
      renderer[method]();
      assert.ok(
        bitmaps.length - before <= 9,
        type.name + ': the first paint must not allocate all 200 marble/label bitmaps at once'
      );
      assert.equal(cache.warming, true);
      for (let i = 0; i < 100 && cache.warming; i++) {
        clock += 1000 / 60;
        renderer.frame(clock);
      }
      assert.equal(cache.warming, false, 'all visible sprites eventually finish warming');
      assert.ok(renders > 15, 'pending cache work keeps the ready screen at full cadence');
      const warm = bitmaps.length;
      for (let i = 0; i < 20; i++) {
        clock += 1000 / 60;
        renderer.frame(clock);
      }
      assert.equal(bitmaps.length, warm, 'warm frames reuse the finished bitmaps');
      assert.equal(renderer.state, 'ready');
    }
    const cache = new RenderCache(),
      ball = { ...balls[0] };
    cache.beginFrame();
    assert.equal(cache.drawBall(ctx, ball, 40, 1), true);
    clock += 3;
    assert.equal(cache.drawBall(ctx, ball, 40, 1), true, 'finished bitmaps remain usable after the budget expires');
    ball.name = 'Changed label';
    const before = calls.length,
      allocated = bitmaps.length;
    assert.equal(cache.drawBall(ctx, ball, 40, 1), false);
    assert.equal(bitmaps.length, allocated, 'label invalidation also respects the budget');
    assert.equal(calls.length, before, 'fallback is selected before painting a partial marble');
    cache.beginFrame();
    assert.equal(cache.drawBall(ctx, ball, 40, 1), true);
    global.OffscreenCanvas = undefined;
    cache.beginFrame();
    assert.equal(cache.drawBall(ctx, ball, 40, 1), false);
    assert.equal(cache.warming, false, 'vector-only browsers never schedule bitmap warmup');
  } finally {
    global.performance = originalPerformance;
    global.OffscreenCanvas = originalCanvas;
  }
  console.log(
    'PASS bounded cold-entry bitmap work, full warmup cadence, unchanged ready physics and stable warm caches'
  );
}
