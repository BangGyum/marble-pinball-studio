const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);

const { initMarbleDesign, getMarbleDesign, setMarbleDesign } = require('../src/marble-design.ts');
const { setSceneTheme } = require('../src/scene-theme.ts');
const { RenderCache } = require('../src/render-cache.ts');
const { drawMarble } = require('../src/marble-art.ts');
const events = new Map();
global.window = {
  addEventListener(type, listener) {
    if (!events.has(type)) events.set(type, []);
    events.get(type).push(listener);
  },
  dispatchEvent(event) { for (const listener of events.get(event.type) ?? []) listener(event); },
};

function controls(saved, { readFails = false, writeFails = false } = {}) {
  const select = { value: '', addEventListener(type, listener) { this[type] = listener; } };
  const toast = { hidden: true, textContent: '' }, writes = [];
  global.document = { getElementById: id => id === 'marble-design' ? select : toast };
  global.localStorage = {
    getItem(key) { assert.equal(key, 'marble-pinball.marble-design'); if (readFails) throw Error('blocked'); return saved; },
    setItem(key, value) { if (writeFails) throw Error('full'); writes.push([key, value]); },
  };
  initMarbleDesign();
  return { select, toast, writes };
}
assert.equal(getMarbleDesign(), 'ceramic', 'new sessions start with matte ceramic');
for (const saved of [null, 'old-style', '', 'ceramic', 'racing-band']) {
  const { select } = controls(saved);
  assert.equal(getMarbleDesign(), saved === 'racing-band' ? saved : 'ceramic');
  assert.equal(select.value, getMarbleDesign(), 'the selector reflects the restored design');
}
assert.equal(controls('racing-band', { readFails: true }).select.value, 'ceramic');
const ui = controls(null);
let changes = 0;
window.addEventListener('pinball-marble-design-change', () => changes++);
ui.select.value = 'racing-band'; ui.select.change();
assert.equal(getMarbleDesign(), 'racing-band');
assert.deepEqual(ui.writes, [['marble-pinball.marble-design', 'racing-band']]);
assert.equal(changes, 1);
assert.equal(controls(ui.writes[0][1]).select.value, 'racing-band', 'a fresh initialization restores the last choice');
const originalTimeout = global.setTimeout;
try {
  global.setTimeout = () => 0;
  const blocked = controls(null, { writeFails: true });
  blocked.select.value = 'racing-band'; blocked.select.change();
  assert.equal(getMarbleDesign(), 'racing-band', 'unavailable storage does not block a live design change');
  assert.equal(blocked.toast.hidden, false);
  assert.match(blocked.toast.textContent, /공 디자인은 변경했지만 저장하지 못했어요/);
} finally { global.setTimeout = originalTimeout; }
console.log('PASS ceramic default, saved selection, invalid/blocked storage and live change notification');

function context() {
  return new Proxy({ calls: [] }, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: text.length * 8 });
    if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...args) => target.calls.push([key, ...args]);
  } });
}
const bitmaps = [];
global.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; this.ctx = context(); bitmaps.push(this); }
  getContext() { return this.ctx; }
};
const ctx = context(), ball = { id: 0, name: '구슬', color: 'hsl(137.508 85% 72%)', x: 2, y: 3 };
const before = JSON.stringify(ball), cache = new RenderCache();
setSceneTheme('dark'); setMarbleDesign('ceramic');
cache.drawBall(ctx, ball, 40, 2);
const ceramic = bitmaps.at(-2), label = bitmaps.at(-1), allocated = bitmaps.length;
assert.equal(ceramic.ctx.calls.some(call => call[0] === 'fillRect'), false);
setMarbleDesign('racing-band'); cache.drawBall(ctx, ball, 40, 2);
assert.equal(bitmaps.length, allocated + 1, 'changing design rebuilds only the marble sprite');
assert.ok(bitmaps.at(-1).ctx.calls.some(call => call[0] === 'fillRect'), 'the new sprite contains the racing band');
assert.equal(ctx.calls.at(-1)[1], label, 'name labels survive a design switch');
assert.equal(JSON.stringify(ball), before, 'display changes never alter participant data');
console.log('PASS immediate sprite invalidation, racing-band drawing and retained names/participant identity');

for (const theme of ['dark', 'beige']) for (const design of ['ceramic', 'racing-band']) {
  setSceneTheme(theme); setMarbleDesign(design);
  const crowdCache = new RenderCache(), count = bitmaps.length;
  const balls = Array.from({ length: 100 }, (_, id) => ({ ...ball, id, name: `공 ${id}` }));
  for (const b of balls) assert.equal(crowdCache.drawBall(ctx, b, 40, 2), true);
  assert.equal(bitmaps.length - count, 200);
  for (let frame = 0; frame < 120; frame++) {
    ctx.calls.length = 0;
    for (const b of balls) crowdCache.drawBall(ctx, b, 40, 2, b.x, b.y, { angle: b.id, amount: .17 * Math.cos(frame / 10) });
    assert.equal(ctx.calls.filter(call => call[0] === 'drawImage').length, 200);
  }
  assert.equal(bitmaps.length - count, 200, `${theme}/${design}: warm frames reuse all 100 marble and label sprites`);
  const fallback = context(), savedCanvas = global.OffscreenCanvas;
  try {
    global.OffscreenCanvas = undefined;
    assert.equal(crowdCache.drawBall(fallback, ball, 40, 2), false);
    drawMarble(fallback, 2, 3, .25, ball.color, { angle: .7, amount: .17 });
    assert.equal(fallback.calls.some(call => call[0] === 'fillRect'), design === 'racing-band');
    assert.equal(fallback.shadowBlur, 0, 'neither material adds expensive live glow');
  } finally { global.OffscreenCanvas = savedCanvas; }
}
console.log('PASS both designs/themes: 100 deforming balls over 120 frames without new bitmaps; vector fallback');

global.devicePixelRatio = 1;
global.requestAnimationFrame = () => 1;
global.ResizeObserver = class { observe() {} };
const { Game } = require('../src/game.ts');
const { LanView } = require('../src/lan/view.ts');
const canvas = { getContext: () => context(), addEventListener() {} };
const renderers = [new Game(canvas), new LanView(canvas)];
for (const renderer of renderers) {
  renderer.renderDirty = false; renderer.state = 'paused'; renderer.balls = [ball];
  renderer.prepare = renderer.setScene = () => assert.fail('design changes must not reset the race');
}
const changed = controls('ceramic');
changed.select.value = 'racing-band'; changed.select.change();
for (const renderer of renderers) {
  assert.equal(renderer.renderDirty, true, 'even an idle or paused renderer repaints after a design change');
  assert.equal(renderer.state, 'paused'); assert.deepEqual(renderer.balls, [ball]);
}
setMarbleDesign('ceramic'); setSceneTheme('dark');
console.log('PASS standalone/LAN paused screens repaint without resetting the race');
