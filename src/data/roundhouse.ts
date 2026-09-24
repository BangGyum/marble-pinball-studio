import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { arc, wall } from './wind-map-shapes';

export const yards = [{ x: 24, y: 28, spin: -0.65, color: '#65efcf' }, { x: 24, y: 72, spin: 0.7, color: '#ffc268' }];
const entities: MapEntity[] = [];
const edge = (points: [number, number][], depth = 0.6) => {
  const e = wall(points, depth); e.shape.color = '#e6bc76'; entities.push(e);
};
for (const yard of yards) {
  edge(arc(24, yard.y, 18, -77, 83));
  edge(arc(24, yard.y, 18, 97, 257));
  entities.push({position:{x:24,y:yard.y},type:'static',shape:{type:'circle',radius:10.8,hidden:true},
    props:{density:1,restitution:0.15,angularVelocity:0}});
  // Each carriage is an offset convex fixture rotating about the yard centre.
  // The visible train uses these same vertices and body angles.
  for (let car=0;car<3;car++) {
    const angle = car ? -Math.sign(yard.spin)*car*0.48 : 0;
    const points: [number,number][] = [[12.3,-3],[17.1,-3],[17.1,3],[12.3,3],[12.3,-3]];
    entities.push({position:{x:24,y:yard.y},type:'kinematic',
      shape:{type:'polyline',solid:true,hidden:true,rotation:0,points:points.map(([px,py]):[number,number]=>{const x=px,y=py;return [x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)];}),color:yard.color},
      props:{density:1,restitution:0.12,angularVelocity:yard.spin}});
  }
  if (yard.y === 28) entities.push({position:{x:21.8,y:yard.y+19},type:'kinematic',
    shape:{type:'polyline',solid:true,points:[[0,-0.18],[4.4,-0.18],[4.4,0.18],[0,0.18],[0,-0.18]],rotation:0,color:yard.color},
    props:{density:1,restitution:0.05,angularVelocity:0,
      timedGate:{period:8.4,openFor:2.5,phase:0,angle:1.4,releaseAfter:55}}});
}
const topX=18*Math.cos(77*Math.PI/180), topY=18*Math.sin(77*Math.PI/180);
const bottomX=18*Math.cos(83*Math.PI/180), bottomY=18*Math.sin(83*Math.PI/180);
for (const sign of [-1,1]) {
  edge([[24+sign*4,-30],[24+sign*4,8],[24+sign*topX,28-topY]], sign*0.6);
  edge([[24+sign*bottomX,28+bottomY],[24+sign*bottomX,49],[24+sign*topX,72-topY]],sign*0.6);
  edge([[24+sign*bottomX,72+bottomY],[24+sign*bottomX,104]],sign*0.6);
}
export const roundhouse: StageDef = {
  title:'회전 차고지',width:48,spawnX:24,goalY:100,zoomY:95,randomizeStart:true,
  art:{style:'roundhouse',contours:[]},entities,
  windZones:yards.map(yard=>({type:'vortex',x:24,y:yard.y,radius:18.1,innerRadius:10.8,
    speed:-Math.sign(yard.spin)*11,radial:6,gust:0.08,pulse:1,dutyCycle:0.65,period:8.4,phase:yard.y===28?0:3.1})),
};
