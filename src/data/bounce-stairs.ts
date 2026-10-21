import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/MapEntity.type';
import { wall } from './wind-map-shapes';

type Point = [number, number];
const width = 48;
const left: Point[] = [[20, -30], [20, 5], [18, 8], [4, 20], [4, 123], [20, 136], [20, 146]];
const right: Point[] = left.map(([x, y]) => [width - x, y]);
const rail = (points: Point[]): MapEntity => {
  const entity = wall(points, 0.8);
  entity.shape.color = '#61dfdd';
  return entity;
};
const pad = (from: Point, to: Point): MapEntity => {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  return {
    position: { x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2 }, type: 'static',
    shape: { type: 'box', width: Math.hypot(dx, dy) / 2, height: 0.28,
      rotation: Math.atan2(dy, dx), color: '#ffc26e' },
    props: { density: 1, restitution: 0.72, angularVelocity: 0 },
  };
};

export const bounceStairs: StageDef = {
  title: '반동 계단', width, spawnX: 24, goalY: 142, zoomY: 137, randomizeStart: true,
  art: { style: 'bounce-stairs', contours: [[...left, ...right.slice().reverse()]] },
  entities: [
    rail(left), rail(right),
    pad([4, 27], [32, 41]),
    pad([44, 48], [16, 55]),
    pad([4, 69], [32, 76]),
    pad([44, 90], [16, 97]),
    pad([4, 111], [32, 118]),
  ],
};
