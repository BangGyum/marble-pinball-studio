import type { StageDef, WaterZone } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
const seaGlass = '#94d4cd';
const brass = '#ffca79';

function bank(points: Point[], color = seaGlass) {
  const rail = wall(points, 0);
  rail.shape.color = color;
  return rail;
}

function pool(left: number, right: number, surface: number, bottom: number, current: number): WaterZone {
  return { x: left, y: surface, width: right - left, depth: bottom - surface, current };
}

// The hinge sits behind the right bank. The leaf opens down and parks outside the waterway.
function sluice(y: number, release: number): MapEntity[] {
  const hinge = { x: 37.5, y };
  return [
    {
      type: 'kinematic',
      position: hinge,
      shape: {
        type: 'polyline',
        solid: true,
        rotation: 0,
        points: [
          [0, 0],
          [-9.6, 0],
          [-9.6, 0.21],
          [0, 0.33],
          [0, 0],
        ],
        color: brass,
      },
      props: {
        density: 1,
        restitution: 0.05,
        angularVelocity: 0,
        timedGate: {
          period: 30,
          openFor: 3,
          phase: (30 - (release % 30)) % 30,
          angle: -Math.PI / 2,
          releaseAfter: release,
        },
      },
    },
    {
      type: 'static',
      position: hinge,
      shape: { type: 'circle', radius: 0.38, color: brass, sensor: true },
      props: { density: 1, restitution: 0, angularVelocity: 0 },
    },
  ];
}

export const tidalLocks: StageDef = {
  title: '밀물 갑문',
  art: { style: 'tidal-locks', contours: [] },
  width: 38,
  spawnX: 8,
  randomizeStart: true,
  goalY: 84,
  zoomY: 79,
  waterZones: [
    pool(1, 29.5, 9, 16.3, 7.8),
    pool(8, 37, 21, 28.3, -8.8),
    pool(1, 29.5, 33, 40.3, 7.6),
    pool(8, 37, 45, 52.3, -9.5),
    pool(1, 29.5, 57, 64.3, 7.8),
    pool(10, 37, 67.8, 74.5, -10),
    pool(1, 26, 76, 81.5, 10),
  ],
  entities: [
    bank(
      [
        [1, 86],
        [1, -22],
        [37, -22],
        [37, 86],
      ],
      '#729caa'
    ),
    bank([
      [1, 13.6],
      [9, 14.5],
      [21, 15.2],
      [28, 16],
    ]),
    ...sluice(16, 8.5),
    bank([
      [37, 25.2],
      [30, 26.4],
      [18, 26.9],
      [9, 28],
    ]),
    // The nose of the island splits the return current, then both lanes feed the same bend.
    bank(
      [
        [34.5, 23.6],
        [27, 23.95],
        [21, 24.65],
        [17, 24.9],
      ],
      '#9dc6de'
    ),
    bank([
      [1, 37.1],
      [8, 38.4],
      [17, 38.7],
      [28, 40],
    ]),
    ...sluice(40, 23),
    bank([
      [37, 48.9],
      [28, 50.3],
      [18, 50.7],
      [9, 52],
    ]),
    bank(
      [
        [30, 47.5],
        [26, 47.9],
        [22, 48.7],
      ],
      '#9dc6de'
    ),
    bank([
      [1, 61.1],
      [10, 62.2],
      [20, 62.7],
      [28, 64],
    ]),
    ...sluice(64, 38),
    // The last two banks make a broad S. The outside line rolls back into the current.
    bank(curve([37, 69.1], [32, 72.6], [19, 71.4], [11, 74.1])),
    bank(curve([1, 74.5], [4, 80.4], [15, 77.7], [26, 81.1])),
  ],
};
