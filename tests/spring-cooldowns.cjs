const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
global.fetch=undefined;
const {SpringCooldowns}=require('../src/spring-cooldowns.ts'),{Race}=require('../src/race.ts'),{springLab}=require('../src/data/spring-lab.ts'),{validateStage}=require('../src/model.ts');
(async()=>{
 let now=1000;const ledger=new SpringCooldowns(()=>now),a={},b={};
 const springs=springLab.entities.filter(e=>e.shape.spring).map(e=>e.shape);
 ledger.consume(springs[0],a);assert.equal(ledger.remaining(springs[0],b),5000);
 ledger.consume(springs[1],a);assert.equal(ledger.remaining(springs[1],a),10000);assert.equal(ledger.remaining(springs[1],b),0);assert.equal(ledger.remaining(springs[2],a),0);
 now+=5000;assert.equal(ledger.remaining(springs[0],a),0);assert.equal(ledger.remaining(springs[1],a),5000);
 now+=5000;assert.equal(ledger.remaining(springs[1],a),0);
 for(const cooldown of [null,{scope:'oops',seconds:5},{scope:'shared',seconds:0},{scope:'personal',seconds:121}]){
 const stage=structuredClone(springLab);stage.entities.find(e=>e.shape.spring).shape.spring.cooldown=cooldown;assert.throws(()=>validateStage(stage));
 }
 const race=new Race();await race.physics.init();race.springCooldowns.now=()=>now;
 const [top,lower,other]=springLab.entities.flatMap((e,i)=>e.shape.spring?[i]:[]);
 try{
 race.prepare(springLab,['test']);race.startRace([1,1]);
 assert.equal(race.activateSpring(top,a),true);assert.equal(race.activateSpring(top,b),false);
 assert.equal(race.activateSpring(lower,a),true);assert.equal(race.activateSpring(lower,b),false);
 assert.equal(race.springStatuses(b).find(s=>s[0]===lower)[1],0,'busy rejection consumes no personal cooldown');
 assert.equal(race.activateSpring(other,a),true,'two personal devices are independent');
 for(let i=0;i<65;i++)race.advance();
 assert.equal(race.activateSpring(lower,a),false,'physical return does not end personal cooldown');
 assert.equal(race.activateSpring(lower,b),true,'another person can activate after return');
 assert.equal(race.activateSpring(top,b),false,'simulation time cannot expire wall-clock cooldown');
 race.pause();now+=5000;assert.equal(race.activateSpring(top,b),false,'paused input rejected even after expiration');race.pause();
 assert.equal(race.activateSpring(top,b),true,'shared cooldown expires at five real seconds');
 now+=5000;for(let i=0;i<65;i++)race.advance();assert.equal(race.activateSpring(lower,a),true,'personal cooldown expires at ten real seconds');
 race.prepare(springLab,['new']);assert.ok(race.springStatuses(a).every(s=>s[1]===0&&!s[2]));assert.ok(race.springStatuses(b).every(s=>s[1]===0&&!s[2]));
 console.log('PASS common 5s, independent personal 10s, uncharged rejection, real clock/pause, validation and new-race reset');
 }finally{race.physics.clearMarbles();race.physics.clear();}
})().catch(e=>{console.error(e);process.exitCode=1});
