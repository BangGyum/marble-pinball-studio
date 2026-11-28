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
      const alpha = ctx.globalAlpha;
      const key = `${getSceneTheme()}/${accent}/${width}/${height}/${density}/${sample}/${alpha}`;
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
        paintSpring(art, width, height, sample, accent);
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
        // Keep the contact face and anchor rigid. Only stretch the bellows between them.
        const faceEnd = top + Math.ceil((height + 0.025) * density);
        const footStart = top + Math.floor((sample + 0.53) * density);
        const bellows = footStart - faceEnd,
          foot = sprite.height - footStart;
        ctx.drawImage(sprite, 0, 0, sprite.width, faceEnd, left, -top / density, spriteWidth, faceEnd / density);
        ctx.drawImage(
          sprite,
          0,
          faceEnd,
          sprite.width,
          bellows,
          left,
          (faceEnd - top) / density,
          spriteWidth,
          bellows / density + delta
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
  paintSpring(ctx, width, height, extension, accent);
}

function paintSpring(ctx: Context, width: number, height: number, extension: number, accent: string) {
  const beige = getSceneTheme() === 'beige';
  const rubber = beige ? '#4d5140' : '#25484d';
  const foldColor = sceneColor(accent);
  const foot = extension + 0.57;
  const foldStart = height - 0.03;
  const pitch = (foot - foldStart) / 3;

  function pad(x: number, y: number, w: number, h: number, radius: number, color: string) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  for (let i = 0; i < 3; i++) {
    const y = foldStart + i * pitch;
    pad(-0.48, y, 0.96, pitch + 0.014, 0.08, rubber);
    pad(-0.51, y + 0.012, 1.02, Math.min(0.1, pitch * 0.6), 0.045, foldColor);
  }
  pad(-0.66, foot - 0.025, 1.32, 0.145, 0.07, rubber);
  pad(-width, -height, width * 2, height * 2, height * 0.89, rubber);
  pad(-width * 0.96, -height * 0.89, width * 1.92, height * 1.42, height * 0.66, beige ? '#f2ead6' : '#e3eddf');
  pad(-width * 0.21, -height * 0.6, width * 0.42, height * 0.27, height * 0.14, beige ? '#8b946c' : '#668a7b');
}
