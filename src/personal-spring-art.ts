import { getSceneTheme, sceneColor } from './scene-theme';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const sprites = new Map<string, OffscreenCanvas>();
const pixelBudget = 3 * 1024 * 1024;
let cachedPixels = 0;

// Local -Y is the launch direction. The face follows the collider; the foot stays anchored.
export function drawPersonalSpring(
  ctx: Context,
  width: number,
  height: number,
  extension: number,
  scale: number,
  accent: string,
  dpr?: number
) {
  ctx.shadowBlur = 0;
  if (typeof OffscreenCanvas !== 'undefined') {
    const transform = dpr === undefined ? ctx.getTransform() : undefined;
    const pixels = transform ? Math.hypot(transform.a, transform.b) : scale * (dpr ?? 1);
    const density = Math.max(16, 2 ** Math.ceil(Math.log2(pixels)));
    const half = Math.ceil((Math.max(width, 0.65) + 0.08) * density);
    const top = Math.ceil((height + 0.08) * density);
    // Nearby lengths share a bitmap; the actual physics displacement positions both ends below.
    const sample = Math.round(extension * 4) / 4;
    const bottom = Math.ceil((sample + 0.73) * density);
    if (height < 0.4 && half * 2 <= 1024 && half * 2 * (top + bottom) <= 750_000) {
      const styleScale = scale < 16 ? 12 : scale < 24 ? 20 : Math.max(24, 2 ** Math.round(Math.log2(scale)));
      const alpha = ctx.globalAlpha;
      const key = `${getSceneTheme()}/${accent}/${width}/${height}/${styleScale}/${density}/${sample}/${alpha}`;
      let sprite = sprites.get(key);
      if (!sprite) {
        const area = half * 2 * (top + bottom);
        while (sprites.size >= 12 || cachedPixels + area > pixelBudget) {
          const [oldKey, oldest] = sprites.entries().next().value!;
          sprites.delete(oldKey);
          cachedPixels -= oldest.width * oldest.height;
          oldest.width = oldest.height = 1;
        }
        sprite = new OffscreenCanvas(half * 2, top + bottom);
        const art = sprite.getContext('2d')!;
        art.setTransform(density, 0, 0, density, half, top);
        art.globalAlpha = alpha;
        paintSpring(art, width, height, sample, styleScale, accent);
        sprites.set(key, sprite);
        cachedPixels += area;
      }
      ctx.globalAlpha = 1;
      const left = -half / density,
        spriteWidth = sprite.width / density;
      const delta = extension - sample;
      if (Math.abs(delta) < 0.00001) {
        ctx.drawImage(sprite, left, -top / density, spriteWidth, sprite.height / density);
      } else {
        // Keep the contact face and anchor rigid. Only stretch the winding between them.
        const faceEnd = top + Math.ceil((height + 0.025) * density);
        const footStart = top + Math.floor((sample + 0.53) * density);
        const winding = footStart - faceEnd,
          foot = sprite.height - footStart;
        ctx.drawImage(sprite, 0, 0, sprite.width, faceEnd, left, -top / density, spriteWidth, faceEnd / density);
        ctx.drawImage(
          sprite,
          0,
          faceEnd,
          sprite.width,
          winding,
          left,
          (faceEnd - top) / density,
          spriteWidth,
          winding / density + delta
        );
        ctx.drawImage(
          sprite,
          0,
          footStart,
          sprite.width,
          foot,
          left,
          (footStart - top) / density + delta,
          spriteWidth,
          foot / density
        );
      }
      ctx.globalAlpha = alpha;
      return;
    }
  }
  paintSpring(ctx, width, height, extension, scale, accent);
}

function paintSpring(ctx: Context, width: number, height: number, extension: number, scale: number, accent: string) {
  const foot = extension + 0.57;
  const turns = scale < 16 ? 2 : 3;
  const pitch = (foot - height) / turns;
  const steel = sceneColor('#80a8b3');
  ctx.fillStyle = sceneColor('#34515f');
  ctx.fillRect(-0.09, height, 0.18, foot - height);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.min(0.085, 0.038 + 0.52 / scale);
  // Receding and forward halves of the winding meet at each turn.
  ctx.strokeStyle = sceneColor('#426471');
  ctx.beginPath();
  for (let i = 0; i < turns; i++) {
    const y = height + i * pitch;
    ctx.moveTo(-0.39, y);
    ctx.quadraticCurveTo(-0.49, y + pitch * 0.26, 0.39, y + pitch * 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = steel;
  ctx.beginPath();
  for (let i = 0; i < turns; i++) {
    const y = height + (i + 0.5) * pitch;
    ctx.moveTo(0.39, y);
    ctx.quadraticCurveTo(0.49, y + pitch * 0.26, -0.39, y + pitch * 0.5);
  }
  ctx.stroke();
  ctx.fillStyle = sceneColor('#395563');
  ctx.fillRect(-0.65, foot - 0.04, 1.3, 0.15);
  ctx.fillStyle = steel;
  ctx.fillRect(-0.59, foot - 0.04, 1.18, 0.047);
  const bevel = Math.min(0.12, width * 0.18, height * 0.7);
  ctx.beginPath();
  ctx.moveTo(-width + bevel, -height);
  ctx.lineTo(width - bevel, -height);
  ctx.lineTo(width, -height + bevel);
  ctx.lineTo(width, height - bevel);
  ctx.lineTo(width - bevel, height);
  ctx.lineTo(-width + bevel, height);
  ctx.lineTo(-width, height - bevel);
  ctx.lineTo(-width, -height + bevel);
  ctx.closePath();
  ctx.fillStyle = sceneColor('#243844');
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = steel;
  ctx.lineWidth = Math.min(0.06, 0.026 + 0.4 / scale);
  ctx.stroke();
  ctx.fillStyle = sceneColor(accent);
  ctx.fillRect(-width + bevel, -height, 2 * (width - bevel), height * 0.37);
  // The inset chevron points toward the striking edge even when the spring is idle.
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = Math.min(0.08, 0.045 + 0.55 / scale);
  ctx.beginPath();
  ctx.moveTo(-width * 0.24, height * 0.53);
  ctx.lineTo(0, -height * 0.33);
  ctx.lineTo(width * 0.24, height * 0.53);
  ctx.stroke();
  if (scale >= 24) {
    ctx.fillStyle = steel;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * width * 0.76, height * 0.2, 0.034, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
