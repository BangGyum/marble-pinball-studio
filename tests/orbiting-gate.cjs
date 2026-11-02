const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { orbitingGate: stage, orbitingBowl: bowl } = require('../src/data/orbiting-gate.ts');

(async () => {
  const race = new Race(); await race.physics.init();
  const physics = race.physics, random = Math.random;
  try {
    for (const phase of [0, 5, 10, 15]) for (const open of [false, true]) {
      physics.clearMarbles(); physics.clear();
      physics.createStage({ ...stage, windZones: [], entities: [stage.entities[3]] });
      for (let i = 0; i < phase * 60; i++) physics.step(1 / 60);
      const angle = physics.getEntities()[0].angle - Math.PI / 3 + (open ? 0 : Math.PI);
      physics.createMarble(0, bowl.x + 11.8 * Math.cos(angle), bowl.y + 11.8 * Math.sin(angle));
      physics.start(); physics.setMarbleVelocity(0, -Math.cos(angle) * 14, -Math.sin(angle) * 14);
      let minimum = Infinity;
      for (let i = 0; i < 20; i++) {
        physics.step(1 / 60); const p = physics.getMarblePosition(0);
        minimum = Math.min(minimum, Math.hypot(p.x - bowl.x, p.y - bowl.y));
      }
      assert.ok(open ? minimum < 8 : minimum > 9.8, `rotating ring phase ${phase}: ${open ? 'open mouth admits' : 'closed arc blocks'} the marble (${minimum})`);
    }
    console.log('PASS open-mouth/closed-arc probes at four physical ring orientations');
    const unassisted = structuredClone(stage), lip = unassisted.entities[3].shape.points.at(-2), lipRadius = Math.hypot(...lip);
    lip[0] *= (bowl.ring + .65) / lipRadius; lip[1] *= (bowl.ring + .65) / lipRadius;
    const glance = (map, radius) => {
      physics.clearMarbles(); physics.clear(); physics.createStage({ ...map, windZones: [] });
      const angle = -54 * Math.PI / 180;
      physics.createMarble(0, bowl.x + radius * Math.cos(angle), bowl.y + radius * Math.sin(angle));
      physics.start(); physics.setMarbleVelocity(0, -Math.sin(angle) * 18, Math.cos(angle) * 18);
      let peak = 0;
      for (let i = 0; i < 12; i++) {
        physics.step(1 / 60); const v = physics.getMarbleVelocity(0);
        peak = Math.max(peak, Math.hypot(v.vx, v.vy));
      }
      const v = physics.getMarbleVelocity(0);
      return { ...physics.getMarblePosition(0), ...v, peak, speed: Math.hypot(v.vx, v.vy) };
    };
    const missed = glance(unassisted, 10.95), touched = glance(stage, 10.95);
    assert.ok(touched.speed < missed.speed * .7, 'the short lip physically brakes a glancing pass');
    assert.ok(touched.peak <= missed.peak, 'the guide does not add a launch impulse');
    assert.deepEqual(glance(stage, 13), glance(unassisted, 13), 'a distant pass receives no automatic help');
    console.log('PASS short guide brakes real contact without a launch impulse and leaves distant passes unchanged');
    for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 100, 300])) {
      for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [42, 123456, 271828])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        race.startRace([count, count], 'desc');
        const previous = new Map(), entered = new Set(), turns = new Map();
        let first = 0, escaped = 0, badEntry = 0;
        while (race.state === 'running' && race.elapsed < 120) {
          race.advance(); const ring = physics.getEntities()[3];
          for (const ball of race.balls) {
            const radius = Math.hypot(ball.x - bowl.x, ball.y - bowl.y), angle = Math.atan2(ball.y - bowl.y, ball.x - bowl.x);
            const old = previous.get(ball.id);
            if (ball.rank) {
              assert.ok(radius <= stage.goalArea.radius + 1e-5, 'the actual finish is inside the central drain');
              continue;
            }
            if (ball.y > 14 && radius > bowl.radius + .15) escaped++;
            if (old) {
              turns.set(ball.id, (turns.get(ball.id) ?? 0) + Math.atan2(Math.sin(angle - old.angle), Math.cos(angle - old.angle)));
              if (old.radius > 10.2 && radius <= 10.2) {
                const difference = Math.atan2(Math.sin(angle - ring.angle + Math.PI / 3), Math.cos(angle - ring.angle + Math.PI / 3));
                if (Math.abs(difference) > (bowl.halfGap + 6) * Math.PI / 180) badEntry++;
                entered.add(ball.id);
              }
            }
            previous.set(ball.id, { radius, angle });
          }
          if (!first && race.arrivals.length) first = race.elapsed;
        }
        const minTurns = Math.min(...turns.values()) / (Math.PI * 2);
        console.log(JSON.stringify({ count, seed: initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2),
          arrived: race.arrivals.length, reason: race.finishReason, entered: entered.size, escaped, badEntry,
          minTurns: +minTurns.toFixed(2), rescues: race.rescues }));
        assert.equal(race.finishReason, 'arrived', 'finish naturally without timeout ranking');
        assert.equal(race.arrivals.length, count);
        assert.equal(entered.size, count, 'every marble passes the moving mouth');
        assert.equal(escaped, 0, 'every-frame checks keep marbles inside the bowl');
        assert.equal(badEntry, 0, 'no shortcut through the closed part of the rotating ring');
        assert.ok(minTurns > .5 && first > 4 && race.elapsed < 110, 'circulate before arrival and keep the last marble within a bounded race');
      }
    }
    race.prepare(stage, ['다시 시작']);
    assert.equal(race.elapsed, 0); assert.equal(race.arrivals.length, 0);
    assert.ok(Math.abs(physics.getEntities()[3].angle) < 1e-5, 'reset restores the mouth angle');
  } finally { Math.random = random; physics.dispose(); }
  console.log('PASS orbiting gate: natural completion, circulation, central capture, collision containment and reset');
})().catch(error => { console.error(error); process.exitCode = 1; });
