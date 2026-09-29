const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const { blankStage, readSavedMaps, saveMaps, MAPS_KEY, MAPS_BACKUP_PREFIX } = require('../src/model.ts');
const { stages, DEFAULT_MAP_INDEX } = require('../src/data/maps.ts');
const storageFor = (raw) => {
  const values = new Map(raw === undefined ? [] : [[MAPS_KEY, raw]]);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const good = { id: 'good', stage: blankStage() };
const bad = { id: 'bad', stage: { ...blankStage(), goalY: -1 } };
const raw = JSON.stringify([good, bad, null]);
const storage = storageFor(raw);
let invalid = 0;
const recovered = readSavedMaps(storage, count => { invalid = count; });
assert.deepEqual(recovered, [good]);
assert.equal(invalid, 2);
assert.equal(storage.getItem(MAPS_KEY), raw, 'loading must not rewrite damaged data');
const added = { id: 'new', stage: blankStage() };
saveMaps(storage, [...recovered, added]);
assert.deepEqual(readSavedMaps(storage).map(m => m.id), ['good', 'new']);
const backups = () => [...storage.values].filter(([key]) => key.startsWith(MAPS_BACKUP_PREFIX));
assert.equal(backups().length, 1);
assert.equal(backups()[0][1], raw);
saveMaps(storage, [good]);
assert.equal(backups().length, 1, 'healthy saves must not accumulate recovery backups');

const oldNow = Date.now;
Date.now = () => 123;
try {
  for (const damaged of ['broken JSON', '{}']) {
    storage.setItem(MAPS_KEY, damaged);
    assert.throws(() => readSavedMaps(storage));
    saveMaps(storage, [good]);
  }
} finally { Date.now = oldNow; }
assert.ok(backups().some(([, value]) => value === 'broken JSON'));
assert.ok(backups().some(([, value]) => value === '{}'), 'same-time backups must not replace one another');
const denied = storageFor(raw);
const write = denied.setItem;
denied.setItem = (key, value) => {
  if (key !== MAPS_KEY) throw new Error('QuotaExceededError');
  write(key, value);
};
assert.throws(() => saveMaps(denied, [good]), /QuotaExceededError/);
assert.equal(denied.getItem(MAPS_KEY), raw, 'failed backup must not overwrite the original');
const healthy = storageFor(JSON.stringify([good]));
assert.throws(() => saveMaps(healthy, [bad]));
assert.deepEqual(readSavedMaps(healthy), [good], 'invalid edits must not damage existing maps');
console.log('PASS partial map recovery, original backups, failed backups, repeated recovery and invalid saves');

// Both frontends use the same persistence/list implementation; exercise it directly.
const { MapLibrary } = require('../src/map-library.ts');
const store = storageFor();
const library = new MapLibrary(stages);
library.load(store);
const pipeline = stages.findIndex(s => s.title === '네온 파이프라인');
let edited = { ...stages[pipeline], goalY: 220 };
const savedId = library.save(store, edited, 'builtin-' + pipeline);
assert.ok(!savedId.startsWith('builtin-'));
edited = { ...edited, goalY: 210 };
assert.equal(library.save(store, edited, savedId), savedId);
assert.equal(library.list().filter(m => !m.id.startsWith('builtin-')).length, 1);
library.load(store);
assert.equal(library.list().find(m => m.id === savedId).stage.goalY, 210);
assert.equal(library.list().find(m => m.id === 'builtin-' + pipeline).stage.goalY, stages[pipeline].goalY);
const duplicateId = library.save(store, { ...edited, goalY: 200 }, null);
assert.notEqual(duplicateId, savedId, 'same-title maps keep separate identities');
assert.equal(library.list().filter(m => !m.id.startsWith('builtin-')).length, 2);
assert.equal(library.list(edited).at(-1).id, 'preview');
assert.ok(!library.list().some(m => m.id === 'preview'), 'preview never enters the saved list');
const denyWrites = { getItem: store.getItem, setItem() { throw new Error('QuotaExceededError'); } };
assert.throws(() => library.save(denyWrites, { ...edited, goalY: 190 }, savedId));
assert.equal(library.list().find(m => m.id === savedId).stage.goalY, 210, 'failed save leaves in-memory state intact');
assert.throws(() => library.remove(denyWrites, savedId));
assert.ok(library.list().some(m => m.id === savedId));
library.remove(store, duplicateId);
assert.ok(library.list().some(m => m.id === savedId), 'removing another map preserves the selected map');
library.remove(store, savedId);
assert.equal(library.list().length, stages.length);
console.log('PASS shared library save/re-edit/reload/duplicate titles/preview/removal and failed writes');
assert.equal(stages[DEFAULT_MAP_INDEX].title, '네온 분기점');
console.log('PASS shared initial map is neon junction');
assert.equal(stages.length, 16, 'the built-in map list includes reversal ladder and excludes retired maps');
assert.ok(stages.some(stage => stage.title === '네온 크로스웨이'));
assert.ok(stages.some(stage => stage.title === '회전 차고지'));
assert.ok(!stages.some(stage => ['역풍 엘리베이터', '돌풍 갈림길'].includes(stage.title)),
  'removed maps must be absent from both built-in pickers');
assert.ok(!stages.some(stage => ['네온 오비트', '네온 믹서'].includes(stage.title)),
  'retired orbit and mixer maps are absent from every built-in picker');
console.log('PASS retired neon orbit and mixer maps are removed');
