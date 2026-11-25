import type { StageDef } from './data/maps';
import type { EntityBoxShape, MapEntity } from './types/map-entity';

export type SpringPlacement = { x: number; y: number; direction: number };
export type PlacedSpring = SpringPlacement & { id: string; ownerName: string; placedAt?: number; activatedAt?: number };

const HALF_WIDTH = 0.9;
const HALF_HEIGHT = 0.18;
const BASE_LENGTH = 0.7;
const STROKE = 1.5;

export const PERSONAL_SPRING_DURATION = 0.65;
export function springHasExpired(spring: PlacedSpring, elapsed: number) {
  return spring.activatedAt !== undefined && elapsed >= spring.activatedAt + PERSONAL_SPRING_DURATION;
}

export function personalSpringExtension(seconds: number) {
  if (seconds <= 0) return 0;
  if (seconds < 0.08) return 1 - (1 - seconds / 0.08) ** 3;
  if (seconds < 0.14) return 1;
  const t = Math.min(1, (seconds - 0.14) / 0.36);
  return 1 - t * t * (3 - 2 * t);
}

export function personalSpringShape(direction: number): EntityBoxShape {
  return {
    type: 'box',
    width: HALF_WIDTH,
    height: HALF_HEIGHT,
    rotation: direction + Math.PI / 2,
    color: '#ffcf7c',
    spring: { distance: STROKE, direction },
  };
}

export function springCollisionLayer(stage: StageDef, { x, y }: Pick<SpringPlacement, 'x' | 'y'>): 1 | 2 {
  const bridge = stage.exitBridge;
  if (!bridge) return 1;
  // Placement targets the visible deck when tracks overlap on screen.
  for (const { deck } of [bridge, ...(bridge.transfers ?? [])]) {
    let inside = false;
    for (let i = 0, j = deck.length - 1; i < deck.length; j = i++) {
      const [ax, ay] = deck[j];
      const [bx, by] = deck[i];
      if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) inside = !inside;
    }
    if (inside) return 2;
  }
  return 1;
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
    Math.min(x - dx * BASE_LENGTH, x + dx * distance) < rx ||
    Math.max(x - dx * BASE_LENGTH, x + dx * distance) > (stage.width ?? 26) - rx ||
    Math.min(y - dy * BASE_LENGTH, y + dy * distance) < ry ||
    Math.max(y - dy * BASE_LENGTH, y + dy * distance) > stage.goalY - ry
  )
    throw new Error('스프링과 발사 방향이 맵 안에 들어오도록 골라 주세요.');
  if (springCollisionLayer(stage, placement) === 2) shape.collisionLayer = 2;
  shape.spring!.personal = { x, y };
  return {
    position: { x, y },
    type: 'kinematic',
    shape,
    props: { density: 1, restitution: 0.8, angularVelocity: 0 },
  };
}

type SpringBounds = { x: number; y: number; direction: number; along: number; across: number };

function sweptBounds({ x, y, direction }: SpringPlacement): SpringBounds {
  const offset = (STROKE - BASE_LENGTH) / 2;
  return {
    x: x + Math.cos(direction) * offset,
    y: y + Math.sin(direction) * offset,
    direction,
    along: (STROKE + BASE_LENGTH) / 2 + HALF_HEIGHT,
    across: HALF_WIDTH,
  };
}

function intersects(a: SpringBounds, b: SpringBounds) {
  return [a.direction, a.direction + Math.PI / 2, b.direction, b.direction + Math.PI / 2].every((angle) => {
    const distance = Math.abs((a.x - b.x) * Math.cos(angle) + (a.y - b.y) * Math.sin(angle));
    const radius = (s: SpringBounds) =>
      s.along * Math.abs(Math.cos(angle - s.direction)) + s.across * Math.abs(Math.sin(angle - s.direction));
    return distance <= radius(a) + radius(b);
  });
}

export function validatePersonalSpring(
  stage: StageDef,
  placement: SpringPlacement,
  others: readonly SpringPlacement[]
) {
  const layer = personalSpringEntity(stage, placement).shape.collisionLayer ?? 1;
  const bounds = sweptBounds(placement);
  if (others.some((other) => springCollisionLayer(stage, other) === layer && intersects(bounds, sweptBounds(other))))
    throw new Error('다른 스프링의 배치 위치 또는 발동 범위와 겹쳐요.');
  for (const { position, shape } of stage.entities ?? []) {
    if (shape.type !== 'box' || !shape.spring || (shape.collisionLayer ?? 1) !== layer) continue;
    const { direction, distance } = shape.spring,
      offset = distance / 2,
      angle = shape.rotation - direction;
    if (
      intersects(bounds, {
        x: position.x + Math.cos(direction) * offset,
        y: position.y + Math.sin(direction) * offset,
        direction,
        along: offset + Math.abs(Math.cos(angle)) * shape.width + Math.abs(Math.sin(angle)) * shape.height,
        across: Math.abs(Math.sin(angle)) * shape.width + Math.abs(Math.cos(angle)) * shape.height,
      })
    )
      throw new Error('맵 스프링의 발동 범위와 겹쳐요.');
  }
}
