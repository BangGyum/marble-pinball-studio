import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { arc, curve, wall } from './wind-map-shapes';

type Point = [number, number];
const center: Point = [24, 37], radius = 16;
const rim = (from: number, to: number) => arc(...center, radius, from, to);
const leftRim = rim(-135, -240), rightRim = rim(-45, 60), bottom = rim(80, 100);
const leftExit = leftRim.at(-1)!, rightExit = rightRim.at(-1)!;
const leftLip = bottom.at(-1)!, rightLip = bottom[0];
const leftTop: Point[] = [[20, -30], [20, 6],
  ...curve([20, 6], [20, 9], [13, 8], [13, 12]).slice(1), [13, 17],
  ...curve([13, 17], [13, 20], [15, 21], leftRim[0]).slice(1), ...leftRim.slice(1)];
const rightTop: Point[] = leftTop.map(([x, y]) => [48 - x, y]);
const leftSlide: Point[] = [leftExit,
  ...curve(leftExit, [8, 52], [9, 56], [11, 59]).slice(1),
  ...curve([11, 59], [13, 62], [14, 64], [17, 69]).slice(1),
  ...curve([17, 69], [19, 71], [21.5, 73], [21.5, 77]).slice(1), [21.5, 82]];
const rightSlide: Point[] = [rightExit,
  ...curve(rightExit, [42, 51], [42, 57], [36, 61]).slice(1),
  ...curve([36, 61], [31, 64], [30, 68], [28, 72]).slice(1),
  ...curve([28, 72], [27, 74], [26.5, 75], [26.5, 77]).slice(1), [26.5, 82]];
const leftInner: Point[] = [leftLip,
  ...curve(leftLip, [19, 55], [15.5, 53], [17, 58]).slice(1),
  ...curve([17, 58], [18, 63], [17, 65], [24, 70]).slice(1)];
const rightInner: Point[] = [rightLip,
  ...curve(rightLip, [29, 55], [35, 53], [33, 58]).slice(1),
  ...curve([33, 58], [31, 62], [27, 68], [24, 70]).slice(1)];
const divider = [...bottom, ...leftInner.slice(1), ...rightInner.slice(0, -1).reverse()];

// Each curved blade is three convex fixtures, with the same hinge and angular speed.
// The blades reach the bottom pack while retaining marble clearance at the rim.
const blades: MapEntity[] = [];
const edges: [number, number, number][] = [[1.35, -14, 18], [5, -10, 12], [10, -1, 16], [14.6, 8, 22]];
const polar = (r: number, a: number): Point => [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)];
for (let blade = 0; blade < 5; blade++) {
  for (let segment = 1; segment < edges.length; segment++) {
    const a = edges[segment - 1], b = edges[segment], offset = blade * 72;
    const points = [polar(a[0], a[1] + offset), polar(b[0], b[1] + offset),
      polar(b[0], b[2] + offset), polar(a[0], a[2] + offset)];
    blades.push({ position: { x: center[0], y: center[1] }, type: 'kinematic',
      shape: { type: 'polyline', solid: true, rotation: 0, color: '#f24bcf', points: [...points, points[0]] },
      props: { density: 1, restitution: 0.12, angularVelocity: 1.35,
        spinCycle: { period: 10, runFor: 5.5, phase: 0, idleSpeed: 0.3 } } });
  }
}
const gate = (hinge: Point, tip: Point, angle: number, phase: number): MapEntity => {
  const dx = tip[0] - hinge[0], dy = tip[1] - hinge[1], length = Math.hypot(dx, dy);
  const nx = -dy / length * 0.16, ny = dx / length * 0.16;
  return { position: { x: hinge[0], y: hinge[1] }, type: 'kinematic',
    shape: { type: 'polyline', solid: true, rotation: 0, color: '#ffbf4b',
      points: [[nx, ny], [dx + nx, dy + ny], [dx - nx, dy - ny], [-nx, -ny], [nx, ny]] },
    props: { density: 1, restitution: 0.05, angularVelocity: 0,
      timedGate: { period: 10, openFor: 4.5, phase, angle } } };
};
const boost = (x: number, y: number, angle: number): MapEntity => ({
  position: { x, y }, type: 'static',
  shape: { type: 'box', width: 1.2, height: 0.9, rotation: angle, color: '#ffc653', boostSpeed: 28 },
  props: { density: 1, restitution: 0, angularVelocity: 0 },
});

export const neonJackpot: StageDef = {
  title: '네온 잭팟', width: 48, spawnX: 24, goalY: 80, zoomY: 75, randomizeStart: true,
  art: { style: 'jackpot', contours: [[...leftTop, ...leftSlide.slice(1),
    ...rightSlide.slice().reverse(), ...rightTop.slice(0, -1).reverse()], divider] },
  windZones: [
    { type: 'directional', x: 19, y: 17, width: 6, height: 8, velocityX: -7, velocityY: -28,
      strength: 7, pulse: 1, period: 5.5, dutyCycle: 0.45, phase: 0,
      fan: { x: 19, y: 20.5, radius: 1.35, front: true } },
    { type: 'directional', x: 29, y: 17, width: 6, height: 8, velocityX: 7, velocityY: -28,
      strength: 7, pulse: 1, period: 5.5, dutyCycle: 0.45, phase: 1.8,
      fan: { x: 29, y: 20.5, radius: 1.35, front: true } },
    { type: 'directional', x: 24, y: 37, width: 31, height: 31, velocityX: 2, velocityY: 18,
      strength: 3, pulse: 1, period: 10, dutyCycle: 0.45, phase: Math.PI },
    // Alternate the release direction so the rim cannot shelter the final few marbles.
    { type: 'directional', x: 24, y: 51.5, width: 8, height: 3, velocityX: -13, velocityY: -3,
      strength: 4, pulse: 1, period: 5, dutyCycle: 0.5, phase: 0 },
    { type: 'directional', x: 24, y: 51.5, width: 8, height: 3, velocityX: 13, velocityY: -3,
      strength: 4, pulse: 1, period: 5, dutyCycle: 0.5, phase: Math.PI },
    { type: 'directional', x: 14, y: 60, width: 6, height: 8, velocityX: -1, velocityY: -24,
      strength: 5, pulse: 1, period: 6, dutyCycle: 0.48, phase: 0.7,
      fan: { x: 14, y: 63, radius: 1.2, front: true } },
  ],
  entities: [
    wall(leftTop, -0.8), wall(rightTop, 0.8),
    wall(leftSlide, -0.8), wall(rightSlide, 0.8), wall(divider, 0.8),
    wall(rim(-110, -70), 0.6),
    ...blades,
    { position: { x: 24, y: 37 }, type: 'static', shape: { type: 'circle', radius: 1.5, color: '#ad277f' },
      props: { density: 1, restitution: 0.1, angularVelocity: 0 } },
    // Hinges sit on the divider: open leaves fold into the island, never across a route.
    gate(leftLip, leftExit, -1.45, 5), gate(rightLip, rightExit, 1.45, 4.5),
    boost(37, 57, 1.8), boost(31.5, 64, 2.1), boost(26.7, 70, 1.9),
  ],
};
