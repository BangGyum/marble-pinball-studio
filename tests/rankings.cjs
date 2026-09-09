const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
const { getStandings, Rankings } = require('../src/rankings.ts');

// Small DOM stand-in: verify real renderer output and safe names without browser automation.
class Element {
  children = [];
  style = {};
  dataset = {};
  attributes = {};
  replacements = 0;
  moves = 0;
  attributeWrites = 0;
  parentElement = null;
  get firstElementChild() { return this.children[0] ?? null; }
  get nextElementSibling() {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  append(...children) {
    children.forEach(child => { child.parentElement = this; });
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children.forEach(child => { child.parentElement = null; });
    children.forEach(child => { child.parentElement = this; });
    this.children = children;
    this.replacements++;
  }
  insertBefore(item, next) {
    if (item.parentElement) item.parentElement.children.splice(item.parentElement.children.indexOf(item), 1);
    const index = next ? this.children.indexOf(next) : this.children.length;
    assert.ok(index >= 0);
    this.children.splice(index, 0, item);
    item.parentElement = this;
    this.moves++;
  }
  setAttribute(key, value) {
    this.attributeWrites++;
    this.attributes[key] = value;
  }
}
const nodes = new Map();
global.document = {
  createElement: () => new Element(),
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  },
};
const ball = (id, y, name = '같은 이름') => ({
  id,
  y,
  x: 10,
  name,
  color: 'hsl(' + id * 67 + ' 85% 72%)',
  angle: 0,
  stuck: 0,
});
const race = {
  state: 'ready',
  balls: [ball(0, 12, '<img src=x onerror=alert(1)>'), ball(1, 28), ball(2, 28), ball(3, 20)],
  arrivals: [],
};
const panel = new Rankings();
panel.update(race);
assert.deepEqual(getStandings(race), []);
const list = nodes.get('ranking-list');
assert.equal(list.hidden, true);
race.state = 'running';
assert.deepEqual(
  getStandings(race).map((b) => b.id),
  [1, 2, 3, 0]
);
assert.deepEqual(
  race.balls.map((b) => b.id),
  [0, 1, 2, 3],
  'sorting must not mutate physics order'
);
panel.update(race);
assert.equal(nodes.size, 1, 'standings use one list');
assert.equal(list.children.length, 4, 'identical names remain separate marbles');
assert.ok(
  list.children.every((item) => item.children.length === 2),
  'rows contain only the marble color and name'
);
assert.equal(list.children[0].children[0].style.backgroundColor, race.balls[1].color);
assert.equal(list.children[3].children[1].textContent, race.balls[0].name, 'names are plain text');
assert.equal(list.children[3].children[1].children.length, 0);
assert.ok(list.children.every((item) => item.dataset.finished === 'false'));
const leader = list.children[0],
  overtaker = list.children[3];
const initialReplacements = list.replacements;
race.balls[0].y = 33;
panel.update(race);
assert.equal(list.children[0], overtaker, 'overtakes reorder existing colored rows');
assert.equal(overtaker.value, 1);
assert.equal(list.replacements, initialReplacements, 'an overtake must not detach the whole list');
assert.equal(list.moves, 1, 'a single overtake moves only the displaced row');
const replacements = list.replacements;
const unchangedWrites = list.children.map(item => item.attributeWrites);
const unchangedMoves = list.moves;
race.state = 'paused';
panel.update(race);
assert.equal(list.replacements, replacements, 'unchanged standings preserve the scrollable list');
assert.equal(list.moves, unchangedMoves, 'unchanged order performs no DOM moves');
assert.deepEqual(list.children.map(item => item.attributeWrites), unchangedWrites, 'unchanged ranks/status perform no attribute writes');

race.balls[1].rank = 1;
race.arrivals.push(race.balls[1]);
race.balls[1].y = 100;
panel.update(race);
assert.deepEqual(
  getStandings(race).map((b) => b.id),
  [1, 0, 2, 3]
);
assert.equal(list.children[0], leader, 'the finished marble stays in the same list');
assert.equal(leader.dataset.finished, 'true', 'finished status enables bold styling');
assert.equal(leader.attributes['aria-label'], '1등 같은 이름 · 도착');
assert.ok(list.children.slice(1).every((item) => item.dataset.finished === 'false'));
race.balls[3].y = 150;
panel.update(race);
assert.deepEqual(
  getStandings(race).map((b) => b.id),
  [1, 3, 0, 2],
  'active marbles cannot overtake a fixed arrival'
);
assert.deepEqual(
  list.children.map((item) => item.value),
  [1, 2, 3, 4]
);
for (const id of [2, 0, 3]) {
  race.balls[id].rank = race.arrivals.length + 1;
  race.arrivals.push(race.balls[id]);
}
race.state = 'finished';
panel.update(race);
assert.equal(list.hidden, false);
assert.deepEqual(
  getStandings(race).map((b) => b.id),
  [1, 2, 0, 3],
  'final order follows arrivals, not positions'
);
assert.ok(list.children.every((item) => item.dataset.finished === 'true'));
panel.update(race);
assert.equal(list.children.length, 4, 'results remain available after the race');

race.state = 'ready';
race.balls = [ball(0, 5, '새 참가자')];
race.arrivals = [];
panel.update(race);
assert.equal(list.children.length, 0, 'reset clears old results');
assert.equal(list.hidden, true);
race.state = 'running';
panel.update(race);
assert.equal(list.children[0].children[1].textContent, '새 참가자', 'a reused id must not keep an old name');
assert.equal(list.children[0].dataset.finished, 'false', 'reset clears finished styling');
race.balls = Array.from({ length: 300 }, (_, id) => ball(id, id, '참가자 ' + id));
panel.update(race);
assert.equal(list.children.length, 300, 'all participants remain in the scrollable list');
assert.equal(list.children[299].value, 300);
for (let round = 0; round < 12; round++) {
  race.balls.forEach((b, i) => { b.y = (i * 137 + round * 31) % 307; });
  panel.update(race);
  assert.deepEqual(list.children.map(item => item.children[1].textContent), getStandings(race).map(b => b.name));
  assert.deepEqual(list.children.map(item => item.value), Array.from({ length: 300 }, (_, i) => i + 1));
}
console.log('PASS unified rankings, fixed arrivals, finished styling, colors, safe names, reset and 300 marbles');
