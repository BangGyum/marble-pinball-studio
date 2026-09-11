import type { MapEntity } from '../types/MapEntity.type';

type Point = [number, number];

export const arc = (x: number, y: number, r: number, from: number, to: number): Point[] => {
  const steps = Math.ceil(Math.abs(to - from) / 5);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (from + (to - from) * i / steps) * Math.PI / 180;
    return [x + r * Math.cos(a), y + r * Math.sin(a)];
  });
};
export const curve = (a: Point, b: Point, c: Point, d: Point): Point[] =>
  Array.from({ length: 17 }, (_, i) => {
    const t = i / 16, u = 1 - t;
    return [u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
      u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]];
  });
export const wall = (points: Point[], backing = 0.8): MapEntity => ({
  position: { x: 0, y: 0 }, type: 'static',
  shape: { type: 'polyline', points, rotation: 0, color: '#64f4e0', backing },
  props: { density: 1, restitution: 0.05, angularVelocity: 0 },
});
export const inletLeft: Point[] = [[5, -30], [5, -1], ...curve([5, -1], [5, 3], [7, 5], [9.25, 7]).slice(1)];
export const inletRight: Point[] = [[20.5, -30], [20.5, -1], ...curve([20.5, -1], [20.5, 3], [19, 5], [16.5, 7]).slice(1)];
export const propeller = (x: number, y: number, radius: number, spin: number): MapEntity[] => [
  ...[0, 120, 240].map((degrees): MapEntity => {
    const a = degrees * Math.PI / 180;
    return {
      position: { x, y }, type: 'kinematic',
      shape: { type: 'polyline', points: [[0, 0], [radius * Math.cos(a), radius * Math.sin(a)]],
        rotation: 0, color: '#ba9cff' },
      props: { density: 1, restitution: 0.15, angularVelocity: spin },
    };
  }),
  { position: { x, y }, type: 'static', shape: { type: 'circle', radius: 0.65, color: '#d9caff' },
    props: { density: 1, restitution: 0.1, angularVelocity: 0 } },
];
