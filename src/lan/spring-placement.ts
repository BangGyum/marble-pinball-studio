import type { StageDef } from '../data/maps';
import { drawEntities } from '../draw';
import { personalSpringEntity, personalSpringShape, type PlacedSpring, type SpringPlacement } from '../personal-spring';
import { sceneColor } from '../scene-theme';

type Point = { x: number; y: number };

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
  choose(point: Point): SpringPlacement | undefined {
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
    personalSpringEntity(this.stage, placement);
    return placement;
  }
  draw(ctx: CanvasRenderingContext2D, scale: number) {
    if (!this.stage || !this.pointer) return;
    const origin = this.origin ?? this.pointer;
    const placement = {
      ...origin,
      direction: this.origin ? Math.atan2(this.pointer.y - origin.y, this.pointer.x - origin.x) : -Math.PI / 2,
    };
    let valid = true;
    try {
      personalSpringEntity(this.stage, placement);
    } catch {
      valid = false;
    }
    // Invalid positions remain visible so the player can correct the direction.
    const shape = personalSpringShape(placement.direction);
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
  stage: StageDef,
  springs: PlacedSpring[],
  ownId: string | undefined,
  scale: number
) {
  for (const spring of springs) {
    const { shape } = personalSpringEntity(stage, spring);
    ctx.save();
    ctx.globalAlpha = spring.id === ownId ? 0.85 : 0.45;
    drawEntities(ctx, [{ x: spring.x, y: spring.y, angle: 0, shape, life: -1 }], scale);
    ctx.globalAlpha = 1;
    ctx.fillStyle = sceneColor(spring.id === ownId ? '#ffcf7c' : '#aee9ed');
    ctx.font = `600 ${12 / scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(spring.id === ownId ? '내 스프링 · 1회' : '참여자 스프링', spring.x, spring.y - 0.6);
    ctx.restore();
  }
}
