// Offline asset QA on real Race/Box2D states; this does not implement dolphin collisions.
// PINBALL_CANVAS_MODULE may point to an existing @napi-rs/canvas installation.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { createCanvas, loadImage, Path2D, GlobalFonts } = require(process.env.PINBALL_CANVAS_MODULE || '@napi-rs/canvas');
if (process.platform === 'win32') {
  for (const family of ['Malgun Gothic', 'system-ui']) GlobalFonts.registerFromPath(path.join(process.env.WINDIR, 'Fonts/malgun.ttf'), family);
}
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.fetch = undefined;
global.Path2D = Path2D;
global.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };
const { Race } = require('../src/race.ts');
const { stages, hiddenStages } = require('../src/data/maps.ts');
const { drawEntities } = require('../src/draw.ts');
const { drawMapArt, drawMapOverlay, bridgeBallOpacity } = require('../src/map-art.ts');
const { drawWind } = require('../src/wind-render.ts');
const { drawMarble } = require('../src/marble-art.ts');
const { setSceneTheme } = require('../src/scene-theme.ts');
const assetDir = path.resolve(__dirname, '../src/assets/effects/dolphin-v1');
const outputDir = path.resolve(__dirname, '../.test-build/dolphin-map-check');
const manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'asset-manifest.json'), 'utf8'));
const report = { scope: 'Real map physics; offline visual overlay only. No dolphin impulses, LAN or browser FPS verification.',
  seed: 123456, count: 100, secondsPerMap: 12, visibleMaps: stages.length - hiddenStages.length, maps: [], renders: 0 };
