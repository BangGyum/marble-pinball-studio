import type { WindZone } from './data/maps';

export function drawWind(ctx: CanvasRenderingContext2D, winds: WindZone[], time: number, scale: number) {
  for (const wind of winds) {
    const frequency = wind.period ? 2 * Math.PI / wind.period : 1.7;
    const phase = time * frequency + (wind.phase ?? 0);
    const power = 1 - (wind.pulse ?? 0) * (0.5 - 0.5 * Math.sin(phase));
    ctx.save();
    ctx.lineWidth = Math.max(1.5 / scale, 0.045);
    ctx.strokeStyle = '#72edee';
    ctx.fillStyle = '#72edee';
    ctx.globalAlpha = 0.15 + 0.4 * power;
    ctx.shadowBlur = 0;
    if (wind.type === 'vortex') {
      const sign = Math.sign(wind.speed), radius = wind.radius * 0.73;
      for (let i = 0; i < 3; i++) {
        const a = time * wind.speed / wind.radius + i * Math.PI * 2 / 3;
        const end = a + sign * 0.65;
        ctx.beginPath();
        ctx.arc(wind.x, wind.y, radius, a, end, sign < 0);
        ctx.stroke();
        arrowhead(ctx, wind.x + Math.cos(end) * radius, wind.y + Math.sin(end) * radius, end + sign * Math.PI / 2);
      }
    } else {
      const angle = Math.atan2(wind.velocityY, wind.velocityX);
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const length = Math.min(9, Math.abs(ux) * wind.width + Math.abs(uy) * wind.height);
      const breadth = Math.min(6, Math.abs(uy) * wind.width + Math.abs(ux) * wind.height);
      const baseX = wind.fan?.x ?? wind.x - ux * length / 2;
      const baseY = wind.fan?.y ?? wind.y - uy * length / 2;
      for (let i = -1; i <= 1; i++) {
        const offset = i * breadth * 0.25;
        const travel = (time * 2 + (i + 1) * 0.3) % 2;
        const x = baseX + ux * (2 + travel) - uy * offset;
        const y = baseY + uy * (2 + travel) + ux * offset;
        const endX = x + ux * length * 0.55, endY = y + uy * length * 0.55;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        arrowhead(ctx, endX, endY, angle);
      }
      if (wind.fan) {
        const fan = wind.fan;
        ctx.globalAlpha = 1;
        ctx.translate(fan.x, fan.y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.strokeStyle = '#c7a4ff';
        ctx.fillStyle = '#392064';
        ctx.shadowColor = '#af78ff';
        ctx.shadowBlur = scale > 8 ? 9 : 0;
        ctx.beginPath();
        ctx.ellipse(0, 0.55, fan.radius, fan.radius * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, fan.radius, fan.radius * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#e4d4ff';
        const pulse = wind.pulse ?? 0;
        const rotation = 8 * (time * (1 - pulse / 2) + pulse / 2 * (Math.cos(wind.phase ?? 0) - Math.cos(phase)) / frequency);
        for (let blade = 0; blade < 6; blade++) {
          const a = rotation + blade * Math.PI / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * fan.radius * 0.85, Math.sin(a) * fan.radius * 0.27);
          ctx.stroke();
        }
        ctx.fillStyle = '#f1e6ff';
        ctx.beginPath();
        ctx.arc(0, 0, 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function arrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(angle - 0.55) * 0.8, y - Math.sin(angle - 0.55) * 0.8);
  ctx.lineTo(x - Math.cos(angle + 0.55) * 0.8, y - Math.sin(angle + 0.55) * 0.8);
  ctx.closePath();
  ctx.fill();
}
