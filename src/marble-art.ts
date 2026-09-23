type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// The highlight stays in screen space; the physical collision radius remains unchanged.
export function drawMarble(ctx: Context, x: number, y: number, radius: number, color: string) {
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = color; ctx.shadowBlur = Math.min(7, radius * 0.6);
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0;
  const shade = ctx.createRadialGradient(-radius * 0.38, -radius * 0.42, radius * 0.05, 0, 0, radius);
  shade.addColorStop(0, '#ffffff90'); shade.addColorStop(0.3, '#ffffff18');
  shade.addColorStop(0.62, '#050b160d'); shade.addColorStop(0.9, '#02081799'); shade.addColorStop(1, '#010610dd');
  ctx.fillStyle = shade; ctx.fill();
  ctx.strokeStyle = '#ffffff80'; ctx.lineWidth = radius * 0.065; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-radius * 0.3, -radius * 0.4, radius * 0.31, radius * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffffdd'; ctx.fill();
  ctx.beginPath(); ctx.arc(radius * 0.1, radius * 0.12, radius * 0.66, 0.15, 1.65);
  ctx.lineWidth = radius * 0.08; ctx.strokeStyle = '#c9faff55'; ctx.stroke();
  ctx.restore();
}
