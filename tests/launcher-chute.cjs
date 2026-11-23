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
global.fetch = undefined;

const { Race } = require('../src/race.ts');
const { launcherLab } = require('../src/data/launcher-lab.ts');
const { oneBounce } = require('../src/data/one-bounce.ts');
const {
  BARREL_LENGTH,
  BARREL_TILT,
  FUNNEL_ENTRY_Y,
  LAUNCHER_ENTRY_HALF_WIDTH,
  LAUNCHER_ENTRY_Y,
  LAUNCHER_GATE_Y,
  LAUNCHER_GATE_OPEN_ANGLE,
  LAUNCH_SPEED,
  launcherFunnel,
  marbleLauncher,
} = require('../src/marble-launcher.ts');
const { encodeScene, decodeScene } = require('../src/lan/protocol.ts');

async function verifyChute() {
  const race = new Race();
  const physics = race.physics;
  await physics.init();
  try {
    const x = 18,
      y = 16,
      mouth = y + LAUNCHER_ENTRY_Y;
    const stage = { title: 'Chute probe', goalY: 40, zoomY: 35, entities: [marbleLauncher(x, y, 'chute')] };
    for (const [ballX, ballY, vx, vy] of [
      [x + 1.27, y, 0, 0],
      [x, y + 1.17, 0, 0],
      [x + LAUNCHER_ENTRY_HALF_WIDTH + 0.25, mouth - 0.08, 0, 8],
      [x, mouth + 0.08, 0, -8],
      [x + 0.42, mouth + 0.08, -8, 0],
    ]) {
      race.prepare(stage, ['outside']);
      race.startRace([1, 1]);
      physics.placeMarble(0, ballX, ballY);
      physics.setMarbleVelocity(0, vx, vy);
      for (let frame = 0; frame < 6; frame++) {
        physics.step(1 / 60);
        assert.equal(physics.launchers[0].loaded, undefined, 'entry requires crossing the mouth from above');
      }
    }

    race.prepare(stage, ['first', 'second', 'third']);
    race.startRace([3, 3]);
    physics.placeMarble(0, x, mouth - 0.05);
    physics.setMarbleVelocity(0, 0, 2);
    physics.placeMarble(1, x + 5, mouth - 1);
    physics.placeMarble(2, x + 6, mouth - 1);
    const launcher = physics.launchers[0];
    const order = [];
    let next = 1;
    let heldAtGate = false,
      pushed = false;
    for (let frame = 0; frame < 240; frame++) {
      const before = launcher.loaded?.body;
      physics.step(1 / 60);
      const gate = launcher.gate.body;
      const occupied = launcher.loaded?.body;
      const guided = occupied ?? before;
      assert.deepEqual(physics.getLauncherGuideIds(), guided ? [physics.marbleBodies.indexOf(guided)] : []);
      assert.equal(physics.marbleBodies.filter((body) => !body.IsEnabled()).length, occupied ? 1 : 0);
      if (gate.IsEnabled()) {
        assert.equal(gate.GetAngle(), 0);
        if (next <= 2 && occupied === physics.marbleBodies[next - 1]) {
          physics.placeMarble(next, x, y + LAUNCHER_GATE_Y - 0.34);
          next++;
        }
        heldAtGate ||= physics.marbleBodies.some((body) => {
          const p = body.GetPosition();
          return body.IsEnabled() && Math.abs(p.x - x) < 0.35 && Math.abs(p.y - (y + LAUNCHER_GATE_Y - 0.32)) < 0.08;
        });
      }
      if (occupied) {
        const travel = launcher.pistonTravel ?? 0;
        if (travel > 0.1) {
          const angle = BARREL_TILT + launcher.entity.body.GetAngle();
          const pos = occupied.GetPosition();
          const piston = launcher.piston.body.GetPosition();
          const along = (piston.x - pos.x) * Math.cos(angle) + (piston.y - pos.y) * Math.sin(angle);
          assert.ok(Math.abs(along - 0.36) < 0.002, 'the visible piston follows behind the marble');
          pushed = true;
        }
      }
      if (before && !occupied) {
        const id = physics.marbleBodies.indexOf(before);
        const angle = BARREL_TILT + launcher.entity.body.GetAngle();
        const pos = physics.getMarblePosition(id);
        const velocity = physics.getMarbleVelocity(id);
        assert.ok(Math.abs(Math.hypot(pos.x - x, pos.y - y) - BARREL_LENGTH) < 0.001);
        assert.ok(Math.abs(velocity.vx + Math.cos(angle) * LAUNCH_SPEED) < 0.001);
        assert.ok(Math.abs(velocity.vy + Math.sin(angle) * LAUNCH_SPEED) < 0.001);
        order.push(id);
      }
    }
    assert.deepEqual(order, [0, 1, 2], 'queued marbles feed one at a time in arrival order');
    assert.ok(heldAtGate, 'the closed gate physically holds the following marble');
    assert.ok(pushed);
    assert.ok(Math.abs(launcher.gate.body.GetAngle() - LAUNCHER_GATE_OPEN_ANGLE) < 0.001);
    assert.equal(launcher.pistonTravel, 0);

    const scene = {
      type: 'scene',
      raceId: 'test',
      revision: 1,
      stage,
      settings: { mapId: 0, names: 'a', order: 'asc', picks: 1 },
      entities: physics.getEntities(),
      fixed: [false, false, false],
      balls: [],
    };
    assert.deepEqual(decodeScene(JSON.parse(JSON.stringify(encodeScene(scene)))).entities, scene.entities);
    console.log('PASS directional intake, single-file loading, physical gate, timed piston and LAN scene round trip');
  } finally {
    physics.dispose();
  }
}

