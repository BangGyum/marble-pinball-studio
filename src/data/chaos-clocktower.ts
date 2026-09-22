import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { arc, wall } from './wind-map-shapes';

type Point = [number, number];
// The guide rims ARE the outer walls: there is no hidden slot behind a wheel to trap a pack.
const left: Point[] = [[20, -30], [20, 7], ...arc(16, 26, 12.5, 230, 100),
  [20, 41], [22, 44], [20, 49], [20, 56], [13, 62], [7, 66],
  ...arc(17, 77, 10.4, 235, 100), [20, 93], [20, 104]];
const right: Point[] = [[28, -30], [28, 7], [28, 10], [29, 14], [30, 22], [32, 31], [39, 38],
  ...arc(31, 52, 11.2, -50, 80), [27, 65], [26, 69], [29, 75], [29, 83], [28, 93], [28, 104]];
// Layout, radius and blade count mirror the six / four / three-wheel concept.
export const clockWheels = [
  { x: 16, y: 26, radius: 10.7, blades: 6, speed: 2.25, period: 7, phase: 0, bend: 0 },
  { x: 31, y: 52, radius: 9.3, blades: 4, speed: -2.65, period: 8.2, phase: 2, bend: 24 },
  { x: 17, y: 77, radius: 8.5, blades: 3, speed: 2.9, period: 6.3, phase: 1, bend: 32 },
];
const rotors: MapEntity[] = [];
for (const wheel of clockWheels) {
  const polar = (r: number, a: number): Point => [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)];
  for (let blade = 0; blade < wheel.blades; blade++) {
    const radii = wheel.bend ? [1.2, 3.7, 6.2, wheel.radius] : [1.2, wheel.radius];
    for (let i = 1; i < radii.length; i++) {
      const a = radii[i - 1], b = radii[i], base = blade * 360 / wheel.blades;
      const angleA = base + wheel.bend * (a / wheel.radius) ** 2;
      const angleB = base + wheel.bend * (b / wheel.radius) ** 2;
      const points = [polar(a, angleA - 60 / a), polar(b, angleB - 60 / b),
        polar(b, angleB + 60 / b), polar(a, angleA + 60 / a)];
      rotors.push({ position: { x: wheel.x, y: wheel.y }, type: 'kinematic',
        shape: { type: 'polyline', solid: true, rotation: 0, color: '#b46aff', points: [...points, points[0]] },
        props: { density: 1, restitution: 0.18, angularVelocity: wheel.speed,
          spinCycle: { period: wheel.period, runFor: wheel.period - 2, phase: wheel.phase, idleSpeed: wheel.speed * 0.18 } } });
    }
  }
  rotors.push({ position: { x: wheel.x, y: wheel.y }, type: 'static',
    shape: { type: 'circle', radius: 1.35, color: '#8044cf' },
    props: { density: 1, restitution: 0.1, angularVelocity: 0 } });
}
const gates: MapEntity[] = [1, -1].map(side => ({
  position: { x: side === 1 ? 20 : 28, y: 95 }, type: 'kinematic',
  shape: { type: 'polyline', solid: true, rotation: 0, color: '#c575ff',
    points: [[0, -0.22], [side * 4, -0.22], [side * 4, 0.22], [0, 0.22], [0, -0.22]] },
  props: { density: 1, restitution: 0.05, angularVelocity: 0,
    timedGate: { period: 6.4, openFor: 2.8, phase: 0, angle: side * 1.4 } },
}));

export const chaosClocktower: StageDef = {
  title: '카오스 시계탑', width: 48, spawnX: 24, goalY: 102, zoomY: 97, randomizeStart: true,
  art: { style: 'clocktower', contours: [[...left, ...right.slice().reverse()]] },
  // Keep the inlet clear so both starting rows meet the first wheel instead of a right-side detour.
  entities: [wall(left, -1), wall(right, 1),
    ...rotors, ...gates,
    ...[[23, 18, 1.9], [30, 38, 2.4], [20, 62, 0.65], [25.5, 88, 2.2]].map(([x, y, rotation]): MapEntity => ({
      position: { x, y }, type: 'static',
      shape: { type: 'box', width: 1.4, height: 0.8, rotation, boostSpeed: 21, color: '#ffc653' },
      props: { density: 1, restitution: 0, angularVelocity: 0 },
    })),
  ],
};
