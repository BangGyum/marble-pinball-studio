const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 9 } }).outputText, file);
const { Recorder } = require('../src/recorder.ts');
assert.equal(Recorder.supported({}), false);
let trackStops = 0;
const downloads = [];
const revoked = [];
global.MediaRecorder = class {
  static isTypeSupported(type) { return type === 'video/webm;codecs=vp8'; }
  constructor(stream, options) { this.mimeType = options.mimeType; this.state = 'inactive'; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['frame'], { type: this.mimeType }) }); this.onstop(); }
};
global.document = { body: { append() {} }, createElement() { return { click() { downloads.push(this.download); }, remove() {} }; } };
global.URL.createObjectURL = blob => { assert.equal(blob.type, 'video/webm;codecs=vp8'); return 'blob:test'; };
global.URL.revokeObjectURL = url => revoked.push(url);
global.setTimeout = callback => { callback(); return 1; };
const canvas = { captureStream: fps => { assert.equal(fps, 30); return { getTracks: () => [{ stop: () => trackStops++ }] }; } };
const recorder = new Recorder();
recorder.start(canvas); recorder.start(canvas); recorder.stop(); recorder.stop();
recorder.start(canvas); recorder.stop();
assert.equal(downloads.length, 2); assert.ok(downloads.every(name => name.endsWith('.webm')));
assert.equal(trackStops, 2); assert.equal(revoked.length, 2);
console.log('PASS recorder MIME selection, repeat start/stop, track cleanup and download lifecycle (mock MediaRecorder)');
