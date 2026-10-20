const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);

const { MarbleElasticity } = require('../src/marble-elasticity.ts');
const elasticity = new MarbleElasticity();
elasticity.sample(0, 0, 0, 0, 1000);
elasticity.sample(0, 0, .2, 1 / 60, 1017);
assert.equal(elasticity.effect(0, 1017), undefined, 'steady movement does not deform the ball');
elasticity.sample(0, 0, .15, 2 / 60, 1034);
const impact = elasticity.effect(0, 1034);
assert.ok(impact && impact.amount > .07 && impact.amount <= .17, 'a sharp rebound briefly squashes the ball');
assert.ok(Math.abs(impact.angle + Math.PI / 2) < .001, 'the squash follows the impact direction');
assert.ok(elasticity.effect(0, 1154).amount < 0, 'the ball stretches lightly as it recovers');
assert.equal(elasticity.effect(0, 1274), undefined, 'the shape is round again after 240ms');
assert.equal(elasticity.effect(0, 1034, true), undefined, 'reduced motion suppresses deformation');
elasticity.reset();
assert.equal(elasticity.effect(0, 1034), undefined, 'a new race clears old impacts');
elasticity.sample(1, 0, 0, 0, 1000);
elasticity.sample(1, 0, 4 / 60, 1 / 60, 1017);
elasticity.sample(1, 0, 2 / 60, 2 / 60, 1034);
assert.equal(elasticity.effect(1, 1034), undefined, 'a weak tap does not keep a ball wobbling');

for (let i = 0; i < 100; i++) elasticity.sample(i, i, 0, 0, 1000);
for (let step = 1; step <= 20; step++) for (let i = 0; i < 100; i++) {
  const time = step / 60;
  elasticity.sample(i, i, 5 * time + 5 * time * time, time, 1000 + time * 1000);
}
assert.ok(Array.from({ length: 100 }, (_, i) => elasticity.effect(i, 1400)).every(effect => !effect),
  'ordinary acceleration does not animate a crowded field of 100 balls');
console.log('PASS rebound squash, recovery, reduced motion, reset and 100-ball non-impact motion');

const calls = [], bitmaps = [];
const context = () => new Proxy({}, { get(target, key) {
  if (key in target) return target[key];
  if (key === 'measureText') return text => ({ width: text.length * 8 });
  if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
  return (...args) => calls.push([key, ...args]);
} });
global.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; this.ctx = context(); bitmaps.push(this); }
  getContext() { return this.ctx; }
};
const { RenderCache } = require('../src/render-cache.ts');
const cache = new RenderCache(), ctx = context();
const ball = { id: 0, name: '탱탱볼', color: '#6be4c5', x: 2, y: 3 };
cache.drawBall(ctx, ball, 40, 1);
assert.equal(bitmaps.length, 2, 'one marble and one label are rasterized');
calls.length = 0;
for (let frame = 0; frame < 30; frame++)
  cache.drawBall(ctx, ball, 40, 1, 2, 3, { angle: 0, amount: .12 * (1 - frame / 30) });
assert.equal(bitmaps.length, 2, 'animation transforms the cached sprite without regenerating it');
assert.equal(calls.filter(call => call[0] === 'scale').length, 30, 'only the marble sprite is stretched');
assert.equal(calls.filter(call => call[0] === 'drawImage').length, 60, 'the label stays in its normal drawing path');
console.log('PASS elastic animation reuses cached marble and label sprites');

global.window = { addEventListener() {} };
global.devicePixelRatio = 1;
global.requestAnimationFrame = () => 1;
global.ResizeObserver = class { observe() {} };
const { Game } = require('../src/game.ts');
const { LanView } = require('../src/lan/view.ts');
const canvas = { getContext: () => context(), addEventListener() {}, getBoundingClientRect: () => ({ width: 1000, height: 600 }) };
const game = new Game(canvas);
game.stage = { title: 'Test', goalY: 100, entities: [] };
game.state = 'running';
game.balls = [{ id: 0, name: 'A', color: '#fff', x: 10, y: 0, angle: 0, stuck: 0 }];
const heights = [0, .2, .15];
game.physics = { step() {}, getMarblePosition: () => ({ x: 10, y: heights.shift(), angle: 0 }), getEntities: () => [] };
game.advance(); game.advance(); game.advance();
let drawnSquash;
game.renderCache.drawBall = (_ctx, _ball, _scale, _dpr, _x, _y, squash) => { drawnSquash = squash; return true; };
game.renderMinimap = () => {};
game.render();
assert.ok(drawnSquash, 'the standalone game passes a physical rebound to the marble renderer');
game.pause();
assert.equal(game.marbleElasticity.effect(0, performance.now()), undefined, 'pause clears a local impact');
console.log('PASS standalone physics rebound reaches the renderer and clears on pause');

const view = new LanView(canvas);
view.setScene({ raceId: 'bounce', revision: 1, stage: { title: 'Test', width: 26, goalY: 100, zoomY: 95, entities: [] },
  entities: [], fixed: [], balls: [{ id: 0, name: 'A', color: '#fff' }], settings: { order: 'asc', picks: 1 } });
const frame = (seq, elapsed, y, state = 'running') => ({ raceId: 'bounce', revision: 1, seq, elapsed, state,
  balls: [[0, 10, y, 0, 0]], angles: [], winners: [] });
