import type { MapEntity } from '../types/MapEntity.type';
import type { StageDef } from './maps';

const mint = '#64f4e0', pink = '#ff8bc6', violet = '#ba9cff', gold = '#ffd67a';

const left: [number, number][] = [
  [9.25, -30], [9.25, 7],
  [4, 11], [2, 15], [4, 19], [2, 23], [4, 27],
  [2, 31], [4, 52], [9, 55], [9, 61],
];
const wall = (points: [number, number][], backing: number): MapEntity => ({
  position: { x: 0, y: 0 },
  type: 'static',
  shape: { type: 'polyline', points, rotation: 0, color: mint, backing },
  props: { density: 1, restitution: 0.08, angularVelocity: 0 },
});
const rotor = (x: number, y: number, spin: number, rotation: number, color: string, width = 3.1, restitution = 0.18): MapEntity => ({
  position: { x, y },
  type: 'kinematic',
  shape: { type: 'box', width, height: 0.16, rotation, color },
  props: { density: 1, restitution, angularVelocity: spin },
});

export const neonMixer: StageDef = {
  title: '네온 믹서',
  width: 26,
  randomizeStart: true,
  goalY: 58,
  zoomY: 54,
  entities: [
    wall(left, -2),
    wall(left.map(([x, y]) => [26 - x, y]), 2),
    // Stagger the gaps so marbles cross the paddles instead of dropping straight through.
    // The first three pairs feed an extra mixing chamber before the finish.
    rotor(9, 14, 6.0, -0.65, mint),
    rotor(17, 14, -6.7, 0.45, pink),
    rotor(7.5, 22, 7.0, 0.85, gold),
    rotor(15.5, 22, -6.2, -0.5, violet),
    rotor(10.5, 30, 7.6, -0.8, pink),
    rotor(18.5, 30, -8.0, 0.15, mint),
    // Reverse the central flow so the leaders rejoin the following pack.
    rotor(10, 38, -7.0, 0.4, violet, 3.5, 0),
    rotor(17.5, 38, 7.5, 0.4, gold, 3.5, 0),
    // Offset the final opening with one more paddle across the direct drop.
    rotor(13, 47, -8.0, 0.4, pink, 3.4, 0),
  ],
};
