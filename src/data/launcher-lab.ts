import type { StageDef } from '../stage-def';
import { marbleLauncher } from '../marble-launcher';
import { wall } from './wind-map-shapes';

const rail = (points: [number, number][], color: string) => {
  const e = wall(points, 0);
  e.shape.color = color;
  return e;
};
const feed = '#79d5cf',
  brass = '#ffc675',
  lift = '#82a9c4';
const launcher = marbleLauncher(28, 21.5, 'chute');
launcher.props.oscillation!.amplitude = 0.12;

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
    rail(
      [
        [1, 8],
        [12, 10.2],
      ],
      feed
    ),
    rail(
      [
        [19, 9],
        [17, 10.7],
        [13.2, 12.1],
      ],
      feed
    ),
    {
      type: 'kinematic',
      position: { x: 15.1, y: 13.25 },
      shape: { type: 'box', width: 1.65, height: 0.15, rotation: 0.18, color: brass },
      props: { density: 1, restitution: 0.25, angularVelocity: 0, oscillation: { amplitude: 0.58, period: 1.9 } },
    },
    rail(
      [
        [1, 12],
        [14, 15.2],
        [22, 17.1],
        [26.65, 19.22],
        [27.34, 19.72],
        [27.34, 20.5],
      ],
      feed
    ),
    rail(
      [
        [7, 21.7],
        [4.2, 26],
        [4.2, 40],
      ],
      brass
    ),
    rail(
      [
        [30.5, 18.8],
        [28.66, 20.16],
        [28.66, 21.7],
      ],
      brass
    ),
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
