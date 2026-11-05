const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 9 } }).outputText,
    file
  );
const { Recorder } = require('../src/recorder.ts');
assert.equal(Recorder.supported({}), false);
let trackStops = 0;
let failStart = false;
let lastRecorder;
const downloads = [];
const revoked = [];
global.MediaRecorder = class {
  static isTypeSupported(type) {
    return type === 'video/webm;codecs=vp8';
  }
  constructor(_stream, options) {
    this.mimeType = options.mimeType;
    this.state = 'inactive';
    lastRecorder = this;
  }
  start() {
    if (failStart) throw new Error('start failed');
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable({ data: new Blob(['frame'], { type: this.mimeType }) });
    this.onstop();
  }
};
global.document = {
  body: { append() {} },
  createElement() {
    return {
      click() {
        downloads.push(this.download);
      },
      remove() {},
    };
  },
};
global.URL.createObjectURL = (blob) => {
  assert.equal(blob.type, 'video/webm;codecs=vp8');
  return 'blob:test';
};
global.URL.revokeObjectURL = (url) => revoked.push(url);
global.setTimeout = (callback) => {
  callback();
  return 1;
};
const canvas = {
  captureStream: (fps) => {
    assert.equal(fps, 30);
    return { getTracks: () => [{ stop: () => trackStops++ }] };
  },
};
const recorder = new Recorder();
recorder.start(canvas);
recorder.start(canvas);
recorder.stop();
recorder.stop();
recorder.start(canvas);
recorder.stop();
assert.equal(downloads.length, 2);
assert.ok(downloads.every((name) => name.endsWith('.webm')));
assert.equal(trackStops, 2);
assert.equal(revoked.length, 2);
failStart = true;
assert.throws(() => recorder.start(canvas), /start failed/);
assert.equal(trackStops, 3, 'a failed start stops its capture track');
failStart = false;
let unexpectedStops = 0;
const interrupted = new Recorder(() => unexpectedStops++);
interrupted.start(canvas);
lastRecorder.stop();
assert.equal(unexpectedStops, 1, 'unexpected stops notify the view');
interrupted.start(canvas);
assert.equal(lastRecorder.state, 'recording', 'recording can restart after an unexpected stop');
interrupted.stop();
assert.equal(unexpectedStops, 1, 'an intentional stop does not notify');
interrupted.start(canvas);
const oldRecorder = lastRecorder;
oldRecorder.stop = function () {
  this.state = 'inactive';
};
interrupted.stop();
interrupted.start(canvas);
const newRecorder = lastRecorder;
oldRecorder.onstop();
assert.equal(unexpectedStops, 1, 'a delayed stop event from an old recording is ignored');
interrupted.start(canvas);
assert.equal(lastRecorder, newRecorder, 'an old stop event does not clear the current recording');
interrupted.stop();
console.log(
  'PASS recorder MIME selection, repeat start/stop, track cleanup and download lifecycle (mock MediaRecorder)'
);
