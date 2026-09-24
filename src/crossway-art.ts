import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const cache = new WeakMap<StageDef, OffscreenCanvas>();
const tau = Math.PI * 2;
const chrome = (ctx: Context, x: number, y: number, radius: number) => {
  const fill = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  fill.addColorStop(0, '#f4fbff'); fill.addColorStop(0.24, '#8a9da9'); fill.addColorStop(0.48, '#263541');
  fill.addColorStop(0.72, '#a2bcc8'); fill.addColorStop(1, '#111c24'); return fill;
};
function paint(ctx: Context, stage: StageDef) {
  ctx.save();
  const outline = stage.art!.contours[0];
  ctx.beginPath(); ctx.moveTo(...outline[0]); outline.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
  ctx.save(); ctx.clip();
  const field = ctx.createLinearGradient(0, 0, 64, 0);
  field.addColorStop(0, '#071b23'); field.addColorStop(0.35, '#070c12');
  field.addColorStop(0.65, '#070c12'); field.addColorStop(1, '#231909');
  ctx.fillStyle = field; ctx.fillRect(0, -30, 64, stage.goalY + 35);
  // The central runway is a floor marking, with rails only where collisions exist.
  const runway = ctx.createLinearGradient(29.5, 0, 34.5, 0);
  runway.addColorStop(0, '#ffa91c45'); runway.addColorStop(0.15, '#bf852d25');
  runway.addColorStop(0.5, '#1e1c17'); runway.addColorStop(0.85, '#bf852d25'); runway.addColorStop(1, '#ffa91c45');
  ctx.fillStyle = runway; ctx.fillRect(29.5, 8, 5, stage.goalY - 8);
  ctx.setLineDash([0.35, 0.65]); ctx.lineWidth = 0.06; ctx.strokeStyle = '#ffc56265';
  for (const x of [29.5, 34.5]) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, stage.goalY); ctx.stroke(); }
  ctx.setLineDash([]);
  // Fine floor inlays distinguish the playfield from the opaque metal rails.
  for (let y = 24; y < 83; y += 14) for (const x of [23, 41]) {
    ctx.beginPath(); ctx.arc(x, y, 0.42, 0, tau); ctx.strokeStyle = '#71879935'; ctx.lineWidth = 0.07; ctx.stroke();
    ctx.fillStyle = '#bacad235'; ctx.fillRect(x - 0.12, y - 0.03, 0.24, 0.06);
  }
  ctx.restore();
  // Metallic backing is offset to the same side as each wall's solid fixtures.
  for (const entity of stage.entities ?? []) {
    const s = entity.shape;
    if (s.type !== 'polyline' || entity.type !== 'static' || s.hidden) continue;
    ctx.save(); ctx.translate(entity.position.x, entity.position.y); ctx.rotate(s.rotation);
    const p = s.points, depth = s.backing ?? 0;
    ctx.lineJoin = 'round';
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!length) continue;
      const nx = (b[1] - a[1]) / length * depth, ny = (a[0] - b[0]) / length * depth;
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(b[0] + nx, b[1] + ny); ctx.lineTo(a[0] + nx, a[1] + ny); ctx.closePath();
      ctx.fillStyle = chrome(ctx, a[0], a[1], 1); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(...p[0]); p.slice(1).forEach(v => ctx.lineTo(...v));
    ctx.strokeStyle = '#091015'; ctx.lineWidth = 0.42; ctx.stroke();
    ctx.strokeStyle = s.color ?? '#39e6ff'; ctx.lineWidth = 0.18; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ecffff'; ctx.lineWidth = 0.04; ctx.stroke();
    // Small mounting clamps follow the existing rail; they are purely decorative.
    for (let i = 5; i < p.length - 3; i += 10) {
      const a = p[i], b = p[i + 1];
      ctx.save(); ctx.translate(...a); ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
      ctx.fillStyle = chrome(ctx, 0, 0, 0.6); ctx.fillRect(-0.18, -0.5, 0.36, 1);
      ctx.strokeStyle = '#c1d4df'; ctx.lineWidth = 0.045; ctx.strokeRect(-0.18, -0.5, 0.36, 1); ctx.restore();
    }
    ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#d7e7ec'; ctx.font = '600 0.72px system-ui';
  ctx.fillText('NEON / CROSSWAY', 32, -1.5);
  ctx.fillStyle = '#90a4b0'; ctx.font = '500 0.4px system-ui'; ctx.fillText('CYAN × AMBER', 32, 0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 10; col++) {
    ctx.fillStyle = (row + col) % 2 ? '#10181c' : '#dfebed';
    ctx.fillRect(29.5 + col * 0.5, stage.goalY - 1.5 + row * 0.5, 0.5, 0.5);
  }
  ctx.restore();
}

export function drawCrosswayArt(ctx: Context, stage: StageDef, cacheBackground = true) {
  if (!cacheBackground || typeof OffscreenCanvas === 'undefined') { paint(ctx, stage); return; }
  let canvas = cache.get(stage);
  if (!canvas) {
    const density = 18; canvas = new OffscreenCanvas((stage.width ?? 64) * density, (stage.goalY + 35) * density);
    const c = canvas.getContext('2d')!; c.scale(density, density); c.translate(0, 30); paint(c, stage); cache.set(stage, canvas);
  }
  ctx.drawImage(canvas, 0, -30, stage.width ?? 64, stage.goalY + 35);
}

export function drawCrosswayDevices(ctx: Context, entities: MapEntityState[]) {
  ctx.save(); ctx.shadowBlur = 0;
  for (const e of entities) {
    const s = e.shape;
    if (s.hidden || (s.type !== 'circle' && !(s.type === 'polyline' && s.solid))) continue;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle);
    if (s.type === 'circle') {
      const r = s.radius;
      ctx.beginPath(); ctx.arc(0, 0.22, r, 0, tau); ctx.fillStyle = '#000a'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, tau); ctx.fillStyle = chrome(ctx, 0, 0, r); ctx.fill();
      ctx.strokeStyle = s.color ?? '#39e6ff'; ctx.lineWidth = 0.19; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, tau); ctx.fillStyle = '#121b24'; ctx.fill();
      ctx.strokeStyle = '#bcd3e0'; ctx.lineWidth = 0.06; ctx.stroke();
      const cap = ctx.createRadialGradient(-r * 0.15, -r * 0.2, 0, 0, 0, r * 0.56);
      cap.addColorStop(0, '#fffbeb'); cap.addColorStop(0.45, '#fff0b4'); cap.addColorStop(0.65, '#a17535'); cap.addColorStop(1, '#182633');
      ctx.beginPath(); ctx.arc(0, 0, r * 0.56, 0, tau); ctx.fillStyle = cap; ctx.fill();
    } else if (s.type === 'polyline') {
      ctx.rotate(s.rotation); ctx.beginPath(); ctx.moveTo(...s.points[0]); s.points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
      ctx.fillStyle = chrome(ctx, 0, 0, 3); ctx.fill(); ctx.strokeStyle = s.color ?? '#ffbf45'; ctx.lineWidth = 0.18; ctx.stroke();
      ctx.save(); ctx.scale(0.76, 0.76); ctx.beginPath(); ctx.moveTo(...s.points[0]); s.points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
      ctx.fillStyle = '#0b1823'; ctx.fill(); ctx.strokeStyle = '#b8e8f1'; ctx.lineWidth = 0.08; ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, 0.37, 0, tau); ctx.fillStyle = '#aabdc9'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 0.16, 0, tau); ctx.fillStyle = '#293642'; ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
