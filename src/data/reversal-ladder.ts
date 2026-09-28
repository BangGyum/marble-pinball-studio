import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
const entities: MapEntity[] = [];
const edge = (points: Point[], backing: number) => {
  const entity = wall(points, backing);
  entity.shape.color = '#decba4'; entity.shape.hidden = true;
  entities.push(entity);
  return points;
};
const borders = [
  edge([[5,-24],[5,93],...curve([5,93],[5,100],[24,99],[25,104]).slice(1),[25,115]], 1.2),
  edge([[51,-24],[51,25],...curve([51,25],[51,28],[49,29],[49,31]).slice(1),
    ...curve([49,31],[49,33],[49.5,34],[51,35]).slice(1),[51,66],
    ...curve([51,66],[51,69],[49,70],[49,72]).slice(1),...curve([49,72],[49,74],[49.5,75],[51,76]).slice(1),[51,93],...curve([51,93],[51,100],[32,99],[31,104]).slice(1),[31,115]], -1.2),
  edge([[5,-24],[28,-24],[51,-24]], 1),
  edge([[20,-24],[20,5],...curve([20,5],[20,9],[25,9],[25,11]).slice(1)], 0.7),
  edge([[36,-24],[36,5],...curve([36,5],[36,9],[31,9],[31,11]).slice(1)], -0.7),
];
const ramps: [Point,Point,number?][] = [
  [[5,14],[45,25]], [[11,46],[51,35],14], [[5,55],[45,66],15], [[11,87],[51,76],43],
];
for (const [index,[a,b,springX]] of ramps.entries()) {
  const angle = Math.atan2(b[1]-a[1],b[0]-a[0]), c = Math.cos(angle), s = Math.sin(angle);
  const length = Math.hypot(b[0]-a[0],b[1]-a[1]);
  const at = (distance:number, depth=0):Point => [a[0]+c*distance-s*depth,a[1]+s*distance+c*depth];
  const platform = (start:number,end:number) => {
    // Round only exposed downhill ends; keep spring joins flush and the hull convex (Box2D max 8 vertices).
    const depth=2.7, radius=Math.min(1.1,(end-start)*0.35), corner=radius*(1-Math.SQRT1_2);
    let points:Point[];
    if (end===length && index%2===0) points=[at(start),at(end-radius),at(end-corner,corner),at(end,radius),
      at(end,depth-radius),at(end-corner,depth-corner),at(end-radius,depth),at(start,depth)];
    else if (start===0 && index%2===1) points=[at(start+radius),at(end),at(end,depth),at(start+radius,depth),
      at(start+corner,depth-corner),at(start,depth-radius),at(start,radius),at(start+corner,corner)];
    else points=[at(start),at(end),at(end,depth),at(start,depth)];
    points.push(points[0]);
    entities.push({position:{x:0,y:0},type:'static',shape:{type:'polyline',rotation:0,solid:true,hidden:true,points,color:'#cbbfa7'},
      props:{density:1,restitution:0.08,angularVelocity:0}});
  };
  if (springX !== undefined) {
    const distance = (springX-a[0])/c, halfWidth=2.2;
    platform(0,distance-halfWidth); platform(distance+halfWidth,length);
    const p = at(distance,0.45), shared = index===1;
    entities.push({position:{x:p[0],y:p[1]},type:'kinematic',
      shape:{type:'box',width:halfWidth,height:0.45,rotation:angle,color:shared?'#ffc85b':'#67dfff',
        spring:{distance:1.2,direction:[0,-1.05,-1.3,-2.1][index],cooldown:{scope:shared?'shared':'personal',seconds:shared?5:10}}},
      props:{density:1,restitution:0.12,angularVelocity:0}});
  } else platform(0,length);
  const right=index%2===0, p=at(right?length-2.4:index===1?-1.4:1.8,-0.35);
  entities.push({position:{x:p[0],y:p[1]},type:'static',
    shape:{type:'box',width:1.5,height:0.6,rotation:angle+(right?0:Math.PI),boostSpeed:15,color:'#ffd277'},
    props:{density:1,restitution:0,angularVelocity:0}});
}
for(const y of [30,72]) entities.push({position:{x:47.8,y},type:'static',
  shape:{type:'box',width:1.8,height:1.1,rotation:Math.PI/2,boostSpeed:19,color:'#68e5ff'},
  props:{density:1,restitution:0,angularVelocity:0}});
entities.push({position:{x:8.1,y:50.6},type:'kinematic',
  shape:{type:'box',width:2.35,height:0.26,rotation:0.2,hidden:true,color:'#ffd277'},
  props:{density:1,restitution:0.22,angularVelocity:-1.15}});
// The tram's path is parallel to the last ramp; its physical wheels skim that surface.
const trainAngle = -Math.atan2(11,40), trainNormal = {x:-Math.sin(trainAngle),y:Math.cos(trainAngle)};
entities.push({position:{x:30-trainNormal.x*0.65,y:81.775-trainNormal.y*0.65},type:'kinematic',
  shape:{type:'polyline',solid:true,rotation:0,hidden:true,color:'#e5b55b',
    points:([[-4.2,0.55],[-2,-1.15],[2,-1.15],[4.2,0.55],[-4.2,0.55]] as Point[]).map(([x,y]):Point=>[x*Math.cos(trainAngle)-y*Math.sin(trainAngle),x*Math.sin(trainAngle)+y*Math.cos(trainAngle)])},
  props:{density:1,restitution:0.25,angularVelocity:0,sliding:{amplitude:8,period:5.8,phase:0.7,direction:trainAngle}}});

export const reversalLadder: StageDef = {
  title:'역전 사다리',width:56,spawnX:28,goalY:110,zoomY:105,randomizeStart:true,
  art:{style:'reversal-ladder',contours:borders},entities,
};
