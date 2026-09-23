import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
const cyan = '#39e6ff', gold = '#ffbf45';
const left: Point[] = [[22, -30], [22, 0], [24, 7],
  ...curve([24, 7], [21, 11], [7, 9], [5, 22]).slice(1),
  ...curve([5, 22], [3, 38], [4, 57], [4, 69]).slice(1),
  ...curve([4, 69], [4, 85], [24, 84], [29.5, 99]).slice(1), [29.5, 120]];
const right: Point[] = left.map(([x, y]) => [64 - x, y]);
const rail = (points: Point[], color: string, backing = -0.65): MapEntity => {
  const entity = wall(points, backing); entity.shape.color = color; return entity;
};
const bumper = (x: number, y: number, radius: number, color: string): MapEntity => ({
  position: { x, y }, type: 'static', shape: { type: 'circle', radius, color },
  props: { density: 1, restitution: 0.95, angularVelocity: 0 },
});
const boost = (x: number, y: number, rotation: number, color: string, speed = 24): MapEntity => ({
  position: { x, y }, type: 'static',
  shape: { type: 'box', width: 1.4, height: 0.65, rotation, color, boostSpeed: speed },
  props: { density: 1, restitution: 0, angularVelocity: 0 },
});
const triangle = (x: number, y: number, color: string, spin: number): MapEntity => ({
  position: { x, y }, type: 'kinematic',
  shape: { type: 'polyline', solid: true, rotation: 0, color,
    points: [[-2.5, -1.7], [3.1, 0], [-2.5, 1.7], [-2.5, -1.7]] },
  props: { density: 1, restitution: 0.35, angularVelocity: spin },
});

// The crossing shelves end in open gaps: no decorative overpass blocks the 2D race.
export const neonCrossway: StageDef = {
  title: '네온 크로스웨이', width: 64, spawnX: 32, goalY: 112, zoomY: 107, randomizeStart: true,
  art: { style: 'crossway', contours: [[...left, ...right.slice().reverse()]] },
  entities: [
    rail(left, cyan, -0.9), rail(right, gold, 0.9),
    rail(curve([31, 10], [25, 16], [13, 9], [10, 26]), cyan, 0.65),
    rail(curve([33, 10], [39, 16], [51, 9], [54, 26]), gold),
    rail(curve([10, 26], [10, 32], [26, 32], [29, 38]), cyan),
    rail(curve([54, 26], [54, 32], [43, 33], [40, 38]), gold, 0.65),
    rail([[30, 17], [30, 26]], gold), rail([[34, 17], [34, 26]], gold, 0.65),
    rail(curve([4.6, 37], [11, 39], [22, 42], [26, 49]), gold),
    rail(curve([59.4, 41], [57, 49], [44, 52], [35, 56]), cyan, 0.65),
    rail(curve([29, 59], [25, 60], [21, 62], [18, 64]), cyan, 0.65),
    rail([[30, 42], [30, 49]], gold), rail([[34, 42], [34, 49]], gold, 0.65),
    rail(curve([4, 64], [5, 75], [22, 73], [28, 82]), cyan),
    rail(curve([60, 72], [57, 80], [42, 81], [37, 89]), gold, 0.65),
    rail([[30, 73], [30, 84]], gold), rail([[34, 73], [34, 84]], gold, 0.65),
    bumper(11.7, 16, 1.35, cyan), bumper(52.3, 16, 1.35, gold),
    bumper(6.3, 32, 1.35, cyan), bumper(57.3, 34, 1.35, gold),
    bumper(32, 39.8, 1.2, cyan), bumper(57.5, 38, 1.35, gold),
    bumper(14, 68, 1.35, cyan), bumper(36.5, 69, 1.65, gold),
    triangle(32, 34, gold, 1.5), triangle(33, 62, cyan, -2.2),
    boost(5.3, 57, -0.95, cyan, 19), boost(55.5, 64, -2.19, gold, 19),
    boost(28.2, 88, 0.78, cyan), boost(35.5, 90.5, 2.36, gold),
  ],
};
