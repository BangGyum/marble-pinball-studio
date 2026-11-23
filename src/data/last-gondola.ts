import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
const rail = (points: Point[], color = '#90adbd', sensor = false): MapEntity => {
  const entity = wall(points, 0);
  Object.assign(entity.shape, { color, sensor });
  return entity;
};
const pin = (x: number, y: number, radius: number, color: string, sensor = false): MapEntity => ({
  position: { x, y },
  type: 'static',
  shape: { type: 'circle', radius, color, sensor },
  props: { density: 1, restitution: 0.38, angularVelocity: 0 },
});
const mint = '#85ebbf',
  amber = '#ffd184';
const origin = { x: 8.7, y: 18.1 },
  destination = { x: 27.7, y: 26.4 };

function mixer(x: number, y: number, spin: number): MapEntity[] {
  return [
    {
      type: 'kinematic',
      position: { x, y },
      shape: { type: 'box', width: 2.55, height: 0.16, rotation: 0, color: '#80c7c0' },
      props: { density: 1, restitution: 0.34, angularVelocity: spin },
    },
    pin(x, y, 0.22, '#b8d4c9', true),
  ];
}

function hingedRail(
  x: number,
  y: number,
  dx: number,
  dy: number,
  timedGate: NonNullable<MapEntity['props']['timedGate']>
): MapEntity {
  return {
    type: 'kinematic',
    position: { x, y },
    shape: {
      type: 'polyline',
      solid: true,
      rotation: 0,
      color: amber,
      points: [
        [0, 0],
        [dx, dy],
        [dx, dy + 0.18],
        [0, 0.18],
        [0, 0],
      ],
    },
    props: { density: 1, restitution: 0.1, angularVelocity: 0, timedGate },
  };
}

const stationGate = { period: 8.5, openFor: 2.9, phase: 4, releaseAfter: 5.7 };
const stationApproach = curve([0.7, 6.8], [0.7, 12], [2.2, 13.9], [7.05, 15.5]);
// Give the crowded left approach a solid face behind the visible curve, without narrowing the station.
const stationWall = stationApproach.slice(1).map((end, i): MapEntity => {
  const start = stationApproach[i];
  const dx = end[0] - start[0],
    dy = end[1] - start[1],
    depth = 0.28 / Math.hypot(dx, dy);
  return {
    type: 'static',
    position: { x: 0, y: 0 },
    shape: {
      type: 'polyline',
      solid: true,
      hidden: true,
      rotation: 0,
      points: [
        start,
        end,
        [end[0] - dy * depth, end[1] + dx * depth],
        [start[0] - dy * depth, start[1] + dx * depth],
        start,
      ],
    },
    props: { density: 1, restitution: 0.05, angularVelocity: 0 },
  };
});

export const lastGondola: StageDef = {
  title: '막차 곤돌라',
  width: 32,
  spawnX: 8.45,
  goalY: 53,
  zoomY: 48,
  randomizeStart: true,
  goalArea: { x: 28.5, y: 51.65, radius: 1.27 },
  entities: [
    rail([
      [0.7, 40],
      [0.7, -20],
      [31.3, -20],
      [31.3, 42],
    ]),
    rail(stationApproach, undefined, true),
    ...stationWall,
    rail([[16.2, -20], ...curve([16.2, 7.2], [16.2, 12.2], [13.7, 14.4], [10.2, 15.53])]),
    // Both paddles lift marbles toward the center before the two halves of the hatch open together.
    hingedRail(7.05, 15.5, 1.575, 0.015, { ...stationGate, angle: 1.32 }),
    hingedRail(10.2, 15.53, -1.575, -0.015, { ...stationGate, angle: -1.32 }),
    ...mixer(6, 12.25, -4.3),
    ...mixer(11.1, 12.25, 4.3),
    rail(
      [
        [origin.x, origin.y],
        [destination.x, destination.y],
      ],
      '#69ad9e',
      true
    ),
    ...[origin, destination].map((p) => pin(p.x, p.y, 0.19, amber, true)),
    {
      type: 'kinematic',
      position: origin,
      shape: {
        type: 'polyline',
        sensor: true,
        color: mint,
        rotation: 0,
        gondola: { x: destination.x - origin.x, y: destination.y - origin.y },
        points: [
          [-1, 0.64],
          [-1, 1.18],
          [-0.85, 1.39],
          [0.85, 1.39],
          [1, 1.18],
          [1, 0.64],
        ],
      },
      props: { density: 1, restitution: 0, angularVelocity: 0 },
    },
    // The downhill lip stays draining even at rest. Speed decides which of the two landings a marble reaches.
    rail([
      ...curve([0.7, 21.1], [2, 22.9], [8.7, 24.8], [11.9, 25.8]),
      ...curve([11.9, 25.8], [13.25, 26.21], [14.35, 26.31], [15.4, 26.39]).slice(1),
    ]),
    rail(curve([18.35, 27.85], [19.5, 27.87], [21.25, 28.4], [21.95, 28.8]), '#a0cece'),
    rail(curve([12.15, 28.85], [13.8, 30.48], [17.8, 30.56], [19.8, 31.6])),
    // The bridge completes the leftward switchback. When it tips, the next marble drops onto the inner ledge.
    rail([...curve([24.1, 28.9], [24.1, 30.8], [23.2, 32.1], [20.5, 33.1]), [17.6, 34.2]]),
    hingedRail(17.6, 34.2, -5.8, 1.85, { period: 3.6, openFor: 1.65, phase: 0.55, angle: -1.18 }),
    pin(17.6, 34.2, 0.2, amber, true),
    rail(curve([11.8, 36.05], [8.6, 37.1], [5.6, 37.95], [3.5, 38.9])),
    rail(curve([11.15, 40.6], [12, 41.75], [14.6, 41.95], [16.15, 42.48]), '#96cbbf'),
    {
      type: 'static',
      position: { x: 4.9, y: 42.95 },
      shape: { type: 'box', width: 0.92, height: 0.5, rotation: 0.34, boostSpeed: 12.5, color: '#81d3c2' },
      props: { density: 1, restitution: 0, angularVelocity: 0 },
    },
    // Catch ordinary-route rebounds under the cable before the gondola unloads to the right.
    rail([
      [21.9, 25.9],
      ...curve([23.4, 26.45], [24, 26.8], [24.1, 27.9], [24.1, 28.9]),
      ...curve([24.1, 40.6], [24.1, 42], [24.6, 43], [25.5, 43.65]),
    ]),
    rail([
      ...curve([0.7, 40], [0.7, 41.3], [1.4, 42.1], [3.7, 42.95]),
      ...curve([3.7, 42.95], [9.4, 45.05], [23.55, 48.05], [26.25, 49.45]).slice(1),
      [27.25, 50.35],
      [27.25, 54],
    ]),
    rail([...curve([31.3, 42], [31.3, 46.8], [30.4, 48.55], [29.75, 50.35]), [29.75, 54]], amber),
    // Two downhill turns in the express shaft give fast marbles on the ordinary route time to catch up.
    rail(
      [
        [31.3, 30],
        [30, 30.35],
        [27.6, 31.35],
        [25.4, 32.55],
      ],
      '#a0cece'
    ),
    rail(
      [
        [24.1, 34.45],
        [25.5, 34.8],
        [28, 35.95],
        [30.1, 37.1],
      ],
      '#a0cece'
    ),
  ],
};
