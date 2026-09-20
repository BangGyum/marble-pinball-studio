import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';

type Point = [number, number];
const bend = (a: Point, b: Point, c: Point, d: Point, steps = 32): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t;
    return [u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
      u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]];
  });
const sections = [
  bend([23, 9], [23, 15], [34, 14], [39, 20]),
  bend([39, 20], [49, 30], [26, 31], [13, 38]),
  bend([13, 38], [2, 44], [5, 49], [15, 53]),
  bend([15, 53], [28, 58], [44, 61], [39, 70]),
  bend([39, 70], [34, 79], [24, 81], [13, 88]),
  bend([13, 88], [1, 96], [9, 101], [24, 106]),
  bend([24, 106], [45, 112], [30, 122], [30, 128]),
];
const center = sections.flatMap((points, i) => i ? points.slice(1) : points);
const bank = (side: number): Point[] => center.map(([x, y], i) => {
  const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [x - (b[1] - a[1]) / length * 2.5 * side, y + (b[0] - a[0]) / length * 2.5 * side];
});
const left = bank(1), right = bank(-1);
// Split the bank exactly at the bypass junctions; the opening and art share these coordinates.
for (const x of [23.5, 26.5]) {
  for (let i = right.length - 1; i > 0; i--) {
    const a = right[i - 1], b = right[i];
    if ((a[0] - x) * (b[0] - x) >= 0) continue;
    const t = (x - a[0]) / (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]);
    if ((y > 28 && y < 41) || (y > 50 && y < 63) ||
      (y > 78 && y < 91) || (y > 102 && y < 115)) right.splice(i, 0, [x, y]);
  }
}
const junction = (x: number, min: number, max: number) => right.findIndex(([px, y]) => px === x && y > min && y < max);
const a = junction(26.5, 28, 41), b = junction(23.5, 28, 41);
const c = junction(23.5, 50, 63), d = junction(26.5, 50, 63);
const a2 = junction(26.5, 78, 91), b2 = junction(23.5, 78, 91);
const c2 = junction(23.5, 102, 115), d2 = junction(26.5, 102, 115);
const inletRight: Point[] = [[26.5, -30], [26.5, 6], ...bend([26.5, 6], [26.5, 7], [25.5, 8], right[0], 8).slice(1)];
const outerLeft: Point[] = [[19.5, -30], [19.5, 6],
  ...bend([19.5, 6], [19.5, 8], [19.5, 9], [18, 10], 8).slice(1),
  ...bend([18, 10], [12, 11], [6, 8], [6, 3], 24).slice(1),
  ...bend([6, 3], [0, 10], [11, 13], left[10]).slice(1), ...left.slice(11)];
const outerRight = [...inletRight, ...right.slice(1, a + 1), ...right.slice(d, a2 + 1), ...right.slice(d2)];
const island = [...right.slice(b, c + 1), right[b]];
const island2 = [...right.slice(b2, c2 + 1), right[b2]];
const cupLeft: Point[] = [...bend([10, 132], [10, 136], [20, 137], [26, 138]), [26, 143]];
const cupRight: Point[] = [...bend([36, 132], [36, 136], [32, 137], [28, 138]), [28, 143]];
const wall = (points: Point[], backing: number): MapEntity => ({
  position: { x: 0, y: 0 }, type: 'static',
  shape: { type: 'polyline', points, rotation: 0, color: '#9ce7ff', backing },
  props: { density: 1, restitution: 0.04, angularVelocity: 0 },
});
const diamond = (i: number, restitution = 0.85): MapEntity => {
  const p = center[i], floor = center[i + 1][0] > center[i - 1][0] ? left[i] : bank(-1)[i];
  return { position: { x: p[0] + (floor[0] - p[0]) * 1.2, y: p[1] + (floor[1] - p[1]) * 1.2 },
    type: 'kinematic', shape: { type: 'box', width: 0.62, height: 0.62, rotation: Math.PI / 4, color: '#ffc76b' },
    props: { density: 1, restitution, angularVelocity: 2.5 } };
};

