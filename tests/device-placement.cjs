const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const { pinballCascade } = require('../src/data/pinball-cascade.ts');
const { orbitalLock, orbitalRings } = require('../src/data/orbital-lock.ts');
const { neonHourglass } = require('../src/data/neon-hourglass.ts');
const { fractureCanyon } = require('../src/data/fracture-canyon.ts');
const rotate = ([x, y], angle, position) => [
  position.x + x * Math.cos(angle) - y * Math.sin(angle),
  position.y + x * Math.sin(angle) + y * Math.cos(angle),
];
const segments = points => points.slice(1).map((point, i) => [points[i], point]);
const distance = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const inside = (p, points) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
const walls = stage => stage.entities.filter(e =>
  e.type === 'static' && e.shape.type === 'polyline' && !e.shape.solid && !e.shape.collisionLayer
).flatMap(e => segments(e.shape.points.map(p => rotate(p, e.shape.rotation, e.position))));
function inTrack(stage, p) {
  if (stage === orbitalLock) {
    const r = Math.hypot(p[0] - 32, p[1] - 40);
    return orbitalRings.some(ring => r > ring.inner && r < ring.outer);
  }
  const [outer, ...islands] = stage.art.contours;
  return inside(p, outer) && !islands.some(points => inside(p, points));
}
function freeRotor(stage, index) {
  const e = stage.entities[index], centre = [e.position.x, e.position.y];
  const radius = Math.hypot(e.shape.width, e.shape.height);
  assert.ok(inTrack(stage, centre), stage.title + ': rotor centre is in the playable track');
  const gap = Math.min(...walls(stage).map(([a, b]) => distance(centre, a, b))) - radius;
  // A 0.5-wide marble must fit even when a blade points directly at the rim.
  assert.ok(gap >= 0.6, stage.title + ': full rotor sweep needs marble clearance; gap=' + gap);
  for (const gate of stage.entities.filter(other => other.props.timedGate && !other.shape.collisionLayer)) {
    for (let i = 0; i <= 80; i++) {
      const points = gate.shape.points.map(p => rotate(p, gate.props.timedGate.angle * i / 80, gate.position));
      assert.ok(!inside(centre, points), 'gate must not sweep through the rotor centre');
      const gateGap = Math.min(...segments(points).map(([a, b]) => distance(centre, a, b))) - radius;
      assert.ok(gateGap >= 0.55, 'moving gate and rotor must leave a marble-width gap: ' + gateGap);
    }
  }
}
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function segmentGap(a, b, c, d) {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b));
}
function boostInTrack(stage, index) {
  const e = stage.entities[index], s = e.shape;
  assert.ok(s.boostSpeed, 'target must be a boost pad');
  const corners = [[-s.width, -s.height], [s.width, -s.height], [s.width, s.height], [-s.width, s.height]]
    .map(p => rotate(p, s.rotation, e.position));
  assert.ok(corners.every(p => inTrack(stage, p)), stage.title + ': the whole boost pad must be inside the track');
  const gap = Math.min(...segments([...corners, corners[0]]).flatMap(([a, b]) =>
    walls(stage).map(([c, d]) => segmentGap(a, b, c, d))));
  assert.ok(gap >= 0.05, stage.title + ': boost rectangle must not cross or touch a wall; gap=' + gap);
}
freeRotor(orbitalLock, 20);
freeRotor(fractureCanyon, 31);
freeRotor(fractureCanyon, 32);
for (const index of [18, 22, 23, 25]) boostInTrack(neonHourglass, index);
boostInTrack(pinballCascade, 34);
const jump = pinballCascade.entities[34].shape;
assert.ok(Math.sin(jump.rotation) < 0 && Math.cos(jump.rotation) < 0,
  'the final jump pad launches back toward the flipper instead of accelerating straight into the finish');
console.log('PASS relocated device clearance, gate sweeps, complete boost footprints and jump direction');