async function verifyFunnel() {
  const race = new Race();
  const physics = race.physics;
  await physics.init();
  try {
    const x = 18,
      y = 16;
    const sides = launcherFunnel({ x, y });
    const rail = (points) => ({
      type: 'static',
      position: { x: 0, y: 0 },
      shape: { type: 'polyline', rotation: 0, points },
      props: { density: 1, restitution: 0, angularVelocity: 0 },
    });
    const stage = {
      title: 'Funnel probe',
      goalY: 40,
      zoomY: 35,
      entities: [rail(sides.left), rail(sides.right), marbleLauncher(x, y, 'funnel')],
    };
    race.prepare(stage, ['side entry']);
    race.startRace([1, 1]);
    physics.placeMarble(0, x + 0.1, y - 0.5);
    for (let frame = 0; frame < 18; frame++) {
      physics.step(1 / 60);
      assert.equal(physics.launchers[0].loaded, undefined, 'a marble below the funnel mouth cannot load');
    }
    race.prepare(stage, ['left', 'right']);
    race.startRace([2, 2]);
    physics.placeMarble(0, x - 0.28, y - 1.65);
    physics.placeMarble(1, x + 0.28, y - 1.65);
    const launcher = physics.launchers[0];
    assert.equal(launcher.gate, undefined, 'the funnel must never create a horizontal gate');
    const fired = new Set();
    let unjammed = false;
    let clearAt;
    for (let frame = 0; frame < 300 && fired.size < 2; frame++) {
      const before = launcher.loaded;
      physics.step(1 / 60);
      const after = launcher.loaded;
      unjammed ||= !!launcher.funnelAssist;
      assert.equal(physics.marbleBodies.filter((body) => !body.IsEnabled()).length, after ? 1 : 0);
      if (before && !after) {
        fired.add(before.id);
        clearAt = physics.motionTime;
      }
    }
    assert.ok(unjammed, 'a wedged pair triggered the intake recovery');
    assert.equal(fired.size, 2, 'both marbles are fired within five seconds');
    const scene = {
      type: 'scene',
      raceId: 'funnel',
      revision: 1,
      stage,
      settings: { mapId: 0, names: 'a', order: 'asc', picks: 1 },
      entities: physics.getEntities(),
      fixed: [false, false],
      balls: [],
    };
    assert.deepEqual(decodeScene(JSON.parse(JSON.stringify(encodeScene(scene)))).entities, scene.entities);
    console.log('PASS gate-free funnel, two-marble jam recovery and one-at-a-time firing in', clearAt.toFixed(2), 's');
  } finally {
    physics.dispose();
  }
}