view.push(frame(1, 0, 0));
view.push(frame(2, .05, .6));
view.push(frame(3, .1, .45));
view.push(frame(4, .15, .3));
view.draw(1000); view.draw(1050); view.draw(1100);
assert.ok(view.marbleElasticity.effect(0, 1100), 'LAN playback animates a rebound when the matching snapshot reaches the screen');
view.push(frame(5, .15, .3, 'paused'));
assert.equal(view.marbleElasticity.effect(0, 1100), undefined, 'pause clears the transient effect');
console.log('PASS LAN playback shows the rebound at the displayed snapshot and clears it on pause');

for (const playbackRate of [.5, 1, 2, 4, 8]) {
  view.setScene({ ...view.scene, raceId: `bounce-${playbackRate}` });
  [0, .6, .45, .3].forEach((y, i) => view.push({
    ...frame(i + 1, i * .05 * playbackRate, y * playbackRate),
    raceId: `bounce-${playbackRate}`, playbackRate,
  }));
  view.draw(1000); view.draw(1050); view.draw(1100);
  assert.ok(view.marbleElasticity.effect(0, 1100),
    `LAN ${playbackRate}x must keep rebound effects at the normal 20Hz snapshot rate`);
}
const resumed = new MarbleElasticity();
resumed.sample(0, 0, 0, 0, 1000);
resumed.sample(0, 0, .6, .05, 1050);
resumed.sample(0, 0, .45, .1, 1550);
assert.equal(resumed.effect(0, 1550), undefined, 'returning after a long sampling gap must not invent an impact');
const repeated = new MarbleElasticity();
repeated.sample(0, 0, 0, 0, 1000);
repeated.sample(0, 0, .6, .05, 1050);
repeated.sample(0, 0, .6, .05, 1067);
repeated.sample(0, 0, .45, .1, 1100);
assert.ok(repeated.effect(0, 1100), 'repeated snapshot times must preserve the velocity baseline');
repeated.sample(0, 0, .45, .1, 1117);
assert.ok(repeated.effect(0, 1117), 'repeated snapshot times must not cancel an active rebound');
console.log('PASS LAN .5/1/2/4/8x rebound, repeated snapshots and stale sample recovery');

// Inspect the actual drawing transforms, including restoration before the name label.
const { drawMarble } = require('../src/marble-art.ts');
function drawingTransforms(draw) {
  let matrix = [1, 0, 0, 1];
  const stack = [], drawn = [], ctx = context();
  ctx.save = () => stack.push([...matrix]);
  ctx.restore = () => { matrix = stack.pop(); };
  ctx.translate = () => {};
  ctx.scale = (x, y) => { matrix = [matrix[0] * x, matrix[1] * x, matrix[2] * y, matrix[3] * y]; };
  ctx.rotate = angle => {
    const [a, b, c, d] = matrix, cos = Math.cos(angle), sin = Math.sin(angle);
    matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin];
  };
  ctx.drawImage = ctx.ellipse = () => drawn.push([...matrix]);
  draw(ctx);
  assert.deepEqual(matrix, [1, 0, 0, 1], 'drawing must restore the surrounding canvas transform');
  return drawn;
}
for (const angle of [-Math.PI, -Math.PI / 2, 0, Math.PI / 4, Math.PI]) {
  for (const amount of [0, .0041, .17, -.02]) {
    const squash = { angle, amount }, cos = Math.cos(angle), sin = Math.sin(angle);
    const [sprite, label] = drawingTransforms(ctx => cache.drawBall(ctx, ball, 40, 1, 2, 3, squash));
    const [vector] = drawingTransforms(ctx => drawMarble(ctx, 2, 3, .25, ball.color, squash));
    assert.deepEqual(sprite, vector, 'cached and vector marbles must use the same deformation');
    assert.deepEqual(label, [1, 0, 0, 1], 'names must remain upright and unstretched');
    const [a, b, c, d] = sprite;
    for (const [x, y, scale] of [[cos, sin, 1 - amount], [-sin, cos, 1 + amount * .7]]) {
      assert.ok(Math.hypot(a * x + c * y - x * scale, b * x + d * y - y * scale) < 1e-10,
        'squash must stretch each impact axis without spinning the sphere lighting');
    }
  }
}
console.log('PASS cached/vector lighting stays oriented through impact and recovery; labels stay unchanged');

const crowdedCache = new RenderCache();
const crowd = Array.from({ length: 100 }, (_, id) => ({ ...ball, id, name: `Ball ${id}` }));
const bitmapCount = bitmaps.length;
for (const marble of crowd) crowdedCache.drawBall(ctx, marble, 40, 1);
assert.equal(bitmaps.length - bitmapCount, 200, '100 balls allocate one marble and one label each');
for (let frame = 0; frame < 120; frame++) {
  calls.length = 0;
  for (const marble of crowd) crowdedCache.drawBall(ctx, marble, 40, 1, marble.x, marble.y, {
    angle: marble.id, amount: .17 * Math.cos(frame / 10),
  });
  assert.equal(calls.filter(call => call[0] === 'drawImage').length, 200);
}
assert.equal(bitmaps.length - bitmapCount, 200, '100 simultaneous animations never rebuild the cached sprites');
console.log('PASS 100 simultaneously deforming balls reuse all sprites through 120 rendered frames');
