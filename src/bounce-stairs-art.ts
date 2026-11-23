import type { StageDef } from './stage-def';
import { sceneColor } from './scene-theme';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawBounceStairsArt(ctx: Context, stage: StageDef) {
  const contour = stage.art!.contours[0];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...contour[0]);
  for (const point of contour.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  const floor = ctx.createLinearGradient(0, 0, stage.width ?? 48, stage.goalY);
  floor.addColorStop(0, sceneColor('#143b48'));
  floor.addColorStop(0.55, sceneColor('#0c1e30'));
  floor.addColorStop(1, sceneColor('#23303c'));
  ctx.fillStyle = floor;
  ctx.fill();
  ctx.clip();

  for (const [index, entity] of (stage.entities ?? []).slice(2).entries()) {
    if (entity.shape.type !== 'box') continue;
    const pad = entity.shape;
    ctx.save();
    ctx.translate(entity.position.x, entity.position.y);
    ctx.rotate(pad.rotation);
    const landing = ctx.createLinearGradient(0, -1.1, 0, 1.1);
    landing.addColorStop(0, sceneColor('#ffc26e00'));
    landing.addColorStop(0.5, sceneColor('#ffc26e35'));
    landing.addColorStop(1, sceneColor('#ffc26e00'));
    ctx.fillStyle = landing;
    ctx.fillRect(-pad.width, -1.1, pad.width * 2, 2.2);
    ctx.restore();

    // The gap at each free end is the next downward route, not another wall.
    const x = index % 2 ? 10 : 38,
      y = entity.position.y + 10;
    ctx.strokeStyle = sceneColor('#a8eadd88');
    ctx.lineWidth = 0.18;
    for (const offset of [0, 1.15]) {
      ctx.beginPath();
      ctx.moveTo(x - 1.1, y + offset - 0.5);
      ctx.lineTo(x, y + offset + 0.25);
      ctx.lineTo(x + 1.1, y + offset - 0.5);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function drawBounceStairsFinish(ctx: Context, stage: StageDef, scale: number) {
  const contour = stage.art!.contours[0];
  const y = stage.goalY;
  let left = Infinity,
    right = -Infinity;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const [ax, ay] = contour[j],
      [bx, by] = contour[i];
    if (ay > y === by > y) continue;
    const x = ax + ((y - ay) * (bx - ax)) / (by - ay);
    left = Math.min(left, x);
    right = Math.max(right, x);
  }
  if (left >= right) return false;

  ctx.save();
  ctx.shadowBlur = 0;
  const cell = (right - left) / 10;
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 10; col++) {
      ctx.fillStyle = sceneColor((row + col) % 2 ? '#17212b' : '#e8faf3');
      ctx.fillRect(left + col * cell, y - 2 * cell + row * cell, cell, cell);
    }
  ctx.strokeStyle = sceneColor('#65efda');
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([0.35, 0.3]);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  if ((right - left) * scale >= 48) {
    ctx.fillStyle = sceneColor('#65efda');
    ctx.font = `${12 / scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('FINISH', (left + right) / 2, y - 2 * cell);
  }
  ctx.restore();
  return true;
}
