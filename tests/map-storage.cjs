const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
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

// Exercise the actual map-list and editor callbacks in both frontends without touching browser storage.
for (const file of ['src/index.ts', 'src/lan/client.ts']) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const declarations = source.statements.filter(ts.isVariableStatement).flatMap(s => [...s.declarationList.declarations]);
  const allMaps = declarations.find(d => d.name.getText(source) === 'allMaps').getText(source);
  const editor = declarations.find(d => d.name.getText(source) === 'editor').initializer.arguments[0].getText(source);
  const store = storageFor();
  const ctx = { stages, DEFAULT_MAP_INDEX, saved: [], customStage: undefined, currentStage: stages[DEFAULT_MAP_INDEX],
    mapSelect: { value: '' }, localStorage: store, saveMaps, crypto: require('node:crypto'),
    refreshMaps(id) { if (id !== undefined) ctx.mapSelect.value = id; }, prepare() {}, showGame() {},
    prepareUI() { ctx.transmitted = vm.runInContext('allMaps().find(m => m.id === mapSelect.value)?.stage', ctx); },
  };
  vm.createContext(ctx);
  vm.runInContext(ts.transpileModule('const ' + allMaps + '; const actions = ' + editor + ';', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, ctx);
  const pipeline = stages.findIndex(s => s.title === '네온 파이프라인');
  ctx.edited = { ...stages[pipeline], goalY: 220 };
  ctx.mapSelect.value = 'builtin-' + pipeline;
  vm.runInContext('actions.save(edited, mapSelect.value)', ctx);
  const savedId = ctx.mapSelect.value;
  assert.ok(!savedId.startsWith('builtin-'));
  ctx.edited = { ...ctx.edited, goalY: 210 };
  vm.runInContext('actions.save(edited, mapSelect.value)', ctx);
  assert.equal(ctx.mapSelect.value, savedId);
  assert.equal(ctx.saved.length, 1, file + ': re-edit must update the same map');
  ctx.saved = readSavedMaps(store);
  assert.equal(vm.runInContext('allMaps().find(m => m.id === mapSelect.value).stage.goalY', ctx), 210);
  assert.equal(vm.runInContext('allMaps().find(m => m.id === "builtin-' + pipeline + '").stage.goalY', ctx), stages[pipeline].goalY);
  if (file.includes('/lan/')) assert.equal(ctx.transmitted.goalY, 210, 'LAN must send the saved selection');
  ctx.saved.push({ id: 'legacy', stage: { ...ctx.edited, goalY: 200 } });
  assert.equal(vm.runInContext('allMaps().filter(m => !m.id.startsWith("builtin-")).length', ctx), 2,
    'existing same-title maps remain accessible by ID');
  vm.runInContext('actions.remove("legacy")', ctx);
  assert.equal(ctx.mapSelect.value, savedId, 'deleting another map must preserve selection');
  vm.runInContext('actions.remove(mapSelect.value)', ctx);
  assert.equal(ctx.mapSelect.value, 'builtin-' + DEFAULT_MAP_INDEX);
  console.log('PASS ' + file + ': save, re-edit, reload, duplicate titles and removal');
}
assert.equal(stages[DEFAULT_MAP_INDEX].title, '네온 분기점');
console.log('PASS shared initial map is neon junction');
assert.equal(stages.length, 15, 'the built-in map list includes switchback express, roundhouse and spring lab, and excludes retired maps');
assert.ok(stages.some(stage => stage.title === '네온 크로스웨이'));
assert.ok(stages.some(stage => stage.title === '회전 차고지'));
assert.ok(!stages.some(stage => ['역풍 엘리베이터', '돌풍 갈림길'].includes(stage.title)),
  'removed maps must be absent from both built-in pickers');
assert.ok(!stages.some(stage => ['네온 오비트', '네온 믹서'].includes(stage.title)),
  'retired orbit and mixer maps are absent from every built-in picker');
console.log('PASS retired neon orbit and mixer maps are removed');
