import type { StageDef } from './data/maps';
import { clockWheels } from './data/chaos-clocktower';

export function drawArcadeArt(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, stage: StageDef) {
  const clock = stage.art!.style === 'clocktower', end = stage.goalY;
  ctx.save();
  ctx.beginPath();
  for (const points of stage.art!.contours) {
    ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
  }
  const fill = ctx.createLinearGradient(0, 0, 48, end);
  fill.addColorStop(0, '#0b1c2a'); fill.addColorStop(0.5, '#090c19'); fill.addColorStop(1, '#102934');
  ctx.fillStyle = fill; ctx.fill();
  ctx.save();
  ctx.lineWidth = 0.12; ctx.strokeStyle = '#283656';
  for (const x of [3, 45]) {
    ctx.beginPath(); ctx.moveTo(x, 11); ctx.lineTo(x, end);
    ctx.moveTo(x + 1, 11); ctx.lineTo(x + 1, end); ctx.stroke();
    for (let y = 14; y < end; y += 5) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y + 2.5); ctx.lineTo(x, y + 5); ctx.stroke();
    }
  }
  if (clock) {
    for (const wheel of clockWheels) {
      const r = wheel.radius + 0.7;
      ctx.strokeStyle = '#65578a'; ctx.lineWidth = 0.09;
      for (const radius of [r, r + 0.5, 1.6, 2]) {
        ctx.beginPath(); ctx.arc(wheel.x, wheel.y, radius, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = 0; i < 48; i++) {
        const a = i * Math.PI / 24, outer = r - (i % 4 ? 0.3 : 0.7);
        ctx.beginPath(); ctx.moveTo(wheel.x + Math.cos(a) * r, wheel.y + Math.sin(a) * r);
        ctx.lineTo(wheel.x + Math.cos(a) * outer, wheel.y + Math.sin(a) * outer); ctx.stroke();
      }
    }
  } else {
    ctx.strokeStyle = '#235061'; ctx.lineWidth = 0.12;
    for (let row = 0; row < 3; row++) for (const side of [1, -1]) {
      const y = 20 + row * 18 + (side === -1 ? 9 : 0);
      const mirror = (x: number) => side === 1 ? x : 48 - x;
      ctx.fillStyle = '#12303c'; ctx.beginPath(); ctx.moveTo(mirror(2), y);
      ctx.lineTo(mirror(7), y + 2); ctx.lineTo(mirror(22), y + 7); ctx.lineTo(mirror(22), y + 8);
      ctx.lineTo(mirror(2), y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.setLineDash([0.35, 0.4]);
    ctx.strokeStyle = '#a769dd60';
    for (const e of stage.entities ?? []) if (e.props.sliding && e.shape.type === 'box') {
      const reach = e.props.sliding.amplitude + e.shape.width;
      ctx.beginPath(); ctx.moveTo(e.position.x - reach, e.position.y);
      ctx.lineTo(e.position.x + reach, e.position.y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.textAlign = 'center'; ctx.fillStyle = '#86f9eb'; ctx.font = '700 1.25px system-ui';
  ctx.fillText('START', 24, 9.6);
  ctx.font = '600 0.9px system-ui'; ctx.fillStyle = '#d7adff';
  if (clock) {
    ctx.fillText('엇박자 회전', 36, 24); ctx.fillText('한꺼번에 방출', 24, 91);
  } else {
    ctx.fillText('연쇄 점프', 24, 18); ctx.fillText('낙하 역전', 24, 74);
  }
  const x = clock ? 20 : 21, size = clock ? 0.8 : 0.6;
  for (let row = 0; row < 2; row++) for (let col = 0; col < 10; col++) {
    ctx.fillStyle = (row + col) % 2 ? '#111925' : '#d4fff8';
    ctx.fillRect(x + col * size, end - 2 * size + row * size, size, size);
  }
  ctx.fillStyle = '#86f9eb'; ctx.font = '700 1px system-ui'; ctx.fillText('FINISH', 24, end + 1.5);
  ctx.restore();
}
