import type { StageDef } from './stage-def';
import { backgroundCache } from './background-cache';
import type { MapEntityState } from './types/map-entity';
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = [number, number];
const cyan = '#67e8f9',
  gold = '#ffd078';
function stroke(ctx: Ctx, points: Point[], color: string, width: number) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const p of points.slice(1)) ctx.lineTo(...p);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}
function paint(ctx: Ctx, stage: StageDef) {
  ctx.save();
  const backdrop = ctx.createLinearGradient(0, 0, 44, 0);
  backdrop.addColorStop(0, '#17191e');
  backdrop.addColorStop(0.14, '#090c11');
  backdrop.addColorStop(0.85, '#0b0e13');
  backdrop.addColorStop(1, '#191b20');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, -2, 44, 116);
  ctx.strokeStyle = '#343a40';
  ctx.lineWidth = 0.25;
  ctx.strokeRect(1, -1, 42, 113);
  for (const e of stage.entities ?? []) {
    if (e.shape.type !== 'polyline' || !e.shape.hidden) continue;
    const pts = e.shape.points.map(([x, y]): Point => [x + e.position.x, y + e.position.y]);
    const color = e.shape.color ?? cyan;
    // The luminous top edge is the Box2D collision line; layers below it are only visual depth.
    ctx.save();
    ctx.translate(0, 1.05);
    stroke(ctx, pts, '#020508', 2.35);
    stroke(ctx, pts, '#2b3138', 1.8);
    stroke(ctx, pts, '#76828a', 1.1);
    stroke(ctx, pts, '#191f26', 0.68);
    ctx.restore();
    stroke(ctx, pts, '#070c10', 1.55);
    stroke(ctx, pts, '#565e64', 1.12);
    stroke(ctx, pts, '#c6c4bb', 0.43);
    ctx.shadowBlur = 6;
    ctx.shadowColor = color;
    stroke(ctx, pts, color, 0.13);
    ctx.shadowBlur = 0;
    if (pts.length === 2)
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p[0], p[1] + 0.55, 0.17, 0, Math.PI * 2);
        ctx.fillStyle = '#c2c7c4';
        ctx.fill();
        ctx.strokeStyle = '#26313a';
        ctx.lineWidth = 0.06;
        ctx.stroke();
      }
  }
  const finish = ctx.createLinearGradient(0, 104, 0, 113);
  finish.addColorStop(0, '#5e686d');
  finish.addColorStop(1, '#171a20');
  ctx.fillStyle = finish;
  ctx.fillRect(17.2, 104, 9.6, 9);
  ctx.fillStyle = '#141d23';
  ctx.fillRect(18, 104, 8, 8);
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 12; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#141b22' : '#f4e7cb';
      ctx.fillRect(18 + (col * 2) / 3, 108 + (row * 2) / 3, 2 / 3, 2 / 3);
    }
  ctx.font = 'bold 1.15px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dbe5e7';
  ctx.fillText('샛길 캐스케이드', 22, 3.3);
  ctx.font = '0.55px system-ui';
  ctx.fillStyle = '#92a1a6';
  ctx.fillText('SHORTCUT CASCADE', 22, 4.3);
  ctx.fillStyle = '#a8f5f5';
  ctx.font = 'bold 0.68px system-ui';
  ctx.fillText('▼ FINISH', 22, 107.2);
  ctx.restore();
}
export function drawCascadeArt(ctx: Ctx, stage: StageDef, cacheBackground = true) {
  if (!cacheBackground || typeof OffscreenCanvas === 'undefined') {
    paint(ctx, stage);
    return;
  }
  backgroundCache.draw(ctx, stage, 'shortcut-cascade', { x: 0, y: -2, width: 44, height: 116, density: 22 }, (target) =>
    paint(target, stage)
  );
}
export function drawCascadeDevices(ctx: Ctx, stage: StageDef, entities: MapEntityState[]) {
  ctx.save();
  for (const [i, e] of entities.entries()) {
    const def = stage.entities?.[i],
      sh = e.shape;
    if (!def || sh.type !== 'box' || !sh.spring) continue;
    const color = sh.spring.cooldown?.scope === 'shared' ? gold : cyan;
    const base = def.position;
    ctx.save();
    ctx.translate(base.x, base.y + 1.65);
    ctx.fillStyle = '#202b32';
    ctx.strokeStyle = '#a4aeb1';
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.roundRect(-1.15, -1.25, 2.3, 2.5, 0.25);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -1.3);
    for (let t = 0; t <= 12; t++) ctx.lineTo(Math.sin(t * Math.PI) * 0.55, -1.25 + t * 0.2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.18;
    ctx.stroke();
    ctx.fillStyle = '#14252b';
    ctx.fillRect(-1.1, 1.32, 2.2, 0.7);
    ctx.fillStyle = color;
    ctx.font = 'bold 0.5px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(sh.spring.cooldown?.scope === 'shared' ? '공통 5초' : '개인 10초', 0, 1.84);
    ctx.restore();
  }
  ctx.restore();
}
