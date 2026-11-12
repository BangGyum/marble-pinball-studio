const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
const { DolphinSettingsPanel } = require('../src/dolphin-settings.ts'),
  { DolphinDrag } = require('../src/dolphin-drag.ts');
const fields = Object.fromEntries(
  [
    'enabled',
    'fields',
    'minus',
    'plus',
    'count',
    'gap',
    'slider',
    'interval',
    'size',
    'size-slider',
    'speed',
    'speed-slider',
    'preview',
    'overview',
    'hint',
  ].map((name) => [name, { value: '20', checked: false, disabled: false, hidden: false }])
);
const changes = [],
  root = { classList: { add() {} }, querySelector: (selector) => fields[/"(.*?)"/.exec(selector)[1]] };
let overviews = 0;
const panel = new DolphinSettingsPanel(
  root,
  (value, commit) => changes.push({ value, commit }),
  () => {},
  () => overviews++
);
const stage = { title: 'Tall', width: 26, goalY: 300, zoomY: 295 };
panel.setStage(stage);
fields.enabled.checked = true;
fields.enabled.onchange();
assert.equal(panel.value.interval, 5);
assert.equal(fields.interval.value, '5', 'new settings start at five seconds');
assert.equal(panel.value.enabled, true);
assert.equal(overviews, 1);
assert.deepEqual(panel.value.rows, [12, 32, 52]);
fields.count.value = '5';
fields.count.onchange();
assert.equal(panel.value.rows.length, 5);
fields.gap.value = '30';
fields.gap.onchange();
assert.deepEqual(panel.value.rows, [12, 42, 72, 102, 132]);
fields.slider.value = '40';
fields.slider.oninput();
assert.equal(changes.at(-1).commit, false);
fields.slider.onchange();
assert.equal(changes.at(-1).commit, true);
fields.interval.value = '7';
fields.interval.onchange();
assert.equal(panel.value.interval, 7);
fields.interval.value = '0';
fields.interval.onchange();
assert.equal(panel.value.interval, 5);
fields.interval.value = '1000';
fields.interval.onchange();
assert.equal(panel.value.interval, 120);
assert.equal(fields.size.value, '100', 'legacy settings display the default size');
fields['size-slider'].value = '150';
fields['size-slider'].oninput();
assert.equal(panel.value.size, 150);
assert.equal(fields.size.value, '150');
assert.equal(changes.at(-1).commit, false);
fields['size-slider'].onchange();
assert.equal(changes.at(-1).commit, true);
fields.size.value = '1';
fields.size.oninput();
assert.equal(panel.value.size, 150, 'partial typing must not reset the size');
fields.size.value = '175';
fields.size.oninput();
assert.equal(panel.value.size, 175);
assert.equal(fields['size-slider'].value, '175');
fields.size.value = '500';
fields.size.onchange();
assert.equal(panel.value.size, 200);
fields.size.value = '0';
fields.size.onchange();
assert.equal(panel.value.size, 50);
assert.equal(fields.speed.value, '1', 'legacy settings display the default 1x speed');
fields['speed-slider'].value = '0.5';
fields['speed-slider'].oninput();
assert.equal(panel.value.speed, 0.5);
assert.equal(fields.speed.value, '0.5');
assert.equal(changes.at(-1).commit, false);
fields['speed-slider'].onchange();
assert.equal(changes.at(-1).commit, true);
fields.speed.value = '1.3';
fields.speed.oninput();
assert.equal(panel.value.speed, 1.3);
assert.equal(fields['speed-slider'].value, '1.3');
fields.speed.value = '0';
fields.speed.oninput();
assert.equal(panel.value.speed, 1.3, 'partial typing preserves the selected speed');
fields.speed.onchange();
assert.equal(panel.value.speed, 0.5);
fields.speed.value = '3';
fields.speed.onchange();
assert.equal(panel.value.speed, 1.5);
panel.setLocked(true);
const locked = JSON.stringify(panel.value);
fields.plus.onclick();
fields.gap.value = '5';
fields.gap.onchange();
fields['size-slider'].value = '150';
fields['size-slider'].oninput();
fields['size-slider'].onchange();
fields.size.value = '150';
fields.size.oninput();
fields.size.onchange();
fields['speed-slider'].value = '0.8';
fields['speed-slider'].oninput();
fields['speed-slider'].onchange();
fields.speed.value = '0.8';
fields.speed.oninput();
fields.speed.onchange();
assert.equal(JSON.stringify(panel.value), locked);
assert.equal(fields.enabled.disabled, true);
panel.setLocked(false);
panel.setStage({ ...stage, goalY: 20.345 });
assert.ok(panel.value.rows.at(-1) <= 17.345);
const manualRows = [14, 45, 77];
panel.setStage(JSON.parse(JSON.stringify(stage)), {
  enabled: true,
  rows: manualRows,
  interval: 13,
  size: 150,
  speed: 1.3,
});
panel.setStage(stage);
assert.deepEqual(panel.value.rows, manualRows, 'LAN scene copies must not replace individually positioned rows');
fields.interval.value = '9';
fields.interval.onchange();
assert.deepEqual(panel.value.rows, manualRows, 'changing appearance interval preserves the manual layout');
const clientSource = ts.createSourceFile(
  'client.ts',
  fs.readFileSync('src/lan/client.ts', 'utf8'),
  ts.ScriptTarget.ES2022
);
const settingsFunction = clientSource.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'inputSettings'
);
const serialized = require('node:vm').runInNewContext(
  ts.transpileModule(settingsFunction.getText(clientSource), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + '; inputSettings()',
  {
    names: { value: 'a,b' },
    parseNames: (text) => text.split(','),
    allMaps: () => [{ id: 'builtin-0', stage }],
    mapSelect: { value: 'builtin-0' },
    updatePicks() {},
    winningRange() {},
    order: { value: 'asc' },
    picks: { value: '1' },
    dolphinPanel: panel,
    stages: [stage],
  }
);
assert.deepEqual(
  Array.from(serialized.dolphins.rows),
  manualRows,
  'the actual LAN command builder keeps manual row positions'
);
assert.equal(serialized.dolphins.interval, 9);
assert.equal(serialized.dolphins.size, 150, 'LAN command retains the selected size');
assert.equal(serialized.dolphins.speed, 1.3, 'LAN command retains the selected speed');
console.log(
  'PASS dolphin toggle, row count, spacing/size/speed slider and input, limits, map changes and locked settings'
);

{
  const { SeaAnimalSettingsPanel } = require('../src/sea-animal-settings.ts');
  const { validateDolphins } = require('../src/dolphin.ts');
  const createElement = () => ({
    classList: { add() {} },
    dataset: {},
    children: [],
    fields: Object.fromEntries(Object.keys(fields).map((name) => [name, { checked: false }])),
    append(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      return this.fields[/"(.*?)"/.exec(selector)[1]];
    },
    querySelectorAll() {
      return this.children.filter((child) => child.dataset.animal).map((child) => child.fields.preview);
    },
  });
  const previousDocument = global.document;
  global.document = { createElement };
  const root = createElement(),
    changes = [],
    overviews = [],
    animals = new SeaAnimalSettingsPanel(
      root,
      (value, commit) => changes.push({ value, commit }),
      () => {},
      (kind) => overviews.push(kind)
    );
  global.document = previousDocument;
  const options = {
    enabled: true,
    rows: [14, 45, 77],
    interval: 13,
    size: 150,
    speed: 0.5,
    manta: { enabled: false, rows: [18, 42], interval: 11, size: 80, speed: 1.3 },
  };
  animals.setStage(stage, options);
  const controls = Object.fromEntries(
    root.children.filter((child) => child.dataset.animal).map((child) => [child.dataset.animal, child.fields])
  );
  const toggle = (kind, checked) => {
    controls[kind].enabled.checked = checked;
    controls[kind].enabled.onchange();
  };
  for (const kind of ['manta', 'dolphin', 'manta', 'dolphin']) {
    const count = changes.length;
    toggle(kind, true);
    assert.equal(animals.value.enabled, kind === 'dolphin', 'enabling manta turns dolphin off');
    assert.equal(animals.value.manta.enabled, kind === 'manta', 'enabling dolphin turns manta off');
    for (const other of ['dolphin', 'manta']) {
      assert.equal(controls[other].enabled.checked, other === kind, 'both switches reflect the selection');
      assert.equal(controls[other].fields.hidden, other !== kind, 'only the enabled effect shows its options');
    }
    assert.equal(changes.length, count + 1, 'switching effects sends one coherent settings update');
    assert.equal(changes.at(-1).commit, true);
    assert.equal(overviews.at(-1), kind, 'the preview follows the newly enabled effect');
    assert.deepEqual(validateDolphins(changes.at(-1).value, stage), animals.value);
    assert.deepEqual(animals.value.rows, options.rows, 'switching preserves dolphin row positions');
    assert.equal(animals.value.size, options.size);
    assert.equal(animals.value.speed, options.speed);
    assert.deepEqual(animals.value.manta, { ...options.manta, enabled: kind === 'manta' });
  }
  toggle('dolphin', false);
  assert.equal(animals.value.enabled || animals.value.manta.enabled, false, 'both effects can be off');
  animals.setStage({ ...stage, goalY: 200 });
  assert.equal(animals.value.enabled || animals.value.manta.enabled, false, 'map changes preserve the off state');
  toggle('manta', true);
  animals.setLocked(true);
  const locked = JSON.stringify(animals.value),
    count = changes.length;
  toggle('dolphin', true);
  toggle('manta', false);
  assert.equal(JSON.stringify(animals.value), locked, 'race/viewer locks prevent switching effects');
  assert.equal(changes.length, count);
  animals.setLocked(false);
  assert.equal(controls.dolphin.enabled.checked, false);
  assert.equal(controls.manta.enabled.checked, true);
  console.log(
    'PASS mutually exclusive animal switches, preserved options, preview, all-off state and race/viewer locks'
  );
}

global.window = { addEventListener() {} };
for (const scale of [0.5, 3, 70]) {
  const listeners = {},
    capture = new Set(),
    canvas = {
      style: {},
      getBoundingClientRect: () => ({ left: 37, top: 54 }),
      addEventListener(name, callback) {
        listeners[name] ??= [];
        listeners[name].push(callback);
      },
      setPointerCapture: (id) => capture.add(id),
      hasPointerCapture: (id) => capture.has(id),
      releasePointerCapture: (id) => capture.delete(id),
    };
  let settings = { enabled: true, rows: [12, 32, 52], interval: 20 },
    editing = true;
  const moved = [],
    drag = new DolphinDrag(
      canvas,
      () => editing,
      () => settings,
      () => stage,
      (i, y, commit) => {
        settings = { ...settings, rows: settings.rows.map((row, index) => (index === i ? y : row)) };
        moved.push({ i, y, commit });
      }
    );
  drag.setView(
    { x: 100, y: -15, scale, width: 26 * scale, height: 300 * scale },
    { x: 10, y: 20, scale: 1, width: 26, height: 300 }
  );
  const fire = (name, x, y, id = 4) => {
    const event = {
      button: 0,
      clientX: x + 37,
      clientY: y + 54,
      pointerId: id,
      preventDefault() {},
      stopImmediatePropagation() {},
    };
    for (const listener of listeners[name] ?? []) listener(event);
  };
  const x = 100 + 13 * scale,
    y = -15 + 32 * scale;
  fire('pointerdown', x, y + 1);
  fire('pointermove', x, y + 1 + 5 * scale);
  assert.equal(settings.rows[1], 37, 'drag uses world units and preserves initial grab offset at every zoom');
  fire('pointermove', x, 10000, 99);
  assert.equal(settings.rows[1], 37, 'a second pointer does not move the selected row');
  fire('pointermove', x, 10000);
  assert.equal(settings.rows[1], 51.5, 'rows cannot cross their neighbour');
  fire('pointerup', x, 10000);
  assert.equal(moved.at(-1).commit, true);
  assert.equal(capture.size, 0);
  fire('pointerdown', 20, 32);
  fire('pointermove', 20, 37);
  fire('pointerup', 20, 37);
  assert.equal(settings.rows[0], 17, 'minimap dragging uses its independent transform');
  editing = false;
  const before = JSON.stringify(settings);
  fire('pointerdown', x, y);
  fire('pointermove', x, 1000);
  fire('pointerup', x, 1000);
  assert.equal(JSON.stringify(settings), before, 'running race or viewer cannot drag rows');
}
console.log('PASS draggable rows at 3 zoom levels, page offsets, minimap, bounds, pointer ownership and edit lock');
const { Game } = require('../src/game.ts'),
  { LanView } = require('../src/lan/view.ts');
const { RenderResolution } = require('../src/render-resolution.ts');
for (const width of [400, 1000])
  for (const height of [300, 600])
    for (const goal of [20, 300]) {
      for (const View of [Game, LanView]) {
        const view = Object.create(View.prototype),
          map = { ...stage, goalY: goal };
        Object.assign(view, {
          state: 'ready',
          width,
          height,
          stage: map,
          balls: [],
          zoom: 3,
          dolphinRenderer: { kind: 'dolphin' },
          onZoomChange() {},
          render() {},
        });
        if (View === Game) view.dolphins = { enabled: true, rows: [12], interval: 20 };
        else view.scene = { stage: map, settings: { dolphins: { enabled: true, rows: [12], interval: 20 } } };
        view.showDolphinLayout();
        const scale = view.viewScale(),
          top = height * 0.43 - view.camera.y * scale;
        assert.ok(top >= -1e-6 && top + goal * scale <= height + 1e-6, 'whole layout includes both spawn and finish');
        assert.equal(view.zoom, 1, 'fit resets the previous zoom');
        view.readyCamera = { x: 12.85, y: 3 };
        view.follow(true);
        assert.equal(view.dolphinOverview, false, 'follow exits full layout for close-up editing');
        assert.deepEqual(view.camera, { x: 12.85, y: 3 });
      }
    }
console.log('PASS full-map fit for short/tall maps and narrow/wide standalone/LAN canvases');

global.requestAnimationFrame = () => 1;
global.devicePixelRatio = 1;
global.document = { hidden: false };
for (const View of [Game, LanView])
  for (const hz of [60, 120, 144]) {
    const view = Object.create(View.prototype),
      settings = { enabled: true, rows: [12], interval: 120, size: 200 };
    let draws = 0;
    Object.assign(view, {
      state: 'ready',
      visible: true,
      renderResolution: new RenderResolution(),
      resolutionAt: 0,
      dolphinPreview: true,
      dolphinPreviewElapsed: 2.9,
      dolphinPreviewLast: 0,
      last: 0,
      lastFrameDraw: 0,
      renderDirty: false,
      winners: [],
      balls: [{ id: 0, x: 12, y: 4 }],
      elapsed: 0,
      advance() {
        assert.fail('a ready preview must never advance the race');
      },
      render() {
        draws++;
      },
      draw() {
        draws++;
      },
    });
    if (View === Game) view.dolphins = settings;
    else view.scene = { settings: { dolphins: settings } };
    const before = JSON.stringify(view.balls);
    for (let i = 0; i <= hz * 15; i++) view.frame(1000 + (i * 1000) / hz);
    assert.equal(
      draws,
      hz * 15 + 1,
      'ready preview draws every display callback, including the 120-second waiting period'
    );
    assert.ok(Math.abs(view.dolphinPreviewElapsed - 17.9) < 1e-6, 'preview speed is refresh independent');
    assert.equal(view.elapsed, 0);
    assert.equal(JSON.stringify(view.balls), before, 'preview leaves prepared marbles untouched');
    let at = view.dolphinPreviewElapsed,
      now = 16000;
    const frozen = () => {
      now += 20;
      view.frame(now);
      assert.equal(view.dolphinPreviewElapsed, at);
    };
    view.setDolphinPreview(false);
    frozen();
    view.setDolphinPreview(true);
    view.visible = false;
    frozen();
    view.visible = true;
    global.document.hidden = true;
    frozen();
    global.document.hidden = false;
    view.reducedMotion = { matches: true };
    frozen();
    view.reducedMotion.matches = false;
    now += 10000;
    view.frame(now);
    assert.equal(view.dolphinPreviewElapsed, at, 'returning from a background tab does not catch up');
    now += 20;
    view.frame(now);
    assert.ok(view.dolphinPreviewElapsed > at);
    at = view.dolphinPreviewElapsed;
    view.state = 'paused';
    frozen();
    view.state = 'ready';
    settings.enabled = false;
    frozen();
  }
console.log(
  'PASS standalone/LAN ready animation at 60/120/144Hz, unchanged physics, off/hidden/reduced-motion/pause and tab return'
);
