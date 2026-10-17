const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const { setSceneTheme, sceneColor } = require('../src/scene-theme.ts');
const { stages } = require('../src/data/maps.ts');
const { drawMapArt, drawMapOverlay } = require('../src/map-art.ts');
const { drawEntities } = require('../src/draw.ts');
const { drawWind } = require('../src/wind-render.ts');
const { BackgroundCache } = require('../src/background-cache.ts');
const { RenderCache } = require('../src/render-cache.ts');

function context() {
  const paths = [], colors = [], state = {};
  return new Proxy({ paths, colors }, {
    set(_, key, value) { state[key] = value; if (['fillStyle', 'strokeStyle', 'shadowColor'].includes(key) && typeof value === 'string') colors.push(value); return true; },
    get(target, key) {
      if (key in target) return target[key];
      if (key in state) return state[key];
      if (key === 'getTransform') return () => ({ a: 24, b: 0 });
      if (key === 'measureText') return text => ({ width: text.length * 12 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => {
        paths.push([key, ...args]); return { addColorStop: (_, value) => colors.push(value) };
      };
      return (...args) => paths.push([key, ...args]);
    },
  });
}

const before = JSON.stringify(stages);
function paint(stage, theme) {
  setSceneTheme(theme);
  const ctx = context(), entities = stage.entities.map(e => ({ x: e.position.x, y: e.position.y, angle: 0, life: -1, shape: e.shape }));
  drawMapArt(ctx, stage, 24, false);
  drawEntities(ctx, stage.exitBridge ? entities.filter(e => e.shape.collisionLayer !== 2) : entities, 24, -1, true, undefined, !!stage.art, stage.art?.style === 'reversal-ladder');
  drawWind(ctx, stage.windZones ?? [], 1, 24);
  drawMapOverlay(ctx, stage, entities, 24, false);
  return ctx;
}
for (const stage of stages) {
  const dark = paint(stage, 'dark'), beige = paint(stage, 'beige'), restored = paint(stage, 'dark');
  assert.deepEqual(beige.paths, dark.paths, stage.title + ': theme preserves every drawing path');
  assert.deepEqual(restored.colors, dark.colors, stage.title + ': switching back restores exact colors');
  assert.notDeepEqual(beige.colors, dark.colors, stage.title + ': scenery and devices change color');
  assert.ok(beige.colors.every(color => /^#[\da-f]{3,8}$/i.test(color)), stage.title + ': valid canvas colors');
  assert.ok(!beige.colors.some(color => {
    if (color.length < 7) return false;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    return b - r > 30 || g - r > 45;
  }), stage.title + ': no cyan or violet neon paints remain');
}
assert.equal(JSON.stringify(stages), before, 'theme changes never mutate saved colors or physics definitions');
setSceneTheme('beige');
assert.equal(sceneColor('#64f4e050').slice(-2), '50', 'alpha is preserved');
assert.equal(sceneColor('#fff0').slice(-2), '00', 'short hex transparency is preserved');
console.log('PASS all 16 maps use beige paint, preserve geometry and restore the exact dark palette');

const bitmaps = [];
global.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; this.ctx = context(); bitmaps.push(this); }
  getContext() { return this.ctx; }
};
const ctx = context(), backgrounds = new BackgroundCache(200, 100), stage = stages[8];
let paints = 0;
const draw = () => backgrounds.draw(ctx, stage, 'test', { x: 0, y: 0, width: 10, height: 10, density: 1 }, target => {
  paints++; target.fillStyle = sceneColor('#65efda');
});
setSceneTheme('dark'); draw(); draw();
setSceneTheme('beige'); draw(); draw();
assert.equal(paints, 2, 'one background per theme, with no repeated repaint');
assert.notEqual(bitmaps[0].ctx.fillStyle, bitmaps[1].ctx.fillStyle, 'beige never reuses the dark bitmap');
setSceneTheme('dark'); draw();
assert.equal(paints, 2, 'the previous theme can be reused within the shared pixel budget');

const cache = new RenderCache(), entities = stage.entities.map(e => ({ x: e.position.x, y: e.position.y, angle: 0, life: -1, shape: e.shape }));
cache.drawMinimap(ctx, stage, entities, 2, 1);
const darkMap = ctx.paths.filter(p => p[0] === 'drawImage').at(-1)[1];
setSceneTheme('beige'); cache.drawMinimap(ctx, stage, entities, 2, 1);
assert.notEqual(ctx.paths.filter(p => p[0] === 'drawImage').at(-1)[1], darkMap, 'minimap cache changes theme');
const ball = { name: '구슬', color: '#92e5da', x: 1, y: 1 };
setSceneTheme('dark'); cache.drawBall(ctx, ball, 32, 1);
const count = bitmaps.length;
setSceneTheme('beige'); cache.drawBall(ctx, ball, 32, 1);
assert.equal(bitmaps.length, count + 1, 'only the label is rebuilt; marble identity and sprite are retained');
assert.equal(bitmaps.at(-1).ctx.fillStyle, '#44382d');
assert.equal(bitmaps.at(-1).ctx.strokeStyle, '#fff8eb');
console.log('PASS theme-aware background, minimap and label caches without repeated allocations');
