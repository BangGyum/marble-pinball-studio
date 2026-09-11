import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';

const point = (degrees: number): [number, number] => {
  const a = degrees * Math.PI / 180;
  return [20 + 14 * Math.cos(a), 25 + 14 * Math.sin(a)];
};
const arc = (from: number, to: number): [number, number][] =>
  Array.from({ length: Math.ceil((to - from) / 3) + 1 }, (_, i) =>
    point(from + (to - from) * i / Math.ceil((to - from) / 3)));
const wall = (points: [number, number][], backing = 1.2): MapEntity => ({
  position: { x: 0, y: 0 }, type: 'static',
  shape: { type: 'polyline', points, rotation: 0, color: '#64f4e0', backing },
  props: { density: 1, restitution: 0.08, angularVelocity: 0 },
});
const inletLeft = point(220), inletRight = point(255);
const exitUpper = point(38), exitLower = point(60);

export const neonOrbit: StageDef = {
  title: '네온 오비트', width: 40, goalY: 47, zoomY: 42, randomizeStart: true,
  vortex: { x: 20, y: 25, radius: 14.1, speed: 16, gust: 0.5 },
  entities: [
    wall(arc(60, 220)),
    wall(arc(255, 398)),
    wall([[9.25, -30], [9.25, 7], inletLeft], -1.2),
    wall([[16.5, -30], [16.5, 7], inletRight], 1.2),
    wall([exitLower, [29, 40], [29, 49]], -1.2),
    wall([exitUpper, [33, 40], [33, 49]], 1.2),
    // Intercept the direct inlet-to-exit flow and throw leaders back into the chamber.
    { position: { x: 27, y: 32 }, type: 'kinematic',
      shape: { type: 'box', width: 3.4, height: 0.18, rotation: 0.7, color: '#ff8bc6' },
      props: { density: 1, restitution: 0.35, angularVelocity: -3.8 } },
    { position: { x: 13, y: 22 }, type: 'kinematic',
      shape: { type: 'box', width: 2.8, height: 0.16, rotation: 0.4, color: '#ffd67a' },
      props: { density: 1, restitution: 0.3, angularVelocity: 4.5 } },
    // Satellite paddles break the outer orbit into alternating inward/outward routes.
    ...[
      { x: 23, y: 16, spin: -3.1, color: '#74a8ff' },
      { x: 30, y: 23, spin: 3.7, color: '#64f4e0' },
      { x: 13, y: 32, spin: -4.2, color: '#ff8bc6' },
    ].map(({ x, y, spin, color }): MapEntity => ({
      position: { x, y }, type: 'kinematic',
      shape: { type: 'box', width: 2.4, height: 0.16, rotation: 0.5, color },
      props: { density: 1, restitution: 0.25, angularVelocity: spin },
    })),
    ...[[17, 15], [9.8, 27], [19, 35]].map(([x, y]): MapEntity => ({
      position: { x, y }, type: 'static',
      shape: { type: 'circle', radius: 0.7, color: '#ffd67a' },
      props: { density: 1, restitution: 0.7, angularVelocity: 0 },
    })),
    ...[0, 120, 240].map((degrees): MapEntity => {
      const a = degrees * Math.PI / 180;
      return {
        position: { x: 20, y: 25 }, type: 'kinematic',
        shape: { type: 'polyline', points: [[0, 0], [6 * Math.cos(a), 6 * Math.sin(a)]], rotation: 0, color: '#ba9cff' },
        props: { density: 1, restitution: 0.2, angularVelocity: 2.2 },
      };
    }),
    { position: { x: 20, y: 25 }, type: 'static', shape: { type: 'circle', radius: 0.8, color: '#ffd67a' },
      props: { density: 1, restitution: 0.2, angularVelocity: 0 } },
  ],
};
