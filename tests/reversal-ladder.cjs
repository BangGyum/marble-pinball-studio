const assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
global.fetch=undefined;
const {Race}=require('../src/race.ts'),{reversalLadder:stage}=require('../src/data/reversal-ladder.ts');
const {validateStage,saveMaps,readSavedMaps}=require('../src/model.ts');
(async()=>{
 assert.deepEqual(validateStage(stage),stage);
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 saveMaps(storage,[{id:'ladder',stage}]);assert.deepEqual(readSavedMaps(storage)[0].stage,stage);
 const trainIndex=stage.entities.findIndex(e=>e.props.sliding), springs=stage.entities.flatMap((e,i)=>e.shape.spring?[i]:[]);
 assert.deepEqual(springs.map(i=>stage.entities[i].shape.spring.cooldown),[{scope:'shared',seconds:5},{scope:'personal',seconds:10},{scope:'personal',seconds:10}]);
 for(const direction of [NaN,Infinity,'1',7]) {
  const invalid=structuredClone(stage);invalid.entities[trainIndex].props.sliding.direction=direction;
  assert.throws(()=>validateStage(invalid));
 }
 const race=new Race();await race.physics.init();const physics=race.physics,B=physics.Box2D,random=Math.random;
 const contacts=new Map(), listener=new B.JSContactListener();let lookup=new Map(),run='';
 listener.BeginContact=pointer=>{
  const contact=B.wrapPointer(pointer,B.b2Contact),a=contact.GetFixtureA().GetBody(),b=contact.GetFixtureB().GetBody();
  for(const [body,other] of [[a,b],[b,a]]) {
   const i=lookup.get(B.getPointer(body));if(i===undefined||other.GetType()!==B.b2_dynamicBody)continue;
   const ids=contacts.get(i)??new Set();ids.add(run+'/'+B.getPointer(other));contacts.set(i,ids);
  }
 };
 listener.EndContact=()=>{};listener.PreSolve=()=>{};listener.PostSolve=()=>{};physics.world.SetContactListener(listener);
 try {
  race.prepare(stage,['motion']);
  const definition=stage.entities[trainIndex],slide=definition.props.sliding;
  for(let step=1;step<=180;step++) {
   const before=physics.getEntities()[trainIndex];physics.step(1/60);
   const pose=physics.getEntities()[trainIndex],offset=slide.amplitude*Math.sin(step/60*Math.PI*2/slide.period+slide.phase);
   assert.ok(Math.abs(pose.x-definition.position.x-Math.cos(slide.direction)*offset)<0.001);
   assert.ok(Math.abs(pose.y-definition.position.y-Math.sin(slide.direction)*offset)<0.001);
   const between=physics.getEntities(0.5)[trainIndex];assert.ok(Math.abs(between.y-(before.y+pose.y)/2)<0.001,'sloped train interpolates both coordinates');
  }
  const problems=[],reports=[];
  for(const count of (process.argv[2]?[Number(process.argv[2])]:[1,20,40]))for(const interactive of [false,true])for(const initial of (process.argv[3]?[Number(process.argv[3])]:[123456,271828,314159])) {
   let seed=initial;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
   race.prepare(stage,Array.from({length:count},(_,i)=>String(i)));race.startRace([Math.max(1,count-1),count],'desc');
   lookup=new Map(physics.entities.map((e,i)=>[B.getPointer(e.body),i]));run=count+'/'+interactive+'/'+initial;
   let time=0,first=0,escaped=0,fired=[0,0,0];race.springCooldowns.now=()=>time;
   while(race.state==='running'&&race.elapsed<150) {
    time=race.elapsed*1000;
    if(interactive)for(const [n,i] of springs.entries()) {
     const e=physics.getEntities()[i],a=e.shape.rotation;
     const onPiston=race.balls.some(b=>!b.rank&&Math.abs((b.x-e.x)*Math.cos(a)+(b.y-e.y)*Math.sin(a))<e.shape.width+0.3&&Math.abs(-(b.x-e.x)*Math.sin(a)+(b.y-e.y)*Math.cos(a))<1);
     if(onPiston&&race.activateSpring(i))fired[n]++;
    }
    race.advance();if(!first&&race.arrivals.length)first=race.elapsed;
    for(const b of race.balls)if(!b.rank&&(b.x<4.75||b.x>51.25||b.y<-24.25))escaped++;
   }
   const report={count,interactive,seed:initial,first:+first.toFixed(2),finish:+race.elapsed.toFixed(2),arrived:race.arrivals.length,reason:race.finishReason,rescues:race.rescues,escaped,fired,remaining:race.balls.filter(b=>!b.rank).map(b=>[b.id,+b.x.toFixed(2),+b.y.toFixed(2)])};
   console.log(JSON.stringify(report));reports.push(report);
   if(race.finishReason!=='arrived'||race.arrivals.length!==count||escaped||race.rescues)problems.push(report);
   assert.ok(race.arrivals.every(b=>b.x>25&&b.x<31),'every finish through the central chute');
  }
  const devices=stage.entities.map((e,i)=>({i,kind:e.shape.spring?'spring':e.props.sliding?'train':e.shape.boostSpeed?'boost':e.type==='kinematic'?'rotor':'wall',hits:contacts.get(i)?.size??0})).filter(e=>e.kind!=='wall');
  console.log('DEVICE_CONTACTS '+JSON.stringify(devices));
  if(!process.argv[2])for(const device of devices)if(!device.hits)problems.push({unreached:device});
  assert.deepEqual(problems,[],'natural completion, no containment rescues, and all devices contacted');
  console.log('PASS reversal ladder: '+reports.length+' real physics races, contacts, diagonal motion, interpolation and storage');
 }finally{Math.random=random;physics.world.SetContactListener(0);B.destroy(listener);physics.clearMarbles();physics.clear();}
})().catch(e=>{console.error(e);process.exitCode=1});
