const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { ViewHistory } = require('../src/view-history.ts');

const entries = [{ state: null }, { state: { existing: 'kept' } }];
let position = 1, exits = 0, popstate;
const history = {
  get state() { return entries[position].state; },
  replaceState(state) { entries[position] = { state }; },
  pushState(state) { entries.splice(++position, entries.length - position, { state }); },
  back() {
    if (!position) return;
    position--;
    if (!position) exits++;
    else popstate({ state: this.state });
  },
  forward() {
    if (position + 1 < entries.length) {
      position++;
      popstate({ state: this.state });
    }
  },
};
global.window = { history, addEventListener(type, listener) { if (type === 'popstate') popstate = listener; } };
const views = [];
const navigation = new ViewHistory(view => views.push(view));
assert.deepEqual(history.state, { existing: 'kept', marblePinballView: 'gallery' });

navigation.enterGame();
navigation.enterGame();
assert.equal(entries.length, 3, 'repeated game entry adds only one history item');
history.back();
assert.deepEqual(views, ['gallery'], 'browser Back returns to the map gallery');
assert.equal(exits, 0, 'browser Back does not leave the app from a map');
history.forward();
assert.deepEqual(views, ['gallery', 'game'], 'browser Forward restores the game');
navigation.returnToGallery();
assert.equal(views.at(-1), 'gallery', 'the in-app map list button follows the same history');
navigation.enterGame();
assert.equal(entries.length, 3, 'resuming replaces the abandoned forward path');
history.back();
assert.equal(views.at(-1), 'gallery');
navigation.returnToGallery();
assert.equal(exits, 0, 'opening the gallery again does not accidentally navigate away');
history.back();
assert.equal(exits, 1, 'a further Back from the gallery retains normal browser behavior');
console.log('PASS map gallery and game Back/Forward navigation without premature page exit');
