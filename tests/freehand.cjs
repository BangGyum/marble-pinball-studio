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
  physics.clear();
  console.log(
    'PASS freehand creation, closed stroke, snapping, undo/redo, selection, cancellation, storage and Box2D loading'
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
