import type { StageDef } from '../stage-def';
import { curve, wall } from './wind-map-shapes';

const rail = (points: [number, number][], color = '#9abaca') => {
  const entity = wall(points, 0);
  entity.shape.color = color;
  return entity;
};

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
        color: '#edb66d',
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
    rail([...curve([0.7, 21.3], [2.7, 24.9], [7.1, 25.3], [10.4, 25.55]), [11.65, 25.9]]),
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
      [14.8, 49],
      [16, 50.6],
      [16, 54],
    ]),
    rail(
      [
        [32.3, 42],
        [31, 44.4],
        [26, 46.8],
        [19.8, 49],
        [18.2, 50.6],
        [18.2, 54],
      ],
      '#d6b478'
    ),
  ],
};
