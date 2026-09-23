const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { neonCrossway: stage } = require('../src/data/neon-crossway.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
const inside = (ball, points) => {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > ball.y) !== (b[1] > ball.y) && ball.x < (b[0] - a[0]) * (ball.y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
(async () => {
  assert.deepEqual(validateStage(stage), stage);
  const distance = (p, a, b) => {
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const t = Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  };
  const walls = stage.entities.filter(e => e.type === 'static' && e.shape.type === 'polyline').flatMap(e => {
    const p=e.shape.points;
    return p.slice(1).flatMap((b,i) => {
      const a=p[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]),d=e.shape.backing||0;
      const n=[(b[1]-a[1])*d/l,(a[0]-b[0])*d/l];
      const c=[b[0]+n[0],b[1]+n[1]],f=[a[0]+n[0],a[1]+n[1]];
      return [[a,b],[b,c],[c,f],[f,a]].filter(([a,b])=>a[0]!==b[0]||a[1]!==b[1]);
    });
  });
  for (const e of stage.entities.filter(e=>e.type==='kinematic')) {
    const radius=Math.max(...e.shape.points.map(p=>Math.hypot(...p)));
    const gap=Math.min(...walls.map(([a,b])=>distance([e.position.x,e.position.y],a,b)))-radius;
    assert.ok(gap>=0.55,'triangle sweep leaves marble clearance: '+gap);
  }
  for (const e of stage.entities.filter(e=>e.shape.boostSpeed)) {
    const s=e.shape,c=Math.cos(s.rotation),n=Math.sin(s.rotation);
    for(let x=-s.width;x<=s.width+0.01;x+=s.width/4) for(let y=-s.height;y<=s.height+0.01;y+=s.height/4) {
      const p={x:e.position.x+x*c-y*n,y:e.position.y+x*n+y*c};
      assert.ok(inside(p,stage.art.contours[0]),'boost pad lies fully inside the course');
      assert.ok(Math.min(...walls.map(([a,b])=>distance([p.x,p.y],a,b)))>0.05,'boost pad clears solid rails: '+JSON.stringify({centre:e.position,p}));
    }
  }
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  saveMaps(storage, [{ id: 'crossway', stage }]);
  assert.deepEqual(readSavedMaps(storage)[0].stage, stage);
  const race = new Race(); await race.physics.init();
  const physics = race.physics, B = physics.Box2D, random = Math.random, contacts = new Map();
  const listener = new B.JSContactListener();
  let bodyIndices = new Map(), run = '';
  listener.BeginContact = pointer => {
    const contact = B.wrapPointer(pointer, B.b2Contact);
    const a = contact.GetFixtureA().GetBody(), b = contact.GetFixtureB().GetBody();
    for (const [body, other] of [[a,b],[b,a]]) {
      const index = bodyIndices.get(B.getPointer(body));
      if (index === undefined || other.GetType() !== B.b2_dynamicBody) continue;
      const ids = contacts.get(index) ?? new Set(); ids.add(run + '/' + B.getPointer(other)); contacts.set(index, ids);
    }
  };
  listener.EndContact = () => {}; listener.PreSolve = () => {}; listener.PostSolve = () => {};
  physics.world.SetContactListener(listener);
  try {
    for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 40])) {
      for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456, 271828, 314159, 161803])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        bodyIndices = new Map(physics.entities.map((e,i) => [B.getPointer(e.body),i])); run = count + '/' + initial;
        race.startRace([Math.max(1, count - 1), count], 'desc');
        let first = 0, escaped = 0;
        const paths = [new Set(), new Set(), new Set()];
        while (race.state === 'running' && race.elapsed < 70) {
          race.advance();
          if (!first && race.arrivals.length) first = race.elapsed;
          for (const ball of race.balls) if (!ball.rank) {
            if (!inside(ball, stage.art.contours[0])) escaped++;
            if (ball.y > 20 && ball.y < 70) paths[ball.x < 28 ? 0 : ball.x > 36 ? 2 : 1].add(ball.id);
          }

        }
        console.log(JSON.stringify({count, seed: initial, first: +first.toFixed(2), finish: +race.elapsed.toFixed(2),
          arrived: race.arrivals.length, escaped, paths: paths.map(p => p.size),
          remaining: race.balls.filter(b => !b.rank).map(b => [b.id, +b.x.toFixed(2), +b.y.toFixed(2)])}));
        assert.equal(escaped, 0, 'no marble escapes the outer walls');
        assert.equal(race.arrivals.length, count, 'all marbles finish');
        assert.ok(race.arrivals.every(b => b.x > 29.5 && b.x < 34.5), 'finish chute aligns with the checker stripe');
      }
    }
    console.log('CONTACTS', JSON.stringify(stage.entities.map((e,i) => ({i, type:e.shape.type, x:e.position.x, y:e.position.y, count:contacts.get(i)?.size ?? 0}))));
    if (!process.argv[3]) for (const [i,e] of stage.entities.entries()) {
      if (e.shape.type === 'circle' || e.type === 'kinematic' || e.shape.boostSpeed !== undefined)
        assert.ok(contacts.has(i), 'every device must meet real marble paths: '+i);
    }
    console.log('PASS crossway gameplay, containment, device use and storage');
  } finally { Math.random = random; physics.world.SetContactListener(0); B.destroy(listener); physics.clearMarbles(); physics.clear(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
