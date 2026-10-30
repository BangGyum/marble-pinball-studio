const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { DolphinSettingsPanel } = require('../src/dolphin-settings.ts'), { DolphinDrag } = require('../src/dolphin-drag.ts');
const fields = Object.fromEntries(['enabled','fields','minus','plus','count','gap','slider','interval','preview','overview','hint']
  .map(name => [name, { value: '20', checked: false, disabled: false, hidden: false }]));
const changes = [], root = { classList: { add() {} }, querySelector: selector => fields[/"(.*?)"/.exec(selector)[1]] };
let overviews = 0;
const panel = new DolphinSettingsPanel(root, (value, commit) => changes.push({ value, commit }), () => {}, () => overviews++);
const stage = { title: 'Tall', width: 26, goalY: 300, zoomY: 295 };
panel.setStage(stage); fields.enabled.checked = true; fields.enabled.onchange();
assert.equal(panel.value.enabled, true); assert.equal(overviews, 1); assert.deepEqual(panel.value.rows, [12, 32, 52]);
fields.count.value = '5'; fields.count.onchange(); assert.equal(panel.value.rows.length, 5);
fields.gap.value = '30'; fields.gap.onchange(); assert.deepEqual(panel.value.rows, [12, 42, 72, 102, 132]);
fields.slider.value = '40'; fields.slider.oninput(); assert.equal(changes.at(-1).commit, false); fields.slider.onchange(); assert.equal(changes.at(-1).commit, true);
fields.interval.value = '7'; fields.interval.onchange(); assert.equal(panel.value.interval, 7);
fields.interval.value = '0'; fields.interval.onchange(); assert.equal(panel.value.interval, 6);
fields.interval.value = '1000'; fields.interval.onchange(); assert.equal(panel.value.interval, 120);
panel.setLocked(true); const locked = JSON.stringify(panel.value); fields.plus.onclick(); fields.gap.value = '5'; fields.gap.onchange();
assert.equal(JSON.stringify(panel.value), locked); assert.equal(fields.enabled.disabled, true);
panel.setLocked(false); panel.setStage({ ...stage, goalY: 20.345 }); assert.ok(panel.value.rows.at(-1) <= 17.345);
const manualRows = [14,45,77];
panel.setStage(JSON.parse(JSON.stringify(stage)), { enabled:true, rows:manualRows, interval:13 });
panel.setStage(stage);
assert.deepEqual(panel.value.rows,manualRows,'LAN scene copies must not replace individually positioned rows');
fields.interval.value='9'; fields.interval.onchange();
assert.deepEqual(panel.value.rows,manualRows,'changing appearance interval preserves the manual layout');
const clientSource = ts.createSourceFile('client.ts',fs.readFileSync('src/lan/client.ts','utf8'),ts.ScriptTarget.ES2022);
const settingsFunction = clientSource.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='inputSettings');
const serialized = require('node:vm').runInNewContext(ts.transpileModule(settingsFunction.getText(clientSource),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText+'; inputSettings()',{
  names:{value:'a,b'},parseNames:text=>text.split(','),allMaps:()=>[{id:'builtin-0',stage}],mapSelect:{value:'builtin-0'},
  updatePicks(){},winningRange(){},order:{value:'asc'},picks:{value:'1'},dolphinPanel:panel,stages:[stage],
});
assert.deepEqual(Array.from(serialized.dolphins.rows),manualRows,'the actual LAN command builder keeps manual row positions');
assert.equal(serialized.dolphins.interval,9);
console.log('PASS dolphin toggle, row count, spacing slider/input, interval limits, map changes and locked settings');

global.window = { addEventListener() {} };
for (const scale of [.5, 3, 70]) {
  const listeners = {}, capture = new Set(), canvas = {
    style: {}, getBoundingClientRect: () => ({ left: 37, top: 54 }),
    addEventListener(name, callback) { (listeners[name] ??= []).push(callback); },
    setPointerCapture: id => capture.add(id), hasPointerCapture: id => capture.has(id), releasePointerCapture: id => capture.delete(id),
  };
  let settings = { enabled: true, rows: [12, 32, 52], interval: 20 }, editing = true;
  const moved = [], drag = new DolphinDrag(canvas, () => editing, () => settings, () => stage, (i, y, commit) => {
    settings = { ...settings, rows: settings.rows.map((row, index) => index === i ? y : row) }; moved.push({ i, y, commit });
  });
  drag.setView({ x: 100, y: -15, scale, width: 26 * scale, height: 300 * scale }, { x: 10, y: 20, scale: 1, width: 26, height: 300 });
  const fire = (name, x, y, id = 4) => {
    const event = { button: 0, clientX: x + 37, clientY: y + 54, pointerId: id, preventDefault() {}, stopImmediatePropagation() {} };
    for (const listener of listeners[name] ?? []) listener(event);
  };
  const x = 100 + 13 * scale, y = -15 + 32 * scale;
  fire('pointerdown', x, y + 1); fire('pointermove', x, y + 1 + 5 * scale);
  assert.equal(settings.rows[1], 37, 'drag uses world units and preserves initial grab offset at every zoom');
  fire('pointermove', x, 10000, 99); assert.equal(settings.rows[1], 37, 'a second pointer does not move the selected row');
  fire('pointermove', x, 10000); assert.equal(settings.rows[1], 51.5, 'rows cannot cross their neighbour');
  fire('pointerup', x, 10000); assert.equal(moved.at(-1).commit, true); assert.equal(capture.size, 0);
  fire('pointerdown', 20, 32); fire('pointermove', 20, 37); fire('pointerup', 20, 37);
  assert.equal(settings.rows[0], 17, 'minimap dragging uses its independent transform');
  editing = false; const before = JSON.stringify(settings); fire('pointerdown', x, y); fire('pointermove', x, 1000); fire('pointerup', x, 1000);
  assert.equal(JSON.stringify(settings), before, 'running race or viewer cannot drag rows');
}
console.log('PASS draggable rows at 3 zoom levels, page offsets, minimap, bounds, pointer ownership and edit lock');
const { Game } = require('../src/game.ts'), { LanView } = require('../src/lan/view.ts');
for (const width of [400,1000]) for (const height of [300,600]) for (const goal of [20,300]) {
  for (const View of [Game,LanView]) {
    const view = Object.create(View.prototype), map = { ...stage, goalY: goal };
    Object.assign(view, { state: 'ready', width, height, stage: map, balls: [], zoom: 3, onZoomChange() {}, render() {} });
    if (View===Game) view.dolphins={enabled:true,rows:[12],interval:20};
    else view.scene={stage:map,settings:{dolphins:{enabled:true,rows:[12],interval:20}}};
    view.showDolphinLayout(); const scale=view.viewScale(), top=height*.43-view.camera.y*scale;
    assert.ok(top>=-1e-6 && top+goal*scale<=height+1e-6,'whole layout includes both spawn and finish');
    assert.equal(view.zoom,1,'fit resets the previous zoom');
    view.readyCamera={x:12.85,y:3}; view.follow(true);
    assert.equal(view.dolphinOverview,false,'follow exits full layout for close-up editing');
    assert.deepEqual(view.camera,{x:12.85,y:3});
  }
}
console.log('PASS full-map fit for short/tall maps and narrow/wide standalone/LAN canvases');
