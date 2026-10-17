const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const { MapTransition } = require('../src/map-transition.ts');

function fixture({ reduced = false, hidden = false } = {}) {
  const timers = new Map(), documentEvents = {}, windowEvents = {}, motionEvents = {}, layers = [];
  const element = (properties = {}) => ({
    inert: false, hidden: false, focusCount: 0,
    focus() { this.focusCount++; },
    style: { setProperty(key, value) { this[key] = value; }, getPropertyValue(key) { return this[key] ?? ''; } },
    classList: { values: new Set(), add(value) { this.values.add(value); }, remove(value) { this.values.delete(value); }, contains(value) { return this.values.has(value); } },
    ...properties,
  });
  const motion = { matches: reduced, addEventListener(type, listener) { motionEvents[type] = listener; } };
  global.window = { innerWidth: 1280, innerHeight: 720, matchMedia: () => motion, addEventListener(type, listener) { windowEvents[type] = listener; } };
  global.document = { hidden, body: { append(layer) { layers.push(layer); } }, addEventListener(type, listener) { documentEvents[type] = listener; },
    createElement() {
      const nodes = { span: {}, strong: {} };
      return element({ nodes, setAttribute() {}, querySelector: selector => nodes[selector], remove() { layers.splice(layers.indexOf(this), 1); } });
    },
  };
  global.setTimeout = (callback, delay) => { timers.set(callback, delay); return callback; };
  global.clearTimeout = callback => timers.delete(callback);
  const back = element(), gallery = element(), game = element({ hidden: true, querySelector: () => back });
  const card = element({ querySelector: selector => ({ textContent: selector === '.map-card-title' ? '오비탈 <b>락</b>' : '09' }),
    getBoundingClientRect: () => ({ left: 700, top: 900, width: 240, height: 400 }),
  });
  card.style.setProperty('--map-color', '#91bcff');
  let selections = 0;
  const select = () => { selections++; gallery.hidden = true; game.hidden = false; };
  const run = delay => {
    const callback = [...timers].find(([, value]) => value === delay)?.[0];
    assert.ok(callback, `timer at ${delay}ms exists`); timers.delete(callback); callback();
  };
  return { transition: new MapTransition(gallery, game), select, selections: () => selections, timers, run, layers, card,
    gallery, game, back, motion, documentEvents, windowEvents, motionEvents };
}

const f = fixture();
f.transition.play(f.card, f.select);
assert.equal(f.selections(), 0, 'selection waits until the visual cover is opaque');
assert.ok(f.gallery.inert && f.game.inert, 'both screens reject stray input during the transition');
assert.equal(f.layers[0].nodes.strong.textContent, '오비탈 <b>락</b>', 'custom titles remain literal text');
assert.equal(f.layers[0].style['--map-color'], '#91bcff');
assert.equal(f.layers[0].style['--from-y'], '360px', 'offscreen card origins are clamped to the viewport');
f.transition.play(f.card, () => { throw new Error('duplicate selection'); });
assert.equal(f.layers.length, 1);
assert.equal(f.timers.size, 2);
f.run(220);
assert.equal(f.selections(), 1);
assert.equal(f.game.hidden, false);
f.run(820);
assert.equal(f.selections(), 1, 'finishing does not select the map twice');
assert.equal(f.layers.length, 0);
assert.equal(f.timers.size, 0);
assert.equal(f.gallery.inert || f.game.inert, false);
assert.equal(f.back.focusCount, 1);
assert.equal(f.card.classList.contains('map-card-launching'), false);
f.transition.finish(); f.transition.cancel();
f.gallery.hidden = false; f.game.hidden = true;
f.transition.play(f.card, f.select); f.run(820);
assert.equal(f.selections(), 2, 'returning to the gallery allows another map transition');
console.log('PASS map-colored transition, duplicate input guard, single selection, cleanup, focus and repeat use');

for (const action of ['hidden', 'resize', 'pagehide', 'reduced', 'finish']) {
  for (const swapped of [false, true]) {
    const f = fixture(); f.transition.play(f.card, f.select);
    if (swapped) f.run(220);
    if (action === 'hidden') { document.hidden = true; f.documentEvents.visibilitychange(); }
    else if (action === 'reduced') { f.motion.matches = true; f.motionEvents.change(); }
    else if (action === 'finish') f.transition.finish();
    else f.windowEvents[action]();
    assert.equal(f.selections(), 1, action);
    assert.equal(f.layers.length + f.timers.size, 0, action);
    assert.equal(f.gallery.inert || f.game.inert, false, action);
    if (action === 'hidden') assert.equal(f.back.focusCount, 0, 'hidden tabs do not steal focus');
  }
}
console.log('PASS early completion before/after screen swap on visibility, resize, exit and reduced-motion changes');

for (const swapped of [false, true]) {
  const f = fixture(); f.transition.play(f.card, f.select);
  if (swapped) f.run(220);
  f.transition.cancel();
  assert.equal(f.selections(), Number(swapped), 'external navigation must not later select a stale map');
  assert.equal(f.layers.length + f.timers.size, 0);
  assert.equal(f.gallery.inert || f.game.inert, false);
  assert.equal((swapped ? f.back : f.card).focusCount, 1);
}
for (const options of [{ reduced: true }, { hidden: true }]) {
  const f = fixture(options); f.transition.play(f.card, f.select);
  assert.equal(f.selections(), 1);
  assert.equal(f.layers.length + f.timers.size, 0, 'reduced/hidden entry is immediate without visual work');
  assert.equal(f.gallery.inert || f.game.inert, false);
}
console.log('PASS external navigation cancels pending selection and reduced-motion entry remains immediate');
