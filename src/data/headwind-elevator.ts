import type { StageDef } from './maps';
import { arc, curve, wall, inletLeft, inletRight } from './wind-map-shapes';

export const headwindElevator: StageDef = {
  title: '역풍 엘리베이터', width: 42, goalY: 79, zoomY: 74, randomizeStart: true,
  windZones: [
    { type: 'directional', x: 9, y: 40, width: 11, height: 30, velocityX: 4, velocityY: -18,
      strength: 3, pulse: 0.85, period: 8, phase: -1.6, turbulence: 3,
      fan: { x: 9, y: 51, radius: 3.6 } },
    { type: 'directional', x: 15, y: 22.5, width: 12, height: 7, velocityX: 10, velocityY: -1,
      strength: 2.8, pulse: 0.4, period: 8, phase: -0.4, turbulence: 2 },
    { type: 'directional', x: 26, y: 60, width: 8, height: 12, velocityX: 3, velocityY: -15,
      strength: 3, pulse: 0.9, period: 8, phase: 1.4, turbulence: 2.5,
      fan: { x: 26, y: 62, radius: 2.7 } },
    { type: 'directional', x: 31, y: 53.5, width: 10, height: 6, velocityX: 7, velocityY: -1,
      strength: 2.8, pulse: 0.45, period: 8, phase: 2, turbulence: 1.5 },
  ],
  entities: [
    // Trace both lift wells and the inside of each curved chute with one boundary.
    wall([...inletLeft, [3.5, 12], [3.5, 22], [5, 24], [3.5, 29],
      [3.5, 36], [5, 39], [3.5, 43], [3.5, 51], ...arc(9, 51, 5.5, 180, 0).slice(1),
      [14.5, 44], [16, 42], [14.5, 40], [14.5, 33], [16, 31], [14.5, 29], [14.5, 26],
      ...curve([14.5, 26], [23, 26], [35, 27], [33, 34]).slice(1),
      ...curve([33, 34], [31, 39], [22, 40], [22, 49]).slice(1), [22, 62],
      ...arc(26, 62, 4, 180, 0).slice(1), [30, 56],
      ...curve([30, 56], [35, 55], [35, 61], [34, 64]).slice(1),
      ...curve([34, 64], [33, 68], [20, 68], [20, 73]).slice(1), [17, 73], [20, 77], [20, 81]], -0.8),
    wall([...inletRight, [16.5, 8], [14.5, 13], [14.5, 20],
      ...curve([14.5, 20], [29, 20], [40, 24], [39, 34]).slice(1),
      ...curve([39, 34], [39, 43], [30, 44], [30, 49]).slice(1), [30, 51],
      ...curve([30, 51], [39, 50], [40, 56], [39, 64]).slice(1),
      ...curve([39, 64], [39, 72], [25, 71], [25, 73]).slice(1), [28, 73], [25, 77], [25, 81]], 0.8),
  ],
};
