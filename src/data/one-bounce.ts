import { launcherFunnel, marbleLauncher } from '../marble-launcher';
import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, wall } from './wind-map-shapes';

type Point = [number, number];
const feed = '#8ab6b2',
  returnRail = '#708897',
  cup = '#ffd184';
const rail = (points: Point[], color: string): MapEntity => {
  const entity = wall(points, 0);
  entity.shape.color = color;
  return entity;
};
const launcher = marbleLauncher(28, 21.5, 'funnel');
// Keep high shots below the feed ramp and vary the angle after a return lap.
launcher.props.oscillation = { amplitude: 0.265, period: 3.17 };
launcher.shape.launcherCycleScale = 0.62;
const funnel = launcherFunnel(launcher.position);
const guidePivot = { x: 28.52, y: 20.43 };
// Swing the upper guide away from the pack while keeping the loading throat steady.
const funnelGuide: MapEntity = {
  type: 'kinematic',
  position: guidePivot,
  shape: {
    type: 'polyline',
    rotation: 0,
    points: [[30.42, 18.5], ...funnel.right.slice(1)].map(([x, y]): Point => [x - guidePivot.x, y - guidePivot.y]),
    color: returnRail,
  },
  props: { density: 1, restitution: 0, angularVelocity: 0, oscillation: { amplitude: 0.48, period: 1.1 } },
};

const enclosure = rail(
  [
    [0.8, 17],
    [0.8, -21],
    [33.4, -21],
    [33.4, 16.7],
  ],
  returnRail
);

export const oneBounce: StageDef = {
  title: '원바운드 샷',
  width: 34,
  spawnX: 7.2,
  goalY: 40,
  zoomY: 35,
  randomizeStart: true,
  goalArea: { x: 3.35, y: 37.8, radius: 1.08 },
  art: { style: 'one-bounce', contours: [] },
  entities: [
    enclosure,
    rail([...curve([0.8, 17], [0.9, 18.83], [2.65, 19.17], [2.65, 22]), [2.65, 40]], cup),
    rail([...curve([7.2, 19.7], [6.86, 20.39], [4.5, 20.7], [4.05, 22]), [4.05, 40]], cup),
    // The two lips meet the starting grid at the same height.
    rail(curve([0.8, 3.1], [2.15, 4.65], [3.5, 6.2], [5.9, 7.05]), feed),
    rail([[13.6, -21], [13.6, 3.1], ...curve([13.6, 3.1], [12.25, 4.65], [10.9, 6.2], [8.5, 7.05]).slice(1)], feed),
    rail(
      [
        ...curve([0.8, 8.2], [3.1, 9.1], [6.8, 10.2], [8.5, 10.66]),
        ...curve([8.5, 10.66], [11, 11.3], [13.8, 12.55], [17, 13.4]).slice(1),
        // A continuous descent into the funnel avoids a pocket between overlapping rails.
        ...curve([17, 13.4], [19.25, 13.85], [22.75, 15.5], [24.7, 17.1]).slice(1),
        ...funnel.left,
      ],
      feed
    ),
    rail([...curve([24.15, 14.45], [24.85, 14.58], [25.48, 14.84], [26.15, 15.6]), [27.45, 17.9]], feed),
    {
      type: 'kinematic',
      position: { x: 16.6, y: 11.62 },
      shape: { type: 'box', width: 0.22, height: 1.15, rotation: 0, color: '#ba9cff' },
      props: { density: 1, restitution: 0.32, angularVelocity: 0, oscillation: { amplitude: 0.85, period: 2.5 } },
    },
    funnelGuide,
    launcher,
    rail(
      [
        [4.05, 30],
        [14, 32.4],
        [28, 35.3],
        [32.85, 36.15],
        [33.4, 35.6],
        [33.4, 16.7],
        [29.1, 13.65],
      ],
      returnRail
    ),
    rail(
      [
        [30.5, 18.8],
        [30.5, 33.2],
      ],
      returnRail
    ),
  ],
  windZones: [
    // Carry loose marbles down the shallow rail before turning them into the throat.
    { type: 'directional', x: 8, y: 9.7, width: 5.6, height: 2.2, velocityX: 6, velocityY: 2.4, strength: 2.4 },
    { type: 'directional', x: 13, y: 11.55, width: 5, height: 2.1, velocityX: 6.4, velocityY: 2.75, strength: 2.6 },
    {
      type: 'directional',
      x: 28.65,
      y: 18.55,
      width: 3.7,
      height: 2.4,
      velocityX: -2.15,
      velocityY: 4.15,
      strength: 5,
    },
    { type: 'directional', x: 32, y: 25.85, width: 2.9, height: 21.8, velocityX: 0, velocityY: -10, strength: 6 },
    { type: 'directional', x: 30.95, y: 15.6, width: 5.4, height: 4.8, velocityX: -7, velocityY: 0, strength: 6 },
  ],
};
