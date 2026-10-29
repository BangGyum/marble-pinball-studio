const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../src/assets/effects/dolphin-v1/preview.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ctx = new Proxy({}, { get: (o, k) => k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (k in o ? o[k] : () => {}),
  set: (o, k, v) => (o[k] = v, true) });
const canvas = () => ({ width: 0, height: 0, getContext: () => ctx });
const elements = Object.fromEntries(['left', 'right', 'pause', 'replay', 'guide', 'load-state', 'jump-still', 'splash-still', 'dark', 'beige']
  .map(id => [id, { ...canvas(), checked: true, setAttribute(k, v) { this[k] = v; } }]));
const sandbox = vm.createContext({ document: { hidden: false, getElementById: id => elements[id], createElement: canvas, addEventListener() {} },
  matchMedia: () => ({ matches: false, addEventListener() {} }), Path2D: class { moveTo() {} lineTo() {} quadraticCurveTo() {} },
  Image: class { decode() { return Promise.resolve(); } }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
const run = code => vm.runInContext(code, sandbox);
run(source);
run('const originalPose = pose;');
const length = Math.hypot(86, -10), tangent = { x: 86 / length, y: -10 / length }, normal = { x: -10 / length, y: -86 / length };
const near = (actual, expected, message, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${message}: ${actual} vs ${expected}`);
// A grazing impact against a stationary body must keep tangential speed.
// The old preview overwrote both axes with a scripted upward launch.
const initial = { x: 325 + normal.x * 22.5, y: 165 + normal.y * 22.5,
  vx: tangent.x * 50 - normal.x * 100, vy: tangent.y * 50 - normal.y * 100, age: -1 };
run(`pose = () => ({x:320,y:160,angle:0}); time = .1; direction = 1; balls = [${JSON.stringify(initial)}]; update(1 / 240);`);
const bounce = run('balls[0]');
near(bounce.vx * tangent.x + bounce.vy * tangent.y, 50, 'wall collision preserves tangential velocity');
near(bounce.vx * normal.x + bounce.vy * normal.y, 55, 'wall collision reflects the inward normal component');
console.log('PASS dolphin glancing collision uses contact-normal reflection');

(async () => {
  await new Promise(resolve => setImmediate(resolve));
  const contact = run('resolveContact'), p = { x: 320, y: 160, angle: 0 };
  let contactCases = 0;
  for (const dir of [1, -1]) for (const angle of [0, .7]) {
    run(`direction = ${dir};`); p.angle = angle;
    const world = (x, y) => ({ x: dir * (Math.cos(angle) * x - Math.sin(angle) * y), y: Math.sin(angle) * x + Math.cos(angle) * y });
    for (const [qx, qy, nx, ny] of [[5, 5, normal.x, normal.y], [5, 5, -normal.x, -normal.y],
      [48, 0, tangent.x, tangent.y], [-38, 10, -tangent.x, -tangent.y]]) {
      const n = world(nx, ny), q = world(qx, qy), t = { x: -n.y, y: n.x };
      for (const motion of [{ vx: 0, vy: 0, omega: 0 }, { vx: 110, vy: -90, omega: 0 }, { vx: 30, vy: 20, omega: .8 }]) {
        const surface = world(qx + nx * 14, qy + ny * 14);
        const wall = { x: motion.vx - motion.omega * surface.y, y: motion.vy + motion.omega * surface.x };
        const make = inward => ({ x: p.x + q.x + n.x * 22.5, y: p.y + q.y + n.y * 22.5,
          vx: wall.x + t.x * 30 + n.x * inward, vy: wall.y + t.y * 30 + n.y * inward, age: -1 });
        const b = make(-100);
        assert.equal(contact(b, p, motion), true);
        near((b.vx - wall.x) * n.x + (b.vy - wall.y) * n.y, 55, 'normal reflection in moving-wall coordinates');
        near((b.vx - wall.x) * t.x + (b.vy - wall.y) * t.y, 30, 'grazing velocity is unchanged');
        near(Math.hypot(b.x - p.x - q.x, b.y - p.y - q.y), 23.02, 'overlap is separated to the surface');
        const velocity = [b.vx, b.vy];
        assert.equal(contact(b, p, motion), false);
        assert.deepEqual([b.vx, b.vy], velocity, 'same contact never launches twice');
        const leaving = make(80), before = [leaving.vx, leaving.vy];
        assert.equal(contact(leaving, p, motion), false);
        assert.deepEqual([leaving.vx, leaving.vy], before, 'a separating ball does not bounce');
        const slow = make(-5); contact(slow, p, motion);
        near((slow.vx - wall.x) * n.x + (slow.vy - wall.y) * n.y, 0, 'slow contact settles without adding bounce');
        const outside = make(-100); outside.x += n.x * 10; outside.y += n.y * 10;
        assert.equal(contact(outside, p, motion), false, 'no impulse before touching');
        contactCases++;
      }
    }
  }
  console.log(`PASS ${contactCases} stationary/moving/rotating contact cases, mirrored directions and separation`);

  const simulate = (fps, dir, count = 9) => {
    run(`pose = originalPose; restart(${dir});`);
    if (count === 100) run(`balls = Array.from({length:100},(_,i)=>({x:direction===1?20+i%20*30:620-i%20*30,
      y:115+Math.floor(i/20)*16,vx:0,vy:0,age:-1,hitAngle:0,impact:0,color:'#8edcce'}));`);
    run(`for(let i=0;i<${fps * 6};i++) update(1/${fps});`);
    return JSON.parse(run('JSON.stringify({time,balls})'));
  };
  let maxFpsDelta = 0;
  for (const count of [9, 100]) {
    const baseline = simulate(60, 1, count);
    assert.ok(baseline.balls.some(b => b.age >= 0), 'the real preview path makes contact');
    for (const fps of [30, 120, 144]) {
      const other = simulate(fps, 1, count);
      near(other.time, baseline.time, 'display rate does not change physics time');
      for (let i = 0; i < count; i++) for (const key of ['x', 'y', 'vx', 'vy', 'age']) {
        const delta = Math.abs(other.balls[i][key] - baseline.balls[i][key]);
        maxFpsDelta = Math.max(maxFpsDelta, delta); near(other.balls[i][key], baseline.balls[i][key], `same trajectory at ${fps}Hz`);
      }
    }
    const mirrored = simulate(60, -1, count);
    for (let i = 0; i < count; i++) {
      near(baseline.balls[i].x + mirrored.balls[i].x, 640, 'left/right position symmetry', 1e-6);
      near(baseline.balls[i].vx + mirrored.balls[i].vx, 0, 'left/right speed symmetry', 1e-6);
      near(baseline.balls[i].y, mirrored.balls[i].y, 'same vertical response in both directions', 1e-6);
      assert.ok(Object.values(mirrored.balls[i]).filter(v => typeof v === 'number').every(Number.isFinite));
    }
  }
  console.log('PASS 9/100 balls: identical 30/60/120/144Hz trajectories and left/right symmetry');

  for (const fps of [20, 30, 60, 120, 144]) {
    run('pose = originalPose; restart(1); previous = 1000;');
    run(`for(let i=1;i<=${fps};i++) tick(1000+i*1000/${fps});`);
    near(run('time'), 1, `animation clock keeps elapsed time at ${fps}Hz`);
  }
  console.log('PASS callback timing at 20/30/60/120/144Hz');

  run('direction = 1; pose = originalPose;');
  const arcSample = t => {
    const h = .0001, a = run(`pose(${t - h})`), p = run(`pose(${t})`), b = run(`pose(${t + h})`);
    return { ...p, vx: (b.x - a.x) / (2 * h), vy: (b.y - a.y) / (2 * h), ay: (b.y - 2 * p.y + a.y) / (h * h) };
  };
  const period = run('duration / 3'), rising = arcSample(period * .3), apex = arcSample(period * .5);
  near(rising.ay, apex.ay, 'airborne arc has constant downward acceleration', .001);
  assert.ok(apex.ay > 0, 'gravity continues pulling downward throughout the flight');
  near(rising.angle, Math.atan2(rising.vy, rising.vx), 'body pitch follows the actual flight tangent', 1e-6);
  near(apex.vy, 0, 'the crest has no vertical velocity', .00001);
  const startPhase = run('airStart'), endPhase = run('airEnd'), surface = run('waterY');
  const bodyHalfWidth = run('bodyWidth / 2'), bodyHalfHeight = bodyHalfWidth * 626 / 1675;
  for (const turn of [period, 2 * period]) for (const offset of [-.03, 0, .03]) {
    const p = run(`pose(${turn + offset})`);
    const top = p.y - Math.abs(Math.sin(p.angle)) * bodyHalfWidth - Math.abs(Math.cos(p.angle)) * bodyHalfHeight;
    assert.ok(top > surface, 'the entire sprite stays submerged briefly while turning toward the next jump');
  }
  for (const hop of [0, 1, 2]) for (const phase of [startPhase, endPhase]) {
    const at = (hop + phase) * period, h = .00001;
    const a = arcSample(at - h), b = arcSample(at + h), p = run(`pose(${at})`);
    near(p.y, surface, 'splash event occurs at the water crossing', .000001);
    near(a.vy, b.vy, 'water crossing keeps a continuous velocity', .02);
    near(a.ay, b.ay, 'water crossing keeps continuous acceleration', 3);
    assert.ok(Math.abs(a.angle - b.angle) < .001, 'water entry never snaps the body angle');
    assert.ok(phase === startPhase ? a.vy < -100 : b.vy > 100, 'entry/exit retains momentum instead of hovering');
  }
  run('direction = 1;');
  const underwaterBall = { x: 325 + normal.x * 22.5, y: surface + 45 + normal.y * 22.5,
    vx: -normal.x * 100, vy: -normal.y * 100, age: -1 };
  const underwaterBefore = { ...underwaterBall };
  assert.equal(contact(underwaterBall, { x: 320, y: surface + 40, angle: 0 }, { vx: 0, vy: 0, omega: 0 }), false);
  assert.deepEqual(underwaterBall, underwaterBefore, 'hidden submerged surfaces cannot push or teleport marbles');
  for (const event of run('splashEvents')) {
    const p = run(`pose(${event.at})`);
    near(p.y + Math.sin(p.angle) * 62, surface, 'splash starts when the nose crosses the surface', .0001);
    near(p.x + Math.cos(p.angle) * 62, event.x, 'splash is placed at the nose crossing', .0001);
  }
  console.log('PASS ballistic flight acceleration and tangent-aligned pitch');
  console.log('PASS six continuous water crossings and no invisible submerged impact');

  run('direction = 1; pose = originalPose;');
  for (const landing of [5.8 / 3, 5.8 * 2 / 3]) {
    const a = run(`pose(${landing - 1e-5})`), b = run(`pose(${landing + 1e-5})`);
    assert.ok(Math.abs(a.angle - b.angle) < .001, 'landing has no instant angle flip');
    near(a.y, b.y, 'continuous landing position');
  }
  run('paused = true; previous = 0;');
  const pausedAt = run('time'); run('tick(1000);'); near(run('time'), pausedAt, 'pause does not advance physics');
  run('restart(1); update(.001);'); assert.ok(run('physicsAccumulator') > 0);
  run('restart(-1);'); assert.equal(run('physicsAccumulator'), 0);
  assert.equal(run('balls.every(b => b.age === -1 && b.vx === 0 && b.vy === 0)'), true);
  run('still(2.9);'); near(run('time'), 2.9, 'still scene follows the same physics steps');
  assert.equal(run('paused'), true);
  elements['splash-still'].onclick();
  const entryAt = run('splashEvents[1].at');
  assert.ok(run('time') > entryAt && run('time') < entryAt + .2, 'splash scene shows water entry');
  const positions = []; ctx.translate = (...args) => positions.push(args);
  run("balls=[{x:320,y:170,vx:0,vy:0,age:2,hitAngle:0,impact:0,color:'#8edcce'}]; render();");
  assert.equal(positions.filter(p => p[0] === 320 && p[1] === 170).length, 2, 'balls still render after one second in both themes');
  console.log('PASS smooth landing, pause/restart, still scene and no timed ball disappearance');
  let gradients = 0;
  ctx.createRadialGradient = () => { gradients++; return { addColorStop() {} }; };
  run("balls=Array.from({length:100},(_,i)=>({x:20+i%20*30,y:115+Math.floor(i/20)*16,age:-1,hitAngle:0,impact:0,color:'#39adce'})); guidePaths.clear(); render();");
  const warmGradients = gradients;
  run('for(let i=0;i<120;i++) render();');
  assert.equal(gradients, warmGradients, '100 marbles reuse highlights over repeated frames');
  assert.equal(run('guidePaths.size'), 1, 'both themes share a guide for the current direction');
  positions.length = 0;
  run("balls=[{x:320,y:1000,age:2,hitAngle:0,impact:0,color:'#39adce'}]; render();");
  assert.equal(positions.filter(p => p[0] === 320 && p[1] === 1000).length, 0, 'offscreen marbles do not render');
  console.log('PASS 100-marble highlight/guide reuse and offscreen culling');
  run('restart(1); render(); restart(-1); render();');
  const cacheSizes = run('[ballSprites.size, guidePaths.size].join()');
  run('for(let i=0;i<10;i++){update(20);render();}');
  near(run('time'), 0, 'ten full 20-second cycles reset without clock drift');
  assert.equal(run('[ballSprites.size, guidePaths.size].join()'), cacheSizes, 'repeating the effect does not grow its caches');
  assert.equal(run('balls.every(b=>[b.x,b.y,b.vx,b.vy].every(Number.isFinite))'), true);
  console.log('PASS ten 20-second cycles without invalid state or cache growth');
  const output = path.join(__dirname, '../.test-build/dolphin-bounce'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ scope: 'Standalone dolphin preview only; not game/LAN integration',
    contactCases, participantCounts: [9, 100], displayRates: [30, 60, 120, 144], maxFpsDelta,
    tangentialSpeedBefore: 50, oldTangentialSpeedAfter: 103.74383331954519, tangentialSpeedAfter: 50,
    separatingContacts: 'PASS', overlapCorrection: 'PASS', mirroredDirections: 'PASS', pauseRestart: 'PASS', noTimedFade: 'PASS',
    callbackRates: [20, 30, 60, 120, 144], cachedHighlights: 'PASS', cachedGuide: 'PASS', offscreenCulling: 'PASS',
    repeatedCycles: 10, cacheGrowth: 0, ballisticArc: 'PASS', tangentAlignedPitch: 'PASS',
    continuousWaterCrossings: 6, submergedTurn: 'PASS', submergedImpact: 'blocked' }, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
