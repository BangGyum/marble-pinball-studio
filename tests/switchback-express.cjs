const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { switchbackExpress: stage } = require('../src/data/switchback-express.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
function inside(ball, points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > ball.y) !== (b[1] > ball.y) && ball.x < (b[0] - a[0]) * (ball.y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
(async () => {
  assert.deepEqual(validateStage(stage), stage);
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
  saveMaps(storage, [{id:'express',stage}]); assert.deepEqual(readSavedMaps(storage)[0].stage, stage);
  const race = new Race(); await race.physics.init();
  const physics = race.physics, B = physics.Box2D, random = Math.random, reports = [], problems = [];
  const listener = new B.JSContactListener(), contacts = new Map();
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
  const routeTotals = [0,0,0,0];
  try {
    for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 40])) {
      for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456,271828,314159,161803,104729,8675309])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        bodyIndices = new Map(physics.entities.map((e,i) => [B.getPointer(e.body),i])); run = count + '/' + initial;
        race.startRace([Math.max(1,count-1),count], 'desc');
        let first = 0, escaped = 0, lastEscaped;
        const routes = [new Set(),new Set(),new Set(),new Set()];
        while (race.state === 'running' && race.elapsed < 90) {
          race.advance();
          if (!first && race.arrivals.length) first = race.elapsed;
          for (const ball of race.balls) if (!ball.rank) {
            if (!stage.art.contours.some(p => inside(ball,p))) {escaped++;lastEscaped=[ball.id,ball.x,ball.y];}
            if (ball.y>23 && ball.y<26) routes[ball.x<40?0:1].add(ball.id);
            if (ball.y>88 && ball.y<93) routes[ball.x>20?2:3].add(ball.id);
          }
        }
        const report = {count,seed:initial,first:+first.toFixed(2),finish:+race.elapsed.toFixed(2),reason:race.finishReason,
          arrived:race.arrivals.length,escaped,lastEscaped,rescues:race.rescues,routes:routes.map(r=>r.size),
          remaining:race.balls.filter(b=>!b.rank || b.y<stage.goalY).map(b=>[b.id,+b.x.toFixed(2),+b.y.toFixed(2)])};
        reports.push(report); console.log(JSON.stringify(report));
        report.routes.forEach((n,i)=>routeTotals[i]+=n);
        if (race.finishReason!=='arrived' || report.remaining.length || escaped || race.rescues) problems.push(report);
        assert.ok(race.arrivals.every(b=>b.x>28.6 && b.x<35.4),'finish chute aligns');
      }
    }
    const devices=stage.entities.map((e,i)=>({i,kind:e.shape.boostSpeed?'boost':e.shape.type,moving:e.type==='kinematic',
      x:e.position.x,y:e.position.y,hits:contacts.get(i)?.size??0})).filter(e=>e.kind!=='polyline'||e.moving);
    console.log('DEVICES',JSON.stringify(devices),'ROUTES',JSON.stringify(routeTotals));
    if (!process.argv[3]) {
      for (const e of devices) if (!e.hits) problems.push({unreached:e});
      assert.ok(routeTotals.every(n=>n>0),'both mainline and both shortcuts carry marbles');
    }
    assert.deepEqual(problems, [], 'natural completion, no wall escapes or rescue teleports, and every device used');
    console.log('PASS switchback express: storage, real physics, containment, device and branch coverage ('+reports.length+' races)');
  } finally { Math.random=random; physics.world.SetContactListener(0); B.destroy(listener); physics.clearMarbles(); physics.clear(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
