import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { wall } from './wind-map-shapes';
const spring = (x:number,y:number,direction:number,scope: 'shared' | 'personal'):MapEntity => ({
  position:{x,y},type:'kinematic',
  shape:{type:'box',width:2.2,height:0.45,rotation:0,color:'#7fe3ff',spring:{distance:1.2,direction,cooldown:{scope,seconds:scope==='shared'?5:10}}},
  props:{density:1,restitution:0.25,angularVelocity:0},
});
export const springLab:StageDef = {
  title:'스프링 놀이터',width:26,goalY:55,zoomY:50,
  entities:[
    wall([[4,-30],[4,53]],0.5),wall([[22,-30],[22,53]],-0.5),
    wall([[4,-20],[22,-20]],-0.5),
    wall([[4,13],[9,16],[13,16.5]],0.4),
    wall([[22,24],[17,27],[13,27.5]],-0.4),
    wall([[4,36],[9,39],[13,39.5]],0.4),
    spring(10.5,16.4,-Math.PI/2,'shared'),spring(15.5,27.4,-Math.PI/2,'personal'),spring(10.5,39.4,-Math.PI/2,'personal'),
    wall([[4,44],[10,49],[10,58]],0.5),wall([[22,44],[16,49],[16,58]],-0.5),
  ],
};
