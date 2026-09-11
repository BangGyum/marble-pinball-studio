import type { StageDef } from './maps';
import { arc, curve, wall, propeller, inletLeft, inletRight } from './wind-map-shapes';

// The circles share their intersection as an open throat, without crossing walls.
const direction = Math.atan2(18, 10) * 180 / Math.PI;
const spread = Math.acos(Math.hypot(18, 10) / 22) * 180 / Math.PI;
const upper = direction - spread, lower = direction + spread;
const point = (x: number, y: number, degrees: number) => arc(x, y, 11, degrees, degrees + 1)[0];

export const twinVortex: StageDef = {
  title: '쌍둥이 소용돌이', width: 39, goalY: 68, zoomY: 63, randomizeStart: true,
  windZones: [
    { type: 'vortex', x: 14, y: 22, radius: 11.2, speed: 14, radial: 2, gust: 0.18,
      pulse: 0.95, period: 8, phase: 0.5 },
    { type: 'vortex', x: 24, y: 40, radius: 11.2, speed: -14, radial: 2, gust: 0.18,
      pulse: 0.95, period: 7, phase: 2.5 },
  ],
  entities: [
    wall([...inletLeft, point(14, 22, 245)], -0.8),
    wall([...inletRight, point(14, 22, 282)], 0.8),
    wall(arc(14, 22, 11, lower, 245)),
    wall(arc(14, 22, 11, 282, 360 + upper)),
    wall(arc(24, 40, 11, 100, upper + 180)),
    wall(arc(24, 40, 11, lower + 180, 425)),
    wall([point(24, 40, 100), ...curve(point(24, 40, 100), [23, 55], [12, 54], [15, 60]).slice(1),
      ...curve([15, 60], [17, 61], [19, 62], [19, 63]).slice(1), [16, 63], [19, 66], [19, 70]], -0.8),
    wall([point(24, 40, 65), ...curve(point(24, 40, 65), [30, 57], [20, 58], [21, 60]).slice(1),
      ...curve([21, 60], [23, 61], [24, 62], [24, 63]).slice(1), [27, 63], [24, 66], [24, 70]], 0.8),
    ...propeller(14, 22, 3.8, 2.3),
    ...propeller(24, 40, 3.8, -2.6),
    { position: { x: 0, y: 0 }, type: 'static',
      shape: { type: 'polyline', rotation: 0, points: [[17.5, 27], [20, 25]], color: '#ba9cff' },
      props: { density: 1, restitution: 0.5, angularVelocity: 0 } },
    { position: { x: 0, y: 0 }, type: 'static',
      shape: { type: 'polyline', rotation: 0, points: [[17, 46], [20, 48]], color: '#ba9cff' },
      props: { density: 1, restitution: 0.5, angularVelocity: 0 } },
  ],
};
