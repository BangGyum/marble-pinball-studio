import type { StageDef } from './maps';
import { arc, curve, wall, propeller, paddle, inletLeft, inletRight } from './wind-map-shapes';

const direction = Math.atan2(18, 10) * 180 / Math.PI;
const spread = Math.acos(Math.hypot(18, 10) / 22) * 180 / Math.PI;
const upper = direction - spread, lower = direction + spread;
const point = (x: number, y: number, degrees: number) => arc(x, y, 11, degrees, degrees + 1)[0];

export const twinVortex: StageDef = {
  title: '쌍둥이 소용돌이', width: 46, goalY: 72, zoomY: 67, randomizeStart: true, spawnX: 29,
  windZones: [
    { type: 'vortex', x: 20, y: 22, radius: 11.2, speed: -17, radial: 7, gust: 0.1,
      pulse: 1, period: 8, phase: 0.5, dutyCycle: 0.65 },
    { type: 'vortex', x: 30, y: 40, radius: 11.2, speed: 17, radial: 7, gust: 0.1,
      pulse: 1, period: 8, phase: 2.5, dutyCycle: 0.65 },
    { type: 'directional', x: 7, y: 42, width: 6, height: 38, velocityX: 0, velocityY: -26,
      strength: 4, pulse: 0.65, period: 7, phase: 1, turbulence: 1,
      fan: { x: 7, y: 58, radius: 2.4, front: true } },
    { type: 'directional', x: 11, y: 26, width: 10, height: 7, velocityX: 19, velocityY: 4,
      strength: 3, pulse: 0.5, period: 7, phase: 1 },
    { type: 'directional', x: 15, y: 47, width: 11, height: 10, velocityX: -16, velocityY: -6,
      strength: 3, pulse: 1, period: 7, phase: 2.5 },
    { type: 'directional', x: 30, y: 44, width: 24, height: 12, velocityX: -28, velocityY: 2,
      strength: 5, pulse: 1, period: 7, phase: 0, dutyCycle: 0.6 },
  ],
  entities: [
    wall([...inletLeft.map(([x, y]): [number, number] => [x + 16.15, y]), point(20, 22, 300)], -0.8),
    wall([...inletRight.map(([x, y]): [number, number] => [x + 16.15, y]), point(20, 22, 330)], 0.8),
    wall(arc(20, 22, 11, lower, 150)),
    wall(arc(20, 22, 11, 175, 300)),
    wall(arc(20, 22, 11, 330, 360 + upper)),
    wall(arc(30, 40, 11, 100, 140)),
    wall(arc(30, 40, 11, 165, upper + 180)),
    wall(arc(30, 40, 11, lower + 180, 425)),
    // Continuous side well connects the lower chamber back into the upper one.
    wall([point(20, 22, 175), ...curve(point(20, 22, 175), [4, 29], [4, 42], [4, 58]).slice(1),
      ...arc(7, 58, 3, 180, 0).slice(1),
      ...curve([10, 58], [10, 52], [15, 52], point(30, 40, 140)).slice(1)], -0.8),
    wall([point(20, 22, 150), ...curve(point(20, 22, 150), [9, 33], [9, 39], [10, 43]).slice(1),
      ...curve([10, 43], [12, 45], [16, 44], point(30, 40, 165)).slice(1)], 0.8),
    wall([point(30, 40, 100), ...curve(point(30, 40, 100), [29, 55], [18, 56], [21, 62]).slice(1),
      ...curve([21, 62], [23, 63], [25, 65], [25, 67]).slice(1), [22, 67], [25, 70], [25, 74]], -0.8),
    wall([point(30, 40, 65), ...curve(point(30, 40, 65), [36, 57], [26, 60], [27, 62]).slice(1),
      ...curve([27, 62], [29, 63], [30, 65], [30, 67]).slice(1), [33, 67], [30, 70], [30, 74]], 0.8),
    ...[145, 265].map((a) => wall(arc(20, 22, 7, a, a + 65), 0)),
    ...[0, 130, 250].map((a) => wall(arc(30, 40, 7, a, a + 45), 0)),
    ...propeller(20, 22, 4.8, -3.1),
    ...propeller(30, 40, 4.8, 3.4),
    ...paddle(25, 31, 2.1, -3.7),
  ],
};