async function verifyDenseRaces() {
  const race = new Race();
  const physics = race.physics;
  const random = Math.random;
  await physics.init();
  try {
    for (const stage of [launcherLab, oneBounce]) {
      for (const count of [100, 300]) {
        for (const initial of [77, 1337]) {
          let seed = initial;
          Math.random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          race.prepare(
            stage,
            Array.from({ length: count }, (_, id) => String(id))
          );
          race.startRace([count, count], 'desc');
          const launcher = physics.launchers[0],
            ids = new Map(Object.entries(physics.marbleMap).map(([id, body]) => [body, Number(id)])),
            released = new Set();
          assert.equal(launcher.gate, undefined);
          let reloadWait = 0,
            longestReloadWait = 0,
            longestLoad = 0;
          while (race.state === 'running' && race.elapsed < 400) {
            const before = launcher.loaded;
            race.advance();
            const loaded = launcher.loaded;
            if (before && !loaded) released.add(ids.get(before.body));
            const guided = loaded ?? before;
            if (guided) {
              longestLoad = Math.max(longestLoad, physics.motionTime - guided.at);
              const id = ids.get(guided.body);
              const held = race.balls[id];
              // Box2D positions are stored as float32. Allow rounding at exact contact.
              const minSeparation = 0.4999;
              for (const other of race.balls) {
                if (other.id === id || other.rank || Math.abs(held.x - other.x) >= minSeparation) continue;
                if (Math.abs(held.y - other.y) >= minSeparation) continue;
                const distance = Math.hypot(held.x - other.x, held.y - other.y);
                assert.ok(
                  distance >= minSeparation,
                  `${stage.title} / ${count} / ${initial}: marbles ${id} and ${other.id} overlap at ${race.elapsed.toFixed(2)}s (distance ${distance.toFixed(4)})`
                );
              }
            }
            const waiting =
              !loaded &&
              race.balls.some(
                (ball) =>
                  !ball.rank &&
                  Math.abs(ball.x - launcher.entity.x) < 0.44 &&
                  ball.y >= launcher.entity.y + FUNNEL_ENTRY_Y - 0.7 &&
                  ball.y < launcher.entity.y + FUNNEL_ENTRY_Y
              );
            reloadWait = waiting ? reloadWait + 1 / 60 : 0;
            longestReloadWait = Math.max(longestReloadWait, reloadWait);
          }
          const diagnosis = [stage.title, count, initial, race.elapsed.toFixed(2)].join(' / ');
          assert.equal(race.finishReason, 'arrived', diagnosis);
          assert.equal(race.arrivals.length, count, diagnosis);
          assert.equal(released.size, count, diagnosis + ' all marbles must leave the muzzle');
          assert.equal(race.rescues, 0, diagnosis);
          assert.ok(longestLoad < 0.45, diagnosis + ' a marble cannot stall in the barrel');
          assert.ok(longestReloadWait < 2, diagnosis + ' the funnel must clear an occupied throat');
          console.log(
            'PASS',
            diagnosis,
            'longest ready wait',
            longestReloadWait.toFixed(2),
            'load',
            longestLoad.toFixed(3)
          );
        }
      }
    }
  } finally {
    Math.random = random;
    physics.dispose();
  }
}

(async () => {
  await verifyChute();
  await verifyFunnel();
  await verifyDenseRaces();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
