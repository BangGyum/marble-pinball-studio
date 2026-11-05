const assert = require('node:assert/strict');
const fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f
  );
const { finishFraction, raceProgress } = require('../src/finish.ts');
const { Race } = require('../src/race.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
const { orbitingGate, orbitingBowl } = require('../src/data/orbiting-gate.ts');
const { encodeScene, decodeScene } = require('../src/lan/protocol.ts');
const { drawOrbitingGateMouth } = require('../src/orbiting-gate-art.ts');

const stage = {
  title: '원형 결승',
  goalY: 30,
  zoomY: 25,
  width: 26,
  entities: [],
  goalArea: { x: 10, y: 10, radius: 2 },
};
assert.equal(finishFraction(stage, { x: 6, y: 10 }, { x: 11, y: 10 }), 0.4);
assert.equal(
  finishFraction(stage, { x: 6, y: 10 }, { x: 14, y: 10 }),
  0.25,
  'fast pass-through still crosses the finish'
);
assert.equal(finishFraction(stage, { x: 6, y: 13 }, { x: 14, y: 13 }), undefined, 'near miss is not an arrival');
assert.equal(finishFraction(stage, { x: 14, y: 10 }, { x: 18, y: 10 }), undefined, 'moving away is not an arrival');
assert.equal(finishFraction(stage, { x: 10, y: 10 }, { x: 10, y: 10 }), 0);
assert.equal(finishFraction(stage, { x: 5, y: 10 }, { x: 5, y: 10 }), undefined);
assert.equal(
  finishFraction(stage, { x: 8, y: 30 }, { x: 8, y: 31 }),
  undefined,
  'map bottom is not the circular finish'
);
assert.equal(finishFraction({ ...stage, goalArea: undefined }, { x: 5, y: 29 }, { x: 5, y: 33 }), 0.25);
assert.ok(raceProgress(stage, { x: 10, y: 13 }) > raceProgress(stage, { x: 10, y: 29 }));
const race = new Race();
race.stage = stage;
race.state = 'running';
race.range = [1, 2];
race.balls = [
  { id: 0, name: 'later', x: 6, y: 10, angle: 0, stuck: 0 },
  { id: 1, name: 'earlier', x: 10, y: 7, angle: 0, stuck: 0 },
];
Object.assign(race.physics, {
  step() {},
  getMarblePosition: (id) => (id ? { x: 10, y: 12, angle: 0 } : { x: 11, y: 10, angle: 0 }),
  removeMarble() {},
});
race.advance();
assert.deepEqual(
  race.arrivals.map((b) => b.id),
  [1, 0],
  'same-step arrivals use circle entry time, not marble ID'
);
assert.equal(race.finishReason, 'arrived');
assert.deepEqual(validateStage(orbitingGate), orbitingGate);
for (const goalArea of [
  null,
  {},
  [],
  { x: 10, y: 10, radius: 0 },
  { x: 10, y: 10, radius: NaN },
  { x: '10', y: 10, radius: 2 },
  { x: 1, y: 10, radius: 2 },
  { x: 25, y: 10, radius: 2 },
  { x: 10, y: 29, radius: 2 },
  { x: Infinity, y: 10, radius: 2 },
])
  assert.throws(() => validateStage({ ...stage, goalArea }), /원형 결승/);
assert.throws(() => validateStage({ ...orbitingGate, goalArea: undefined }), /원형 결승/);
assert.throws(() => validateStage({ ...orbitingGate, art: { style: 'orbiting-gate', contours: [] } }), /배경 장식/);
const values = new Map(),
  storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
saveMaps(storage, [{ id: 'moving-mouth', stage: orbitingGate }]);
assert.deepEqual(readSavedMaps(storage)[0].stage, orbitingGate);
const scene = {
  type: 'scene',
  raceId: 'circle',
  revision: 1,
  stage: orbitingGate,
  settings: { names: '가\n나', mapId: 18, order: 'asc', picks: 1 },
  balls: [],
  fixed: [],
  entities: orbitingGate.entities.map((e) => ({
    x: e.position.x,
    y: e.position.y,
    angle: 0,
    life: -1,
    shape: e.shape,
  })),
};
assert.deepEqual(
  decodeScene(JSON.parse(JSON.stringify(encodeScene(scene)))),
  scene,
  'LAN preserves circular finish and collision geometry'
);
const ctx = new Proxy({}, { get: () => () => {} });
const ring = scene.entities[3];
drawOrbitingGateMouth(ctx, [ring], 8);
assert.doesNotThrow(
  () => drawOrbitingGateMouth(ctx, [{ ...ring, shape: { ...ring.shape, points: ring.shape.points.slice(0, -1) } }], 8),
  'editing the closing vertex does not break the mouth marker'
);
assert.doesNotThrow(
  () =>
    drawOrbitingGateMouth(
      ctx,
      [
        {
          ...ring,
          shape: {
            ...ring.shape,
            points: [
              [0, 0],
              [1, 0],
              [2, 0],
              [2, 1],
              [1, 1],
              [0, 0],
            ],
          },
        },
      ],
      8
    ),
  'non-circular edited geometry can still be rendered'
);
console.log(
  'PASS circular/line finish, fast crossings, same-step order, progress, validation, save/reload and LAN encoding'
);

// The ready screen must show the full starting grid, then the race shows the whole bowl.
{
  const { Game } = require('../src/game.ts'),
    { LanView } = require('../src/lan/view.ts');
  global.window = { addEventListener() {} };
  global.devicePixelRatio = 1;
  global.requestAnimationFrame = () => 1;
  global.ResizeObserver = class {
    observe() {}
  };
  const context = new Proxy(
    {},
    {
      get: (target, key) =>
        key in target ? target[key] : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {},
    }
  );
  for (const [width, height] of [
    [1100, 740],
    [360, 740],
    [1000, 400],
  ])
    for (const count of [1, 100, 300]) {
      const canvas = {
        getContext: () => context,
        addEventListener() {},
        getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }),
      };
      const game = new Game(canvas);
      game.resize();
      const entities = scene.entities;
      Object.assign(game.physics, {
        clearMarbles() {},
        clear() {},
        createStage() {},
        createMarble() {},
        getEntities: () => entities,
      });
      game.prepare(
        orbitingGate,
        Array.from({ length: count }, (_, i) => String(i))
      );
      const view = new LanView(canvas);
      view.width = width;
      view.height = height;
      view.setScene({
        ...scene,
        raceId: `ready-${count}`,
        balls: game.balls.map(({ id, name, color }) => ({ id, name, color })),
      });
      view.playback.push(
        {
          type: 'frame',
          raceId: `ready-${count}`,
          revision: 1,
          seq: 1,
          time: 0,
          elapsed: 0,
          state: 'ready',
          balls: game.balls.map((b) => [b.id, b.x, b.y, b.angle, 0]),
          angles: entities.map((e) => e.angle),
          winners: [],
          connected: 1,
          speed: 1,
          playbackRate: 1,
        },
        1000
      );
      view.draw(1000);
      for (const renderer of [game, view]) {
        const scale = renderer.viewScale(),
          camera = renderer.camera;
        for (const ball of renderer.balls) {
          const x = width * 0.56 + (ball.x - camera.x) * scale,
            y = height * 0.43 + (ball.y - camera.y) * scale;
          assert.ok(
            x - 0.25 * scale >= 0 && x + 0.25 * scale <= width && y - 0.25 * scale >= 0 && y + 0.8 * scale <= height,
            `${renderer.constructor.name} ${width}x${height}, ${count} marbles: ready grid and labels stay visible`
          );
        }
        renderer.state = 'running';
        if (renderer === game) game.render();
        else view.draw(1000);
        assert.equal(renderer.camera.x, orbitingBowl.x, 'the race restores the full bowl overview');
        const overview = renderer.viewScale();
        assert.ok(overview * 68 <= width && overview * 76 <= height, 'the racing bowl fits the viewport');
        renderer.state = 'ready';
        if (renderer === view) renderer.canControl = true;
        renderer.setDolphinPreview(false);
        renderer.setDolphins({ enabled: true, rows: [30], interval: 5 });
        renderer.showDolphinLayout();
        assert.equal(renderer.viewScale(), overview, 'dolphin layout still shows the whole map before starting');
        renderer.follow(true);
        if (renderer === game) game.render();
        else view.draw(1000);
        assert.equal(renderer.viewScale(), scale, 'closing dolphin layout restores the starting-grid scale');
        assert.deepEqual(renderer.camera, camera, 'closing dolphin layout restores the starting-grid camera');
      }
    }
  console.log(
    'PASS orbiting ready grids at 1/100/300 marbles, desktop/mobile/short windows, race overview and dolphin layout in Game/LAN'
  );
}
