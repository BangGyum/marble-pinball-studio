const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.fetch = undefined;
const { dolphinRows, validateDolphins, dolphinPose, dolphinScale, dolphinBounce, dolphinWave, DOLPHIN_DURATION, DOLPHIN_SWIM, DOLPHIN_WIDTH } = require('../src/dolphin.ts');
const { Race } = require('../src/race.ts'), { stages } = require('../src/data/maps.ts');
const { encodeScene, decodeScene } = require('../src/lan/protocol.ts');
const near = (a, b, message, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${message}: ${a} / ${b}`);
const stage = { title: 'Dolphin audit', width: 26, goalY: 100, zoomY: 95, entities: [] };
const midpoint=DOLPHIN_DURATION/2;
assert.equal(validateDolphins(undefined,stage).interval,5,'default appearances are five seconds apart');
assert.equal(dolphinScale({enabled:true,rows:[12],interval:5}),3,'100% has a three-times-larger physical base');
for (const map of [...stages, { ...stage, goalY: 20.345 }]) for (const count of [1, 3, 6]) for (const gap of [.5, 20, 100]) {
  const rows = dolphinRows(map, count, gap);
  assert.equal(validateDolphins({ enabled: true, rows, interval: 5 }, map).rows.length, count);
}
for (const value of [null, [], {}, { enabled: true, rows: [12], interval: 4.99 }, { enabled: true, rows: [12, 12], interval: 20 },
  { enabled: true, rows: [NaN], interval: 20 }, { enabled: true, rows: [101], interval: 20 },
  { enabled: true, rows: Array(7).fill(12), interval: 20 }, { enabled: true, rows: [12], interval: Infinity }])
  assert.throws(() => validateDolphins(value, stage));
const settings = { enabled: true, rows: [12, 32, 52], interval: 12 };
assert.equal(validateDolphins({ ...settings, size:150 },stage).size,150,'dolphin size is accepted in settings');
for(const size of [49,201,NaN,Infinity,'100']) assert.throws(()=>validateDolphins({...settings,size},stage));
const scene = { type: 'scene', raceId: 'audit', revision: 1, stage, settings: { names: 'a', mapId: 0, order: 'asc', picks: 1, dolphins: settings }, entities: [], fixed: [], balls: [] };
assert.deepEqual(decodeScene(encodeScene(scene)).settings.dolphins, settings);
scene.settings.dolphins={...settings,size:200};
assert.deepEqual(decodeScene(encodeScene(scene)).settings.dolphins,scene.settings.dolphins,'LAN wire preserves the size');
assert.equal(dolphinScale(settings),3); assert.equal(dolphinScale({ ...settings,size:50 }),1.5);
assert.equal(dolphinWave(settings, 12).wave, 1); near(dolphinWave(settings, 12).time, 0, 'configured wave interval');
assert.ok(dolphinWave({...settings,interval:120},15,true).time<DOLPHIN_DURATION,'preview repeats during a long actual appearance interval');
assert.equal(dolphinWave({...settings,interval:120},15).wave,0,'preview does not change actual race timing');
assert.equal(dolphinWave({...settings,interval:5},5).wave,1,'five-second appearances repeat on time');
assert.ok(DOLPHIN_DURATION+.65<=5+1e-9,'a full traversal and splash finish before the next default appearance');
const period=DOLPHIN_DURATION/3;
assert.ok(period*DOLPHIN_SWIM<=.15,'the submerged turn returns to the next jump immediately');
for(const scale of [1.5,3,6])for(const hop of [0,1]){
  const landing=(hop+1-DOLPHIN_SWIM/2)*period,launch=(hop+1+DOLPHIN_SWIM/2)*period;
  const a=dolphinPose(stage,32,landing,1,scale),b=dolphinPose(stage,32,launch,1,scale);
  near(a.y,32,'landing meets the waterline');near(b.y,32,'next launch meets the same waterline');
  assert.ok(b.x-a.x<DOLPHIN_WIDTH*scale*.2,'submerged horizontal travel is a small fraction of the body length');
  for(const at of [landing,launch]){
    const h=1e-5,left=dolphinPose(stage,32,at-h,1,scale),p=dolphinPose(stage,32,at,1,scale),right=dolphinPose(stage,32,at+h,1,scale);
    near((p.y-left.y)/h,(right.y-p.y)/h,'waterline velocity stays continuous',.05);
    near(left.angle,right.angle,'body pitch does not snap at the waterline',.002);
    const before=dolphinPose(stage,32,at-2*h,1,scale),after=dolphinPose(stage,32,at+2*h,1,scale);
    near((p.y-2*left.y+before.y)/(h*h),(after.y-2*right.y+p.y)/(h*h),'waterline acceleration stays continuous',1);
  }
}
for (const time of [0, .5, 1.5, 1.933, 3, 5.7]) {
  const a = dolphinPose(stage, 20, time), b = dolphinPose(stage, 20, time, -1);
  near(a.x + b.x, 26, 'mirrored dolphin positions'); near(a.y, b.y, 'mirrored dolphin heights');
}
const n = { x: -10 / Math.hypot(86, -10), y: -86 / Math.hypot(86, -10) }, tangent = { x: -n.y, y: n.x };
const pose = { x: 13, y: 20, angle: 0, direction: 1, waterY: 30 };
const ball = { x: 13 + 5 / 36 + n.x * .63, y: 20 + 5 / 36 + n.y * .63,
  vx: -n.x * 10 + tangent.x * 3, vy: -n.y * 10 + tangent.y * 3 };
const velocity = dolphinBounce(ball, pose, { vx: 0, vy: 0, omega: 0 }); assert.ok(velocity?.hit);
near(velocity.vx * n.x + velocity.vy * n.y, 5.5, 'normal reflection');
near(velocity.vx * tangent.x + velocity.vy * tangent.y, 3, 'tangential momentum');
assert.equal(dolphinBounce({ ...ball, y: ball.y + 20 }, { ...pose, y: 40 }, { vx: 0, vy: 0, omega: 0 }), undefined, 'submerged surfaces do not hit');
for(const scale of [1.5,3,6]) {
  const point={...ball,x:13+5/36*scale+n.x*(14/36*scale+.24),y:20+5/36*scale+n.y*(14/36*scale+.24)};
  const result=dolphinBounce(point,{...pose,scale},{vx:0,vy:0,omega:0});
  assert.ok(result?.hit); near(result.vx*n.x+result.vy*n.y,5.5,'scaled surface has the same normal reflection');
  assert.equal(dolphinBounce({...point,x:point.x+n.x*.02,y:point.y+n.y*.02},{...pose,scale},{vx:0,vy:0,omega:0}),undefined,
    'ball radius stays .25 at every dolphin size');
  const small=dolphinPose(stage,20,midpoint,1,scale), mirrored=dolphinPose(stage,20,midpoint,-1,scale);
  near(small.x+mirrored.x,26,'scaled mirrored paths');near(20-small.y,2.5*scale,'scaled jump height');
}
console.log('PASS dolphin size/bounds, legacy default, actual/preview timing, LAN wire, mirror and scaled collision reflection');
(async () => {
  const race = new Race(); await race.physics.init();
  let seed = 42; const random = Math.random;
  const resetSeed = () => { seed = 42; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const names = Array.from({ length: 100 }, (_, i) => String(i));
  const run = async effect => {
    resetSeed(); const sample=new Race(); await sample.physics.init();
    try { sample.prepare(stage,names,effect); sample.startRace([1,1]); for(let i=0;i<240;i++)sample.advance(); return JSON.stringify(sample.balls); }
    finally { sample.physics.dispose(); }
  };
  try {
    assert.ok(await run() === await run({ ...settings, enabled: false }), 'disabled dolphins preserve exact physics');
    assert.ok(await run(settings) === await run({...settings,size:100}),'legacy and explicit 100% sizes preserve exact physics');
    race.prepare(stage, ['contact'], { enabled: true, rows: [20], interval: 20 }); race.startRace([1, 1]);
    race.elapsed = midpoint; const p = dolphinPose(stage, 20, midpoint);
    race.physics.placeMarble(0, p.x, p.y - .4); race.physics.setMarbleVelocity(0, 0, 10);
    let impacts = 0; const setVelocity = race.physics.setMarbleVelocity.bind(race.physics);
    race.physics.setMarbleVelocity = (...args) => { impacts++; setVelocity(...args); };
    race.advance(); assert.ok(impacts > 0, 'the real Box2D race receives the dolphin impact');
    assert.ok(race.physics.getMarbleVelocity(0).vy < 0, 'contact reflects downward velocity upward');
    race.prepare(stage,['large contact'],{enabled:true,rows:[20],interval:20,size:200});race.startRace([1,1]);
    race.elapsed=midpoint;const scale=dolphinScale({size:200}),large=dolphinPose(stage,20,midpoint,1,scale);
    race.physics.placeMarble(0,large.x+1.55*scale,large.y);race.physics.setMarbleVelocity(0,-10,0);impacts=0;
    race.advance();assert.ok(impacts>0,'large dolphin contacts beyond the original 3-unit broad phase are included');
    for (const size of (process.argv.includes('--sizes')?[50,100,200]:[100])) for (const map of stages) {
      race.prepare(map, names, { enabled: true, rows: dolphinRows(map, 6, 20), interval: 5, size }); race.startRace([1, 1]);
      for (let i = 0; i < (process.argv.includes('--finish') ? 60 * 650 : 720) && race.state === 'running'; i++) {
        race.advance();
        for (const b of race.balls) assert.ok([b.x, b.y, b.angle].every(Number.isFinite), `${map.title}: finite marble state`);
      }
      if (process.argv.includes('--finish')) assert.equal(race.state, 'finished', `${map.title}: race completes with dolphins`);
      console.log(`PASS integrated dolphin physics: ${map.title}, size ${size}%, 100 marbles, 6 rows, 5-second interval, ${race.elapsed.toFixed(1)}s, ${race.finishReason ?? 'running'}`);
    }
  } finally { Math.random = random; race.physics.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
