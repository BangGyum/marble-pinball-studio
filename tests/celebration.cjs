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
const { drawCelebration } = require('../src/celebration.ts');
const winners = [
  { name: '하나', rank: 8, color: '#65efda' },
  { name: '둘', rank: 9, color: '#ba9cff' },
  { name: '셋', rank: 10, color: '#ffd279' },
];
function draw(age, order = 'asc', reduced = false, width = 1200, entries = winners, inset = 18) {
  const text = [],
    confetti = [],
    offsets = [],
    clips = [];
  const ctx = {
    beginPath() {},
    rect: (...args) => clips.push(args),
    clip() {},
    save() {},
    restore() {},
    rotate() {},
    translate: (...args) => offsets.push(args),
    measureText: (value) => ({ width: Array.from(value).length * 8 }),
    strokeText() {},
    fillText: (value, x, y) => text.push({ value, x, y }),
    fillRect: (...args) => confetti.push(args),
  };
  drawCelebration(ctx, entries, order, age, width, 600, reduced, inset);
  return { text, confetti, offsets, clips };
}
const opening = draw(0.4);
assert.ok(opening.confetti.length > 0, 'confirmation shows animated confetti');
assert.deepEqual(
  opening.text.filter((t) => t.value.includes('등 ·')).map((t) => t.value),
  ['8등 · 하나', '9등 · 둘', '10등 · 셋']
);
assert.ok(
  opening.text.every((t) => t.x > 900 && t.y >= 240 && t.y <= 420),
  'celebration stays at the right middle'
);
const descending = draw(0.4, 'desc');
assert.deepEqual(
  descending.text.filter((t) => t.value.includes('등 ·')).map((t) => t.value),
  ['10등 · 셋', '9등 · 둘', '8등 · 하나']
);
assert.deepEqual(
  winners.map((w) => w.rank),
  [8, 9, 10],
  'presentation order must not mutate the official results'
);
const settled = draw(2);
assert.equal(settled.confetti.length, 0, 'the animation ends without looping');
assert.ok(
  settled.text.some((t) => t.value === '축하합니다!'),
  'results stay visible after the animation'
);
const reduced = draw(0.1, 'asc', true);
assert.equal(reduced.confetti.length, 0);
assert.deepEqual(reduced.offsets, [[0, 0]], 'reduced motion shows stationary results');
assert.equal(draw(0.4, 'asc', false, 1200, []).text.length, 0, 'no celebration before winners are confirmed');
const compact = draw(2, 'asc', false, 360, [{ ...winners[0], name: '아주긴이름'.repeat(8) }]);
assert.ok(
  compact.text.every((t) => Array.from(t.value).length * 8 <= 102),
  'long names fit the narrow celebration area'
);
const many = draw(
  2,
  'asc',
  false,
  1200,
  Array.from({ length: 300 }, (_, i) => ({ ...winners[0], rank: i + 1 }))
);
assert.equal(
  many.text.filter((t) => t.value.includes('등 ·')).length,
  5,
  'large draws stay within the available height'
);
assert.ok(many.text.some((t) => t.value.startsWith('외 295명')));
for (const [width, inset] of [
  [1200, 210],
  [360, 140],
  [260, 120],
]) {
  for (const age of [0.1, 0.4, 2]) {
    const result = draw(age, 'asc', false, width, winners, inset);
    const edge = width - inset;
    assert.ok(
      result.text.every((t) => t.x === edge),
      'results anchor left of the ranking list'
    );
    assert.ok(
      result.text.every((t) => t.x - Array.from(t.value).length * 8 >= 0),
      'results fit narrow screens'
    );
    assert.equal(result.clips[0][2], edge + 4, 'confetti and entrance movement cannot cross into rankings');
  }
}
console.log('PASS celebration direction, placement, lifecycle, reduced motion, long names and large draws');

const pending = draw(
  0.4,
  'desc',
  false,
  1200,
  winners.slice(1).map(({ rank, ...ball }) => ball)
);
assert.ok(pending.text.some((t) => t.value === '당첨 확정 · 2명'));
assert.ok(pending.text.some((t) => t.value === '축하합니다!'));
assert.deepEqual(
  pending.text.filter((t) => t.value.startsWith('당첨 · ')).map((t) => t.value),
  ['당첨 · 셋', '당첨 · 둘']
);
assert.ok(pending.text.every((t) => !t.value.includes('undefined') && !t.value.includes('등 ·')));
