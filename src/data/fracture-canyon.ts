import type { StageDef } from './maps';
import type { MapEntity } from '../types/map-entity';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
const green = '#a6ff63',
  purple = '#b58aff';
const left: Point[] = [
  [22, -30],
  [22, 0],
  [28, 6],
  [28, 7.5],
  [21, 10],
  [8, 14],
  [5, 18],
  [5, 28],
  [7, 35],
  [6, 47],
  [8, 54],
  [6, 66],
  [8, 76],
  ...curve([8, 76], [8, 87], [20, 91], [29, 101]).slice(1),
  [29, 130],
];
const right: Point[] = [
  [42, -30],
  [42, 0],
  [36, 6],
  [36, 7.5],
  [43, 10],
  [57, 14],
  [59, 18],
  ...curve([59, 18], [62, 26], [56, 28], [56, 33]).slice(1),
  ...curve([56, 33], [56, 36], [61, 37], [60, 42]).slice(1),
  ...curve([60, 42], [59, 48], [55, 48], [55, 53]).slice(1),
  ...curve([55, 53], [55, 57], [61, 59], [59, 65]).slice(1),
  ...curve([59, 65], [57, 70], [57, 71], [56, 76]).slice(1),
  ...curve([56, 76], [56, 87], [44, 91], [35, 101]).slice(1),
  [35, 130],
];

// Separate rock islands leave real openings for all three diagonal crossings.
const islands: Point[][] = [
  [
    [32, 17],
    [42, 21],
    [32, 23],
    [22, 21],
    [32, 17],
  ],
  [
    [20, 23],
    [26, 26],
    [25, 28],
    [21, 30],
    [18, 28],
    [18, 25],
    [20, 23],
  ],
  [
    [44, 22.5],
    [48, 25],
    [47, 30],
    [45, 35],
    [41, 32],
    [39, 28],
    [41, 25],
    [44, 22.5],
  ],
  [
    [22, 37],
    [26, 39],
    [25, 44],
    [27, 48],
    [25, 53],
    [26, 56],
    [21, 60],
    [18, 56],
    [19, 50],
    [17.5, 46],
    [19, 41],
    [22, 37],
  ],
  [
    [43, 43],
    [47, 45],
    [48, 49],
    [46, 53],
    [41, 54],
    [38, 50],
    [39, 46],
    [43, 43],
  ],
  [
    [22, 66],
    [26, 69],
    [25, 72],
    [24, 75],
    [20, 77],
    [18, 73],
    [19, 68],
    [22, 66],
  ],
  [
    [42, 60],
    [46, 62],
    [48, 66],
    [46, 71],
    [47, 75],
    [45, 78],
    [40, 81],
    [38, 76],
    [39, 70],
    [38.5, 66],
    [42, 60],
  ],
];
// Closed guide pockets are rock in the scenery as well as unreachable in physics.
const guides: Point[][] = [
  [[59, 18], ...curve([57.5, 25], [58, 29], [54, 33], [49, 35]), [56, 33]],
  [[60, 42], ...curve([59, 44], [58, 48], [55, 50], [51, 52]), [55, 53]],
  [[59, 65], ...curve([58, 65], [57, 69], [54, 73], [49, 75]), [56, 76]],
];
const pockets = guides.map((points) => {
  const start = right.findIndex((p) => p[0] === points[0][0] && p[1] === points[0][1]);
  const end = right.findIndex((p) => p[0] === points.at(-1)![0] && p[1] === points.at(-1)![1]);
  return [
    ...points,
    ...right
      .slice(start, end + 1)
      .reverse()
      .slice(1),
  ];
});
// The pointed inlet rock needs one convex fixture: thick edge strips protrude at its tip.
const inletRock: MapEntity = {
  position: { x: 0, y: 0 },
  type: 'static',
  shape: { type: 'polyline', points: islands[0], rotation: 0, solid: true, hidden: true, color: purple },
  props: { density: 1, restitution: 0.05, angularVelocity: 0 },
};
const rail = (points: Point[], backing: number, color: string): MapEntity => {
  const e = wall(points, backing);
  e.shape.color = color;
  return e;
};
const boost = (x: number, y: number, rotation: number, speed = 26, thickness = 0.6): MapEntity => ({
  position: { x, y },
  type: 'static',
  shape: { type: 'box', width: 0.95, height: thickness, rotation, boostSpeed: speed, color: green },
  props: { density: 1, restitution: 0, angularVelocity: 0 },
});
const rotor = (x: number, y: number, radius: number, speed: number): MapEntity[] => [
  ...[0, Math.PI / 2].map(
    (rotation): MapEntity => ({
      position: { x, y },
      type: 'kinematic',
      shape: { type: 'box', width: radius, height: 0.22, rotation, color: rotation ? purple : green },
      props: { density: 1, restitution: 0.22, angularVelocity: speed },
    })
  ),
  {
    position: { x, y },
    type: 'static',
    shape: { type: 'circle', radius: 0.55, color: '#d3ffad' },
    props: { density: 1, restitution: 0.2, angularVelocity: 0 },
  },
];
const bridgeSlope = Math.atan2(10, 36);
const bridge = (a: Point, b: Point, depth = 0.65): MapEntity => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  const backing = a[0] < b[0] ? -depth : depth,
    nx = (dy / length) * backing,
    ny = (-dx / length) * backing;
  // A solid deck avoids overlapping edge/backing contacts on the shallow slopes.
  return {
    position: { x: 0, y: 0 },
    type: 'static',
    shape: {
      type: 'polyline',
      solid: true,
      rotation: 0,
      color: purple,
      points: [a, b, [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny], a],
    },
    props: { density: 1, restitution: 0.05, angularVelocity: 0 },
  };
};
const hatch: MapEntity = {
  position: { x: 35, y: 54 + (15 * 10) / 36 },
  type: 'kinematic',
  shape: {
    type: 'polyline',
    solid: true,
    rotation: 0,
    color: purple,
    points: [
      [0, 0],
      [-6, (6 * 10) / 36],
      [-6, (6 * 10) / 36 + 0.38],
      [0, 0.38],
      [0, 0],
    ],
  },
  props: {
    density: 1,
    restitution: 0.05,
    angularVelocity: 0,
    timedGate: { period: 4.8, openFor: 2.4, phase: 1.2, angle: -1.05, releaseAfter: 28 },
  },
};
const jump = boost(21.7, 79.65, -0.22, 24);
jump.shape.color = '#ffc668';

