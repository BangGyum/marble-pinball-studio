import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
export type Railway = { points: Point[]; halfWidth: number };
const join = (...parts: Point[][]): Point[] => parts.flatMap((p, i) => i ? p.slice(1) : p);
const main = join([[10, -30], [10, 5]],
  curve([10, 5], [10, 12], [14, 12], [18, 13]),
  curve([18, 13], [28, 13.5], [40, 15], [47, 17]),
  curve([47, 17], [59, 19], [59, 28], [47, 31]),
  curve([47, 31], [38, 33], [26, 34], [17, 37]),
  curve([17, 37], [3, 40], [3, 50], [17, 53]),
  curve([17, 53], [26, 55], [39, 57], [47, 59]),
  curve([47, 59], [60, 62], [60, 72], [47, 75]),
  curve([47, 75], [35, 78], [27, 79], [17, 82]),
  curve([17, 82], [4, 86], [4, 95], [17, 98]),
  curve([17, 98], [29, 101], [38, 103], [47, 106]),
  curve([47, 106], [58, 110], [58, 117], [47, 121]),
  curve([47, 121], [40, 124], [31, 125], [32, 133]), [[32, 133], [32, 154]]);
export const expressTracks: Railway[] = [
  { points: main, halfWidth: 3.4 },
  { points: curve([29, 14.4], [40, 19], [42, 25], [40, 32.5]), halfWidth: 2 },
  { points: curve([30, 79], [19, 84], [18, 94], [24, 100]), halfWidth: 2 },
];
function offset(points: Point[], amount: number): Point[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [p[0] + (b[1] - a[1]) / length * amount, p[1] - (b[0] - a[0]) / length * amount];
  });
}
const contours = expressTracks.map(t => [
  ...offset(t.points, -t.halfWidth), ...offset(t.points, t.halfWidth).reverse(),
]);
function inside(p: Point, polygon: Point[]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
// Clip at exact polygon intersections so junctions have neither pinholes nor tiny ledges.
const rails: MapEntity[] = [];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
expressTracks.forEach((track, index) => {
  for (const side of [-1, 1]) {
    const edge = offset(track.points, track.halfWidth * side);
    let section: Point[] = [];
    const finish = () => {
      if (section.length > 1) {
        const e = wall(section, side * 0.4); e.shape.color = index ? '#ffd18a' : '#56f2ee'; rails.push(e);
      }
      section = [];
    };
    for (let i = 1; i < edge.length; i++) {
      const a = edge[i - 1], b = edge[i], delta: Point = [b[0] - a[0], b[1] - a[1]], cuts = [0, 1];
      contours.forEach((polygon, k) => {
        if (k === index) return;
        for (let n = 0; n < polygon.length; n++) {
          const p = polygon[n], q = polygon[(n + 1) % polygon.length];
          const d: Point = [q[0] - p[0], q[1] - p[1]], start: Point = [p[0] - a[0], p[1] - a[1]];
          const divisor = cross(delta, d);
          if (Math.abs(divisor) < 0.000001) continue;
          const t = cross(start, d) / divisor, u = cross(start, delta) / divisor;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
        }
      });
      cuts.sort((a, b) => a - b);
      for (let j = 1; j < cuts.length; j++) {
        if (cuts[j] - cuts[j - 1] < 0.000001) continue;
        const at = (t: number): Point => [a[0] + delta[0] * t, a[1] + delta[1] * t];
        const mid = at((cuts[j] + cuts[j - 1]) / 2);
        if (contours.some((polygon, k) => k !== index && inside(mid, polygon))) finish();
        else { if (!section.length) section.push(at(cuts[j - 1])); section.push(at(cuts[j])); }
      }
    }
    finish();
  }
});
const boost = (x: number, y: number, angle: number): MapEntity => ({
  position: { x, y }, type: 'static',
  shape: { type: 'box', width: 1.3, height: 0.65, rotation: angle, boostSpeed: 27, color: '#ffbd59' },
  props: { density: 1, restitution: 0, angularVelocity: 0 },
});
const bumper = (x: number, y: number): MapEntity => ({
  position: { x, y }, type: 'static', shape: { type: 'circle', radius: 1.05, color: '#ffce7a' },
  props: { density: 1, restitution: 0.8, angularVelocity: 0 },
});
export const expressGates = [
  { x: 36.1, y: 22, length: 5.2, period: 3.8, openFor: 2, phase: 0.6 },
  { x: 18.1, y: 89, length: 4.4, period: 4.4, openFor: 2.4, phase: 1.9 },
];
export const switchbackExpress: StageDef = {
  title: '스위치백 익스프레스', width: 64, spawnX: 10, goalY: 148, zoomY: 143, randomizeStart: true,
  art: { style: 'switchback-express', contours },
  entities: [
    ...rails,
    // Break the departure queue's left-to-right ordering before the first bend.
    { position: { x: 11, y: 8.5 }, type: 'kinematic',
      shape: { type: 'box', width: 2.4, height: 0.3, rotation: 0, color: '#ffd18a', hidden: true },
      props: { density: 1, restitution: 0.2, angularVelocity: 2.1 } },
    ...[[35, 17], [25, 82]].map(([x, y]): MapEntity => ({
      position: { x, y }, type: 'kinematic',
      shape: { type: 'polyline', solid: true, rotation: 0, color: '#ffcf7e',
        points: [[-1.5, -0.8], [1.8, 0], [-1.5, 0.8], [-1.5, -0.8]] },
      props: { density: 1, restitution: 0.15, angularVelocity: y < 20 ? 0.8 : -0.7 },
    })),
    boost(24, 16, 0.13),
    boost(38, 35.6, 2.98), boost(25, 57.1, 0.18), boost(39, 79.3, 2.93),
    boost(24, 101.9, 0.22), boost(39, 127.1, 2.77),
    bumper(54.7, 25), bumper(6.8, 43.3), bumper(57, 64.8), bumper(8.7, 91), bumper(54, 114),
    ...expressGates.map((gate): MapEntity => ({
      position: { x: gate.x, y: gate.y }, type: 'kinematic',
      shape: { type: 'polyline', points: [[0, 0], [gate.length, 0]], rotation: 0, color: '#f7d9a0' },
      props: { density: 1, restitution: 0.05, angularVelocity: 0,
        timedGate: { period: gate.period, openFor: gate.openFor, phase: gate.phase, angle: 1.35, releaseAfter: 50 } },
    })),
  ],
};
