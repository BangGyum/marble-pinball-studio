import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, wall, paddle } from './wind-map-shapes';

type Point = [number, number];
const entities: MapEntity[] = [];
const rail = (points: Point[], color: string, backing = 0.6) => {
  const entity = wall(points, backing);
  entity.shape.color = color;
  entity.shape.hidden = true;
  entities.push(entity);
};
const cyan = '#67e8f9',
  gold = '#ffd078';
rail([[3, -28], [3, 91], ...curve([3, 91], [3, 99], [16, 99], [17, 104]).slice(1), [17, 113]], cyan, 1);
rail([[41, -28], [41, 91], ...curve([41, 91], [41, 99], [28, 99], [27, 104]).slice(1), [27, 113]], gold, -1);
rail(
  [
    [3, -28],
    [41, -28],
  ],
  cyan
);
for (let row = 0; row < 4; row++) {
  const right = row % 2 === 0,
    y = 12 + row * 20,
    color = right ? cyan : gold;
  const at = (t: number): Point => [right ? 3 + t : 41 - t, y + t * 0.28];
  const gap = right ? 18 : 15;
  rail([at(0), at(gap)], color, right ? 0.7 : -0.7);
  rail([at(gap + 3.2), at(31)], color, right ? 0.7 : -0.7);
  const p = at(28),
    angle = right ? Math.atan(0.28) : Math.PI - Math.atan(0.28);
  entities.push({
    position: { x: p[0], y: p[1] - 0.45 },
    type: 'static',
    shape: { type: 'box', width: 1.15, height: 0.65, rotation: angle, boostSpeed: 17, color },
    props: { density: 1, restitution: 0, angularVelocity: 0 },
  });
  if (row < 3) {
    const p = at(gap + 1.6),
      shared = row === 0;
    entities.push({
      position: { x: p[0], y: p[1] + 3 },
      type: 'kinematic',
      shape: {
        type: 'box',
        width: 1.4,
        height: 0.35,
        rotation: right ? 0.35 : -0.35,
        color,
        spring: {
          distance: 1.2,
          direction: -Math.PI / 2,
          cooldown: { scope: shared ? 'shared' : 'personal', seconds: shared ? 5 : 10 },
        },
      },
      props: { density: 1, restitution: 0.35, angularVelocity: 0 },
    });
  }
}
entities.push(...paddle(36, 28, 2.1, -1.1), ...paddle(8, 48, 2.1, 1.1), ...paddle(36, 68, 2.1, -1.1));
for (const x of [16, 28])
  entities.push({
    position: { x, y: 94 },
    type: 'static',
    shape: { type: 'circle', radius: 1.5, color: x < 22 ? cyan : gold },
    props: { density: 1, restitution: 0.85, angularVelocity: 0 },
  });
export const shortcutCascade: StageDef = {
  title: '샛길 캐스케이드',
  width: 44,
  spawnX: 22,
  goalY: 109,
  zoomY: 104,
  randomizeStart: true,
  art: { style: 'shortcut-cascade', contours: [] },
  entities,
};
