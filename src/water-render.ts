import type { ViewBounds } from './art-visibility';
import { getSceneTheme } from './scene-theme';
import type { WaterZone } from './stage-def';

export function drawWater(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  zones: WaterZone[],
  scale: number,
  time = 0,
  view?: ViewBounds,
  balls?: readonly { x: number; y: number; rank?: number; onBridge?: boolean }[]
) {
  const beige = getSceneTheme() === 'beige';
  for (const { x, y, width, depth, current } of zones) {
    if (view && (x + width < view.left || x > view.right || y + depth < view.top || y > view.bottom)) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, width, depth);
    ctx.clip();
    const shade = ctx.createLinearGradient(0, 0, 0, depth);
    shade.addColorStop(0, beige ? '#5eb8ab88' : '#37ccbd77');
    shade.addColorStop(1, beige ? '#337f818c' : '#15567699');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, depth);
    ctx.strokeStyle = beige ? '#347a73' : '#96f2df';
    ctx.lineWidth = Math.max(1 / scale, 0.055);
    const phase = time * (current === 0 ? 0.5 : current * 0.7);
    ctx.beginPath();
    const segments = Math.min(64, Math.ceil(width * 2));
    for (let i = 0; i <= segments; i++) {
      const u = (i / segments) * width,
        v = 0.09 + 0.065 * Math.sin(u * 1.6 - phase);
      if (i === 0) ctx.moveTo(u, v);
      else ctx.lineTo(u, v);
    }
    ctx.stroke();
    if (scale > 6) {
      // Drifting highlights show the current even before a marble enters the pool.
      ctx.globalAlpha *= 0.45;
      ctx.beginPath();
      for (let row = 1; row <= 3; row++) {
        const offset = (((phase + row * 2.7) % 6) + 6) % 6;
        const v = (depth * row) / 4;
        for (let u = offset - 6; u < width; u += 6) {
          ctx.moveTo(u, v);
          ctx.quadraticCurveTo(u + 0.6, v - 0.12, u + 1.2, v);
        }
      }
      ctx.stroke();
      if (balls) {
        ctx.beginPath();
        for (const ball of balls) {
          if (ball.rank || ball.onBridge || ball.x < x || ball.x > x + width || Math.abs(ball.y - y) > 0.35) continue;
          const radius = 0.35 + (ball.y - y + 0.35) * 0.8;
          ctx.moveTo(ball.x - x + radius, 0.15);
          ctx.ellipse(ball.x - x, 0.15, radius, 0.12, 0, 0, Math.PI * 2);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
