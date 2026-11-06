const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto'),
  ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file
  );
const { mantaContact, mantaSurface, MANTA_OUTLINE } = require('../src/manta-hitbox.ts'),
  { MANTA_SPRITE_RECT: rect, MANTA_SPRITE_WIDTH: width } = require('../src/data/manta-outline.ts');
const image = require('./png-rgba.cjs')('src/assets/effects/manta-v1/manta.png');
const opaque = (x, y) =>
  x >= 0 && y >= 0 && x < image.width && y < image.height && image.pixels[(y * image.width + x) * 4 + 3] >= 128;
const local = (x, y) => ({
  x: ((x + 0.5 - rect[0] - rect[2] / 2) * width) / rect[2],
  y: ((y + 0.5 - rect[1] - rect[3] / 2) * width) / rect[2],
});
const world = (v, p) => ({
  x: p.x + p.direction * p.scale * (Math.cos(p.angle) * v.x - Math.sin(p.angle) * v.y),
  y: p.y + p.scale * (Math.sin(p.angle) * v.x + Math.cos(p.angle) * v.y),
});
const digest = crypto.createHash('sha256').update(image.png).digest('hex');
assert.ok(fs.readFileSync('src/data/manta-outline.ts', 'utf8').includes(digest));
let alphaSamples = 0;
for (let y = 3; y < image.height - 3; y += 5)
  for (let x = 3; x < image.width - 3; x += 5) {
    const solid = opaque(x, y);
    if ([-2, 0, 2].some((dy) => [-2, 0, 2].some((dx) => opaque(x + dx, y + dy) !== solid))) continue;
    const p = local(x, y);
    assert.equal(!!mantaSurface(p.x, p.y, 1e-7), solid, `source-alpha mismatch at ${x},${y}`);
    alphaSamples++;
  }
assert.ok(alphaSamples > 50000);
let contacts = 0;
for (const scale of [1.5, 3, 6])
  for (const direction of [-1, 1])
    for (const angle of [-2.4, -1, 0, 0.8, 2.3]) {
      const pose = { x: 13, y: 20, direction, angle, scale };
      for (const [x, y] of MANTA_OUTLINE) {
        const ball = world({ x, y }, pose),
          contact = mantaContact(ball, pose);
        assert.ok(contact, 'every wing, tail and head edge remains solid after transforming');
        assert.ok(Math.abs(Math.hypot(contact.normalX, contact.normalY) - 1) < 1e-8);
        contacts++;
      }
      for (const pixel of [
        [400, 650],
        [450, 250],
        [1750, 100],
      ]) {
        assert.equal(opaque(...pixel), false);
        assert.equal(mantaContact(world(local(...pixel), pose), pose), undefined, 'transparent space stays empty');
      }
      const right = Math.max(...MANTA_OUTLINE.map((v) => v[0])),
        point = MANTA_OUTLINE.find((v) => v[0] === right),
        normal = { x: Math.cos(angle) * direction, y: Math.sin(angle) },
        q = world({ x: point[0], y: point[1] }, pose);
      assert.ok(mantaContact({ x: q.x + normal.x * 0.24, y: q.y + normal.y * 0.24 }, pose));
      assert.equal(mantaContact({ x: q.x + normal.x * 0.26, y: q.y + normal.y * 0.26 }, pose), undefined);
    }
// Independent all-edge search checks the spatial index around concave mouth/wing/tail gaps.
let seed = 1449;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let i = 0; i < 6000; i++) {
  const x = random() * 5 - 2.5,
    y = random() * 3 - 1.5,
    radius = 0.04 + random() * 0.2;
  let inside = false,
    nearest = Infinity;
  for (let j = 0; j < MANTA_OUTLINE.length; j++) {
    const [ax, ay] = MANTA_OUTLINE[j],
      [bx, by] = MANTA_OUTLINE[(j + 1) % MANTA_OUTLINE.length],
      dx = bx - ax,
      dy = by - ay,
      t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) inside = !inside;
    nearest = Math.min(nearest, (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2);
  }
  const actual = mantaSurface(x, y, radius);
  assert.equal(!!actual, inside || nearest < radius * radius);
  if (actual) assert.ok(Math.abs((x - actual.x) ** 2 + (y - actual.y) ** 2 - nearest) < 1e-9);
}
console.log(
  `PASS manta: ${alphaSamples} source-alpha samples, ${contacts} transformed edge contacts, 6000 reference cases`
);
