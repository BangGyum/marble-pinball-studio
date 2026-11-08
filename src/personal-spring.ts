import type { StageDef } from './data/maps';
import type { EntityBoxShape, MapEntity } from './types/map-entity';

export type SpringPlacement = { x: number; y: number; direction: number };
export type PlacedSpring = SpringPlacement & { id: string };

export function personalSpringShape(direction: number): EntityBoxShape {
  return {
    type: 'box',
    width: 0.9,
    height: 0.18,
    rotation: direction + Math.PI / 2,
    color: '#ffcf7c',
    spring: { distance: 1.5, direction },
  };
}

export function personalSpringEntity(
  stage: StageDef,
  placement: SpringPlacement
): MapEntity & { shape: EntityBoxShape } {
  const { x, y, direction } = placement;
  if (![x, y, direction].every(Number.isFinite) || Math.abs(direction) > Math.PI)
    throw new Error('스프링 위치와 방향이 올바르지 않아요.');
  const shape = personalSpringShape(direction),
    { width, height } = shape,
    distance = shape.spring!.distance;
  const dx = Math.cos(direction),
    dy = Math.sin(direction),
    rx = Math.abs(dy) * width + Math.abs(dx) * height,
    ry = Math.abs(dx) * width + Math.abs(dy) * height;
  if (
    Math.min(x, x + dx * distance) < rx ||
    Math.max(x, x + dx * distance) > (stage.width ?? 26) - rx ||
    Math.min(y, y + dy * distance) < ry ||
    Math.max(y, y + dy * distance) > stage.goalY - ry
  )
    throw new Error('스프링과 발사 방향이 맵 안에 들어오도록 골라 주세요.');
  return {
    position: { x, y },
    type: 'kinematic',
    shape,
    props: { density: 1, restitution: 0.8, angularVelocity: 0 },
  };
}
