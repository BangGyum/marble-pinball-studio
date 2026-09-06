const assert = require('node:assert/strict');
const fs = require('fs'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f
  );
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { neonJunction } = require('../src/data/neon-junction.ts');
const { validateStage } = require('../src/model.ts');
const roundTrip = validateStage(JSON.parse(JSON.stringify(neonJunction)));
assert.equal(roundTrip.entities.filter((e) => e.shape.backing).length, 2);
for (const bad of [NaN, Infinity, 6, '3']) {
  const stage = structuredClone(neonJunction);
  stage.entities.find((e) => e.shape.backing).shape.backing = bad;
  assert.throws(() => validateStage(stage));
}
global.fetch = undefined;
const walls = neonJunction.entities.filter(
  (e) => e.shape.type === 'polyline' && e.shape.points[0][1] > 174 && e.shape.points[0][1] < 175.1
);
const boundary = (side) => {
  const part = walls.filter((e) => (side ? e.shape.points[0][0] > 33 : e.shape.points[0][0] < 33));
  return [
    ...part.find((e) => !e.shape.backing).shape.points.slice(0, -1),
    ...part.find((e) => e.shape.backing).shape.points,
  ];
};
const left = boundary(false);
const right = boundary(true);
const polygon = [...left.slice().reverse(), [31.4, 177], [34.6, 177], ...right];
function inside(x, y) {
  let c = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
(async () => {
  const p = new Box2dPhysics();
  await p.init();
  let escapes = [];
  for (let phase = 0; phase < 72; phase++) {
    p.clearMarbles();
    p.clear();
    p.createStage({ ...neonJunction, randomizeStart: false });
    for (const e of p.entities.filter((e) => e.y > 160 && e.body.GetAngularVelocity())) {
      p.vector.Set(e.x, e.y);
      e.body.SetTransform(p.vector, (phase * Math.PI) / 36);
    }
    const points = [
      [29, 174],
      [37, 174],
      [28.6, 167],
      [37.4, 167],
      [26.3, 170.4],
      [39.7, 170.4],
      [25.6, 167.6],
      [40.4, 167.6],
    ];
    points.forEach(([x, y], i) => p.createMarble(i, x, y));
    p.start();
    const done = new Set();
    for (let t = 0; t < 3600 && done.size < points.length; t++) {
      p.step(1 / 60);
      for (let id = 0; id < points.length; id++) {
        if (done.has(id)) continue;
        const b = p.getMarblePosition(id);
        if (b.y >= 162 && b.y < 176 && !inside(b.x, b.y)) {
          escapes.push({ phase, id, t, x: b.x, y: b.y });
          done.add(id);
          p.removeMarble(id);
        } else if (b.y >= 176) {
          done.add(id);
          p.removeMarble(id);
        }
      }
    }
  }
  assert.equal(escapes.length, 0, JSON.stringify(escapes.slice(0, 8)));
  console.log('PASS rotor wall containment: 72 phases, 576 marbles, zero escapes');
  p.clearMarbles();
  p.clear();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
