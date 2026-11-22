import { BARREL_LENGTH, BARREL_TILT } from './marble-launcher';
import { sceneColor } from './scene-theme';

export function drawLauncher(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  color: string,
  scale: number
) {
  ctx.shadowBlur = 0;
  ctx.rotate(BARREL_TILT);
  const length = BARREL_LENGTH;
  const metal = ctx.createLinearGradient(0, -0.52, 0, 0.52);
  metal.addColorStop(0, sceneColor('#ffe4ad'));
  metal.addColorStop(0.28, sceneColor(color));
  metal.addColorStop(0.52, sceneColor('#876248'));
  metal.addColorStop(1, sceneColor('#443434'));
  ctx.strokeStyle = sceneColor(color);
  ctx.lineWidth = Math.max(0.065, 1 / scale);
  // Dark cutaway between two metal rails keeps the marble visible through the barrel.
  ctx.fillStyle = metal;
  ctx.fillRect(-length, -0.47, length + 0.73, 0.94);
  ctx.fillStyle = sceneColor('#1b2832');
  ctx.fillRect(-length + 0.24, -0.28, length + 0.28, 0.57);
  for (const y of [-0.47, 0.47]) {
    ctx.beginPath();
    ctx.moveTo(-length, y);
    ctx.lineTo(0.73, y);
    ctx.stroke();
  }
  ctx.fillStyle = metal;
  ctx.fillRect(-length - 0.08, -0.6, 0.23, 1.2);
  ctx.fillRect(0.56, -0.54, 0.25, 1.08);
  ctx.beginPath();
  ctx.moveTo(0.56, 0);
  for (let i = 1; i <= 7; i++) ctx.lineTo(0.56 - i * 0.16, i % 2 ? -0.22 : 0.22);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 0.33, 0, 2 * Math.PI);
  ctx.fillStyle = sceneColor('#506274');
  ctx.fill();
  ctx.stroke();
}
