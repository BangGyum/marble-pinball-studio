import type { StageDef } from '../data/maps';
import { drawEntities } from '../draw';
import {
  springHasExpired,
  personalSpringExtension,
  personalSpringShape,
  validatePersonalSpring,
  type PlacedSpring,
  type SpringPlacement,
} from '../personal-spring';
import { sceneColor } from '../scene-theme';
import { drawPersonalSpring } from '../personal-spring-art';

type Point = { x: number; y: number };
type ViewBounds = { left: number; right: number; top: number; bottom: number };
const springShape = personalSpringShape(0);

export class PersonalSpringPlacement {
  private stage?: StageDef;
  origin?: Point;
  private pointer?: Point;
  get active() {
    return !!this.stage;
  }
  begin(stage: StageDef) {
    this.stage = stage;
    this.origin = undefined;
    this.pointer = undefined;
  }
  cancel() {
    this.stage = undefined;
    this.origin = undefined;
    this.pointer = undefined;
  }
  move(point: Point) {
    this.pointer = point;
  }
  choose(point: Point, springs: PlacedSpring[] = [], elapsed = 0): SpringPlacement | undefined {
    if (!this.stage) return;
    if (!this.origin) {
      if (point.x < 0 || point.x > (this.stage.width ?? 26) || point.y < 0 || point.y > this.stage.goalY)
        throw new Error('맵 안에서 배치할 위치를 골라 주세요.');
      this.origin = point;
      this.pointer = { x: point.x, y: point.y - 2 };
      return;
    }
    if (Math.hypot(point.x - this.origin.x, point.y - this.origin.y) < 0.25)
      throw new Error('위치에서 조금 떨어진 곳을 눌러 발사 방향을 골라 주세요.');
    const placement = { ...this.origin, direction: Math.atan2(point.y - this.origin.y, point.x - this.origin.x) };
    validatePersonalSpring(
      this.stage,
      placement,
      springs.filter((spring) => !springHasExpired(spring, elapsed))
    );
    return placement;
  }
  draw(ctx: CanvasRenderingContext2D, scale: number, springs: PlacedSpring[], elapsed: number) {
    if (!this.stage || !this.pointer) return;
    const origin = this.origin ?? this.pointer;
    const placement = {
      ...origin,
      direction: this.origin ? Math.atan2(this.pointer.y - origin.y, this.pointer.x - origin.x) : -Math.PI / 2,
    };
    let valid = true;
    try {
      validatePersonalSpring(
        this.stage,
        placement,
        springs.filter((spring) => !springHasExpired(spring, elapsed))
      );
    } catch {
      valid = false;
    }
    // Invalid positions remain visible so the player can correct the direction.
    const shape = personalSpringShape(placement.direction);
    shape.spring!.personal = origin;
    ctx.save();
    ctx.globalAlpha = 0.65;
    shape.color = valid ? '#ffcf7c' : '#ff777d';
    drawEntities(ctx, [{ x: origin.x, y: origin.y, angle: 0, shape, life: -1 }], scale);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = sceneColor(valid ? '#ffcf7c' : '#ff777d');
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([5 / scale, 4 / scale]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + Math.cos(placement.direction) * 3, origin.y + Math.sin(placement.direction) * 3);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawPlacedSprings(
  ctx: CanvasRenderingContext2D,
  springs: PlacedSpring[],
  ownId: string | undefined,
  scale: number,
  elapsed: number,
  finished: boolean,
  view: ViewBounds,
  dpr = 1
) {
  let painting = false;
  for (const spring of springs) {
    if (
      elapsed < (spring.placedAt ?? 0) ||
      springHasExpired(spring, elapsed) ||
      (finished && spring.activatedAt !== undefined) ||
      spring.x < view.left - 3 ||
      spring.x > view.right + 3 ||
      spring.y < view.top - 3 ||
      spring.y > view.bottom + 3
    )
      continue;
    if (!painting) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.font = `600 ${12 / scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3 / scale;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = sceneColor('#111821');
      painting = true;
    }
    const active = spring.activatedAt !== undefined && elapsed >= spring.activatedAt,
      offset = active ? springShape.spring!.distance * personalSpringExtension(elapsed - spring.activatedAt!) : 0,
      sin = Math.sin(spring.direction),
      x = spring.x + Math.cos(spring.direction) * offset,
      y = spring.y + sin * offset;
    ctx.save();
    ctx.globalAlpha = active ? 1 : spring.id === ownId ? 0.95 : 0.78;
    ctx.translate(x, y);
    ctx.rotate(spring.direction + Math.PI / 2);
    drawPersonalSpring(ctx, springShape.width, springShape.height, offset, scale, springShape.color!, dpr);
    ctx.restore();
    ctx.fillStyle = sceneColor(spring.id === ownId ? '#ffcf7c' : '#aee9ed');
    const below = sin < -0.01;
    ctx.textBaseline = below ? 'top' : 'bottom';
    const labelY = spring.y + (below ? 1 : -1) * (1 + 3 / scale);
    ctx.strokeText(spring.ownerName, spring.x, labelY, 130 / scale);
    ctx.fillText(spring.ownerName, spring.x, labelY, 130 / scale);
  }
  if (painting) ctx.restore();
}