// Read the current preview's actual trajectory instead of maintaining an outdated copy.
const previewSource = fs.readFileSync(path.join(assetDir, 'preview.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const previewElements = new Map();
const preview = vm.createContext({ Path2D, document: { hidden: false, addEventListener() {}, createElement: () => createCanvas(1, 1),
  getElementById(id) {
    if (!previewElements.has(id)) previewElements.set(id, Object.assign(createCanvas(1280, 680), { setAttribute() {}, checked: false }));
    return previewElements.get(id);
  } }, matchMedia: () => ({ matches: false, addEventListener() {} }),
  Image: class { decode() { return new Promise(() => {}); } }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
vm.runInContext(previewSource, preview);
const W = 1000, H = 600, duration = vm.runInContext('duration', preview);
const previewScale = manifest.assets.dolphin.proposedWorldWidth / vm.runInContext('bodyWidth', preview);
const previewCenter = vm.runInContext('pose(duration / 2)', preview);
const previewWaterY = vm.runInContext('waterY', preview), previewSplash = vm.runInContext('splashEvents[2]', preview);
const views = new Map(), gallery = [];
for (const theme of ['dark', 'beige']) views.set(theme, createCanvas(1600, Math.ceil(stages.length / 4) * 240));
function pose(time, direction, anchor) {
  const p = vm.runInContext(`direction = ${direction}; pose(${time})`, preview);
  return { x: anchor.x + (p.x - previewCenter.x) * previewScale, y: anchor.y + (p.y - previewCenter.y) * previewScale, angle: p.angle };
}
function render(race, anchor, body, splash, theme, zoom, direction, phase) {
  setSceneTheme(theme);
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d'), stage = race.stage;
  const time = phase === 'jump' ? duration / 2 : previewSplash.at + .18;
  const p = pose(time, direction, anchor), scale = Math.min(W / 20, H / 13, 70) * zoom;
  const surface = anchor.y + (previewWaterY - previewCenter.y) * previewScale;
  // Fixed world path; changing zoom or theme never changes the object's world position.
  const cam = phase === 'jump' ? anchor : { x: p.x, y: p.y };
  const view = { left: cam.x - W * .56 / scale, right: cam.x + W * .44 / scale,
    top: cam.y - H * .43 / scale, bottom: cam.y + H * .57 / scale };
  ctx.fillStyle = theme === 'beige' ? '#f4ede1' : '#070a0e'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W * .56 - cam.x * scale, H * .43 - cam.y * scale); ctx.scale(scale, scale);
  const entities = race.physics.getEntities();
  drawMapArt(ctx, stage, scale);
  drawEntities(ctx, stage.exitBridge ? entities.filter(e => e.shape.collisionLayer !== 2) : entities,
    scale, -1, true, view, !!stage.art, stage.art?.style === 'reversal-ladder');
  drawWind(ctx, stage.windZones ?? [], race.elapsed, scale);
  drawMapOverlay(ctx, stage, entities, scale, true, view);
  ctx.shadowBlur = 0;
  if (phase === 'splash') {
    const age = .18 / .65, width = 105 * previewScale * (.45 + Math.sin(age * Math.PI / 2) * .7), height = width * splash.height / splash.width;
    ctx.save(); ctx.globalAlpha = (1 - age) * .92;
    const splashX = anchor.x + direction * (previewSplash.x - previewCenter.x) * previewScale;
    ctx.drawImage(splash, splashX - width / 2, surface + 4 * previewScale - height, width, height); ctx.restore();
  }
  const before = ctx.getTransform(), width = manifest.assets.dolphin.proposedWorldWidth;
  ctx.save(); ctx.beginPath(); ctx.rect(view.left, view.top, view.right - view.left, Math.max(0, surface - view.top)); ctx.clip();
  ctx.translate(p.x, p.y); ctx.scale(direction, 1); ctx.rotate(p.angle);
  ctx.drawImage(body, -width / 2, -width * body.height / body.width / 2, width, width * body.height / body.width);
  ctx.restore();
  const after = ctx.getTransform();
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) assert.ok(Math.abs(before[key] - after[key]) < 1e-9);
  assert.equal(ctx.globalAlpha, 1, 'effect opacity must not dim the map or marbles');
  for (const ball of race.balls) if (!ball.rank) {
    ctx.globalAlpha = bridgeBallOpacity(stage, ball); drawMarble(ctx, ball.x, ball.y, .25, ball.color);
  }
  ctx.globalAlpha = 1; ctx.restore();
  ctx.fillStyle = theme === 'beige' ? '#403a30e8' : '#071018e8'; ctx.fillRect(0, 0, W, 59);
  ctx.fillStyle = '#f4f7f8'; ctx.font = '20px "Malgun Gothic", sans-serif';
  ctx.fillText(`${stage.title} · ${theme} · ${Math.round(zoom * 100)}% · ${direction === 1 ? '→' : '←'}`, 18, 25);
  ctx.font = '14px "Malgun Gothic", sans-serif';
  ctx.fillText(`실제 맵·100개 공·${race.elapsed.toFixed(1)}초 / 돌고래는 시각 오버레이, 충돌 미연결`, 18, 47);
  report.renders++;
  return canvas;
}
async function sprite(asset, width) {
  const image = await loadImage(path.join(assetDir, asset.file)), [x, y, w, h] = asset.sourceRect;
  assert.equal(image.width, asset.size[0]); assert.equal(image.height, asset.size[1]);
  assert.ok(x >= 0 && y >= 0 && x + w <= image.width && y + h <= image.height);
  const canvas = createCanvas(width, Math.round(width * h / w));
  canvas.getContext('2d').drawImage(image, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}
(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const body = await sprite(manifest.assets.dolphin, 768), splash = await sprite(manifest.assets.splash, 320);
  const race = new Race(), random = Math.random; await race.physics.init();
  try {
    for (const [index, stage] of stages.entries()) {
      let seed = report.seed;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      race.prepare(stage, Array.from({ length: report.count }, (_, i) => String(i + 1)));
      race.startRace([1, report.count]);
      for (let i = 0; i < 720 && race.state === 'running'; i++) {
        race.advance();
        for (const b of race.balls) assert.ok([b.x, b.y, b.angle].every(Number.isFinite), `${stage.title}: finite marble position`);
      }
      const active = race.racing(), target = active[Math.floor(active.length / 2)] ?? race.balls[0];
      const anchor = { x: target.x, y: target.y }, snapshot = JSON.stringify(race.balls);
      const row = { title: stage.title, hidden: hiddenStages.includes(stage), seconds: +race.elapsed.toFixed(3),
        arrived: race.arrivals.length, rescues: race.rescues, renders: 0, anchor };
      for (const theme of ['dark', 'beige']) for (const zoom of [.35, 1, 3]) for (const direction of [1, -1]) for (const phase of ['jump', 'splash']) {
        const canvas = render(race, anchor, body, splash, theme, zoom, direction, phase);
        row.renders++;
        if (zoom === 1 && direction === 1 && phase === 'jump') {
          const file = `${String(index).padStart(2, '0')}-${theme}.png`;
          fs.writeFileSync(path.join(outputDir, file), canvas.toBuffer('image/png'));
          gallery.push({ title: stage.title, theme, file });
          views.get(theme).getContext('2d').drawImage(canvas, index % 4 * 400, Math.floor(index / 4) * 240, 400, 240);
        }
        if (stage.art?.style === 'infinite-funnel' && ((zoom !== 1 && direction === -1 && phase === 'jump') || (zoom === 1 && direction === -1 && phase === 'splash'))) {
          const file = `spiral-${theme}-${zoom}-${phase}-left.png`;
          fs.writeFileSync(path.join(outputDir, file), canvas.toBuffer('image/png')); gallery.push({ title: `${stage.title} ${zoom * 100}% ${phase} ←`, theme, file });
        }
      }
      assert.equal(JSON.stringify(race.balls), snapshot, 'visual QA must not mutate real race results');
      report.maps.push(row); console.log(`PASS ${stage.title}: 100 marbles, ${row.seconds}s, ${row.renders} render combinations`);
    }
  } finally { Math.random = random; race.physics.dispose(); }
  for (const [theme, canvas] of views) fs.writeFileSync(path.join(outputDir, `overview-${theme}.png`), canvas.toBuffer('image/png'));
  fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outputDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>돌고래 실제 맵 렌더 검사</title><style>body{background:#10151d;color:#ecf2f6;font:16px system-ui;margin:28px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:20px}figure{margin:0}img{width:100%;height:auto}p{line-height:1.7}</style><h1>돌고래 실제 맵 렌더 검사</h1><p>등록 맵 ${stages.length}개 · 구슬 100개 · 각 12초 고정 스텝. 다크/베이지 × 35/100/300% × 좌우 × 도약/물보라 = ${report.renders}회 렌더.<br>게임과 같은 물리·맵 렌더 코드로 만든 오프라인 이미지입니다. 돌고래 타격, 완주, 브라우저 FPS 검증은 포함하지 않습니다.</p><a href="results.json">원본 결과 JSON</a><main>${gallery.map(g => `<figure><img loading="lazy" src="${g.file}" alt="${g.title} ${g.theme}"><figcaption>${g.title} · ${g.theme}</figcaption></figure>`).join('')}</main>`);
  console.log(`PASS ${report.maps.length} maps, ${report.renders} renders. ${outputDir}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
