const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const allocations = [];
const context = () => new Proxy({}, { get(target, key) {
  if (key in target) return target[key];
  if (key === 'measureText') return text => ({ width: text.length * 10 });
  if (key === 'getTransform') return () => ({ a: 50, b: 0 });
  if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
  return () => {};
} });
global.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; this.ctx = context(); allocations.push(width * height); }
  getContext() { return this.ctx; }
};
class Element {
  constructor() { this.events = new Map(); this.style = {}; this.classList = { toggle() {} }; this.open = false; }
  addEventListener(type, listener) { this.events.set(type, listener); }
  dispatch(type, event = {}) { this.events.get(type)?.(event); }
  querySelectorAll() { return []; }
  replaceChildren() {}
  add() {}
  getContext() { return this.ctx ??= context(); }
  getBoundingClientRect() { return { width: 1000, height: 600, left: 0, top: 0 }; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch('close'); }
}
const nodes = new Map();
const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
global.document = { getElementById: node, querySelector: () => node('editor-dialog').open ? node('editor-dialog') : null };
global.window = { addEventListener() {} };
global.ResizeObserver = class { observe() {} };
global.requestAnimationFrame = () => 1;
global.devicePixelRatio = 1;
global.Option = class {};
global.confirm = () => true;
// Toast and recorder callbacks are unrelated to these synchronous lifecycle assertions.
global.setTimeout = () => 1;
global.clearTimeout = () => {};
const { Game } = require('../src/game.ts');
const { LanView } = require('../src/lan/view.ts');
const { Editor } = require('../src/editor.ts');
const { cloneStage, validateStage } = require('../src/model.ts');
const { switchbackExpress } = require('../src/data/switchback-express.ts');
const stage = validateStage(cloneStage(switchbackExpress));
const entities = stage.entities.map(e => ({ x: e.position.x, y: e.position.y, angle: 0, shape: e.shape, life: e.props.life ?? -1 }));
const game = new Game(new Element()); game.stage = stage; game.physics.getEntities = () => entities;
const gameView = { hidden: false }, changes = [];
let saved = 0, played = 0;
const editor = new Editor({ list: () => [], save() { saved++; return 'saved'; }, remove() {}, play() { played++; },
  onOpenChange(open) { changes.push(open); game.setVisible(!open && !gameView.hidden); } });
game.frame(1);
editor.open(stage);
const backgroundCount = () => allocations.filter(pixels => pixels > 10_000_000).length;
const openedCount = backgroundCount();
for (let i = 1; i <= 5; i++) { game.frame(1 + i * 100); editor.render(); }
assert.equal(backgroundCount(), openedCount, 'hidden game and visible editor must not repeatedly evict each other');
node('editor-close').dispatch('click');
assert.equal(backgroundCount(), openedCount + 1, 'closing editor restores the game with at most one background rebuild');
for (let i = 6; i <= 10; i++) game.frame(1 + i * 100);
assert.equal(backgroundCount(), openedCount + 1, 'restored game reuses its rebuilt background');
assert.deepEqual(changes, [true, false]);
console.log('PASS editor suppresses hidden game frames, avoids background eviction loops and restores reuse');

for (const [close, action] of [
  ['save', () => node('editor-save').dispatch('click')],
  ['preview', () => node('editor-test').dispatch('click')],
  // Escape causes the native dialog to close; the close event also covers form/dialog dismissal.
  ['Escape/native close', () => node('editor-dialog').close()],
]) {
  editor.open(); assert.equal(game.visible, false, close + ' starts with a suspended game');
  action(); assert.equal(game.visible, true, close + ' restores the game');
  assert.deepEqual(changes.slice(-2), [true, false]);
}
assert.equal(saved, 1); assert.equal(played, 1);
gameView.hidden = true; game.setVisible(false); editor.open(); node('editor-close').dispatch('click');
assert.equal(game.visible, false, 'closing a gallery-created editor keeps the game hidden');
const showModal = node('editor-dialog').showModal;
node('editor-dialog').showModal = () => { throw new Error('cannot open'); };
const previousChanges = changes.length;
assert.throws(() => editor.open(), /cannot open/);
assert.equal(changes.length, previousChanges, 'failed modal opening must not suspend a visible renderer');
node('editor-dialog').showModal = showModal;
console.log('PASS save, preview, close button, native dismissal, gallery state and failed opening');

const lan = new LanView(new Element());
const scene = { type: 'scene', raceId: 'r', revision: 1, stage, entities, fixed: entities.map(() => false),
  balls: [{ id: 0, name: 'A', color: '#fff' }], settings: { names: 'A', mapId: 0, order: 'asc', picks: 1 } };
lan.setScene(scene);
let draws = 0;
const draw = lan.draw.bind(lan);
lan.draw = now => { draws++; draw(now); };
const frame = (seq, elapsed) => ({ type: 'frame', raceId: 'r', revision: 1, seq, time: 0, elapsed, state: 'running',
  balls: [[0, 10, elapsed + 5, 0, 0]], angles: entities.map(() => 0), winners: [], connected: 1, speed: 1, playbackRate: 1 });
lan.push(frame(1, 0)); lan.frame(1);
lan.setVisible(false);
const beforeHidden = draws;
for (let i = 2; i <= 6; i++) { lan.push(frame(i, i)); lan.frame(i * 1000); }
assert.equal(draws, beforeHidden, 'LAN continues accepting frames without drawing a covered canvas');
assert.equal(lan.state, 'running');
lan.setVisible(true); lan.frame(7000);
assert.equal(draws, beforeHidden + 1, 'LAN redraws immediately after returning from editor');
assert.ok(lan.balls[0].y > 10, 'restored LAN view uses snapshots received while hidden');
console.log('PASS LAN reception continues while hidden and current playback resumes on return');
