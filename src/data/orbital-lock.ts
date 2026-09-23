import type { StageDef } from './maps';
import type { MapEntity } from '../types/MapEntity.type';
import { arc, curve, paddle, wall } from './wind-map-shapes';

type Point = [number, number];
export const orbitalRings = [{ outer: 28, inner: 23 }, { outer: 18, inner: 13 }, { outer: 8, inner: 0 }];
const polar = (r: number, degrees: number): Point => [32 + r * Math.cos(degrees * Math.PI / 180), 40 + r * Math.sin(degrees * Math.PI / 180)];
const gap = (r: number, half: number) => [polar(r, -63 - half), polar(r, -63 + half)];
const outerIn = gap(23, 8), middleOut = gap(18, 10), middleIn = gap(13, 12), coreOut = gap(8, 20);
export const orbitalTransfers = [
  [...arc(32, 40, 23, -71, -55), ...arc(32, 40, 18, -53, -73)],
  [...arc(32, 40, 13, -75, -51), ...arc(32, 40, 8, -43, -83)],
];
const left: Point[] = [[30, 46.7], [30, 70], ...curve([30, 70], [30, 75], [37, 74], [39, 76]).slice(1),
  ...curve([39, 76], [41, 77], [40, 79], [38, 79.5]).slice(1), [28, 81.5], [27, 83.5], [27, 94]];
const right: Point[] = [[34, 46.7], [34, 70], ...curve([34, 70], [34, 71], [40, 70.5], [44, 73]).slice(1),
  ...curve([44, 73], [49, 76], [47, 82], [42, 83]).slice(1), [34, 84.5], [34, 94]];
const elevated = (entity: MapEntity): MapEntity => ({ ...entity, shape: { ...entity.shape, collisionLayer: 2 } });
// Ground-level marbles enter over this one-way lip; the open ramp is drawn instead of its back face.
const entryBackstop = wall([[30, 46.7], [34, 46.7]], 0.8);
entryBackstop.shape.hidden = true;

// Offset solid blade: the pivot is at the end of the gate, not its centre.
const gate = (a: Point, b: Point, period: number, phase: number, angle: number, openFor: number, releaseAfter: number): MapEntity[] => {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy), nx = -dy / length * 0.22, ny = dx / length * 0.22;
  const points: Point[] = [[nx, ny], [dx + nx, dy + ny], [dx - nx, dy - ny], [-nx, -ny], [nx, ny]];
  return [{ position: { x: a[0], y: a[1] }, type: 'kinematic',
    shape: { type: 'polyline', solid: true, rotation: 0, points: points.map(([x, y]) => [x || 0, y || 0]), color: '#bc6eff' },
    props: { density: 1, restitution: 0.08, angularVelocity: 0, timedGate: { period, openFor, phase, angle, releaseAfter } } },
  { position: { x: a[0], y: a[1] }, type: 'static', shape: { type: 'circle', radius: 0.48, color: '#d2a7ff', sensor: true },
    props: { density: 1, restitution: 0.05, angularVelocity: 0 } }];
};

export const orbitalLock: StageDef = {
  title: '오비탈 락', width: 64, spawnX: 32, goalY: 90, zoomY: 85, randomizeStart: true,
  art: { style: 'orbital-lock', contours: [] },
  exitBridge: { entry: { x: 32, y: 47.7, width: 3.6, height: 1 }, deck: [...left, ...right.slice().reverse()] },
  windZones: [
    { type: 'vortex', x: 32, y: 40, radius: 28.3, innerRadius: 18.3, speed: 18, radial: -15, gust: 0.08 },
    { type: 'vortex', x: 32, y: 40, radius: 18.3, innerRadius: 8.3, speed: 14, radial: -13, gust: 0.08, phase: 2 },
    { type: 'vortex', x: 32, y: 40, radius: 7.8, speed: 10, radial: 2, gust: 0.03 },
    { type: 'directional', x: 42.2, y: 20.1, width: 2.4, height: 6, velocityX: -7, velocityY: 14, strength: 8, turbulence: 1 },
    { type: 'directional', x: 38.8, y: 28.8, width: 2.5, height: 5, velocityX: -7, velocityY: 14, strength: 8, turbulence: 1 },
    { type: 'directional', x: 32, y: 46, width: 4, height: 4, velocityX: 0, velocityY: 14, strength: 7 },
  ],
  entities: [
    wall([[26, -30], [26, 3], [28, 7], [28, 9], polar(28, -98)], -0.8),
    wall([[38, -30], [38, 3], [36, 7], [36, 9], polar(28, -82)], 0.8),
    wall(arc(32, 40, 28, -82, 262)),
    wall(arc(32, 40, 23, -55, 289), -0.8),
    wall(arc(32, 40, 18, -53, 287)),
    wall(arc(32, 40, 13, -51, 285), -0.8),
    wall([outerIn[0], middleOut[0]], 0.8), wall([outerIn[1], middleOut[1]], -0.8),
    wall([middleIn[0], coreOut[0]], 0.8), wall([middleIn[1], coreOut[1]], -0.8),
    wall(arc(32, 40, 8, -43, 75.52)), wall(arc(32, 40, 8, 104.48, 277)),
    ...gate(outerIn[0], outerIn[1], 9.2, 6.2, 1.4, 6, 24),
    ...gate(middleIn[0], middleIn[1], 6.4, 5.1, 1.4, 4.9, 30),
    ...gate(coreOut[0], coreOut[1], 5.8, 4.9, 1.3, 4.8, 34),
    ...paddle(7, 39, 1.8, -2.4), ...paddle(40.2, 26.8, 1.2, 2),
    ...paddle(32, 40, 2.9, -3.4),
    ...[wall(left, -0.8), wall(right, 0.8), entryBackstop,
      ...gate([34, 54], [30, 54], 5.7, 2, -1.4, 3.2, 38),
      ...gate([30, 63], [34, 63], 4.3, 0.7, 1.4, 2.7, 40),
      ...[[39, 74, 0.25], [39, 82, 2.95]].map(([x, y, rotation]): MapEntity => ({
        position: { x, y }, type: 'static', shape: { type: 'box', width: 1.8, height: 0.85, rotation, boostSpeed: 22, color: '#ffc653' },
        props: { density: 1, restitution: 0, angularVelocity: 0 },
      })),
    ].map(elevated),
  ],
};
