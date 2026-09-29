const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const { WallGuard } = require('../src/wall-guard.ts');
const { validateStage, exportMap, MAX_MAP_FILE_BYTES } = require('../src/model.ts');
const { stages } = require('../src/data/maps.ts');
const wall = (points, extra = {}) => ({ position: { x: 0, y: 0 }, type: 'static',
  shape: { type: 'polyline', rotation: 0, points, ...extra },
  props: { density: 1, restitution: 0, angularVelocity: 0 } });
const stage = entities => ({ title: '검사', goalY: 100, zoomY: 95, entities });

const diagonal = new WallGuard(stage([wall([[0, 0], [200, 200]])]));
assert.ok(diagonal.cells.size < 500, `one diagonal should follow the line, got ${diagonal.cells.size} cells`);
const longest = new WallGuard(stage([wall([[-1000, -1000], [1000, 1000]])]));
assert.ok(longest.cells.size < 5000);
for (const t of [-999.9, -200, -2, 0, 2, 199.9, 998]) {
  assert.equal(longest.crosses(t - .1, t + .1, t + .1, t - .1, 1), true, `crossing near grid boundary ${t}`);
  assert.equal(longest.crosses(t - .1, t + .1, t, t + .2, 1), false);
}

// Compare the spatial index against a direct orientation test over varied line directions.
let seed = 123456;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < 200; i++) {
  const a = [Math.floor(random() * 100 - 50) * 2, Math.floor(random() * 100 - 50) * 2];
  const b = [Math.floor(random() * 100 - 50) * 2, Math.floor(random() * 100 - 50) * 2];
  if (a[0] === b[0] && a[1] === b[1]) continue;
  const guard = new WallGuard(stage([wall([a, b])]));
  const t = .1 + random() * .8, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = -(b[1] - a[1]) / length * .15, dy = (b[0] - a[0]) / length * .15;
  assert.equal(guard.crosses(x - dx, y - dy, x + dx, y + dy, 1), true);
  assert.equal(guard.crosses(x - dx, y - dy, x - dx / 2, y - dy / 2, 1), false);
  assert.equal(guard.crosses(x - dx, y - dy, x + dx, y + dy, 2), false);
}
console.log('PASS wall grid follows line length, grid corners and crossing direction/layer');

stages.forEach(validateStage);
const pins = Array.from({ length: 2000 }, (_, i) => ({ position: { x: i % 40, y: 20 + Math.floor(i / 40) }, type: 'static',
  shape: { type: 'circle', radius: .1 }, props: { density: 1, restitution: 0, angularVelocity: 0 } }));
assert.equal(validateStage(stage(pins)).entities.length, 2000, 'ordinary maps keep their entity limit');
const manyEdges = Array.from({ length: 999 }, (_, i) => [i / 100, i % 2]);
assert.throws(() => validateStage(stage(Array.from({ length: 12 }, () => wall(manyEdges)))), /충돌 형상/);
assert.throws(() => validateStage(stage(Array.from({ length: 20 }, () => wall([[-1000, -1000], [1000, 1000]])))), /벽 검사/);
assert.throws(() => validateStage({ ...stage([]), note: '가'.repeat(Math.ceil(MAX_MAP_FILE_BYTES / 3)) }), /1MB/);
assert.ok(validateStage({ ...stage([]), note: 'a'.repeat(5000) }));
const large = { ...stage([]), note: 'a'.repeat(MAX_MAP_FILE_BYTES - 150) };
const file = exportMap(large);
assert.ok(Buffer.byteLength(file) <= MAX_MAP_FILE_BYTES, 'export envelope and indentation must fit the import limit');
assert.deepEqual(validateStage(JSON.parse(file).stage), validateStage(large));
const boundary = { ...stage([]), zoomY: 0, note: '가' };
const envelopeBytes = value => Buffer.byteLength(JSON.stringify({ format: 'marble-pinball-map', version: 1, stage: value }));
boundary.note += 'a'.repeat(MAX_MAP_FILE_BYTES - envelopeBytes(boundary));
assert.equal(envelopeBytes(boundary), MAX_MAP_FILE_BYTES, 'raw input fits exactly before zoom normalization');
assert.throws(() => validateStage(boundary), /1MB/, 'normalization must not produce a map above the file limit');
assert.throws(() => exportMap(boundary), /1MB/, 'export cannot emit a file that import rejects');
boundary.note = boundary.note.slice(0, -1);
const normalizedBoundary = validateStage(boundary);
assert.equal(normalizedBoundary.zoomY, 95);
assert.equal(envelopeBytes(normalizedBoundary), MAX_MAP_FILE_BYTES, 'normalized map can fit exactly at the byte limit');
const boundaryFile = exportMap(boundary);
assert.equal(Buffer.byteLength(boundaryFile), MAX_MAP_FILE_BYTES);
assert.deepEqual(validateStage(JSON.parse(boundaryFile).stage), normalizedBoundary);
console.log('PASS all builtins, fixture/grid budgets and UTF-8 serialized map size');
