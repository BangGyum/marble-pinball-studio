const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { Editor } = require('../src/editor.ts');
const { validateStage, MAX_MAP_FILE_BYTES } = require('../src/model.ts');

// Exercise listeners installed by the actual Editor constructor, with only DOM surfaces stubbed.
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { events: new Map(), value: '', style: {}, textContent: '',
    addEventListener(type, listener) { this.events.set(type, listener); },
    getContext() { return {}; }, querySelectorAll() { return []; }, click() {}, close() {} });
  return nodes.get(id);
};
global.document = { getElementById: node, createElement: () => ({ click() {} }) };
global.window = { addEventListener() {} };
global.confirm = () => true;
const originalTimeout = global.setTimeout, originalCreate = URL.createObjectURL;
let exported;
global.setTimeout = () => 0;
URL.createObjectURL = blob => { exported = blob; return 'blob:editor-import-test'; };
const editor = new Editor({ list: () => [], save() { throw new Error('import must not save'); }, remove() {}, play() {} });
const input = node('map-file'), change = input.events.get('change');
const envelope = stage => ({ format: 'marble-pinball-map', version: 1, stage });
const empty = { title: 'Import test', goalY: 100, zoomY: 95, entities: [] };
async function importText(text, size = Buffer.byteLength(text)) {
  let reads = 0;
  input.files = [{ size, async text() { reads++; return text; } }];
  input.value = 'selected.json';
  await change();
  assert.equal(input.value, '', 'the file input is cleared after success or rejection');
  return reads;
}
async function rejected(data, expectedMessage) {
  const previous = editor.stage;
  assert.equal(await importText(JSON.stringify(data)), 1, 'content validation runs after reading');
  assert.strictEqual(editor.stage, previous, 'a rejected file must preserve the current draft');
  assert.match(node('toast').textContent, expectedMessage);
}

(async () => {
  try {
    const legacy = { ...empty, title: 'Existing exported map', art: { style: 'rapids',
      contours: Array.from({ length: 20 }, (_, contour) => Array.from({ length: 1000 }, (_, i) =>
        [12.123456789 + contour / 10, 10.123456789 + i / 100])) } };
    const canonical = validateStage(legacy), pretty = JSON.stringify(envelope(canonical), null, 2);
    assert.equal(Buffer.byteLength(pretty), 1_570_314, 'reproduce the previous exporter output');
    assert.equal(Buffer.byteLength(JSON.stringify(envelope(canonical))), 609_880);
    assert.equal(await importText(pretty), 1, 'a legacy pretty file below 2MB is read');
    assert.deepEqual(editor.stage, canonical, 'legacy formatting must not invalidate a currently valid map');
    assert.equal(editor.dirty, true, 'imported maps remain an unsaved draft');
    assert.equal(editor.id, null);

    const previous = editor.stage;
    assert.equal(await importText('unread', 2_000_001), 0, 'raw files over 2MB are rejected before file.text');
    assert.strictEqual(editor.stage, previous);
    assert.match(node('toast').textContent, /2MB/);
    const small = JSON.stringify(envelope(empty));
    assert.equal(await importText(small + ' '.repeat(2_000_000 - Buffer.byteLength(small))), 1,
      'the original 2MB limit is inclusive');
    assert.deepEqual(editor.stage, validateStage(empty));

    await rejected(envelope({ ...empty, note: 'a'.repeat(MAX_MAP_FILE_BYTES) }), /1MB/);
    await rejected({ ...envelope(empty), format: 'other-map' }, /내보낸 맵/);
    await rejected({ ...envelope(empty), version: 2 }, /내보낸 맵/);
    const wall = points => ({ position: { x: 0, y: 0 }, type: 'static',
      shape: { type: 'polyline', rotation: 0, points }, props: { density: 1, restitution: 0, angularVelocity: 0 } });
    await rejected(envelope({ ...empty, entities: Array.from({ length: 12 }, () =>
      wall(Array.from({ length: 999 }, (_, i) => [i / 100, i % 2]))) }), /충돌 형상/);
    await rejected(envelope({ ...empty, entities: Array.from({ length: 20 }, () =>
      wall([[-1000, -1000], [1000, 1000]])) }), /벽 검사/);

    await importText(pretty);
    node('editor-export').events.get('click')();
    assert.ok(exported.size <= MAX_MAP_FILE_BYTES, 'new exports keep the compact 1MB budget');
    const file = await exported.text();
    assert.equal(await importText(file), 1);
    assert.deepEqual(editor.stage, canonical, 'actual export and import events round-trip the legacy map');
    console.log('PASS legacy 2MB editor imports, pre-read raw limit, compact/geometry budgets, format/version and export round-trip');
  } finally {
    global.setTimeout = originalTimeout;
    URL.createObjectURL = originalCreate;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