const course = {
  title: '지그재그 급류', width: 48, spawnX: 23, randomizeStart: true, goalY: 142, zoomY: 137,
  art: { style: 'rapids', contours: [
    [[19.5, 0], ...outerLeft.filter(([, y]) => y >= 0), ...outerRight.filter(([, y]) => y >= 0).slice().reverse(), [26.5, 0]],
    island, [...cupLeft, ...cupRight.slice().reverse()], island2,
  ], arrows: [[32, 17.5, 0.45], [29, 31.8, 2.78], [10, 48, 0.9], [29, 59, 0.42],
    [29, 81, 2.8], [12, 99, 0.5], [30, 125, Math.PI / 2], [25, 50, Math.PI / 2], [25, 97, Math.PI / 2]] },
  entities: [
    wall(outerLeft, -0.8), wall(outerRight, 0.8), wall(island, 0.8),
    wall(cupLeft, -0.8), wall(cupRight, 0.8),
    wall([[10, 124], [10, 132]], -0.8),
    wall(island2, 0.8),
    diamond(14), diamond(27),
    { position: { x: center[47][0], y: center[47][1] }, type: 'kinematic',
      shape: { type: 'box', width: 2.1, height: 0.16, rotation: 0.2, color: '#b69aff' },
      props: { density: 1, restitution: 0.18, angularVelocity: 0, oscillation: { amplitude: 0.6, period: 3 } } },
    { position: { x: 25, y: 45 }, type: 'static',
      shape: { type: 'circle', radius: 0.55, color: '#ffc76b' },
      props: { density: 1, restitution: 0.65, angularVelocity: 0 } },
    { position: { x: center[172][0], y: center[172][1] - 1.4 }, type: 'kinematic',
      shape: { type: 'polyline', solid: true, rotation: 0, color: '#b69aff',
        points: [[-0.12, 0], [0.12, 0], [0.5, 2.2], [0, 2.7], [-0.5, 2.2], [-0.12, 0]] },
      props: { density: 1, restitution: 0.25, angularVelocity: 0, oscillation: { amplitude: 0.55, period: 2.8 } } },
    diamond(216, 0.25),
    { position: { x: 24.5, y: 135.6 }, type: 'kinematic',
      shape: { type: 'box', width: 1.1, height: 1.1, rotation: 0.3, color: '#b69aff' },
      props: { density: 1, restitution: 0.2, angularVelocity: -1.1 } },
  ],
} satisfies StageDef;

// Keep the existing course intact below a short, rounded mixing chamber.
const drop = 12;
const lower = (points: Point[]): Point[] => points.map(([x, y]) => [x, y + drop]);
const entryLeft: Point[] = [[19.5, -30], [19.5, 5],
  ...bend([19.5, 5], [19.5, 7], [16, 7], [16, 10], 16).slice(1),
  ...bend([16, 10], [16, 16], [17, 17], [21.5, 19], 20).slice(1),
  ...bend([21.5, 19], [21.5, 20], [20.5, 20], [left[0][0], left[0][1] + drop], 8).slice(1),
  ...lower(left.slice(1))];
const entryRight: Point[] = [[26.5, -30], [26.5, 5],
  ...bend([26.5, 5], [26.5, 7], [30, 7], [30, 10], 16).slice(1),
  ...bend([30, 10], [30, 16], [29, 17], [24.5, 19], 20).slice(1),
  ...bend([24.5, 19], [24.5, 20], [25.5, 20], [right[0][0], right[0][1] + drop], 8).slice(1),
  ...lower(outerRight.slice(inletRight.length))];
export const zigzagRapids: StageDef = {
  ...course, goalY: course.goalY + drop, zoomY: course.zoomY + drop,
  entities: [wall(entryLeft, -0.8), wall(entryRight, 0.8),
    ...course.entities.slice(2).map(e => ({ ...e, position: { x: e.position.x, y: e.position.y + drop } })),
    ...[22, 24].map((x, i): MapEntity => ({ position: { x, y: 10 + i * 5 }, type: 'kinematic',
      shape: { type: 'box', width: 2.6, height: 0.18, rotation: 0, color: '#b69aff' },
      props: { density: 1, restitution: 0.25, angularVelocity: i ? -3.5 : 3.5 } })),
    ...course.art.arrows.map(([x, y, angle], i): MapEntity => {
      // Old decorative arrows were approximate; keep each pad centered on the actual pipe.
      if (i < 7) {
        const index = center.reduce((best, p, j) =>
          Math.hypot(p[0] - x, p[1] - y) < Math.hypot(center[best][0] - x, center[best][1] - y) ? j : best, 0);
        const a = center[Math.max(0, index - 1)], b = center[Math.min(center.length - 1, index + 1)];
        [x, y] = center[index]; angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (i === 2 || i === 3) {
          const side = Math.cos(angle) >= 0 ? 1 : -1;
          const offset = i === 2 ? 2 : 1.3;
          x -= Math.sin(angle) * side * offset; y += Math.cos(angle) * side * offset;
        }
      }
      if (i === 1 || i === 4) {
        x = 25; y = (right[i === 1 ? a : a2][1] + right[i === 1 ? b : b2][1]) / 2 - 0.6;
        angle = i === 1 ? 1.8 : Math.PI / 2;
      }
      if (i === 8) x += 0.6;
      return { position: { x, y: y + drop }, type: 'static',
        shape: { type: 'box', width: 1.4, height: 0.55,
          rotation: angle, color: '#ffc653', boostSpeed: [18, 5, 22, 18, 5, 22, 22, 22, 22][i] },
        props: { density: 1, restitution: 0, angularVelocity: 0 } };
    }),
  ],
  art: { style: 'rapids', contours: [
    [[19.5, 0], ...entryLeft.filter(([, y]) => y >= 0), ...entryRight.filter(([, y]) => y >= 0).slice().reverse(), [26.5, 0]],
    ...course.art.contours.slice(1).map(lower),
  ] },
};
