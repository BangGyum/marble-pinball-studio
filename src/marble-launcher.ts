import type { MapEntity } from './types/map-entity';

export const BARREL_LENGTH = 3.4;
export const BARREL_TILT = 0.42;
export const LAUNCH_SPEED = 16;

export function marbleLauncher(x: number, y: number): MapEntity {
  return {
    type: 'kinematic',
    position: { x, y },
    shape: { type: 'circle', radius: 1.15, sensor: true, launcher: true, color: '#ffc675' },
    props: { density: 1, restitution: 0, angularVelocity: 0, oscillation: { amplitude: 0.34, period: 2.7 } },
  };
}
