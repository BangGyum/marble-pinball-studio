import { marbleLauncher } from '../marble-launcher';
import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
const feed = '#8ab6b2',
  returnRail = '#708897',
  cup = '#ffd184';
const rail = (points: Point[], color: string): MapEntity => {
  const entity = wall(points, 0);
  entity.shape.color = color;
  return entity;
};
const launcher = marbleLauncher(28, 21.5, 'chute');

const enclosure = rail(
  [
    [0.8, 17],
    [0.8, -21],
    [33.4, -21],
    [33.4, 16.7],
  ],
  returnRail
);

export const reboundPad: MapEntity = {
  type: 'static',
  position: { x: 13, y: 22.5 },
  shape: { type: 'box', width: 2.9, height: 0.23, rotation: 0.03, color: '#65efda' },
  props: { density: 1, restitution: 1.55, angularVelocity: 0 },
};
export const oneBounce: StageDef = {
  title: '원바운드 샷',
  width: 34,
  spawnX: 6.2,
  goalY: 40,
  zoomY: 35,
  randomizeStart: true,
  goalArea: { x: 3.35, y: 37.8, radius: 1.08 },
  art: { style: 'one-bounce', contours: [] },
  entities: [
    enclosure,
    rail([...curve([0.8, 17], [0.9, 18.83], [2.65, 19.17], [2.65, 22]), [2.65, 40]], cup),
    rail([...curve([7.2, 19.7], [6.86, 20.39], [4.5, 20.7], [4.05, 22]), [4.05, 40]], cup),
    // The crescent openings leave room for several marbles to drain side by side.
    rail(curve([0.8, 3.15], [2.6, 5.7], [3.9, 6.1], [6.15, 6.85]), feed),
    rail(curve([8.55, 6.77], [9.2, 6.4], [9.75, 6.13], [10.15, 5.4]), feed),
    rail(curve([5.15, 7.75], [6.45, 9], [8, 9.3], [9.75, 10]), feed),
    rail(curve([13.55, 9.94], [14.05, 9.55], [14.8, 9.15], [15.25, 8.75]), feed),
    rail(
      [
        ...curve([0.8, 8.2], [3.1, 9.1], [6.8, 10.2], [8.5, 10.66]),
        ...curve([8.5, 10.66], [11, 11.3], [13.8, 12.55], [17, 13.4]).slice(1),
        ...curve([17, 13.4], [19, 13.88], [20.05, 14.22], [21.4, 15.18]).slice(1),
      ],
      feed
    ),
    rail([...curve([24.6, 15.13], [25.1, 14.85], [25.6, 14.7], [26.15, 15.6]), [27.45, 17.9]], feed),
    rail(
      [
        [19.25, 15.75],
        [24.5, 17.35],
        [27.34, 19.72],
        [27.34, 20.5],
      ],
      feed
    ),
    {
      type: 'kinematic',
      position: { x: 16.6, y: 11.62 },
      shape: { type: 'box', width: 0.22, height: 1.15, rotation: 0, color: '#ba9cff' },
      props: { density: 1, restitution: 0.32, angularVelocity: 0, oscillation: { amplitude: 0.85, period: 2.5 } },
    },
    rail(
      [
        [30.5, 18.8],
        [28.66, 20.16],
        [28.66, 21.7],
      ],
      returnRail
    ),
    launcher,
    reboundPad,
    rail(
      [
        [4.05, 30],
        [14, 32.4],
        [28, 35.3],
        [32.85, 36.15],
        [33.4, 35.6],
        [33.4, 16.7],
        [29.1, 13.65],
      ],
      returnRail
    ),
    rail(
      [
        [30.5, 18.8],
        [30.5, 33.2],
      ],
      returnRail
    ),
  ],
  windZones: [
    { type: 'directional', x: 32, y: 25.85, width: 2.9, height: 21.8, velocityX: 0, velocityY: -10, strength: 6 },
    { type: 'directional', x: 30.95, y: 15.6, width: 5.4, height: 4.8, velocityX: -7, velocityY: 0, strength: 6 },
  ],
};
