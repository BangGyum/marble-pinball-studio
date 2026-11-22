import { sceneColor } from './scene-theme';
import type { StageDef } from './stage-def';

// A short bank-shot arrow follows the actual pad if a saved map moves or rotates it.
export function drawBankShotGuide(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stage: StageDef,
  scale: number
) {
  if (scale < 5) return;
  for (const { type, shape, position, props } of stage.entities ?? []) {
    if (type !== 'static' || shape.type !== 'box' || shape.hidden || props.restitution <= 1) continue;
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(shape.rotation);
    ctx.translate(0, -shape.height - 0.27);
    ctx.strokeStyle = sceneColor('#75bfb49c');
    ctx.lineWidth = Math.max(0.055, 1 / scale);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.setLineDash([0.24, 0.27]);
    ctx.beginPath();
    ctx.moveTo(shape.width, -0.76);
    ctx.quadraticCurveTo(shape.width * 0.5, -0.58, 0, 0);
    ctx.quadraticCurveTo(-shape.width * 0.5, -1.17, -shape.width, -1.55);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-shape.width + 0.44, -1.69);
    ctx.lineTo(-shape.width, -1.55);
    ctx.lineTo(-shape.width + 0.27, -1.17);
    ctx.stroke();
    ctx.restore();
  }
}
