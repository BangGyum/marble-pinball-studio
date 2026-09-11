import type { StageDef } from './maps';
import { curve, wall, inletLeft, inletRight } from './wind-map-shapes';

export const gustFork: StageDef = {
  title: '돌풍 갈림길', width: 41, goalY: 69, zoomY: 64, randomizeStart: true,
  windZones: [
    { type: 'directional', x: 20, y: 20, width: 36, height: 18, velocityX: 20, velocityY: 5,
      strength: 2.4, pulse: 1, period: 8, phase: -1.5, turbulence: 2,
      fan: { x: 5, y: 19, radius: 2.4 } },
    { type: 'directional', x: 20, y: 20, width: 36, height: 18, velocityX: -20, velocityY: 5,
      strength: 2.4, pulse: 1, period: 8, phase: Math.PI - 1.5, turbulence: 2,
      fan: { x: 36, y: 20, radius: 2.4 } },
    { type: 'directional', x: 30, y: 44, width: 14, height: 23, velocityX: 3, velocityY: -21,
      strength: 3, pulse: 1, period: 12, phase: 2, turbulence: 3,
      fan: { x: 27, y: 51, radius: 3.2 } },
    { type: 'directional', x: 35, y: 33, width: 6, height: 23, velocityX: 0, velocityY: -25,
      strength: 3, pulse: 1, period: 12, phase: 2, turbulence: 1.5 },
  ],
  entities: [
    wall([...inletLeft, [7, 10], [3, 13], [3, 25],
      ...curve([3, 25], [3, 27], [10, 28], [10, 34]).slice(1), [10, 53],
      ...curve([10, 53], [10, 57], [19, 58], [19, 63]).slice(1), [16, 63], [19, 67], [19, 71]], -0.8),
    wall([...inletRight, [16.5, 8], [28, 10],
      ...curve([28, 10], [37, 10], [38, 15], [38, 22]).slice(1), [38, 42],
      ...curve([38, 42], [38, 51], [33, 55], [28, 55]).slice(1),
      ...curve([28, 55], [25, 57], [24, 59], [24, 63]).slice(1), [27, 63], [24, 67], [24, 71]], 0.8),
    // This island separates the shortcut from the arched return loop.
    wall([[19, 27], [16, 30], [16, 43],
      ...curve([16, 43], [18, 44], [18, 37], [24, 36]).slice(1),
      ...curve([24, 36], [31, 34], [32, 39], [34, 42]).slice(1),
      ...curve([34, 42], [35, 38], [35, 27], [32, 26]).slice(1),
      [26, 26], [22, 29], [19, 27]], -0.65),
  ],
};
