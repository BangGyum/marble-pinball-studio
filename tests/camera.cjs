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

const context = () =>
  new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'measureText') return () => ({ width: 20 });
        if (key === 'getTransform') return () => ({ a: 1, b: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
    }
  );
const canvas = () => ({
  getContext: () => context(),
  addEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
});
global.window = { addEventListener() {} };
global.document = { querySelector: () => null };
global.devicePixelRatio = 1;
global.requestAnimationFrame = () => 1;
global.ResizeObserver = class {
  observe() {}
};
const { Game } = require('../src/game.ts');
const { LanView } = require('../src/lan/view.ts');
const { stages } = require('../src/data/maps.ts');
const bowl = stages.find((stage) => stage.goalArea);
const names = ['A', 'B', 'C'];
const makeScene = (stage, id) => ({
  type: 'scene',
  raceId: String(id),
  revision: 1,
  stage,
  settings: { names: names.join(','), mapId: stages.indexOf(stage), order: 'desc', picks: 1 },
  balls: names.map((name, id) => ({ id, name, color: '#ffffff' })),
  entities: [],
  fixed: [],
});
function gameView() {
  const view = new Game(canvas());
  Object.assign(view.physics, {
    clearMarbles() {},
    clear() {},
    createStage() {},
    createMarble() {},
    getEntities: () => [],
  });
  return view;
}
function prepare(view, stage, id) {
  if (view instanceof Game) view.prepare(stage, names);
  else view.setScene(makeScene(stage, id));
  view.state = 'ready';
}

for (const View of [Game, LanView]) {
  const view = View === Game ? gameView() : new View(canvas());
  view.setVisible(false);
  let id = 0,
    reported;
  view.onZoomChange = (zoom) => {
    reported = zoom;
  };
  for (const first of stages)
    for (const second of stages) {
      if (first === second) continue;
      prepare(view, first, ++id);
      view.setZoom(0.35);
      view.manual = { x: 900, y: 900 };
      view.state = 'finished';
      prepare(view, second, ++id);
      assert.equal(view.zoom, 1, `${View.name}: ${first.title} -> ${second.title} resets previous zoom`);
      assert.equal(reported, 1, 'the visible zoom control also resets');
      assert.equal(view.manual, null, 'a previous minimap target cannot override a new race');
      view.setZoom(1.7);
      prepare(view, second, ++id);
      assert.equal(view.zoom, 1.7, 'preparing the same map keeps the chosen zoom');
    }
}
console.log(
  'PASS all 342 map switches reset zoom and minimap targets; same-map preparation retains zoom in standalone/LAN'
);

let clock = 1000;
const originalPerformance = global.performance;
global.performance = { now: () => clock };
function render(view, { winners = [], last = false, frameMs = 1000 / 60 } = {}) {
  clock += frameMs;
  const positions = names.map((_, id) => [id, 16 + id * 4, 49 + id, 0, last && id < 2 ? id + 1 : 0]);
  if (view instanceof Game) {
    view.state = 'paused';
    view.balls.forEach((ball, id) => {
      Object.assign(ball, { x: positions[id][1], y: positions[id][2], rank: positions[id][4] || undefined });
    });
    view.arrivals = view.balls.filter((ball) => ball.rank);
    view.winners = winners.map((id) => view.balls[id]);
    view.range = [3, 3];
    view.render();
  } else {
    view.state = 'paused';
    view.playback.reset();
    view.push({
      type: 'frame',
      raceId: view.scene.raceId,
      revision: 1,
      seq: ++render.seq,
      elapsed: 20,
      time: 0,
      state: 'paused',
      balls: positions,
      angles: [],
      winners,
      connected: 1,
      speed: 1,
      playbackRate: 1,
    });
    view.draw(clock);
  }
}
render.seq = 0;
try {
  for (const width of [600, 1000])
    for (const View of [Game, LanView]) {
      const view = View === Game ? gameView() : new View(canvas());
      prepare(view, bowl, 'bowl');
      view.width = width;
      view.height = 600;
      view.zoom = 1;
      for (let i = 0; i < 60; i++) render(view);
      const wide = view.viewScale();
      const startCamera = { ...view.camera };
      render(view, { winners: [2], last: true });
      assert.ok(view.viewScale() < Math.min(width / 20, 600 / 13, 70), 'automatic zoom eases into the close view');
      for (let i = 0; i < 120; i++) render(view, { winners: [2], last: true });
      assert.ok(view.viewScale() > wide * 2, `${View.name}: final marble becomes visibly larger`);
      assert.ok(Math.hypot(view.camera.x - 24, view.camera.y - 51) < 0.02, 'the final marble is centered');
      assert.notDeepEqual(view.camera, startCamera);
      view.setZoom(1.2);
      assert.ok(view.viewScale() > wide * 2.2, 'manual zoom remains responsive');

      prepare(view, bowl, 'again');
      view.setZoom(1);
      for (let i = 0; i < 60; i++) render(view);
      view.follow(true);
      for (let i = 0; i < 120; i++) render(view);
      assert.ok(view.viewScale() > wide * 2, 'Follow exits the whole-map view before the finalists are known');
      assert.ok(Math.hypot(view.camera.x - 16, view.camera.y - 49) < 0.02, 'Follow targets the trailing participant');
      const zoom = view.zoom;
      if (view instanceof LanView) view.setScene({ ...view.scene, revision: 2 });
      else view.pause();
      assert.equal(view.zoom, zoom, 'pause and LAN revisions keep zoom');
    }
  for (const View of [Game, LanView]) {
    let baseline;
    for (const hz of [60, 30, 120, 144]) {
      const view = View === Game ? gameView() : new View(canvas());
      prepare(view, bowl, 'refresh');
      for (let i = 0; i < 60; i++) render(view);
      for (let i = 0; i < hz / 2; i++) render(view, { winners: [2], last: true, frameMs: 1000 / hz });
      const sample = [view.camera.x, view.camera.y, view.viewScale()];
      if (!baseline) baseline = sample;
      else
        sample.forEach((value, i) => {
          assert.ok(Math.abs(value - baseline[i]) < 1e-8, 'zoom/follow easing is refresh independent');
        });
    }
  }
} finally {
  global.performance = originalPerformance;
}
console.log(
  'PASS circular map opens wide, eases onto the last marble and responds to Follow/zoom at narrow/wide widths'
);
console.log('PASS final-marble zoom and follow agree at 30/60/120/144Hz in standalone/LAN');
