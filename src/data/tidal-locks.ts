import type { StageDef, WaterZone } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, propeller, wall } from './wind-map-shapes';

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

// The landing slides below the jump. Even at full travel there is open water under both ends.
const landing: MapEntity = {
  type: 'kinematic',
  position: { x: 20.9, y: 79.55 },
  shape: {
    type: 'polyline',
    solid: true,
    color: '#ffc887',
    rotation: 0,
    points: [
      [0, 0],
      [3.6, 2.25],
      [3.45, 2.53],
      [-0.15, 0.28],
      [0, 0],
    ],
  },
  props: { density: 1, restitution: 0.08, angularVelocity: 0, sliding: { amplitude: 1.1, period: 3.2, phase: 0 } },
};

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
  art: {
    style: 'tidal-locks',
    contours: [
      [
        ...curve([22, 32.5], [27.3, 32.5], [31.4, 39.8], [33, 44.3]),
        ...curve([29.4, 44.3], [28, 41.4], [24, 39], [22, 39]),
      ],
      curve([22.7, 33.3], [24.7, 33.5], [26.2, 34.8], [27.4, 36.3]),
      curve([28.6, 39.4], [29.4, 40.3], [30, 41.2], [30.6, 42.5]),
    ],
    arrows: [[19.2, 80.4, Math.PI / 2]],
  },
  width: 38,
  spawnX: 8,
  randomizeStart: true,
  goalY: 84,
  zoomY: 79,
  waterZones: [
    pool(1, 29.5, 9, 16.3, 7.8),
    pool(8, 37, 21, 28.3, -8.8),
    pool(1, 22, 32.5, 39, 10.5),
    pool(8, 37, 44.2, 52.3, -8.5),
    // A plunge pool catches the leaders under the waterfall before the final surge.
    pool(1, 9, 49.2, 61.6, 0.7),
    pool(1, 29.5, 57, 64.3, 7.8),
    pool(10, 37, 67.8, 74.5, -10),
    pool(1, 15.5, 76, 81.5, 10),
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
    // Only the lower branch passes through the submerged jet.
    {
      type: 'static',
      position: { x: 23.5, y: 26.35 },
      shape: { type: 'box', width: 1.5, height: 0.42, rotation: Math.PI - 0.09, boostSpeed: 23, color: '#8adce8' },
      props: { density: 1, restitution: 0, angularVelocity: 0 },
    },
    bank([
      [1, 35.8],
      [8, 37.5],
      [15, 38.6],
      [20, 38.3],
    ]),
    // Leave open water around every blade so deflected marbles drop cleanly on either side.
    ...propeller(26.9, 41.8, 1.95, -1.05),
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
    ...sluice(64, 35),
    bank(curve([37, 69.1], [32, 72.6], [19, 71.4], [11, 74.1])),
    // The inside gap drops directly to the finish. Fast marbles can jump it and ride the outside bend.
    bank(curve([1, 74.5], [4, 79.6], [10, 79.7], [15, 78.8])),
    landing,
  ],
};
