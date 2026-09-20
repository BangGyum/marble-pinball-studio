const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
const { Editor } = require('../src/editor.ts');
const pad = angle => ({ position: { x: 12, y: 10 }, type: 'static',
  shape: { type: 'box', width: 3, height: 1, rotation: angle, color: '#ffc653', boostSpeed: 35 },
  props: { density: 1, restitution: 0, angularVelocity: 0 } });
const stage = entities => ({ title: '부스터 검증', goalY: 60, entities });
const cache = new Map(), storage = { getItem: k => cache.get(k) ?? null, setItem: (k,v) => cache.set(k,v) };
saveMaps(storage, [{ id: 'boost', stage: stage([pad(Math.PI/2)]) }]);
assert.equal(readSavedMaps(storage)[0].stage.entities[0].shape.boostSpeed, 35);
for (const value of [null, 0, -1, 61, NaN]) {
  const e = pad(0); e.shape.boostSpeed = value;
  assert.throws(() => validateStage(stage([e])));
}
assert.throws(() => validateStage(stage([{ ...pad(0), type: 'kinematic' }])));

const nodes = new Map();
global.document = { getElementById: id => { if (!nodes.has(id)) nodes.set(id, { checked: true }); return nodes.get(id); } };
const editor = Object.create(Editor.prototype);
Object.assign(editor, { stage: stage([]), history: [], future: [], tool: 'boost', selected: -1, drag: null,
  render() {}, syncFields() {}, canvas: { setPointerCapture() {}, getBoundingClientRect: () => ({left:0,top:0,width:650}) } });
editor.down({clientX:300,clientY:250,button:0,pointerId:1,preventDefault(){}});
assert.equal(editor.stage.entities[0].shape.boostSpeed, 35);
assert.equal(editor.hit({x:12,y:10}), 0);
editor.undo(); assert.equal(editor.stage.entities.length, 0);
editor.redo(); assert.equal(editor.stage.entities.length, 1);
nodes.set('prop-boost', {value:'45',checkValidity:()=>true}); editor.selected=0;
editor.updateProperty('prop-boost'); assert.equal(editor.stage.entities[0].shape.boostSpeed,45);

(async () => {
  const physics = new Box2dPhysics(); await physics.init();
  const run = (angle, x=12, y=10, initial=0) => {
    physics.clearMarbles(); physics.clear(); physics.createStage(stage([pad(angle)]));
    physics.createMarble(0,x,y); physics.start();
    const body=physics.marbleMap[0], vector=physics.vector;
    vector.Set(Math.cos(angle)*initial,Math.sin(angle)*initial);body.SetLinearVelocity(vector);
    for(let i=0;i<6;i++) physics.step(1/60);
    const v=body.GetLinearVelocity(); return {x:v.x,y:v.y};
  };
  const right=run(0); assert.ok(right.x>25 && right.y>0.8, 'right pad accelerates while preserving gravity');
  const left=run(Math.PI); assert.ok(left.x < -25, 'rotated arrows reverse acceleration');
  const down=run(Math.PI/2); assert.ok(down.y>25, 'down arrows accelerate downward');
  const up=run(-Math.PI/2); assert.ok(up.y < -24, 'up arrows accelerate upward');
  const outside=run(Math.PI/4,15,7); assert.ok(Math.abs(outside.x)<0.01, 'outside the rotated rectangle receives no boost');
  const fast=run(0,12,10,50); assert.ok(fast.x>49, 'a pad never brakes faster marbles');
  run(0);
  for(let i=0;i<45;i++) physics.step(1/60);
  assert.ok(physics.marbleMap[0].GetPosition().x>20, 'sensor pad does not block movement');
  assert.ok(physics.marbleMap[0].GetLinearVelocity().x>30, 'momentum persists after leaving');
  physics.clearMarbles(); physics.clear();
  console.log('PASS booster directions, rotated trigger bounds, sustained speed, no braking, pass-through, editor undo/redo and save validation');
})().catch(e=>{console.error(e);process.exitCode=1;});
