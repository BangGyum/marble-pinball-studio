const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { gustFork } = require('../src/data/gust-fork.ts');
const { twinVortex } = require('../src/data/twin-vortex.ts');

function inside([x, y], points) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
async function contactDistance(physics, entity, segment, side) {
  const [a, b] = segment, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  const nx = dy / length * side, ny = -dx / length * side;
  const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
  physics.createStage({ ...gustFork, randomizeStart: false, windZones: [],
    entities: [{ ...entity, shape: { ...entity.shape, points: segment } }] });
  physics.vector.Set(0, 0);
  physics.world.SetGravity(physics.vector);
  physics.createMarble(1, x + nx * 1.5, y + ny * 1.5);
  physics.start();
  physics.vector.Set(-nx * 2, -ny * 2);
  physics.marbleMap[1].SetLinearVelocity(physics.vector);
  let distance;
  for (let frame = 0; frame < 90 && distance === undefined; frame++) {
    physics.step(1 / 60);
    let edge = physics.marbleMap[1].GetContactList();
    while (physics.Box2D.getPointer(edge)) {
      if (edge.contact.IsTouching()) {
        const p = physics.getMarblePosition(1);
        distance = Math.abs((p.x - x) * nx + (p.y - y) * ny);
        break;
      }
      edge = edge.next;
    }
  }
  physics.clearMarbles();
  physics.clear();
  assert.ok(distance >= 0.24 && distance <= 0.28,
    'contact must match the visible wall and radius 0.25; got ' + distance);
  return distance;
}
(async () => {
  const physics = new Box2dPhysics();
  await physics.init();
  let segments = 0;
  for (const divider of gustFork.entities.slice(2, 4)) {
    const { points, backing } = divider.shape;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      assert.ok(inside([(a[0] + b[0]) / 2 + dy / length * Math.sign(backing) * 0.01,
        (a[1] + b[1]) / 2 - dx / length * Math.sign(backing) * 0.01], points),
        'divider backing must point inside the structure');
      segments++;
    }
    const pointsToProbe = divider === gustFork.entities[2] ? [[16, 41], [12, 46]] : points.slice(0, 2);
    await contactDistance(physics, divider, pointsToProbe, -Math.sign(backing));
  }
  const rails = twinVortex.entities.filter(e => e.shape.type === 'polyline' &&
    e.shape.points.length > 2 && !e.shape.backing);
  assert.equal(rails.length, 5);
  for (const rail of rails) {
    const middle = Math.floor(rail.shape.points.length / 2);
    const segment = rail.shape.points.slice(middle - 1, middle + 1);
    for (const side of [-1, 1]) await contactDistance(physics, rail, segment, side);
  }
  console.log('PASS ' + segments + ' divider segments face inward; 12 physical contacts match visible walls on dividers and both sides of 5 rails');
})().catch(error => { console.error(error); process.exitCode = 1; });