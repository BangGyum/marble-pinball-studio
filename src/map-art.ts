import type { StageDef } from './data/maps';

// Pure scenery: these surfaces, beams and lamps never enter the physics world.
export function drawMapArt(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, stage: StageDef, scale: number
) {
  if (!stage.art) return;
  ctx.save();
  const height = stage.goalY, width = stage.width ?? 48;
  for (const x of [6, width - 6]) {
    const metal = ctx.createLinearGradient(x - 0.5, 0, x + 0.5, 0);
    metal.addColorStop(0, '#0a101a'); metal.addColorStop(0.5, '#253747'); metal.addColorStop(1, '#080c13');
    ctx.fillStyle = metal;
    ctx.fillRect(x - 0.4, 15, 0.8, height - 20);
    for (let y = 23; y < height - 7; y += 19) {
      ctx.strokeStyle = '#243646'; ctx.lineWidth = 0.18;
      ctx.beginPath(); ctx.moveTo(x, y + 10);
      ctx.bezierCurveTo(x, y + 4, width / 2, y + 2, width / 2, y + 8); ctx.stroke();
      ctx.fillStyle = '#534330'; ctx.fillRect(x - 0.6, y - 0.25, 1.2, 0.5);
      ctx.shadowColor = '#ffcd79'; ctx.shadowBlur = Math.min(12, scale * 0.5);
      ctx.fillStyle = '#e7ad58'; ctx.fillRect(x - 0.07, y - 2.2, 0.14, 1.8);
      ctx.shadowBlur = 0;
    }
  }
  ctx.beginPath();
  for (const points of stage.art.contours) {
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
  }
  const glass = ctx.createLinearGradient(0, 0, width, height);
  glass.addColorStop(0, '#163143'); glass.addColorStop(0.3, '#0c1927');
  glass.addColorStop(0.6, '#172e3b'); glass.addColorStop(1, '#102636');
  ctx.fillStyle = glass; ctx.fill('evenodd');
  ctx.clip('evenodd');
  // Narrow reflections give the glass depth without hiding the marbles or collision edges.
  ctx.strokeStyle = '#b4eaff0a'; ctx.lineWidth = 0.06;
  for (let y = 10; y < height; y += 2.7) {
    ctx.beginPath(); ctx.moveTo(0, y + 9); ctx.lineTo(width, y - 9); ctx.stroke();
  }
  ctx.strokeStyle = '#b8f2ff90'; ctx.lineWidth = 0.055 + 0.4 / scale;
  for (const [x, y, angle] of stage.art.arrows ?? []) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath();
    for (const offset of [-0.3, 0.3]) {
      ctx.moveTo(offset - 0.25, -0.25); ctx.lineTo(offset + 0.1, 0); ctx.lineTo(offset - 0.25, 0.25);
    }
    ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
