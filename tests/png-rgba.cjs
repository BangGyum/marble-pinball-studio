const fs = require('node:fs'),
  assert = require('node:assert/strict'),
  zlib = require('node:zlib');

module.exports = function decodePng(file) {
  const png = fs.readFileSync(file),
    chunks = [];
  let width, height;
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset),
      type = png.toString('ascii', offset + 4, offset + 8),
      data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 6);
      assert.equal(data[12], 0);
    }
    if (type === 'IDAT') chunks.push(data);
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks)),
    stride = width * 4,
    pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
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
  return { png, width, height, pixels };
};
