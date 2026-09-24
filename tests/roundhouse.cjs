const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
global.fetch = undefined;
const { Race } = require('../src/race.ts');
const { roundhouse: stage } = require('../src/data/roundhouse.ts');
const { validateStage, saveMaps, readSavedMaps } = require('../src/model.ts');
(async () => {
  assert.deepEqual(validateStage(stage), stage);
  assert.deepEqual(stage.entities.filter(e => e.props.timedGate).map(e => e.position.y), [47], 'only the upper yard waits for a gate');
  for (const wind of stage.windZones) {
    const train = stage.entities.filter(e => e.type === 'kinematic' && e.shape.hidden && e.position.y === wind.y);
    assert.equal(train.length, 3);
    assert.ok(train.every(e => e.props.angularVelocity * wind.speed < 0), 'trains oppose the wind');
  }
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
  saveMaps(storage, [{id:'roundhouse',stage}]); assert.deepEqual(readSavedMaps(storage)[0].stage, stage);
  const race = new Race(); await race.physics.init();
  const physics = race.physics, B = physics.Box2D, random = Math.random, reports = [], problems = [];
  const listener = new B.JSContactListener(), contacts = new Map();
  let bodyIndices = new Map(), run = '';
  let trainHits = [new Set(),new Set()];
  listener.BeginContact = pointer => {
    const contact = B.wrapPointer(pointer, B.b2Contact);
    const a = contact.GetFixtureA().GetBody(), b = contact.GetFixtureB().GetBody();
    for (const [body, other] of [[a,b],[b,a]]) {
      const index = bodyIndices.get(B.getPointer(body));
      if (index === undefined || other.GetType() !== B.b2_dynamicBody) continue;
      const entity=stage.entities[index];
      if(entity.type==='kinematic' && entity.shape.hidden) trainHits[entity.position.y===28?0:1].add(B.getPointer(other));
      const ids = contacts.get(index) ?? new Set(); ids.add(run + '/' + B.getPointer(other)); contacts.set(index, ids);
    }
  };
  listener.EndContact = () => {}; listener.PreSolve = () => {}; listener.PostSolve = () => {};
  physics.world.SetContactListener(listener);

  try {
    for (const count of (process.argv[2] ? [Number(process.argv[2])] : [1, 20, 40])) {
      for (const initial of (process.argv[3] ? [Number(process.argv[3])] : [123456,271828,314159,161803,104729,8675309])) {
        let seed = initial;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        race.prepare(stage, Array.from({ length: count }, (_, i) => String(i)));
        bodyIndices = new Map(physics.entities.map((e,i) => [B.getPointer(e.body),i])); run = count + '/' + initial;
        trainHits = [new Set(),new Set()];
        race.startRace([Math.max(1,count-1),count], 'desc');
        let first = 0, escaped = 0, lastEscaped;

        while (race.state === 'running' && race.elapsed < 120) {
          race.advance();
          if (!first && race.arrivals.length) first = race.elapsed;
          for (const ball of race.balls) if (!ball.rank) {
            if (ball.x < 5.5 || ball.x > 42.5 || [28,72].some(y => {
              const distance=Math.hypot(ball.x-24,ball.y-y);
              return distance<10.7 || (Math.abs(ball.y-y)<18 && Math.abs(ball.x-24)>4.1 && distance>18.1);
            })) {escaped++;lastEscaped=[ball.id,ball.x,ball.y];}
          }
        }
        const report = {count,seed:initial,first:+first.toFixed(2),finish:+race.elapsed.toFixed(2),reason:race.finishReason,
          trainHits:trainHits.map(s=>s.size),arrived:race.arrivals.length,escaped,lastEscaped,rescues:race.rescues,
          remaining:race.balls.filter(b=>!b.rank || b.y<stage.goalY).map(b=>[b.id,+b.x.toFixed(2),+b.y.toFixed(2)])};
        reports.push(report); console.log(JSON.stringify(report));
        if (race.finishReason!=='arrived' || report.remaining.length || escaped || race.rescues) problems.push(report);
        assert.ok(race.arrivals.every(b=>b.x>21.8 && b.x<26.2),'finish chute aligns');
      }
    }
    const devices=stage.entities.map((e,i)=>({i,kind:e.shape.boostSpeed?'boost':e.shape.type,moving:e.type==='kinematic',
      x:e.position.x,y:e.position.y,hits:contacts.get(i)?.size??0})).filter(e=>e.kind!=='polyline'||e.moving);
    console.log('DEVICES',JSON.stringify(devices));
    if (!process.argv[3]) {
      for (const e of devices) if (e.moving && !e.hits) problems.push({unreached:e});

    }
    if (!process.argv[3]) {
      const measured = reports.filter(r => r.count === 20);
      if (measured.length) for (const yard of [0,1]) {
        const hitCount = measured.reduce((sum,r) => sum + r.trainHits[yard],0);
        assert.ok(hitCount >= measured.length * 20 * 0.5, 'at least half of marbles meet each train across the fixed seeds');
      }
    }
    assert.deepEqual(problems, [], 'natural completion, no wall escapes or rescue teleports, and every device used');
    console.log('PASS roundhouse: storage, real physics, containment, train contact coverage ('+reports.length+' races)');
  } finally { Math.random=random; physics.world.SetContactListener(0); B.destroy(listener); physics.clearMarbles(); physics.clear(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
