const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript'),
  zlib = require('node:zlib');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
const { dolphinBounce } = require('../src/dolphin.ts');
const { dolphinSurface, DOLPHIN_OUTLINE } = require('../src/dolphin-hitbox.ts');
const { DOLPHIN_SPRITE_RECT: rect, DOLPHIN_SPRITE_WIDTH: width } = require('../src/data/dolphin-outline.ts');
// Decode the actual source asset with Node builtins so CI checks the image independently of the collider.
const png = fs.readFileSync('src/assets/effects/dolphin-v1/dolphin-tail-fixed.png'),
  idat = [];
let imageWidth, imageHeight;
for (let offset = 8; offset < png.length; ) {
  const length = png.readUInt32BE(offset),
    type = png.toString('ascii', offset + 4, offset + 8),
    data = png.subarray(offset + 8, offset + 8 + length);
  if (type === 'IHDR') {
    imageWidth = data.readUInt32BE(0);
    imageHeight = data.readUInt32BE(4);
    assert.equal(data[8], 8);
    assert.equal(data[9], 6);
    assert.equal(data[12], 0);
  }
  if (type === 'IDAT') idat.push(data);
  offset += length + 12;
}
const raw = zlib.inflateSync(Buffer.concat(idat)),
  stride = imageWidth * 4,
  pixels = new Uint8Array(stride * imageHeight);
for (let y = 0; y < imageHeight; y++) {
  const filter = raw[y * (stride + 1)];
  assert.ok(filter <= 4);
  for (let x = 0; x < stride; x++) {
    const at = y * stride + x,
      a = x >= 4 ? pixels[at - 4] : 0,
      b = y ? pixels[at - stride] : 0,
      c = y && x >= 4 ? pixels[at - stride - 4] : 0;
    let predictor = 0;
    if (filter === 1) predictor = a;
    if (filter === 2) predictor = b;
    if (filter === 3) predictor = Math.floor((a + b) / 2);
    if (filter === 4) {
      const p = a + b - c,
        da = Math.abs(p - a),
        db = Math.abs(p - b),
        dc = Math.abs(p - c);
      predictor = da <= db && da <= dc ? a : db <= dc ? b : c;
    }
    pixels[at] = raw[y * (stride + 1) + 1 + x] + predictor;
  }
}
const opaque = (x, y) =>
  x >= 0 && y >= 0 && x < imageWidth && y < imageHeight && pixels[(y * imageWidth + x) * 4 + 3] >= 128;
const local = ([x, y]) => ({
  x: ((x + 0.5 - rect[0] - rect[2] / 2) * width) / rect[2],
  y: ((y + 0.5 - rect[1] - rect[3] / 2) * width) / rect[2],
});
const world = (v, p) => ({
  x: p.direction * (Math.cos(p.angle) * v.x - Math.sin(p.angle) * v.y) * p.scale + p.x,
  y: (Math.sin(p.angle) * v.x + Math.cos(p.angle) * v.y) * p.scale + p.y,
});
const parts = [
  [950, 160],
  [165, 655],
  [1670, 515],
  [1100, 675],
];
for (const pixel of parts) assert.ok(opaque(...pixel), 'feature probe lies on the source dolphin');
let transformed = 0;
for (const scale of [1.5, 3, 6])
  for (const direction of [1, -1])
    for (const angle of [-2.4, -1, 0, 0.8, 2.3]) {
      const p = { x: 13, y: 20, angle, direction, scale, waterY: 100 };
      for (const pixel of parts) {
        const position = world(local(pixel), p);
        assert.ok(
          dolphinBounce({ ...position, vx: 0, vy: 0 }, p, { vx: 0, vy: 0, omega: 0 }),
          `opaque sprite feature ${pixel} collides at scale=${scale}, direction=${direction}, angle=${angle}`
        );
        transformed++;
      }
      const pixel = [400, 650],
        radius = ((0.25 / scale) * rect[2]) / width;
      let overlapsSprite = false;
      for (let y = -Math.ceil(radius); y <= Math.ceil(radius); y++)
        for (let x = -Math.ceil(radius); x <= Math.ceil(radius); x++)
          if (x * x + y * y <= radius * radius && opaque(pixel[0] + x, pixel[1] + y)) overlapsSprite = true;
      if (!overlapsSprite)
        assert.equal(
          dolphinBounce({ ...world(local(pixel), p), vx: 0, vy: 1 }, p, { vx: 0, vy: 0, omega: 0 }),
          undefined,
          'a marble wholly in the transparent tail gap never collides'
        );
    }
console.log(`PASS ${transformed} source-alpha feature contacts, size/rotation/mirror and transparent-gap rejection`);
const digest = require('node:crypto').createHash('sha256').update(png).digest('hex');
assert.ok(
  fs.readFileSync('src/data/dolphin-outline.ts', 'utf8').includes(digest),
  'outline provenance matches the actual sprite asset'
);
let checked = 0,
  edgeSamples = 0;
