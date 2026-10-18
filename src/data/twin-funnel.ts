import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/MapEntity.type';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
export const twinBowls = [{ x: 26, y: 40, direction: 1 }, { x: 42, y: 96, direction: -1 }];
const contours: Point[][] = [];
const rail = (points: Point[], layer: 1 | 2 = 1, color = '#85c9ec'): MapEntity => {
  const entity = wall(points, 0);
  entity.shape.hidden = true; entity.shape.collisionLayer = layer; entity.shape.color = color;
  return entity;
};
const bowls = twinBowls.flatMap(({ x, y, direction }, index) => {
  const spiral = (offset: number): Point[] => Array.from({ length: 193 }, (_, i) => {
    const t = i / 192, angle = -Math.PI / 2 + direction * t * Math.PI * 4;
    const radius = 23 - 18 * t + offset;
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
  });
  const inner = spiral(-1.7), outer = spiral(1.7);
  const startX = x - direction * 12, startY = index ? 64 : -30, bendY = y - 31;
  const left: Point[] = [[startX - direction * 4, startY], [startX - direction * 4, bendY],
    ...curve([startX - direction * 4, bendY], [startX - direction * 4, y - 21], [x - direction * 7, inner[0][1]], inner[0]).slice(1), ...inner.slice(1)];
  const right: Point[] = [[startX + direction * 4, startY], [startX + direction * 4, bendY],
    ...curve([startX + direction * 4, bendY], [startX + direction * 4, y - 25], [x - direction * 5, outer[0][1]], outer[0]).slice(1), ...outer.slice(1)];
  contours.push([...left, ...right.slice().reverse()]);
  return [rail(left, 1, index ? '#d0a4df' : '#85c9ec'), rail(right, 1, index ? '#d0a4df' : '#85c9ec')];
});
const transferLeft: Point[] = [[23.4, 37.7], [23.4, 46], [51.4, 64], [51.4, 69]];
const transferRight: Point[] = [[28.6, 37.7], [28.6, 44], [56.6, 62], [56.6, 69]];

export const twinFunnel: StageDef = {
  title: '쌍둥이 와류', width: 70, spawnX: 14, goalY: 130, zoomY: 125, randomizeStart: true,
  art: { style: 'twin-funnel', contours },
  exitBridge: {
    entry: { x: 42, y: 95.5, width: 1, height: 1.2 },
    deck: [[39.4, 93.7], [44.6, 93.7], [44.6, 134], [39.4, 134]],
    transfers: [{
      entry: { x: 26, y: 39.5, width: 1, height: 1.2 },
      exit: { x: 54, y: 67.2, width: 6, height: 1.2 },
      deck: [...transferLeft, ...transferRight.slice().reverse()],
    }],
  },
  windZones: twinBowls.flatMap(({ x, y, direction }) => [
    { type: 'vortex' as const, x, y, radius: 25, innerRadius: 5.8, speed: direction * 17, radial: -3, gust: .035 },
    { type: 'directional' as const, x: x - direction * 8, y: y - 26, width: 18, height: 10, velocityX: direction * 13, velocityY: 6, strength: 4 },
    { type: 'vortex' as const, x, y, radius: 6.4, speed: direction * 3, radial: -10 },
  ]),
  entities: [...bowls,
    rail(transferLeft, 2), rail(transferRight, 2), rail([[23.4, 37.7], [28.6, 37.7]], 2),
    rail([[39.4, 93.7], [39.4, 134]], 2), rail([[44.6, 93.7], [44.6, 134]], 2),
    rail([[39.4, 93.7], [44.6, 93.7]], 2),
  ],
};
