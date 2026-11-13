const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/index.ts', 'utf8');
const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.ES2022);
const start = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'startRace');
assert.ok(start, 'standalone start handler exists');
const code = ts.transpileModule(start.getText(file), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const stage = { title: 'Prepared map' };
const names = { value: '가,나,다' };
const game = {
  state: 'ready',
  stage,
  prepareCalls: 0,
  startCalls: 0,
  prepare(nextStage, list) {
    this.prepareCalls++;
    this.stage = nextStage;
    this.balls = list;
    this.state = 'ready';
  },
  start() {
    this.startCalls++;
    this.state = 'running';
  },
};
const context = vm.createContext({
  initialized: true,
  gallery: { transition: { finish() {} } },
  game,
  currentStage: stage,
  names,
  preparedNames: names.value,
  inputTimer: 1,
  clearTimeout() {},
  dolphinPanel: { setStage() {}, value: { enabled: false, rows: [], interval: 20 } },
  parseNames: (text) => text.split(',').filter(Boolean),
  updateWinnerCount() {},
  mode: { value: 'asc' },
  winnerCount: { value: '1' },
  winningRange: () => [1, 1],
  record: { checked: false },
  updateStandings() {},
  setPanelCollapsed() {},
  lockControls() {},
});
vm.runInContext(code, context);
vm.runInContext('startRace()', context);
assert.equal(game.prepareCalls, 0, 'starting keeps the already shuffled preview positions');
assert.equal(game.startCalls, 1);

game.state = 'ready';
names.value = '가,나,다,라';
vm.runInContext('startRace()', context);
assert.equal(game.prepareCalls, 1, 'a name edit before debounce prepares the new roster');
assert.deepEqual(game.balls, ['가', '나', '다', '라']);

game.state = 'finished';
vm.runInContext('startRace()', context);
assert.equal(game.prepareCalls, 2, 'starting again after a finished race prepares a fresh round');
console.log('PASS standalone start preserves prepared shuffle and refreshes stale or finished rounds');
