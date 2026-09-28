import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = [number,number];
const cache = new WeakMap<StageDef,OffscreenCanvas>();
function path(ctx:Ctx,points:Point[]) {
  ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);
}
function panel(ctx:Ctx,x:number,y:number,w:number,h:number,fill:string|CanvasGradient,edge='#827b6d',radius=0.2) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.fillStyle=fill;ctx.fill();
  ctx.strokeStyle=edge;ctx.lineWidth=0.07;ctx.stroke();
}
function bolt(ctx:Ctx,x:number,y:number,r=0.16) {
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle='#151819';ctx.fill();
  ctx.strokeStyle='#afaa9c';ctx.lineWidth=0.05;ctx.stroke();
  path(ctx,[[x-r*0.55,y-r*0.2],[x+r*0.55,y+r*0.2]]);ctx.stroke();
}
function metal(ctx:Ctx,y:number,h:number) {
  const g=ctx.createLinearGradient(0,y,0,y+h);
  ['#ece8db','#aaa697','#d1c8b5','#817d70','#393b39'].forEach((color,i)=>g.addColorStop(i/4,color));
  return g;
}
function rail(ctx:Ctx,points:Point[],gold=false) {
  path(ctx,points);ctx.lineJoin='round';ctx.lineCap='round';
  ctx.strokeStyle='#030507';ctx.lineWidth=1.8;ctx.stroke();
  ctx.strokeStyle='#353a3a';ctx.lineWidth=1.4;ctx.stroke();
  ctx.strokeStyle='#aaa79b';ctx.lineWidth=0.68;ctx.stroke();
  ctx.strokeStyle='#2c3030';ctx.lineWidth=0.42;ctx.stroke();
  ctx.strokeStyle=gold?'#ffc365':'#e4d9bf';ctx.lineWidth=0.1;ctx.stroke();
}
function paint(ctx:Ctx,stage:StageDef) {
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  const back=ctx.createLinearGradient(0,0,56,0);
  back.addColorStop(0,'#171b1e');back.addColorStop(0.18,'#070b0e');back.addColorStop(0.8,'#080d10');back.addColorStop(1,'#191d20');
  ctx.fillStyle=back;ctx.fillRect(1,-2,54,117);
  const contours=stage.art?.contours??[];
  // Floor shading follows the physical bends; the bright outer rail is the actual collision edge.
  for(const [index,sign] of [[0,1],[1,-1]]) {
    const outer=(contours[index]??[]).filter(p=>p[1]>=-24&&p[1]<=93).map(([x,y]):Point=>[x,Math.max(12,y)]);
    if(outer.length<2)continue;
    const inner=outer.map(([x,y]):Point=>[x+sign*5,y]);
    const x=outer[0][0],channel=ctx.createLinearGradient(x,0,x+sign*5,0);
    channel.addColorStop(0,'#34434a');channel.addColorStop(0.2,'#25333d');channel.addColorStop(0.7,'#101b22');channel.addColorStop(1,'#080d11');
    path(ctx,[...outer,...inner.slice().reverse()]);ctx.closePath();ctx.fillStyle=channel;ctx.fill();
    path(ctx,inner);ctx.strokeStyle='#8cabb920';ctx.lineWidth=0.12;ctx.stroke();
  }
  if(contours.length>=5) {
    const bowl=[...contours[3],...contours[4].slice().reverse()];
    path(ctx,bowl);ctx.closePath();ctx.fillStyle='#202827';ctx.fill();
    const bottom=ctx.createLinearGradient(0,95,0,112);bottom.addColorStop(0,'#323b3d');bottom.addColorStop(1,'#777268');
    for(const [index,sign] of [[0,-1],[1,1]]) {
      const lip=contours[index].filter(p=>p[1]>=93&&p[1]<=104);
      const outside=lip.map(([x,y]):Point=>[x+sign*0.9,y+2.4]);
      path(ctx,[...lip,...outside.reverse()]);ctx.closePath();ctx.fillStyle=bottom;ctx.fill();
      ctx.strokeStyle='#777b73';ctx.lineWidth=0.12;ctx.stroke();
    }
  }
  for(const entity of stage.entities??[]) {
    if(entity.shape.type==='polyline'&&entity.shape.backing&&entity.shape.hidden) {
      const points=entity.shape.points.map(([x,y]):Point=>[x+entity.position.x,y+entity.position.y]);
      rail(ctx,points,true);
    }
  }
  for(const x of [3.4,52.6]) {
    panel(ctx,x-0.7,10,1.4,88,'#2b302e','#666b63');
    panel(ctx,x-0.56,10.3,0.24,87.4,metal(ctx,10,88),'#7e7c6f',0.06);
    for(const y of [17,37,60,84]) {
      panel(ctx,x-0.2,y,0.4,5,'#422f18','#ae8546');
      ctx.shadowColor='#ffb84b';ctx.shadowBlur=10;ctx.fillStyle='#ffce7b';ctx.fillRect(x-0.075,y+0.2,0.15,4.6);ctx.shadowBlur=0;
    }
    for(const y of [11,32,54,76,96])bolt(ctx,x,y,0.22);
  }
  for(const e of stage.entities??[]) {
    const sh=e.shape;
    if(sh.type!=='polyline'||!sh.solid||e.type!=='static')continue;
    const points=sh.points.map(([x,y]):Point=>[x+e.position.x,y+e.position.y]);
    const [a,b]=points,angle=Math.atan2(b[1]-a[1],b[0]-a[0]),nx=-Math.sin(angle),ny=Math.cos(angle);
    const depth=Math.max(...points.map(p=>(p[0]-a[0])*nx+(p[1]-a[1])*ny));
    const d:Point=[a[0]+nx*depth,a[1]+ny*depth];
    ctx.save();ctx.translate(0,0.8);path(ctx,points);ctx.fillStyle='#05090d';ctx.fill();ctx.strokeStyle='#090f14';ctx.lineWidth=0.5;ctx.stroke();ctx.restore();
    const skirt=ctx.createLinearGradient(a[0],a[1],d[0],d[1]+0.7);
    skirt.addColorStop(0,'#82908d');skirt.addColorStop(0.55,'#414c4d');skirt.addColorStop(1,'#111a21');
    ctx.save();ctx.translate(0,0.45);path(ctx,points);ctx.fillStyle=skirt;ctx.fill();ctx.strokeStyle='#77827f';ctx.lineWidth=0.13;ctx.stroke();ctx.restore();
    const face=ctx.createLinearGradient(a[0],a[1],d[0],d[1]);
    face.addColorStop(0,'#efe8d6');face.addColorStop(0.09,'#d3cbbb');face.addColorStop(0.3,'#aaa79b');face.addColorStop(0.76,'#b9b2a1');face.addColorStop(0.91,'#d0c9b8');face.addColorStop(1,'#575e58');
    path(ctx,points);ctx.fillStyle=face;ctx.fill();
    ctx.save();ctx.clip();
    // Deterministic fine scratches are baked into the background rather than redrawn each frame.
    let seed=227+a[0]*11+a[1]*19;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<340;i++) {
      const t=rand(),v=rand(),x=a[0]+(b[0]-a[0])*t+(d[0]-a[0])*v,y=a[1]+(b[1]-a[1])*t+(d[1]-a[1])*v;
      ctx.strokeStyle=i%2?'#ffffff10':'#171b1915';ctx.lineWidth=0.02;path(ctx,[[x,y],[x+0.1+rand()*0.45,y-0.03]]);ctx.stroke();
    }
    ctx.restore();
    path(ctx,points);ctx.strokeStyle='#272c2c';ctx.lineWidth=0.35;ctx.stroke();
    ctx.strokeStyle='#b8b4a6';ctx.lineWidth=0.09;ctx.stroke();
    const insetFace=points.map(([x,y]):Point=>{
      const cx=points.reduce((n,p)=>n+p[0],0)/points.length,cy=points.reduce((n,p)=>n+p[1],0)/points.length;
      return [cx+(x-cx)*0.982,cy+(y-cy)*0.982];
    });
    path(ctx,insetFace);ctx.strokeStyle='#4d514c';ctx.lineWidth=0.05;ctx.stroke();
    path(ctx,[a,b]);ctx.strokeStyle='#e2cf9f';ctx.lineWidth=0.19;ctx.stroke();
    ctx.strokeStyle='#fff3d0';ctx.lineWidth=0.045;ctx.stroke();
    const inset=(p:Point,q:Point):Point=>[p[0]+(q[0]-p[0])*0.025+(d[0]-a[0])*0.65,p[1]+(q[1]-p[1])*0.025+(d[1]-a[1])*0.65];
    bolt(ctx,...inset(a,b));bolt(ctx,...inset(b,a));
  }
  ctx.textAlign='center';ctx.fillStyle='#e3dac5';ctx.font='800 1.25px system-ui';ctx.fillText('START',28,1.6);
  ctx.font='700 0.7px system-ui';ctx.fillStyle='#9d9c90';ctx.fillText('▼',28,3);
  // Small engraved title plates keep attention on the marbles and the three controls.
  ctx.textAlign='left';ctx.fillStyle='#decba4';ctx.font='800 1.45px system-ui';ctx.fillText('역전 사다리',7,4);
  ctx.font='0.46px system-ui';ctx.fillStyle='#777f7f';ctx.fillText('REVERSAL LADDER',7,5.2);
  ctx.textAlign='right';ctx.fillStyle='#6e7473';ctx.font='italic 800 0.9px system-ui';ctx.fillText('PAUL',49,4);ctx.fillText('PINBALL',49,5);
  panel(ctx,24.6,105.4,6.8,7.3,metal(ctx,105.4,7.3),'#918674');
  panel(ctx,25.05,105.4,5.9,6.7,'#252928','#b6b4a3');
  for(let row=0;row<2;row++)for(let col=0;col<10;col++){
    ctx.fillStyle=(row+col)%2?'#1a2226':'#f2ead9';ctx.fillRect(25.05+col*0.59,109+row*0.59,0.59,0.59);
  }
  ctx.fillStyle='#ece6d6';ctx.textAlign='center';ctx.font='800 0.75px system-ui';ctx.fillText('▼ FINISH ▼',28,111.5);
  ctx.restore();
}
export function drawLadderArt(ctx:Ctx,stage:StageDef,cacheBackground=true) {
  if(!cacheBackground||typeof OffscreenCanvas==='undefined'){paint(ctx,stage);return;}
  let image=cache.get(stage);
  if(!image){
    const resolution=22;image=new OffscreenCanvas((stage.width??56)*resolution,(stage.goalY+8)*resolution);
    const context=image.getContext('2d')!;context.scale(resolution,resolution);context.translate(0,2);paint(context,stage);cache.set(stage,image);
  }
  ctx.drawImage(image,0,-2,stage.width??56,stage.goalY+8);
}
// Rendering and pointer selection share this stationary housing, separate from the moving piston.
export function ladderSpringHousing(origin:{x:number;y:number},direction:number) {
  return {x:origin.x-Math.cos(direction)*1.2,y:origin.y-Math.sin(direction)*1.2,
    angle:direction,width:1.4,height:2.55};
}
function spring(ctx:Ctx,e:MapEntityState,origin:{x:number;y:number}) {
  const sh=e.shape;if(sh.type!=='box'||!sh.spring)return;
  const shared=sh.spring.cooldown?.scope==='shared',accent=shared?'#ffc653':'#65e3ff';
  const d=sh.spring.direction,dx=Math.cos(d),dy=Math.sin(d),housing=ladderSpringHousing(origin,d),base={x:housing.x-dx*1.2,y:housing.y-dy*1.2};
  const extension=(e.x-base.x)*dx+(e.y-base.y)*dy;
  ctx.save();ctx.translate(base.x,base.y);ctx.rotate(d);
  panel(ctx,1.2-housing.width,-housing.height,housing.width*2,housing.height*2,metal(ctx,-housing.height,housing.height*2),'#c3beaa',0.3);
  panel(ctx,0.2,-1.65,2.2,3.3,'#0a1419',accent,0.16);
  // Telescopic shaft and helical coil stretch with the actual Box2D piston pose.
  ctx.fillStyle='#8c9a9d';ctx.fillRect(0.15,-0.14,extension,0.28);
  const coil=ctx.createLinearGradient(0,-0.9,0,0.9);coil.addColorStop(0,'#1a2b32');coil.addColorStop(0.35,accent);coil.addColorStop(0.6,'#efffff');coil.addColorStop(1,'#20323b');
  ctx.beginPath();
  for(let i=0;i<=80;i++){const t=i/80,x=0.3+t*Math.max(0.3,extension-0.65),y=Math.sin(t*Math.PI*12)*0.86;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
  ctx.strokeStyle='#02060a';ctx.lineWidth=0.24;ctx.stroke();ctx.strokeStyle=coil;ctx.lineWidth=0.13;ctx.stroke();
  for(const y of [-2.18,2.18])bolt(ctx,0.2,y);
  ctx.restore();
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle+sh.rotation);
  panel(ctx,-sh.width,-sh.height,sh.width*2,sh.height*2,metal(ctx,-sh.height,sh.height*2),accent,0.12);
  ctx.fillStyle='#151d20';ctx.font='800 0.48px system-ui';ctx.textAlign='center';ctx.fillText('SPACE',0,0.18);
  for(const x of [-1.86,1.86])bolt(ctx,x,0,0.1);
  ctx.restore();
  ctx.save();ctx.translate(base.x+(shared?3:0),base.y+2.2);
  panel(ctx,-4.2,0,8.4,1.25,'#0a171e',accent,0.13);
  ctx.fillStyle=accent;ctx.font='700 0.6px system-ui';ctx.textAlign='center';
  ctx.fillText((shared?'공통':'개인')+' · 쿨타임 '+(sh.spring.cooldown?.seconds??0)+'초',0,0.85);ctx.restore();
}
function train(ctx:Ctx,e:MapEntityState) {
  const sh=e.shape;if(sh.type!=='polyline')return;
  const [,roof,next]=sh.points,angle=Math.atan2(next[1]-roof[1],next[0]-roof[0]);
  const local=sh.points.map(([x,y]):Point=>[x*Math.cos(angle)+y*Math.sin(angle),-x*Math.sin(angle)+y*Math.cos(angle)]);
  const w=Math.abs(local[0][0]),top=local[1][1],bottom=local[0][1],h=bottom-top;
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle+angle);
  // The side facade projects below the playable roof, like the ramp's metal fascia.
  // The upper silhouette remains the actual bevelled collision hull.
  const side:Point[]=[[local[0][0],bottom],[local[1][0],top],[local[2][0],top],[local[3][0],bottom],
    [local[3][0],bottom+0.75],[local[0][0],bottom+0.75]];
  path(ctx,side);ctx.closePath();ctx.fillStyle='#202b31';ctx.fill();ctx.strokeStyle='#aeb4a5';ctx.lineWidth=0.06;ctx.stroke();
  for(const x of [-w+1,w-1]) {
    ctx.beginPath();ctx.arc(x,bottom+0.73,0.26,0,Math.PI*2);ctx.fillStyle='#101820';ctx.fill();
    ctx.strokeStyle='#bcc0b8';ctx.lineWidth=0.065;ctx.stroke();bolt(ctx,x,bottom+0.73,0.12);
  }
  const body=ctx.createLinearGradient(0,top,0,bottom);
  body.addColorStop(0,'#8b9895');body.addColorStop(0.18,'#3a4648');body.addColorStop(0.65,'#111c22');body.addColorStop(1,'#576159');
  path(ctx,local);ctx.fillStyle=body;ctx.fill();ctx.strokeStyle='#b8b29c';ctx.lineWidth=0.07;ctx.stroke();
  panel(ctx,local[1][0]-0.05,top+0.04,local[2][0]-local[1][0]+0.1,h*0.23,metal(ctx,top,h*0.23),'#9ba196',0.09);
  const glass=ctx.createLinearGradient(0,top+h*0.32,0,top+h*0.82);
  glass.addColorStop(0,'#fff0b4');glass.addColorStop(0.22,'#ffcf6c');glass.addColorStop(1,'#845025');
  for(const x of [-1.72,-0.62,0.48]) {
    panel(ctx,x,top+h*0.38,0.88,h*0.38,glass,'#cba669',0.04);
    path(ctx,[[x+0.14,top+h*0.42],[x+0.43,top+h*0.69]]);ctx.strokeStyle='#fff4c24d';ctx.lineWidth=0.08;ctx.stroke();
  }
  ctx.strokeStyle='#cab486';ctx.lineWidth=0.06;path(ctx,[[-w+0.3,bottom-0.07],[w-0.3,bottom-0.07]]);ctx.stroke();
  for(const x of [-2.4,-1.2,0,1.2])panel(ctx,x,bottom+0.08,0.88,0.38,'#ffc963','#ba8d4c',0.04);

  for(const side of [-1,1]) {
    ctx.save();ctx.translate(side*(w-1.2),top+h*0.69);ctx.rotate(side*0.46);
    panel(ctx,-0.28,-h*0.12,0.56,h*0.24,'#f6ce83','#bd9d64',0.03);ctx.restore();
    ctx.fillStyle='#fff5d7';ctx.fillRect(side<0?-w+0.1:w-0.2,bottom-0.15,0.1,0.08);
  }
  ctx.fillStyle='#d8ac58';ctx.fillRect(-w+0.25,bottom+0.61,w*2-0.5,0.045);
  for(let x=-1.1;x<1.2;x+=0.33){ctx.fillStyle='#142025';ctx.fillRect(x,top+0.05,0.17,h*0.08);}
  ctx.restore();
}
export function drawLadderDevices(ctx:Ctx,stage:StageDef,entities:MapEntityState[]) {
  ctx.save();ctx.shadowBlur=0;
  for(const [index,e] of entities.entries()) {
    const sh=e.shape,definition=stage.entities?.[index];
    if(definition?.props.sliding){train(ctx,e);continue;}
    if(sh.type!=='box')continue;
    if(sh.spring&&definition){spring(ctx,e,definition.position);continue;}
    if(sh.hidden&&definition?.props.angularVelocity) {
      ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle+sh.rotation);
      panel(ctx,-sh.width,-sh.height,sh.width*2,sh.height*2,'#423923','#f8ce73',0.22);
      ctx.beginPath();ctx.arc(0,0,0.63,0,Math.PI*2);ctx.fillStyle='#c7a35c';ctx.fill();bolt(ctx,0,0,0.4);ctx.restore();
    }
    if(sh.boostSpeed) {
      ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle+sh.rotation);
      panel(ctx,-sh.width,-sh.height,sh.width*2,sh.height*2,'#27363e','#909d9b',0.22);
      ctx.strokeStyle=sh.color??'#ffcf73';ctx.lineWidth=0.18;ctx.lineJoin='miter';
      for(const x of [-0.65,0.3]){path(ctx,[[x-0.3,-sh.height*0.55],[x+0.15,0],[x-0.3,sh.height*0.55]]);ctx.stroke();}ctx.restore();
    }
  }
  ctx.restore();
}
