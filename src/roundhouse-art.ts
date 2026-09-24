import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';
import { yards } from './data/roundhouse';
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
function circle(ctx:Ctx,x:number,y:number,r:number){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);}
export function drawRoundhouseArt(ctx:Ctx,_stage:StageDef){
 ctx.save();
 ctx.fillStyle='#172724';ctx.fillRect(20,-3,8,15);ctx.fillRect(21.8,44,4.4,12);ctx.fillRect(21.8,88,4.4,15);
 for(const [index,yard] of yards.entries()){
  const {x,y,color}=yard;
  const surface=ctx.createRadialGradient(x,y,10,x,y,19);surface.addColorStop(0,'#28322c');surface.addColorStop(0.5,'#142520');surface.addColorStop(1,'#080e13');
  circle(ctx,x,y,18.6);ctx.fillStyle=surface;ctx.fill();
  for(let i=0;i<100;i++){
   const a=i*Math.PI*2/100;ctx.save();ctx.translate(x,y);ctx.rotate(a);
   ctx.fillStyle=i%2?'#4c4030':'#62513a';ctx.fillRect(11.7,-0.12,5.5,0.24);ctx.restore();
  }
  for(const r of [12.25,16.6]){
   circle(ctx,x,y,r);ctx.strokeStyle='#0a0c0b';ctx.lineWidth=0.62;ctx.stroke();
   ctx.strokeStyle='#caa16b';ctx.lineWidth=0.2;ctx.stroke();
   circle(ctx,x,y,r+0.16);ctx.strokeStyle='#ffe3a2';ctx.lineWidth=0.045;ctx.stroke();
  }
  circle(ctx,x,y,10.8);const hub=ctx.createRadialGradient(x-3,y-4,1,x,y,11);
  hub.addColorStop(0,'#31443e');hub.addColorStop(1,'#101b1a');ctx.fillStyle=hub;ctx.fill();
  ctx.strokeStyle=color;ctx.lineWidth=0.15;ctx.stroke();
  circle(ctx,x,y,9.7);ctx.strokeStyle='#a887504f';ctx.lineWidth=0.1;ctx.stroke();
  for(let i=0;i<12;i++){const a=i*Math.PI/6;circle(ctx,x+10.2*Math.cos(a),y+10.2*Math.sin(a),0.13);ctx.fillStyle='#dcc69e';ctx.fill();}
  ctx.textAlign='center';ctx.fillStyle='#ead5ad';ctx.font='bold 1.25px system-ui';ctx.fillText(index?'SOUTH DEPOT':'NORTH DEPOT',x,y-1);
  ctx.fillStyle=color;ctx.font='0.8px system-ui';ctx.fillText(index?'TRAIN ↻  /  WIND ↺':'TRAIN ↺  /  WIND ↻',x,y+0.8);
  ctx.font='bold 3px system-ui';ctx.fillText(index?'↷':'↶',x,y+4.4);
  // Signals mark the actual outlet rather than a decorative dead end.
  for(const side of [-1,1]){ctx.fillStyle='#566460';ctx.fillRect(x+side*3-0.12,y+18,0.24,2);circle(ctx,x+side*3,y+18,0.3);ctx.fillStyle=color;ctx.fill();}
 }
 ctx.textAlign='center';ctx.font='bold 1.6px system-ui';ctx.fillStyle='#f4d798';ctx.fillText('회전 차고지',24,0);
 ctx.font='0.7px system-ui';ctx.fillStyle='#89d5bd';ctx.fillText('ROUNDHOUSE RUSH',24,1.6);
 for(let row=0;row<2;row++)for(let col=0;col<8;col++){ctx.fillStyle=(row+col)%2?'#13231f':'#f4e5c2';ctx.fillRect(21.8+col*0.55,98+row*0.55,0.55,0.55);}
 ctx.restore();
}
export function drawRoundhouseTrains(ctx: CanvasRenderingContext2D, entities: MapEntityState[]) {
  for (const entity of entities) {
    if (entity.shape.type !== 'polyline' || !entity.shape.solid || !entity.shape.hidden) continue;
    const corners = entity.shape.points;
    const phase = Math.atan2(corners[0][1] + corners[2][1], corners[0][0] + corners[2][0]);
    const car = Math.round(Math.abs(phase) / 0.48);
    const accent = entity.shape.color ?? '#65efcf';
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.rotate(entity.angle + phase);
    ctx.translate(14.7, 0);
    ctx.scale(1, entity.y < 50 ? -1 : 1);

    const panel = (x: number, y: number, width: number, height: number, radius: number, fill: string | CanvasGradient, edge = '#cba976') => {
      ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 0.09; ctx.stroke();
    };
    // Couplers bridge the small gap between cars. Wheels and pilot use the full collision width.
    panel(-0.18, -3.5, 0.36, 7, 0.1, '#71817e', '#d7bd82');
    panel(-2.4, -3, 4.8, 6, 0.22, '#0b151a', '#e8c188');
    for (const side of [-1, 1]) {
      for (const y of [-2.15, 0, 2.15]) {
        panel(side * 2.1 - 0.26, y - 0.55, 0.52, 1.1, 0.18, '#677b80', '#d7e6d8');
        panel(side * 2.1 - 0.11, y - 0.22, 0.22, 0.44, 0.1, '#192b32', '#acc3bd');
      }
      ctx.strokeStyle = '#e4bb72'; ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.moveTo(side * 2.1, -2.15); ctx.lineTo(side * 2.1, 2.15); ctx.stroke();
    }
    const roof = ctx.createLinearGradient(-1.8, 0, 1.8, 0);
    roof.addColorStop(0, '#162d32'); roof.addColorStop(0.22, accent);
    roof.addColorStop(0.42, '#446466'); roof.addColorStop(1, '#10242a');
    panel(-1.8, -2.75, 3.6, 5.5, 0.38, roof, '#f0cb83');
    if (car === 0) {
      // Steam engine from above: rear cab, long boiler, smokestack, headlamps, cowcatcher.
      panel(-1.65, -2.65, 3.3, 1.65, 0.24, '#263e47', '#ffd38e');
      panel(-1.36, -2.35, 2.72, 0.86, 0.16, '#93deed', '#d7faff');
      ctx.fillStyle = '#446a78'; ctx.fillRect(-0.09, -2.35, 0.18, 0.86);
      const boiler = ctx.createLinearGradient(-1.25, 0, 1.25, 0);
      boiler.addColorStop(0, '#142830'); boiler.addColorStop(0.38, '#6d9193');
      boiler.addColorStop(0.7, '#344f57'); boiler.addColorStop(1, '#101f28');
      panel(-1.22, -1.05, 2.44, 3.46, 0.95, boiler, '#d9b676');
      for (const y of [-0.65, 0.28, 1.25, 2.08]) {
        ctx.strokeStyle = '#cba96a'; ctx.lineWidth = 0.12;
        ctx.beginPath(); ctx.moveTo(-1.13, y); ctx.lineTo(1.13, y); ctx.stroke();
      }
      circle(ctx, 0, 1.48, 0.66); ctx.fillStyle = '#a9864a'; ctx.fill();
      circle(ctx, 0, 1.48, 0.44); ctx.fillStyle = '#202a30'; ctx.fill();
      circle(ctx, 0, 1.48, 0.22); ctx.fillStyle = '#303f43'; ctx.fill();
      // Wedge-shaped nose stays inside the engine's physical collision rectangle.
      ctx.beginPath(); ctx.moveTo(-2.38, 2.48); ctx.lineTo(2.38, 2.48);
      ctx.lineTo(1.12, 2.96); ctx.lineTo(-1.12, 2.96); ctx.closePath();
      ctx.fillStyle = '#c99545'; ctx.fill(); ctx.strokeStyle = '#ffe4a4'; ctx.stroke();
      for (const x of [-1.55, 1.55]) {
        circle(ctx, x, 2.31, 0.31); ctx.fillStyle = '#fff2bc'; ctx.fill();
        circle(ctx, x, 2.31, 0.47); ctx.strokeStyle = '#ffdb81'; ctx.stroke();
      }
    } else if (car === 1) {
      // Passenger coach: long roof, repeated window bays, and a centre skylight.
      panel(-1.57, -2.5, 3.14, 5, 0.22, '#1a3038', '#d5ad6f');
      for (const y of [-1.84, -0.62, 0.62, 1.84]) {
        panel(-1.36, y - 0.4, 2.72, 0.8, 0.12, '#79b8c7', '#d6f2ef');
        ctx.fillStyle = '#d6fcfa'; ctx.fillRect(-0.05, y - 0.36, 0.1, 0.72);
      }
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#ffe0a1';
        for (const y of [-1.78, -0.58, 0.62, 1.82]) ctx.fillRect(side * 1.77 - 0.05, y - 0.32, 0.1, 0.64);
      }
    } else {
      // Freight wagon: ribbed metal cover rather than another square pile of circles.
      panel(-1.58, -2.52, 3.16, 5.04, 0.22, '#243740', '#d5ad6f');
      panel(-1.3, -2.25, 2.6, 4.5, 0.14, '#14242b', '#8db9bd');
      for (const y of [-1.85, -1.18, -0.51, 0.16, 0.83, 1.5]) {
        ctx.fillStyle = y > 0 ? '#536a6d' : '#40565a';
        ctx.fillRect(-1.2, y, 2.4, 0.38);
        ctx.fillStyle = '#a3bbb3'; ctx.fillRect(-1.2, y, 2.4, 0.05);
      }
      panel(-0.48, -0.46, 0.96, 0.92, 0.1, '#8eb5b1', '#f1d18a');
    }
    ctx.restore();
  }
}
