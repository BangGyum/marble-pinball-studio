const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
global.fetch=undefined;
const {Race}=require('../src/race.ts'),{springLab}=require('../src/data/spring-lab.ts'),{validateStage,saveMaps,readSavedMaps}=require('../src/model.ts');
(async()=>{
 assert.deepEqual(validateStage(springLab),springLab);
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 saveMaps(storage,[{id:'spring',stage:springLab}]);assert.deepEqual(readSavedMaps(storage)[0].stage,springLab);
 const invalid=structuredClone(springLab);invalid.entities.find(e=>e.shape.spring).shape.spring.distance=99;assert.throws(()=>validateStage(invalid));
 const race=new Race();await race.physics.init();
 const indices=springLab.entities.flatMap((e,i)=>e.shape.spring?[i]:[]);
 try{
 race.prepare(springLab,['ball']);assert.equal(race.activateSpring(indices[0]),false);
 race.startRace([1,1]);race.physics.placeMarble(0,10.5,15.55);
 assert.equal(race.activateSpring(-1),false);assert.equal(race.activateSpring(0),false);
 assert.equal(race.activateSpring(indices[0]),true);assert.equal(race.activateSpring(indices[0]),false);
 const origin=springLab.entities[indices[0]].position;
 for(let i=0;i<7;i++)race.advance();
 const peak=race.physics.getEntities()[indices[0]];
 assert.ok(peak.y<origin.y-1.1,'full spring stroke');
 assert.ok(race.physics.getMarblePosition(0).y<14.8,'spring physically launches marble');
 const between=race.physics.getEntities(.5)[indices[0]];
 assert.ok(between.y>=peak.y&&between.y<origin.y,'vertical interpolation');
 race.pause();const paused=race.physics.getEntities()[indices[0]];assert.equal(race.activateSpring(indices[0]),false);
 assert.deepEqual(race.physics.getEntities()[indices[0]],paused);race.pause();
 for(let i=0;i<55;i++)race.advance();
 assert.ok(Math.abs(race.physics.getEntities()[indices[0]].y-origin.y)<.001,'returns in one simulated second');
 assert.equal(race.activateSpring(indices[0]),false,'shared cooldown survives physical return');
 race.prepare(springLab,['reset']);assert.ok(Math.abs(race.physics.getEntities()[indices[0]].y-origin.y)<.001);
 for(const count of [1,20,40])for(const interactive of [false,true]){
 race.prepare(springLab,Array.from({length:count},(_,i)=>String(i)));race.startRace([Math.max(1,count-1),count],'desc');
 let maxY=-Infinity,escape=0;
 while(race.state==='running'&&race.elapsed<120){
 if(interactive&&Math.floor(race.elapsed*60)%90===0)for(const i of indices)race.activateSpring(i);
 race.advance();for(const b of race.balls)if(!b.rank){maxY=Math.max(maxY,b.y);if(b.x<3.7||b.x>22.3)escape++;}
 }
 assert.equal(race.finishReason,'arrived');assert.equal(race.arrivals.length,count);assert.equal(race.rescues,0);assert.equal(escape,0);
 console.log('PASS spring lab '+count+' marbles, interactive='+interactive+', '+race.elapsed.toFixed(2)+'s');
 }
 console.log('PASS spring validation/storage, cooldown, real impact, vertical interpolation, pause and reset');
 }finally{race.physics.clearMarbles();race.physics.clear();}
})().catch(e=>{console.error(e);process.exitCode=1});
