import type { StageDef } from './maps';
import type { MapEntity, EntityPhysicalProps } from '../types/MapEntity.type';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
const mirror = (points: Point[]): Point[] => points.map(([x, y]) => [64 - x, y]);
const leftTail: Point[] = [[27.5, 56.5],
  ...curve([27.5, 56.5], [27.5, 60.5], [10.5, 60], [12, 69]).slice(1),
  ...curve([12, 69], [13, 75], [23, 77], [23, 82.5]).slice(1), [21.3, 84.3], [21.3, 90]];
const left: Point[] = [[26, -30], [26, 6.2], [22.5, 6.2], [16.5, 3.8], [14.2, 4.8],
  ...curve([14.2, 4.8], [16, 14], [21, 19.3], [26.2, 23.2]).slice(1),
  [28.5, 26.5], [28.5, 28.2], [14, 38.5],
  ...curve([14, 38.5], [17, 44], [23, 48.5], [26.6, 50.5]).slice(1),
  ...curve([26.6, 50.5], [27.5, 52], [27.5, 54.5], leftTail[0]).slice(1), ...leftTail.slice(1)];
const right: Point[] = [[38, -30], [38, 6.2], [49.5, 10.8],
  ...curve([49.5, 10.8], [46.5, 17], [41, 20.6], [37.2, 23.1]).slice(1),
  ...curve([37.2, 23.1], [51.5, 25.5], [54, 31.5], [51.8, 42.5]).slice(1),
  ...curve([51.8, 42.5], [51, 52], [38.4, 51.5], [36.5, 56.5]).slice(1), ...mirror(leftTail).slice(1)];
// Two islands leave an upper bypass entrance, a second side opening and a real merge below the gates.
const upperIsland: Point[] = [[35.5, 26.5],
  ...curve([35.5, 26.5], [48.5, 28.5], [50.5, 34], [47.3, 45.1]).slice(1), [43.3, 42.5],
  ...curve([43.3, 42.5], [45, 40], [46, 37.7], [46.7, 35.6]).slice(1), [35.5, 28.2], [35.5, 26.5]];
const lowerIsland: Point[] = [[41.5, 44.5], [45.5, 46.5],
  ...curve([45.5, 46.5], [45, 50], [37, 50.8], [35.3, 53.5]).slice(1), [34.7, 54.5],
  ...curve([34.7, 54.5], [34.7, 53.5], [34.7, 52], [35, 50.8]).slice(1),
  ...curve([35, 50.8], [36.5, 49.5], [39.2, 47], [41.5, 44.5]).slice(1)];
const innerTail: Point[] = [[32, 57.2],
  ...curve([32, 57.2], [31.7, 63], [19.5, 63.5], [21, 69]).slice(1),
  ...curve([21, 69], [22, 73], [29.5, 75], [29.5, 80]).slice(1), [29.5, 82]];
const tailIsland: Point[] = [...innerTail, ...mirror(innerTail).reverse()];
const feeder: Point[] = [[22.5, 6.2], [22.5, 9.7], [30, 14]];

// End-hinged, convex leaves are driven by the existing solver-based gate/oscillation components.
const leaf = (hinge: Point, tip: Point, motion: Pick<EntityPhysicalProps, 'timedGate' | 'oscillation'>): MapEntity[] => {
  const dx = tip[0] - hinge[0], dy = tip[1] - hinge[1], length = Math.hypot(dx, dy);
  const nx = -dy / length * 0.32, ny = dx / length * 0.32;
  const points: Point[] = [[nx, ny], [dx + nx, dy + ny], [dx - nx, dy - ny], [-nx, -ny], [nx, ny]];
  return [{ position: { x: hinge[0], y: hinge[1] }, type: 'kinematic',
    shape: { type: 'polyline', solid: true, rotation: 0, points, color: '#b965fa' },
    props: { density: 1, restitution: 0.08, angularVelocity: 0, ...motion } },
  { position: { x: hinge[0], y: hinge[1] }, type: 'static',
    shape: { type: 'circle', radius: 0.62, sensor: true, color: '#c57eff' },
    props: { density: 1, restitution: 0, angularVelocity: 0 } }];
};
const gates = (y: number, leftX: number, rightX: number, period: number, phase: number, releaseAfter: number): MapEntity[] =>
  [-1, 1].flatMap(side => leaf([side < 0 ? leftX : rightX, y], [32, y + 1.3], {
    timedGate: { period, openFor: 3.1, phase, angle: -side * 1.25, releaseAfter },
  }));
const boost = (x: number, y: number, rotation: number): MapEntity => ({ position: { x, y }, type: 'static',
  shape: { type: 'box', width: 1.15, height: 0.7, rotation, boostSpeed: 22, color: '#ffc65c' },
  props: { density: 1, restitution: 0, angularVelocity: 0 } });

export const neonHourglass: StageDef = {
  title: '네온 모래시계', width: 64, spawnX: 32, goalY: 86, zoomY: 81, randomizeStart: true,
  art: { style: 'hourglass', contours: [[...left, ...right.slice().reverse()], upperIsland, lowerIsland, tailIsland] },
  entities: [
    wall(left, -0.8), wall(right, 0.8), wall(upperIsland, -0.6), wall(lowerIsland, -0.6), wall(tailIsland, 0.6),
    wall(feeder, -0.65), wall([[41.5, 7.6], ...mirror(feeder).slice(1)], 0.65),
    ...gates(26.5, 28.5, 35.5, 9.6, 3.6, 25),
    ...leaf([24.5, 39.2], [33.5, 41.5], { oscillation: { amplitude: 0.65, period: 3.4 } }),
    // The left hinge is embedded in the rim, so an open leaf cannot form a marble-sized pocket behind it.
    ...gates(51.2, 26.8, 35, 8.3, 0.8, 35),
    boost(50.3, 36, 1.7), boost(49, 44, 1.9), boost(43, 51, 2.6),
    boost(21, 61.5, 2.65), boost(16, 71, 0.8), boost(26, 79, 0.9),
    boost(43, 61.5, 0.5), boost(48, 71, 2.34), boost(38, 79, 2.24),
  ],
};
