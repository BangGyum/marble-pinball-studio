import type { StageDef } from './stage-def';
import type { MapEntityState } from './types/MapEntity.type';
import { backgroundCache } from './background-cache';
import { sceneColor } from './scene-theme';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function paint(ctx: Context, stage: StageDef) {
  const goal = stage.goalArea!;
  const rim = stage.art!.contours[0];
  ctx.save();
  ctx.beginPath(); ctx.moveTo(...rim[0]); rim.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
  const bowl = ctx.createRadialGradient(goal.x, goal.y, 4, goal.x, goal.y, 28);
  bowl.addColorStop(0, sceneColor('#152b34')); bowl.addColorStop(.65, sceneColor('#10232f')); bowl.addColorStop(1, sceneColor('#193843'));
  ctx.fillStyle = bowl; ctx.fill();
  ctx.strokeStyle = sceneColor('#72edee24'); ctx.lineWidth = .065;
  for (const radius of [18, 24.5]) {
    ctx.beginPath(); ctx.arc(goal.x, goal.y, radius, 0, Math.PI * 2); ctx.stroke();
  }
  const hole = ctx.createRadialGradient(goal.x, goal.y, .3, goal.x, goal.y, goal.radius + 2);
  hole.addColorStop(0, sceneColor('#020709')); hole.addColorStop(.65, sceneColor('#061016')); hole.addColorStop(1, sceneColor('#152b3400'));
  ctx.fillStyle = hole; ctx.beginPath(); ctx.arc(goal.x, goal.y, goal.radius + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = sceneColor('#9fd7cb'); ctx.font = '1.05px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('공과 입구가 만나면 중앙으로', goal.x, goal.y + 30);
  ctx.restore();
}

export function drawOrbitingGateArt(ctx: Context, stage: StageDef, cacheBackground = true) {
  if (!cacheBackground) { paint(ctx, stage); return; }
  backgroundCache.draw(ctx, stage, 'orbiting-gate',
    { x: 0, y: 10, width: stage.width ?? 64, height: stage.goalY - 10, density: 20 }, target => paint(target, stage));
}

// The marker follows the actual body's pose and the two ends of its inner collision rail.
export function drawOrbitingGateMouth(ctx: Context, entities: MapEntityState[], scale: number) {
  const ring = entities.find(e => e.shape.type === 'polyline' && e.shape.points.length > 4 && e.x !== 0);
  if (!ring || ring.shape.type !== 'polyline') return;
  const points = ring.shape.points, a = points[0], radius = Math.hypot(...a);
  const end = points.findIndex(p => Math.hypot(...p) > radius + .1);
  if (radius < .5 || end < 2) return;
  const b = points[end - 1], angle = Math.atan2(a[1] + b[1], a[0] + b[0]);
  ctx.save(); ctx.translate(ring.x, ring.y); ctx.rotate(ring.angle);
  const tip = points.at(-2)!, shoulder = points.at(-3)!;
  if (Math.hypot(...tip) > Math.hypot(...shoulder) + .1) {
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...shoulder); ctx.lineTo(...tip); ctx.closePath();
    ctx.fillStyle = sceneColor('#ffd18445'); ctx.fill();
  }
  ctx.strokeStyle = sceneColor('#ffd184'); ctx.lineWidth = .14 + .6 / scale;
  for (const end of [a, b]) {
    const r = Math.hypot(...end);
    ctx.beginPath(); ctx.moveTo(end[0] * .97, end[1] * .97); ctx.lineTo(end[0] * (r + .95) / r, end[1] * (r + .95) / r); ctx.stroke();
  }
  ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(radius + 2, -.5); ctx.lineTo(radius + 1.25, 0); ctx.lineTo(radius + 2, .5); ctx.stroke();
  ctx.restore();
  if (scale >= 4) {
    const direction = ring.angle + angle;
    ctx.save(); ctx.fillStyle = sceneColor('#ffd184'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${12 / scale}px system-ui`;
    ctx.fillText('입구', ring.x + Math.cos(direction) * (radius + 3.7), ring.y + Math.sin(direction) * (radius + 3.7));
    ctx.restore();
  }
}
