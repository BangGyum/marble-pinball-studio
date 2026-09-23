import type { StageDef, WindZone } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { wall } from './wind-map-shapes';

type Point = [number, number];
const left: Point[] = [[20, -30], [20, 7], [2, 13], [2, 74], [7, 87], [12, 92], [21, 99], [21, 106]];
const right: Point[] = left.map(([x, y]) => [48 - x, y]);
const shelves: MapEntity[] = [], winds: WindZone[] = [];
for (let row = 0; row < 3; row++) for (const side of [1, -1]) {
  const y = 20 + row * 18 + (side === -1 ? 9 : 0);
  const mirror = (x: number) => side === 1 ? x : 48 - x;
  shelves.push(wall([[mirror(2), y], [mirror(7), y + 2], [mirror(22), y + 7]], -side * 0.65));
  // The flipper has a real end hinge; its nose lifts the pack off the sloping shelf.
  shelves.push({ position: { x: mirror(7), y: y + 0.9 }, type: 'kinematic',
    shape: { type: 'polyline', solid: true, rotation: 0, color: '#ba68ff',
      points: [[0, -0.3], [side * 5, 0.7], [side * 5, 1.3], [0, 0.3], [0, -0.3]] },
    props: { density: 1, restitution: 0.3, angularVelocity: 0,
      oscillation: { amplitude: 0.6, period: 2.2 + row * 0.45 + (side === 1 ? 0 : 0.3) } } });
  shelves.push({ position: { x: mirror(7), y: y + 0.9 }, type: 'static',
    shape: { type: 'circle', radius: 0.48, color: '#d29cff' },
    props: { density: 1, restitution: 0.1, angularVelocity: 0 } });
  shelves.push({ position: { x: mirror(15), y: y + 3.9 }, type: 'static',
    shape: { type: 'box', width: 1.6, height: 0.7, rotation: side === 1 ? -0.42 : Math.PI + 0.42,
      color: '#ffc653', boostSpeed: 21 },
    props: { density: 1, restitution: 0, angularVelocity: 0 } });
  winds.push({ type: 'directional', x: mirror(12), y: y + 3, width: 20, height: 8,
    velocityX: side * 17, velocityY: -2, strength: 1.7, turbulence: 2,
    period: 3.5 + row * 0.4, pulse: 0.7, phase: side === 1 ? 0 : Math.PI });
}

export const pinballCascade: StageDef = {
  title: '네온 핀볼 폭포', width: 48, spawnX: 24, goalY: 104, zoomY: 99, randomizeStart: true,
  art: { style: 'pinball-cascade', contours: [[...left, ...right.slice().reverse()]] },
  windZones: winds,
  entities: [wall(left, -1), wall(right, 1), ...shelves,
    // Split the initial pack onto both terraces instead of dropping down the empty centre.
    wall([[19, 16], [24, 12], [29, 16]], 0.6),
    ...[[14, 78], [27, 81], [20, 84], [24, 87], [16, 89]].map(([x, y], i): MapEntity => ({
      position: { x, y }, type: 'kinematic',
      shape: { type: 'box', width: 3.3, height: 0.28, rotation: i % 2 ? -0.12 : 0.12, color: '#b579ff' },
      props: { density: 1, restitution: 0.15, angularVelocity: 0,
        sliding: { amplitude: 2.2, period: 3.3 + i * 0.35, phase: i * 1.2 } },
    })),
    { position: { x: 28, y: 94 }, type: 'kinematic',
      shape: { type: 'polyline', solid: true, rotation: 0, color: '#ba68ff',
        points: [[0, -0.3], [-8, -1.3], [-8, -0.7], [0, 0.3], [0, -0.3]] },
      props: { density: 1, restitution: 0.3, angularVelocity: 0, oscillation: { amplitude: 0.45, period: 2.5 } } },
    { position: { x: 28, y: 94 }, type: 'static',
      shape: { type: 'circle', radius: 0.48, color: '#d29cff' },
      props: { density: 1, restitution: 0.1, angularVelocity: 0 } },
    { position: { x: 31, y: 93.6 }, type: 'static',
      shape: { type: 'box', width: 0.9, height: 0.45, rotation: -2.65, boostSpeed: 17, color: '#ffc653' },
      props: { density: 1, restitution: 0, angularVelocity: 0 } },
  ],
};
