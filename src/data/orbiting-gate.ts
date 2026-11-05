import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { arc, wall } from './wind-map-shapes';

export const orbitingBowl = { x: 32, y: 40, radius: 27, ring: 10, halfGap: 15, spin: -0.32, guide: 0.2 };
const { x, y, radius, ring, halfGap, spin } = orbitingBowl;
const rim = arc(x, y, radius, -81, 261);
const innerRing = arc(0, 0, ring, -60 + halfGap, 300 - halfGap);
const outerRing = arc(0, 0, ring + 0.65, 300 - halfGap, -60 + halfGap);
// A short lip brakes glancing passes; it rotates with the mouth without adding suction.
const lipAngle = ((-60 + halfGap) * Math.PI) / 180;
outerRing[outerRing.length - 1] = [
  (ring + 0.65 + orbitingBowl.guide) * Math.cos(lipAngle),
  (ring + 0.65 + orbitingBowl.guide) * Math.sin(lipAngle),
];
const rotatingRing: MapEntity = {
  position: { x, y },
  type: 'kinematic',
  shape: { type: 'polyline', rotation: 0, points: [...innerRing, ...outerRing, innerRing[0]], color: '#a9bde8' },
  props: { density: 1, restitution: 0.12, angularVelocity: spin },
};

export const orbitingGate: StageDef = {
  title: '떠도는 입구',
  width: 64,
  spawnX: 32,
  goalY: 72,
  zoomY: 67,
  randomizeStart: true,
  goalArea: { x, y, radius: 3.2 },
  art: { style: 'orbiting-gate', contours: [rim] },
  windZones: [
    { type: 'vortex', x, y, radius: 27.4, innerRadius: 10.2, speed: 18, radial: -18, gust: 0.15 },
    { type: 'vortex', x, y, radius: 10.2, speed: 4, radial: -13, gust: 0.025 },
    { type: 'directional', x: 32, y: 12, width: 8, height: 12, velocityX: 13, velocityY: 8, strength: 4 },
  ],
  entities: [
    wall([[26, -32], [26, 5], [28, 10], rim.at(-1)!], -0.8),
    wall([[38, -32], [38, 5], [36, 10], rim[0]], 0.8),
    wall(rim, 0.8),
    rotatingRing,
    ...[
      [47.5, 29, 0.85],
      [17, 48, 0.75],
    ].map(
      ([px, py, r]): MapEntity => ({
        position: { x: px, y: py },
        type: 'static',
        shape: { type: 'circle', radius: r, color: '#bda9e3' },
        props: { density: 1, restitution: 0.65, angularVelocity: 0 },
      })
    ),
  ],
};
