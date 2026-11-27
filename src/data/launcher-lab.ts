import { launcherFunnel, marbleLauncher } from '../marble-launcher';
import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, wall } from './wind-map-shapes';

const rail = (points: [number, number][], color: string) => {
  const e = wall(points, 0);
  e.shape.color = color;
  return e;
};
const feed = '#79d5cf',
  brass = '#ffc675',
  lift = '#82a9c4';
const launcher = marbleLauncher(28, 21.5, 'funnel');
launcher.props.oscillation!.amplitude = 0.114;
launcher.shape.launcherCycleScale = 0.5;
const funnel = launcherFunnel(launcher.position);
// Let the shoulder sweep the queue while the bottom stays centered on the intake.
const guidePivot = { x: 28.52, y: 20.43 };
const guide: MapEntity = {
  type: 'kinematic',
  position: guidePivot,
  shape: {
    type: 'polyline',
    rotation: 0,
    points: [[30.42, 18.5], ...funnel.right.slice(1)].map(([x, y]): [number, number] => [
      x - guidePivot.x,
      y - guidePivot.y,
    ]),
    color: brass,
  },
  props: { density: 1, restitution: 0, angularVelocity: 0, oscillation: { amplitude: 0.48, period: 1.1 } },
};

export const launcherLab: StageDef = {
  title: '구슬 발사 시험장',
  width: 34,
  spawnX: 10,
  goalY: 40,
  zoomY: 35,
  randomizeStart: true,
  goalArea: { x: 3.4, y: 37.7, radius: 1.35 },
  entities: [
    rail(
      [
        [1, -20],
        [33.4, -20],
        [33.4, 16.5],
      ],
      lift
    ),
    rail(
      [
        [1, -20],
        [1, 19],
        [2.6, 26],
        [2.6, 40],
      ],
      brass
    ),
    rail(curve([1, 6.8], [3.8, 7.6], [5.75, 9.4], [7.75, 10.2]), feed),
    rail([[19, -20], [19, 6.8], ...curve([19, 6.8], [16.2, 7.6], [14.25, 9.4], [12.25, 10.2]).slice(1)], feed),
    rail([[1, 12], [14, 15.2], [22, 17.1], ...funnel.left], feed),
    rail(
      [
        [7, 21.7],
        [4.2, 26],
        [4.2, 40],
      ],
      brass
    ),
    guide,
    launcher,
    rail(
      [
        [4.2, 27],
        [14, 30.2],
        [26, 33.6],
        [32.8, 35.2],
        [33.4, 34.9],
        [33.4, 16.5],
        [29, 13.4],
      ],
      lift
    ),
    rail(
      [
        [30.5, 18.8],
        [30.5, 32.5],
      ],
      lift
    ),
  ],
  windZones: [
    { type: 'directional', x: 32, y: 25.4, width: 2.9, height: 20.4, velocityX: 0, velocityY: -9, strength: 6 },
    // Cover both sides of the sloped lip so a marble cannot settle at the edge of the return wind.
    { type: 'directional', x: 30.6, y: 15.05, width: 5.5, height: 4.4, velocityX: -6, velocityY: 0, strength: 6 },
  ],
};
