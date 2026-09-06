import type { MapEntity } from '../types/MapEntity.type';
import type { StageDef } from './maps';

const cyan = '#64f4e0';
const blue = '#74a8ff';
const pink = '#ff8bc6';
const gold = '#ffd67a';

const wall = (points: [number, number][], color: string, backing?: number): MapEntity => ({
  position: { x: 0, y: 0 },
  type: 'static',
  shape: { type: 'polyline', points, rotation: 0, color, backing },
  props: { density: 1, restitution: 0.08, angularVelocity: 0 },
});

const bumper = (x: number, y: number, radius: number, color: string): MapEntity => ({
  position: { x, y },
  type: 'static',
  shape: { type: 'circle', radius, color },
  props: { density: 1, restitution: 0.9, angularVelocity: 0 },
});

const rotor = (x: number, y: number, spin: number, color: string): MapEntity => ({
  position: { x, y },
  type: 'kinematic',
  shape: { type: 'box', width: 1.65, height: 0.13, rotation: 0, color },
  props: { density: 1, restitution: 0.28, angularVelocity: spin },
});

const anchors: [number, number][] = [
  [13, -30],
  [13, 8],
  [19, 18],
  [28, 31],
  [27, 43],
  [18, 54],
  [7.5, 67],
  [8.5, 79],
  [19, 91],
  [29, 104],
  [27, 116],
  [17, 128],
  [8, 139],
  [12, 149],
  [18, 157],
];

const centerLine: [number, number][] = anchors.flatMap(([x, y], index) => {
  if (index === anchors.length - 1) return [[x, y]];
  const [nextX, nextY] = anchors[index + 1];
  return Array.from({ length: 8 }, (_, step): [number, number] => {
    const t = step / 8;
    const smooth = t * t * (3 - 2 * t);
    return [x + (nextX - x) * smooth, y + (nextY - y) * t];
  });
});

const centreAt = (y: number) => {
  for (let index = 1; index < centerLine.length; index++) {
    const previous = centerLine[index - 1];
    const next = centerLine[index];
    if (next[1] >= y) {
      const amount = (y - previous[1]) / (next[1] - previous[1]);
      return previous[0] + (next[0] - previous[0]) * amount;
    }
  }
  return centerLine[centerLine.length - 1][0];
};

const halfWidth = 3.35;
const leftWall = centerLine.map(([x, y]): [number, number] => [x - halfWidth, y]);
const rightWall = centerLine.map(([x, y]): [number, number] => [x + halfWidth, y]);

export const pipelineRun: StageDef = {
  title: '네온 파이프라인',
  width: 36,
  randomizeStart: true,
  goalY: 154,
  zoomY: 150,
  entities: [
    wall(leftWall, cyan, -2.5),
    wall(rightWall, blue, 2.5),
    rotor(centreAt(38), 38, 1.6, pink),
    // Wall-mounted bumpers intercept the outer-wall flow without leaving a trapping slit.
    bumper(centreAt(43) + halfWidth, 43, 1.1, gold),
    bumper(centreAt(72) - halfWidth, 72, 0.95, pink),
    rotor(centreAt(84), 84, -1.35, cyan),
    bumper(centreAt(91) - halfWidth, 91, 1.1, gold),
    bumper(centreAt(116) + halfWidth, 116, 1.1, blue),
    rotor(centreAt(123), 123, 1.5, pink),
    bumper(centreAt(142) - halfWidth, 142, 1.1, gold),
  ],
};
