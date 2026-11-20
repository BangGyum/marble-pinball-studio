import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { arc, curve, wall } from './wind-map-shapes';

type Point = [number, number];
const copper = '#db9258';
const entities: MapEntity[] = [];
const rail = (points: Point[], backing: number) => {
  const entity = wall(points, backing);
  entity.shape.color = copper;
  entity.shape.hidden = true;
  entities.push(entity);
};

// Side catch trays drain inward, returning both branches to the next pivot.
const left: Point[] = [[2, -22], [2, 98], ...curve([2, 98], [2, 103], [18, 105], [19, 110]).slice(1), [19, 116]];
rail(left, -0.65);
rail(
  left.map(([x, y]) => [46 - x, y]),
  0.65
);
for (let row = 0; row < 5; row++) {
  const y = 15 + row * 18,
    center = [23, 21.5, 24, 21.5, 23][row];
  // A circular segment with open lips, pivoting around its lowest point.
  const bias = [-0.43, 0.12, -0.18, 0.12, -0.18][row];
  const points = arc(0, -24, 24, 117, 63).map(
    ([x, y]): Point => [x * Math.cos(bias) - y * Math.sin(bias), x * Math.sin(bias) + y * Math.cos(bias)]
  );
  const rims = row === 2 ? [points.filter(([x]) => x < -2), points.filter(([x]) => x > 2)] : [points];
  for (const points of rims)
    entities.push({
      position: { x: center, y },
      type: 'kinematic',
      shape: {
        type: 'polyline',
        rotation: 0,
        hidden: true,
        color: copper,
        points: [
          ...points,
          ...points
            .slice()
            .reverse()
            .map(([x, y]): Point => [x, y + 0.46]),
          points[0],
        ],
      },
      props: {
        density: 1,
        restitution: 0.08,
        angularVelocity: 0,
        oscillation: { amplitude: 0.85, period: [8, 11.7, 10.2, 12.3, 11.1][row] },
      },
    });
  if (row === 4) break;
  const tray = curve([2, y + 5], [3, y + 8.6], [6, y + 9.8], [12, y + 11.4]);
  rail(tray, -0.45);
  rail(
    tray.map(([x, h]) => [46 - x, h]),
    0.45
  );
}

// The lid sheds misses to the right. Only marbles inside its short throat
// change collision layers and pass in front of the fourth seesaw.
const throat = { x: 24, y: 55.8, width: 5, height: 0.8 };
const outlet = { x: 24, y: 78, width: 7, height: 1.2 };
const deck: Point[] = [
  [21.25, 55.4],
  [26.75, 55.4],
  [26.75, 78.6],
  [21.25, 78.6],
];
entities.push({
  position: { x: 21, y: 52.8 },
  type: 'kinematic',
  shape: {
    type: 'polyline',
    hidden: true,
    color: '#ffc45d',
    rotation: 0,
    points: [
      [0, 0],
      [6.2, 1.2],
      [6.2, 1.55],
      [0, 0.35],
      [0, 0],
    ],
  },
  props: {
    density: 1,
    restitution: 0.05,
    angularVelocity: 0,
    timedGate: { period: 7, openFor: 2.2, phase: 1.5, angle: 1.23 },
  },
});
for (const [x, top, backing] of [
  [21.25, 53.65, -0.28],
  [26.75, 54.5, 0.28],
]) {
  rail(
    [
      [x, top],
      [x, 56.4],
    ],
    backing
  );
  const guide = wall(
    [
      [x, 55.2],
      [x, 78.6],
    ],
    backing
  );
  guide.shape.collisionLayer = 2;
  guide.shape.color = '#dba661';
  entities.push(guide);
}

export const seesawValley: StageDef = {
  title: '시소 계곡',
  width: 46,
  spawnX: 22.5,
  goalY: 114,
  zoomY: 109,
  randomizeStart: true,
  exitBridge: { entry: throat, deck, transfers: [{ entry: throat, exit: outlet, deck }] },
  art: { style: 'seesaw-valley', contours: [] },
  entities,
};
