const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { neonJackpot: stage } = require('../src/data/neon-jackpot.ts');
const { Race } = require('../src/race.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
const { timedGateAngle } = require('../src/timed-gate.ts');
const { rotorPower } = require('../src/rotor-cycle.ts');

const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
saveMaps(storage, [{ id: 'jackpot', stage }]);
assert.deepEqual(readSavedMaps(storage)[0].stage, stage, 'map art, blades, fans, gates and boosters survive saving');
const gate = stage.entities.find(e => e.props.timedGate);
for (const invalid of [null, { ...gate.props.timedGate, period: 0 }, { ...gate.props.timedGate, openFor: gate.props.timedGate.period },
  { ...gate.props.timedGate, phase: NaN }, { ...gate.props.timedGate, angle: 8 }])
  assert.throws(() => validateStage({ ...stage, entities: [{ ...gate, props: { ...gate.props, timedGate: invalid } }] }));
for (const props of [{ ...gate.props, oscillation: { amplitude: 1, period: 3 } }, { ...gate.props, angularVelocity: 1 }])
  assert.throws(() => validateStage({ ...stage, entities: [{ ...gate, props }] }));
const blade = stage.entities.find(e => e.props.spinCycle);
for (const spinCycle of [null, { ...blade.props.spinCycle, runFor: 40 },
  { ...blade.props.spinCycle, idleSpeed: Infinity }, { ...blade.props.spinCycle, phase: '0' }])
  assert.throws(() => validateStage({ ...stage, entities: [{ ...blade, props: { ...blade.props, spinCycle } }] }));

const inside = (ball, points) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > ball.y) !== (b[1] > ball.y) &&
      ball.x < (b[0] - a[0]) * (ball.y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
(async () => {
  const race = new Race(); await race.physics.init();
  const physics = race.physics;
  physics.createStage({ title: '게이트 통과 검증', goalY: 30, entities: [{ ...gate,
    position: { x: 8, y: 10 }, shape: { type: 'polyline', rotation: 0, solid: true,
      points: [[0, -0.15], [8, -0.15], [8, 0.15], [0, 0.15], [0, -0.15]] },
    props: { ...gate.props, timedGate: { period: 6, openFor: 2.5, phase: 3.5, angle: 1.4 } } }] });
  physics.createMarble(0, 12, 8); physics.start();
  for (let i = 0; i < 60; i++) physics.step(1 / 60);
  assert.ok(physics.getMarblePosition(0).y < 10, 'closed gate physically holds a falling marble');
  for (let i = 0; i < 240; i++) physics.step(1 / 60);
  assert.ok(physics.getMarblePosition(0).y > 14, 'opening the gate releases the marble through the same gap');
  physics.clearMarbles(); physics.clear();
  physics.createStage(stage);
  for (let step = 0; step < 840; step++) {
    physics.step(1 / 60);
    for (const e of physics.entities.filter(e => e.timedGate))
      assert.ok(Math.abs(e.body.GetAngle() - timedGateAngle(e.timedGate, (step + 1) / 60)) < 0.001,
        'gate physical angle follows the timed hinge without teleporting');
    const rotors = physics.entities.filter(e => e.spinCycle);
    for (const e of rotors) {
      const speed = e.spinCycle.idleSpeed + (e.spin - e.spinCycle.idleSpeed) * rotorPower(e.spinCycle, (step + 1) / 60);
      assert.ok(Math.abs(e.body.GetAngularVelocity() - speed) < 0.001, 'mixer switches between fast mixing and slow release');
      assert.ok(Math.abs(e.body.GetAngle() - rotors[0].body.GetAngle()) < 0.001, 'all five segmented blades stay synchronized');
    }
  }
  physics.clear(); physics.createStage(stage);
  for (const e of physics.entities.filter(e => e.timedGate))
    assert.ok(Math.abs(e.body.GetAngle() - timedGateAngle(e.timedGate, 0)) < 0.001, 'gate resets to its own phase');
  const results = [];
  for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 9, 28, 100, 200, 300])) {
    for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456, 271828, 314159])) {
      let seed = initial;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
      race.startRace([Math.max(1, count - 1), count], 'desc');
      let first = 0, earlyLeader, escaped = 0, shakes = 0, late;
      const left = new Set(), right = new Set(), lifted = new Set(), launch = new Set();
      const depth = new Map(), launchDepth = new Map();
      const shake = physics.shakeMarble.bind(physics);
      physics.shakeMarble = id => { shakes++; shake(id); };
      const wallStart = performance.now();
      while (race.state === 'running' && race.elapsed < 100) {
        race.advance();
        for (const ball of race.balls) if (!ball.rank) {
          if (!inside(ball, stage.art.contours[0]) || (ball.y > 54 && inside(ball, stage.art.contours[1]))) escaped++;
          if (ball.y < 22) {
            launchDepth.set(ball.id, Math.max(launchDepth.get(ball.id) ?? 0, ball.y));
            if (launchDepth.get(ball.id) - ball.y > 3) launch.add(ball.id);
          }
          if (ball.y > 57 && ball.y < 67) {
            if (ball.x < 20) {
              left.add(ball.id); depth.set(ball.id, Math.max(depth.get(ball.id) ?? 0, ball.y));
              if (depth.get(ball.id) - ball.y > 3) lifted.add(ball.id);
            } else if (ball.x > 28) right.add(ball.id);
          }
        }
        if (earlyLeader === undefined && race.elapsed >= 3)
          earlyLeader = race.balls.reduce((a, b) => a.y > b.y ? a : b).id;
        if (!first && race.arrivals.length) first = race.elapsed;
        if (!late && race.elapsed >= 60) late = race.balls.filter(b => !b.rank).slice(0, 6).map(b => [b.x, b.y]);
      }
      physics.shakeMarble = shake;
      const result = { count, initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2),
        arrived: race.arrivals.length, left: left.size, right: right.size, launch: launch.size,
        lifted: lifted.size, leaderWon: race.arrivals[0]?.id === earlyLeader, escaped, shakes, late,
        msPerStep: +( (performance.now() - wallStart) / (race.elapsed * 60)).toFixed(2),
        remaining: race.balls.filter(b => !b.rank).slice(0, 5).map(b => [b.x, b.y]) };
      console.log(JSON.stringify(result)); results.push(result);
    }
  }
  for (const result of results) {
    assert.equal(result.arrived, result.count, 'every marble must reach the finish');
    assert.equal(result.escaped, 0, 'marbles must stay inside the actual course');
    assert.ok(result.first >= 6 && result.finish < 80, 'race must have time to mix, then fully drain');
  }
  const packs = results.filter(r => r.count === 28);
  if (packs.length >= 3) {
    assert.ok(packs.every(r => r.left > 0 && r.right > 0), 'both final routes must actually carry marbles');
    assert.ok(packs.some(r => !r.leaderWon), 'a starting leader must not always win');
    assert.ok(packs.every(r => r.launch > 0), 'launch fans must visibly lift the marbles');
    assert.ok(packs.some(r => r.lifted > 0), 'the last headwind must return some marbles uphill');
  }
  console.log('PASS jackpot gate collision, spin cycles, map storage, containment, finish times and route mixing');
  physics.clearMarbles(); physics.clear();
})().catch(error => { console.error(error); process.exitCode = 1; });
