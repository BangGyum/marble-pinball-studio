import type { MarbleSquash } from './marble-elasticity';
import { getMarbleDesign } from './marble-design';
import { getSceneTheme } from './scene-theme';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Deformation only affects the drawing; the physical collision radius remains unchanged.
export function drawMarble(ctx: Context, x: number, y: number, radius: number, color: string, squash?: MarbleSquash) {
  ctx.save(); ctx.translate(x, y);
  if (squash) {
    ctx.rotate(squash.angle); ctx.scale(1 - squash.amount, 1 + squash.amount * 0.7);
    ctx.rotate(-squash.angle);
  }
  const beige = getSceneTheme() === 'beige', band = getMarbleDesign() === 'racing-band';
  const ink = beige ? '#4d4437' : '#18282f';
  // Keep participant hues while softening their paint to suit each scene.
  const hue = /^hsl\(([\d.]+)\s/.exec(color)?.[1];
  const paint = hue ? `hsl(${hue} ${beige ? '32% 50%' : '62% 73%'})` : color;
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = paint; ctx.fill();
  const shade = ctx.createRadialGradient(-radius * 0.5, -radius * 0.7, 0, 0, 0, radius * 1.35);
  shade.addColorStop(0, band ? '#fff8e921' : '#fff8e933');
  shade.addColorStop(0.5, '#fff8e900'); shade.addColorStop(1, ink + (band ? '2e' : '1f'));
  ctx.fillStyle = shade; ctx.fill();
  if (band) {
    ctx.save(); ctx.clip(); ctx.rotate(0.55);
    ctx.fillStyle = '#fff8e9'; ctx.fillRect(-radius * 0.23, -radius * 1.1, radius * 0.46, radius * 2.2);
    ctx.strokeStyle = ink + '40'; ctx.lineWidth = radius * 0.045;
    for (const x of [-0.3, 0.3]) {
      ctx.beginPath(); ctx.moveTo(x * radius, -radius); ctx.lineTo(x * radius, radius); ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.beginPath(); ctx.ellipse(-radius * 0.32, -radius * 0.42, radius * 0.28, radius * 0.13, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8e92b'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.96, 0, Math.PI * 2);
  ctx.strokeStyle = ink + '54'; ctx.lineWidth = radius * 0.065; ctx.stroke();
  ctx.restore();
}