export const fractureCanyon: StageDef = {
  title: '균열 협곡',
  width: 64,
  spawnX: 32,
  goalY: 106,
  zoomY: 101,
  randomizeStart: true,
  art: {
    style: 'fracture-canyon',
    contours: [[...left, ...right.slice().reverse()], ...islands, ...pockets],
    arrows: [
      [11, 64, Math.PI / 2],
      [32, 63, Math.PI / 2],
      [52, 50, Math.PI / 2],
      [32, 99, Math.PI / 2],
    ],
  },
  entities: [
    rail(left, -0.9, green),
    rail(right, 0.9, purple),
    ...islands.map((points, i) => (i ? rail(points, -0.7, i % 2 ? green : purple) : inletRock)),
    ...rotor(32, 12, 3.5, 2.2),
    bridge([14, 31], [50, 41]),
    bridge([50, 54], [35, 54 + (15 * 10) / 36]),
    hatch,
    bridge([29, 54 + (21 * 10) / 36], [14, 64]),
    bridge([14, 78], [43, 86.05]),
    ...guides.map((points) => rail(points, 0.6, purple)),
    rail(
      [
        [5, 26],
        [11, 29],
      ],
      -0.6,
      green
    ),
    rail(
      [
        [6, 48],
        [11, 51],
      ],
      -0.6,
      green
    ),
    rail(
      [
        [6, 68],
        [11, 71],
      ],
      -0.6,
      green
    ),
    ...rotor(14.5, 74.2, 2.4, 1.5),
    boost(45.3, 38.8, bridgeSlope),
    boost(39, 56.1, Math.PI - bridgeSlope),
    boost(32, 67, Math.PI / 2, 23, 2),
    boost(10.05, 69.4, Math.atan2(3, 5), 24),
    jump,
    ...rotor(32, 104.3, 0.95, -2.7),
    bridge([29, 101], [32, 102], 0.45),
    bridge([35, 102], [33.7, 103.5], 0.45),
  ],
};
