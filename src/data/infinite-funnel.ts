import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/MapEntity.type';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
export const funnel = { x: 32, y: 44, outer: 29, inner: 5, turns: 4, halfWidth: 1.7 };
const spiral = (offset: number): Point[] => Array.from({ length: 289 }, (_, i) => {
  const t = i / 288, angle = -Math.PI / 2 + t * Math.PI * 2 * funnel.turns;
  const radius = funnel.outer + (funnel.inner - funnel.outer) * t + offset;
  return [funnel.x + Math.cos(angle) * radius, funnel.y + Math.sin(angle) * radius];
});
const inner = spiral(-funnel.halfWidth), outer = spiral(funnel.halfWidth);
const left: Point[] = [[16, -30], [16, 5], ...curve([16, 5], [16, 15], [25, inner[0][1]], inner[0]).slice(1), ...inner.slice(1)];
const right: Point[] = [[24, -30], [24, 5], ...curve([24, 5], [24, 11], [27, outer[0][1]], outer[0]).slice(1), ...outer.slice(1)];
// All rails are static: thin edges plus the shared wall guard avoid the moving-wall substeps.
const rail = (points: Point[], layer: 1 | 2 = 1): MapEntity => {
  const entity = wall(points, 0);
  entity.shape.hidden = true;
  entity.shape.collisionLayer = layer;
  return entity;
};

export const infiniteFunnel: StageDef = {
  title: '끝없는 나선', width: 64, spawnX: 20, goalY: 86, zoomY: 81, randomizeStart: true,
  art: { style: 'infinite-funnel', contours: [[...left, ...right.slice().reverse()]] },
  exitBridge: {
    entry: { x: 32, y: 43.5, width: 2, height: 1.2 },
    deck: [[29.4, 41.7], [34.6, 41.7], [34.6, 90], [29.4, 90]],
  },
  windZones: [
    { type: 'vortex', x: 32, y: 44, radius: 31, innerRadius: 5.8, speed: 18, radial: -3, gust: 0.035 },
    { type: 'directional', x: 24, y: 10, width: 18, height: 10, velocityX: 13, velocityY: 6, strength: 4 },
    { type: 'vortex', x: 32, y: 44, radius: 6.4, speed: 3, radial: -10 },
  ],
  entities: [
    rail(left), rail(right),
    rail([[29.4, 41.7], [29.4, 90]], 2), rail([[34.6, 41.7], [34.6, 90]], 2),
    rail([[29.4, 41.7], [34.6, 41.7]], 2),
  ],
};
