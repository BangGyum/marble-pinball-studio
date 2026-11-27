import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, wall } from './wind-map-shapes';

const rail = (points: [number, number][], color = '#9abaca') => {
  const entity = wall(points, 0);
  entity.shape.color = color;
  return entity;
};
const crossingHub = { x: 8.8, y: 23.8 };
const brass = '#edb66d';
const arm: [number, number][] = [
  [-3.48, -0.18],
  [3.48, -0.18],
  [3.48, 0.18],
  [-3.48, 0.18],
  [-3.48, -0.18],
];
// Solid polygons retain their relative angle when the starting layout is randomized.
const crossingArms = [0.3, Math.PI / 2 + 0.3].map(
  (angle): MapEntity => ({
    type: 'kinematic',
    position: crossingHub,
    shape: {
      type: 'polyline',
      solid: true,
      rotation: 0,
      points: arm.map(([x, y]) => [
        x * Math.cos(angle) - y * Math.sin(angle),
        x * Math.sin(angle) + y * Math.cos(angle),
      ]),
      color: brass,
    },
    props: { density: 1, restitution: 0.16, angularVelocity: -1.9 },
  })
);

export const bubbleMine: StageDef = {
  title: '방울 광산선',
  width: 33,
  spawnX: 7,
  randomizeStart: true,
  goalY: 53,
  zoomY: 48,
  bubbleMine: { x: 11.8, y: 38 },
  entities: [
    rail([
      [0.7, 40],
      [0.7, -20],
      [32.3, -20],
      [32.3, 42],
    ]),
    // The bulkhead keeps the ordinary route out of the elevated unloading shaft.
    rail([
      [20.4, -20],
      [20.4, 36.4],
      [21.2, 38.4],
    ]),
    rail([
      [0.7, 7.4],
      [5, 9],
      [12, 11.4],
      [15.6, 12.9],
    ]),
    rail([
      [20.4, 13.7],
      [17.3, 14.8],
      [15.2, 15.9],
    ]),
    // The brass bridge tips into the ore chute; when level it joins the blue switchback.
    {
      type: 'kinematic',
      position: { x: 15.2, y: 15.9 },
      shape: {
        type: 'polyline',
        solid: true,
        rotation: 0,
        color: brass,
        points: [
          [0, 0],
          [-3.9, 1.4],
          [-3.82, 1.62],
          [0.08, 0.22],
          [0, 0],
        ],
      },
      props: {
        density: 1,
        restitution: 0.08,
        angularVelocity: 0,
        timedGate: { period: 3.9, openFor: 1.45, phase: 0.4, angle: -1.02 },
      },
    },
    rail([[11.3, 17.3], ...curve([9.4, 18.1], [7, 19.7], [5.8, 20.2], [3.8, 20.25])]),
    // The four arms sweep toward the left switchback; the open right side drops onto the lower rail.
    rail(curve([0.7, 23.2], [1.6, 25.7], [4, 26.2], [6.4, 27.25])),
    ...crossingArms,
    {
      type: 'static',
      position: crossingHub,
      shape: { type: 'circle', radius: 0.28, color: '#ffda93' },
      props: { density: 1, restitution: 0.08, angularVelocity: 0 },
    },
    rail([
      [20.4, 27],
      [17.2, 28.15],
      [12.2, 29.65],
      [9.3, 30.9],
    ]),
    // A short gap lets slower marbles drop; faster ones clear it and ride the outer lip.
    rail([[7.1, 31.65], ...curve([6, 32.15], [4.8, 33.2], [3.45, 33.75], [2.8, 33.8])]),
    rail([[0.7, 34.5], ...curve([4, 36.6], [7.8, 39.8], [12.8, 39.4], [15.1, 39.85]), [17.1, 40.65]]),
    rail([
      [0.7, 40],
      [2, 43],
      [6.5, 45.5],
      [12.4, 49],
      [13.6, 50.6],
      [13.6, 54],
    ]),
    rail(
      [
        [32.3, 42],
        [31, 43.8],
        [26, 45.55],
        [22.1, 48.4],
        [20.6, 50.6],
        [20.6, 54],
      ],
      '#d6b478'
    ),
  ],
};
