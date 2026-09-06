import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';

const mint = '#65efda',
  violet = '#ba9cff',
  gold = '#ffd279';
const wall = (points: [number, number][], color = mint): MapEntity => ({
  position: { x: 0, y: 0 },
  type: 'static',
  shape: { type: 'polyline', points, rotation: 0, color },
  props: { density: 1, restitution: 0.08, angularVelocity: 0 },
});
const rotor = (x: number, y: number, width: number, spin: number, rotation: number, color: string): MapEntity => ({
  position: { x, y },
  type: 'kinematic',
  shape: { type: 'box', width, height: 0.13, rotation, color },
  props: { density: 1, restitution: 0.45, angularVelocity: spin },
});
const bumper = (x: number, y: number, radius: number, color: string): MapEntity => ({
  position: { x, y },
  type: 'static',
  shape: { type: 'circle', radius, color },
  props: { density: 1, restitution: 0.8, angularVelocity: 0 },
});

const colors = [mint, '#79baff', violet, '#ff96ce', gold];
// Separate tubes: broad S, double S, straight drop, angular zigzag and a twisting wave.
const pipe = (lane: number, side: number): [number, number][] => {
  if (lane === 2)
    return [
      [33 + side, 60],
      [33 + side, 140],
    ];
  if (lane === 3)
    return [
      [46 + side, 60],
      [49.5 + side, 72],
      [42.5 + side, 88],
      [49.5 + side, 104],
      [42.5 + side, 120],
      [46 + side, 140],
    ];
  return Array.from({ length: 81 }, (_, i) => {
    const t = i / 80;
    const waves = [
      (Math.sin(t * Math.PI * 2) + 0.7 * Math.sin(t * Math.PI * 4)) * 0.8,
      Math.sin(t * Math.PI * 4) * 1.2,
      0,
      0,
      Math.sin(t * Math.PI * 2),
    ];
    return [7 + lane * 13 + waves[lane] * 5 + side, 60 + t * 80];
  });
};
const tubes = Array.from({ length: 5 }, (_, lane) => [
  wall([[1 + lane * 4.8, 28], ...pipe(lane, -1)], colors[lane]),
  wall([[5.8 + lane * 4.8, 28], ...pipe(lane, 1)], colors[lane]),
]).flat();

// Compact Pot of greed-style return channels, adapted from the original MIT map.
const jarPoint = ([x, y]: [number, number]): [number, number] => [33 + (x - 13) * 0.8, 162 + (y - 61.5) * 0.5];
const jarWall = (points: [number, number][]) => wall(points.map(jarPoint), gold);
const returnWall: [number, number][] = [
  [11, 85.8],
  [11, 86.5],
  [10.4, 87.1],
  [9.6, 87.5],
  [8.7, 87.6],
  [7.8, 87.4],
  [6.9, 86.9],
  [6, 86.2],
  [5.2, 85.3],
  [4.6, 84.2],
  [4.1, 82.8],
  [3.5, 80.5],
  [3, 78.6],
  [2, 66.6],
  [3, 63.6],
  [4, 62.4],
  [5, 61.8],
  [6, 61.5],
];
// Filled collision shapes prevent return paddles from pushing marbles into hollow walls.
const divider: [number, number][] = [
  [7, 67.2],
  [7, 83],
  [6, 82.5],
  [5, 78.6],
  [4, 66.6],
  [7, 67.2],
];
const dividers = [-1, 1].map((side) => {
  const entity = jarWall(divider.map(([x, y]) => [side === -1 ? x : 26 - x, y]));
  if (entity.shape.type === 'polyline') entity.shape.solid = true;
  return entity;
});
const paddlePositions: [number, number, number][] = [
  [8.5, 87.6, 1.5],
  [4, 81, 2],
  [2.75, 73.5, 2],
];
const returnPaddles = [-1, 1].flatMap((side) =>
  paddlePositions.map(([x, y, size]) => {
    const [px, py] = jarPoint([side === -1 ? x : 26 - x, y]);
    const paddle = rotor(px, py, size * 0.8, side * 10, 0, violet);
    paddle.props.restitution = 0;
    return paddle;
  })
);
export const neonJunction: StageDef = {
  title: '네온 분기점',
  width: 66,
  randomizeStart: true,
  goalY: 176,
  zoomY: 173,
  entities: [
    wall([
      [9.25, -30],
      [9.25, 7],
      [1, 14],
      [1, 28],
    ]),
    wall(
      [
        [16.5, -30],
        [16.5, 7],
        [25, 14],
        [25, 28],
      ],
      gold
    ),
    rotor(11, 12, 2, 3, 0, mint),
    rotor(15, 12, 2, -3, 0, gold),
    rotor(8, 21, 2.2, 2.3, 0.4, violet),
    rotor(18, 21, 2.2, -2.7, -0.4, gold),
    bumper(13, 19, 0.9, violet),
    ...tubes,
    wall([[0, 120], [0, 137], [6, 140], [8, 146], [29, 155], [31.4, 157], [31.4, 159], jarPoint([6, 61.5])]),
    wall([[66, 120], [66, 137], [60, 140], [58, 146], [37, 155], [34.6, 157], [34.6, 159], jarPoint([20, 61.5])], gold),
    rotor(33, 153.5, 2.4, 2, 0.4, mint),
    jarWall(returnWall),
    jarWall(returnWall.map(([x, y]) => [26 - x, y])),
    ...dividers,
    jarWall([
      [9.5, 74.5],
      [11, 76],
      [11, 91],
    ]),
    jarWall([
      [16.5, 74.5],
      [15, 76],
      [15, 91],
    ]),
    {
      position: { x: 33, y: 165.8 },
      type: 'static',
      shape: { type: 'box', width: 0.8, height: 0.8, rotation: Math.PI / 4, color: mint },
      props: { density: 1, restitution: 0.6, angularVelocity: 0 },
    },
    ...returnPaddles,
  ],
};
