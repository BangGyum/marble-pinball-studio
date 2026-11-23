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
const { dolphinRows } = require('../src/dolphin.ts');
const bowl = stages.find((stage) => stage.goalArea);
const names = ['A', 'B', 'C'];
const makeScene = (stage, id, dolphins) => ({
  type: 'scene',
  raceId: String(id),
  revision: 1,
  stage,
  settings: {
    names: names.join(','),
    mapId: stages.indexOf(stage),
    order: 'asc',
    picks: 1,
    ...(dolphins ? { dolphins } : {}),
  },
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
function prepare(view, stage, id, dolphins) {
  if (view instanceof Game) view.prepare(stage, names, dolphins);
  else view.setScene(makeScene(stage, id, dolphins));
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
      view.focusedBallId = 0;
      view.state = 'finished';
      prepare(view, second, ++id);
      assert.equal(view.zoom, 1, `${View.name}: ${first.title} -> ${second.title} resets previous zoom`);
      assert.equal(reported, 1, 'the visible zoom control also resets');
      assert.equal(view.manual, null, 'a previous minimap target cannot override a new race');
      assert.equal(view.focusedBallId, null, 'reused marble IDs do not carry a selection into a new race');
      view.setZoom(1.7);
      prepare(view, second, ++id);
      assert.equal(view.zoom, 1.7, 'preparing the same map keeps the chosen zoom');
    }
}
console.log(
  'PASS all 342 map switches reset zoom and minimap targets; same-map preparation retains zoom in standalone/LAN'
);

for (const View of [Game, LanView]) {
  const sequence = ['네온 분기점', '떠도는 입구', '끝없는 나선'],
    view = View === Game ? gameView() : new View(canvas());
  view.setVisible(false);
  for (const [index, title] of sequence.entries()) {
    const stage = stages.find((stage) => stage.title === title),
      manta = index > 0,
      dolphins = {
        enabled: !manta,
        rows: dolphinRows(stage),
        interval: 5,
        manta: { enabled: manta, rows: dolphinRows(stage), interval: 5 },
      };
    prepare(view, stage, `sequence-${index}`, dolphins);
    assert.equal(
      view.dolphinRenderer.kind,
      manta ? 'manta' : 'dolphin',
      `${View.name}: ${title} selects the enabled effect when the map arrives`
    );
    view.showDolphinLayout();
    assert.equal(view.dolphinOverview, true, 'the enabled effect has working layout guides');
    assert.equal(view.dolphinDrag.settings().enabled, true, 'row dragging targets the enabled effect');
  }
  const fresh = View === Game ? gameView() : new View(canvas());
  fresh.setVisible(false);
  prepare(fresh, view.scene?.stage ?? view.stage, 'late-join', view.dolphins);
  assert.equal(fresh.dolphinRenderer.kind, 'manta', 'first entry into a manta-only map selects its guides');
}
console.log('PASS three-map sequence and fresh manta entry select the active layout in standalone/LAN');

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
    view.range = [1, 1];
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
      for (let i = 0; i < 120; i++) render(view);
      const close = Math.min(width / 20, 600 / 13, 70);
      assert.equal(view.viewScale(), close);
      const centered = (x, y) => Math.hypot(view.camera.x - x, view.camera.y - y) < 0.02;
      assert.ok(centered(16, 49), 'auto follows the trailer even for a first-place draw');
      view.focusedBallId = 1;
      for (let i = 0; i < 120; i++) render(view);
      assert.ok(centered(20, 50), 'a selected marble takes priority');
      view.manual = { x: 3, y: 4 };
      render(view);
      assert.deepEqual(view.manual, { x: 3, y: 4 }, 'minimap temporarily takes priority');
      view.follow();
      assert.equal(view.focusedBallId, 1, 'leaving the minimap restores the selection');
      view.focusedBallId = 2;
      for (let i = 0; i < 120; i++) render(view);
      assert.ok(centered(24, 51), 'switching selection follows the new marble');
      view.focusedBallId = null;
      for (let i = 0; i < 120; i++) render(view);
      assert.ok(centered(16, 49), 'clearing the selection restores the trailer');
      for (let i = 0; i < 120; i++) render(view, { winners: [2], last: true });
      assert.ok(centered(24, 51), 'the last remaining marble is tracked after winners are known');
      view.setZoom(1.2);
      assert.equal(view.viewScale(), close * 1.2, 'manual zoom remains responsive');
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
console.log('PASS default rear tracking, marble switching, temporary minimap override and zoom in standalone/LAN');
console.log('PASS final-marble zoom and follow agree at 30/60/120/144Hz in standalone/LAN');