for (let y = rect[1] + 3; y < rect[1] + rect[3] - 3; y += 4)
  for (let x = rect[0] + 3; x < rect[0] + rect[2] - 3; x += 4) {
    const filled = opaque(x, y);
    let boundary = false;
    for (let dy = -2; dy <= 2 && !boundary; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (opaque(x + dx, y + dy) !== filled) {
          boundary = true;
          break;
        }
    if (boundary) {
      edgeSamples++;
      continue;
    }
    const point = local([x, y]);
    assert.equal(
      !!dolphinSurface(point.x, point.y, 1e-8),
      filled,
      `sprite/collider disagree away from the 2px contour tolerance at ${x},${y}`
    );
    checked++;
  }
for (const pixel of parts) {
  const p = { x: 0, y: 0, direction: 1, scale: 3, angle: 0.7, waterY: 100 },
    point = world(local(pixel), p);
  assert.equal(
    dolphinBounce({ ...point, vx: 0, vy: 0 }, { ...p, waterY: point.y - 1 }, { vx: 0, vy: 0, omega: 0 }),
    undefined,
    'a marble wholly below the clipping waterline cannot hit a hidden part of the sprite'
  );
}
assert.ok(DOLPHIN_OUTLINE.length < 200, 'the exact outline stays bounded for 100-marble races');
console.log(
  `PASS ${checked} source-alpha interior/exterior samples outside the 2px edge tolerance, ${edgeSamples} boundary samples and hidden-surface rejection`
);
let opaqueChecks = 0;
for (let y = rect[1]; y < rect[1] + rect[3]; y++)
  for (let x = rect[0]; x < rect[0] + rect[2]; x++)
    if (opaque(x, y)) {
      const point = local([x, y]);
      assert.ok(
        dolphinSurface(point.x, point.y, 0.25 / 6),
        `opaque source pixel ${x},${y} must contact a marble even at maximum dolphin size`
      );
      opaqueChecks++;
    }
console.log(`PASS all ${opaqueChecks} opaque source pixels contact a marble at the maximum 200% size`);
// An unindexed reference verifies that the spatial grid never omits a nearer visible edge.
const reference = (x, y, radius, clip) => {
  let inside = false,
    nearest = Infinity;
  for (let i = 0; i < DOLPHIN_OUTLINE.length; i++) {
    let [ax, ay] = DOLPHIN_OUTLINE[i],
      [bx, by] = DOLPHIN_OUTLINE[(i + 1) % DOLPHIN_OUTLINE.length];
    if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) inside = !inside;
    const a = clip.x * ax + clip.y * ay - clip.limit,
      b = clip.x * bx + clip.y * by - clip.limit;
    if (a > 0 && b > 0) continue;
    const t = a / (a - b);
    if (a > 0) {
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
    } else if (b > 0) {
      bx = ax + (bx - ax) * t;
      by = ay + (by - ay) * t;
    }
    const dx = bx - ax,
      dy = by - ay,
      u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, (x - ax - u * dx) ** 2 + (y - ay - u * dy) ** 2);
  }
  return Number.isFinite(nearest) && ((inside && clip.x * x + clip.y * y <= clip.limit) || nearest < radius * radius)
    ? nearest
    : undefined;
};
let seed = 9173;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let i = 0; i < 6000; i++) {
  const x = random() * 5 - 2.5,
    y = random() * 2 - 1,
    radius = 0.25 / (1 + random() * 5),
    angle = random() * Math.PI * 2;
  const clip = { x: Math.sin(angle), y: Math.cos(angle), limit: random() * 2 - 1 };
  const expected = reference(x, y, radius, clip),
    actual = dolphinSurface(x, y, radius, clip);
  assert.equal(!!actual, expected !== undefined, `grid/clipping contact mismatch at ${i}`);
  if (actual) {
    assert.ok(
      Math.abs((x - actual.x) ** 2 + (y - actual.y) ** 2 - expected) < 1e-9,
      'grid chooses the nearest visible surface'
    );
    assert.ok(clip.x * actual.x + clip.y * actual.y <= clip.limit + 1e-9, 'contact stays above the waterline');
    assert.ok(Math.abs(Math.hypot(actual.nx, actual.ny) - 1) < 1e-8, 'surface normal is a unit vector');
  }
}
const edgePoint = {
  x: ((1221.5 - rect[0] - rect[2] / 2) * width) / rect[2],
  y: ((226 - rect[1] - rect[3] / 2) * width) / rect[2],
};
const length = Math.hypot(103, 2),
  normal = { x: 2 / length, y: -103 / length },
  tangent = { x: -normal.y, y: normal.x };
const rotate = (v, p) => ({
  x: p.direction * (Math.cos(p.angle) * v.x - Math.sin(p.angle) * v.y),
  y: Math.sin(p.angle) * v.x + Math.cos(p.angle) * v.y,
});
for (const scale of [1.5, 3, 6])
  for (const direction of [1, -1])
    for (const angle of [-2.4, -1, 0, 0.8, 2.3]) {
      const p = { x: 13, y: 20, angle, direction, scale, waterY: 100 },
        n = rotate(normal, p),
        t = rotate(tangent, p),
        q = world(edgePoint, p);
      for (const motion of [
        { vx: 0, vy: 0, omega: 0 },
        { vx: 5, vy: -8, omega: 0.8 },
      ]) {
        const wall = { vx: motion.vx - motion.omega * (q.y - p.y), vy: motion.vy + motion.omega * (q.x - p.x) };
        const ball = {
          x: q.x + n.x * 0.24,
          y: q.y + n.y * 0.24,
          vx: wall.vx - n.x * 10 + t.x * 3,
          vy: wall.vy - n.y * 10 + t.y * 3,
        };
        const hit = dolphinBounce(ball, p, motion);
        assert.ok(hit?.hit);
        assert.ok(
          Math.abs((hit.vx - wall.vx) * n.x + (hit.vy - wall.vy) * n.y - 5.5) < 1e-6,
          'reflection follows the sprite-edge normal'
        );
        assert.ok(
          Math.abs((hit.vx - wall.vx) * t.x + (hit.vy - wall.vy) * t.y - 3) < 1e-6,
          'tangential speed is preserved'
        );
        assert.equal(
          dolphinBounce({ ...ball, x: q.x + n.x * 0.26, y: q.y + n.y * 0.26 }, p, motion),
          undefined,
          'the marble keeps its .25 world-space radius at every sprite size'
        );
      }
    }
console.log(
  'PASS 6000 clipped-grid reference cases and mirrored/rotated moving-wall reflection with fixed marble radius'
);
