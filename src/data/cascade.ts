import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';

const aqua = '#71e8ff', coral = '#ffad83', gold = '#ffe49a';
const wall = (points: [number, number][], color = aqua): MapEntity => ({
  position: { x: 0, y: 0 }, type: 'static',
  shape: { type: 'polyline', points, rotation: 0, color },
  props: { density: 1, restitution: 0.12, angularVelocity: 0 },
});
const pin = (x: number, y: number, radius = 0.42, restitution = 0.75): MapEntity => ({
  position: { x, y }, type: 'static',
  shape: { type: 'circle', radius, color: gold },
  props: { density: 1, restitution, angularVelocity: 0 },
});
// Original layout: a short peg field, alternating waterfall shelves and an open finish.
export const cascade: StageDef = {
  title: '캐스케이드', width: 26, randomizeStart: true, goalY: 113, zoomY: 109,
  entities: [
    wall([[9.25, -30], [9.25, 6], [1, 15], [1, 96], [4, 101], [10.8, 108], [10.8, 115]]),
    wall([[16.5, -30], [16.5, 6], [25, 15], [25, 96], [22, 101], [15.2, 108], [15.2, 115]], coral),
    ...[10.7, 15.1].map((x, i): MapEntity => ({
      position: { x, y: 11 }, type: 'kinematic',
      shape: { type: 'box', width: 2.6, height: 0.16, rotation: i * 0.7, color: aqua },
      props: { density: 1, restitution: 0.35, angularVelocity: i ? -2 : 2 },
    })),
    ...Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 6 }, (_, col) => pin(3.5 + col * 3.5 + (row % 2) * 1.1, 18 + row * 3))
    ).flat(),
    ...Array.from({ length: 4 }, (_, i) => {
      const y = 34 + i * 13;
      // Cubic curve: steep entry gradually flattens into a launch lip.
      const points: [number, number][] = Array.from({ length: 33 }, (_, step) => {
        const t = step / 32, u = 1 - t;
        return [u * u * u + 3 * u * u * t + 3 * u * t * t * 8 + t * t * t * 19,
          y + 3 * u * u * t * 8 + 3 * u * t * t * 11 + t * t * t * 12];
      });
      return wall(i % 2 ? points.map(([x, py]) => [26 - x, py]) : points, i % 2 ? coral : aqua);
    }),
    pin(11.3, 102, 0.9, 1.3), pin(14.8, 105, 0.9, 1.3), pin(12.8, 109, 0.85, 1.3),
  ],
};
