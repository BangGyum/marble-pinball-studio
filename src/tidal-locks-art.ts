import type { ViewBounds } from './art-visibility';
import { sceneColor } from './scene-theme';
import type { StageDef } from './stage-def';
import { timedGateAngle } from './timed-gate';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Depth marks start at the actual waterline. The chevrons point toward the spillway.
export function drawCanalMarks(ctx: Context, stage: StageDef, scale: number) {
  ctx.save();
  ctx.strokeStyle = sceneColor('#aedbd88c');
  ctx.lineWidth = Math.max(0.055, 0.8 / scale);
  ctx.beginPath();
  for (const zone of stage.waterZones ?? []) {
    const dir = Math.sign(zone.current);
    const x = dir > 0 ? zone.x + 0.25 : zone.x + zone.width - 0.25;
    for (let i = 0; i < zone.depth; i++) {
      ctx.moveTo(x, zone.y + i);
      ctx.lineTo(x + dir * (i % 2 === 0 ? 0.65 : 0.35), zone.y + i);
    }
    const end = dir > 0 ? zone.x + zone.width : zone.x;
    for (const inset of [1, 1.7]) {
      const cx = end - inset * dir;
      ctx.moveTo(cx - dir * 0.3, zone.y - 0.9);
      ctx.lineTo(cx, zone.y - 0.6);
      ctx.lineTo(cx - dir * 0.3, zone.y - 0.3);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function drawLockSignals(ctx: Context, stage: StageDef, scale: number, elapsed: number, view?: ViewBounds) {
  if (scale < 6) return;
  ctx.save();
  ctx.font = '600 0.48px system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  let number = 0;
  for (const e of stage.entities ?? []) {
    const gate = e.props.timedGate;
    if (!gate || gate.releaseAfter === undefined) continue;
    number++;
    const x = e.position.x - 1.1,
      y = e.position.y - 7.5;
    if (view && (x < view.left || x - 5 > view.right || y + 1 < view.top || y - 1 > view.bottom)) continue;
    const open = Math.abs(timedGateAngle(gate, elapsed)) > Math.abs(gate.angle) * 0.85;
    ctx.fillStyle = sceneColor(open ? '#98e6c2' : '#ffca79');
    ctx.beginPath();
    ctx.arc(x, y, 0.17, 0, 2 * Math.PI);
    ctx.fill();
    if (scale >= 12) ctx.fillText(number + '번 갑문 · ' + (open ? '통과' : '대기'), x - 0.36, y);
  }
  ctx.restore();
}
