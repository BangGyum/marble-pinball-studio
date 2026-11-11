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

const { Editor } = require('../src/editor.ts');
const { saveMaps, readSavedMaps, validateStage } = require('../src/model.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const nodes = new Map();
global.document = {
  getElementById: (id) => {
    if (!nodes.has(id)) nodes.set(id, { checked: true });
    return nodes.get(id);
  },
};
const editor = Object.create(Editor.prototype);
Object.assign(editor, {
  stage: { title: '자유 곡선', goalY: 60, entities: [] },
  history: [],
  future: [],
  stroke: [],
  tool: 'freehand',
  selected: -1,
  drag: null,
  wallEnd: null,
  render() {},
  syncFields() {},
  canvas: {
    setPointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 650 };
    },
  },
});
const event = (x, y) => ({ clientX: x * 25, clientY: y * 25, button: 0, pointerId: 1, preventDefault() {} });
editor.down(event(2.13, 10.17));
editor.move(event(3, 11));
editor.move(event(4, 10));
editor.move(event(2.13, 10.17));
editor.up();
assert.equal(editor.stage.entities.length, 1);
const shape = editor.stage.entities[0].shape;
assert.equal(shape.type, 'polyline');
assert.equal(shape.points.length, 4);
assert.deepEqual(shape.points[0], [2.13, 10.17], 'freehand bypasses snapping');
assert.deepEqual(shape.points.at(-1), shape.points[0], 'closed strokes remain walls');
assert.equal(editor.history.length, 1, 'one stroke is one undo step');
editor.undo();
assert.equal(editor.stage.entities.length, 0);
editor.redo();
assert.equal(editor.stage.entities.length, 1);
assert.equal(editor.hit({ x: 3, y: 11 }), 0, 'drawn wall can be selected');
editor.down(event(5, 12));
editor.move(event(6, 14));
editor.cancelDrag();
assert.equal(editor.stage.entities.length, 1);
assert.equal(editor.stroke.length, 0);
editor.down(event(5, 12));
editor.up();
assert.equal(editor.stage.entities.length, 1, 'click alone does not create a zero-length wall');
editor.tool = 'wall';
editor.down(event(5, 12));
editor.move(event(7, 14));
editor.up();
assert.equal(editor.stage.entities[1].shape.points.length, 2, 'straight wall still works');
const wallPoints = editor.stage.entities[1].shape.points.map((point) => [...point]);
const drawnWall = structuredClone(editor.stage.entities[1]);
editor.selected = 1;
nodes.set('prop-spin', { value: '20', checkValidity: () => true });
editor.updateProperty('prop-spin');
const spinningWall = editor.stage.entities[1];
assert.equal(spinningWall.type, 'kinematic');
assert.deepEqual(spinningWall.position, { x: 6, y: 13 }, 'a drawn wall rotates around its center');
assert.deepEqual(
  spinningWall.shape.points.map(([x, y]) => [x + spinningWall.position.x, y + spinningWall.position.y]),
  wallPoints,
  'setting spin preserves the wall geometry before movement'
);
const values = new Map();
const storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
saveMaps(storage, [{ id: 'drawn', stage: editor.stage }]);
assert.deepEqual(readSavedMaps(storage)[0].stage, validateStage(editor.stage));
global.fetch = undefined;
(async () => {
  const physics = new Box2dPhysics();
  await physics.init();
  physics.createStage(readSavedMaps(storage)[0].stage);
  assert.equal(physics.getEntities().length, 2);
  physics.start();
  for (let i = 0; i < 540; i++) physics.step(1 / 60);
  const rotating = physics.getEntities()[1];
  assert.ok(
    Math.abs(rotating.x - 6) < 0.01 && Math.abs(rotating.y - 13) < 0.01,
    'a spinning wall remains anchored inside the map after nine seconds'
  );
  const wallSources = [drawnWall, editor.stage.entities[0]];
  nodes.get('snap').checked = false;
  for (const source of wallSources) {
    editor.stage = { title: '옮긴 벽 회전', goalY: 60, entities: [structuredClone(source)] };
    editor.tool = 'select';
    const [x, y] = source.shape.points[0];
    editor.down(event(x, y));
    editor.move(event(x + 3, y + 1));
    editor.up();
    const moved = structuredClone(editor.stage.entities[0]);
    const before = moved.shape.points.map(([px, py]) => [px + moved.position.x, py + moved.position.y]);
    const cx = (Math.min(...before.map(([px]) => px)) + Math.max(...before.map(([px]) => px))) / 2;
    const cy = (Math.min(...before.map(([, py]) => py)) + Math.max(...before.map(([, py]) => py))) / 2;
    editor.updateProperty('prop-spin');
    const centered = editor.stage.entities[0];
    assert.ok(
      Math.abs(centered.position.x - cx) < 1e-10 && Math.abs(centered.position.y - cy) < 1e-10,
      'dragging a wall before setting spin keeps its pivot at the moved wall center'
    );
    centered.shape.points.forEach(([px, py], i) => {
      assert.ok(Math.abs(px + centered.position.x - before[i][0]) < 1e-10);
      assert.ok(Math.abs(py + centered.position.y - before[i][1]) < 1e-10);
    });
    editor.undo();
    assert.deepEqual(editor.stage.entities[0], moved, 'undo restores the moved wall before recentering');
    editor.redo();
    assert.deepEqual(editor.stage.entities[0], centered, 'redo restores the same centered wall');
    saveMaps(storage, [{ id: 'moved', stage: editor.stage }]);
    physics.clear();
    physics.createStage(readSavedMaps(storage)[0].stage);
    physics.start();
    for (let i = 0; i < 540; i++) physics.step(1 / 60);
    const state = physics.getEntities()[0];
    const xs = state.shape.points.map(([px, py]) => state.x + Math.cos(state.angle) * px - Math.sin(state.angle) * py);
    const ys = state.shape.points.map(([px, py]) => state.y + Math.sin(state.angle) * px + Math.cos(state.angle) * py);
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - cx) < 0.001);
    assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - cy) < 0.001);
    assert.ok(Math.min(...xs) > 0 && Math.min(...ys) > 0, 'the rotating wall stays inside the map after nine seconds');
  }
  physics.clear();
  console.log(
    'PASS freehand creation, closed stroke, snapping, undo/redo, selection, cancellation, storage and Box2D loading'
  );
  console.log(
    'PASS dragged straight/freehand wall spin centers, unchanged geometry, undo/redo and saved Box2D rotation'
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
