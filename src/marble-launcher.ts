import type { EntityCircleShape, MapEntity } from './types/map-entity';

export const BARREL_LENGTH = 3.4;
export const BARREL_TILT = 0.42;
export const LAUNCH_SPEED = 16;
export const LAUNCHER_ENTRY_Y = -0.93;
export const LAUNCHER_ENTRY_HALF_WIDTH = 0.64;
export const FUNNEL_ENTRY_Y = -1.19;
export const FUNNEL_ENTRY_HALF_WIDTH = 0.37;
export const LAUNCHER_GATE_Y = -1.36;
export const LAUNCHER_GATE_HALF_WIDTH = 0.66;
export const LAUNCHER_GATE_OPEN_ANGLE = -Math.PI / 2;
export const LAUNCHER_PISTON_REST = 0.36;
export const BARREL_RAILS = {
  end: -1.35,
  inner: 0.34,
  outer: 0.46,
};

export function marbleLauncher(
  x: number,
  y: number,
  launcher: NonNullable<EntityCircleShape['launcher']> = true
): MapEntity {
  return {
    type: 'kinematic',
    position: { x, y },
    shape: { type: 'circle', radius: 1.15, sensor: true, launcher, color: '#ffc675' },
    props: { density: 1, restitution: 0, angularVelocity: 0, oscillation: { amplitude: 0.34, period: 2.7 } },
  };
}

export function launcherFunnel({ x, y }: MapEntity['position']) {
  const rail = (points: [number, number][]): [number, number][] => points.map(([dx, dy]) => [x + dx, y + dy]);
  return {
    left: rail([
      [-1.35, -2.28],
      [-0.81, -1.88],
      [-0.55, -1.49],
      [-0.45, -1.18],
      [-0.45, -0.87],
    ]),
    right: rail([
      [2.5, -2.7],
      [0.82, -1.73],
      [0.48, -1.36],
      [0.42, -1.12],
      [0.42, 0.2],
    ]),
  };
}

export function funnelSide(points: [number, number][], color: string): MapEntity {
  return {
    position: { x: 0, y: 0 },
    type: 'kinematic',
    shape: { type: 'polyline', rotation: 0, points, color },
    props: { density: 1, restitution: 0, angularVelocity: 0, sliding: { amplitude: 0.11, period: 1.05, phase: 0 } },
  };
}

export function launcherGate(x: number, y: number): MapEntity {
  const end = -2 * LAUNCHER_GATE_HALF_WIDTH;
  const edge = 0.065;
  return {
    type: 'kinematic',
    position: { x: x + LAUNCHER_GATE_HALF_WIDTH, y: y + LAUNCHER_GATE_Y },
    shape: {
      type: 'polyline',
      solid: true,
      rotation: 0,
      color: '#df9974',
      points: [
        [end, -edge],
        [0, -edge],
        [0, edge],
        [end, edge],
        [end, -edge],
      ],
    },
    props: { density: 1, restitution: 0, angularVelocity: 0 },
  };
}

export function launcherPiston(x: number, y: number): MapEntity {
  return {
    type: 'kinematic',
    position: {
      x: x + LAUNCHER_PISTON_REST * Math.cos(BARREL_TILT),
      y: y + LAUNCHER_PISTON_REST * Math.sin(BARREL_TILT),
    },
    shape: { type: 'box', width: 0.09, height: 0.22, rotation: BARREL_TILT, sensor: true, color: '#d6a778' },
    props: { density: 1, restitution: 0, angularVelocity: 0 },
  };
}
