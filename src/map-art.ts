import type { StageDef } from './data/maps';
import { drawArcadeArt } from './arcade-art';
import { drawOrbitalArt } from './orbital-art';
import { drawHourglassArt } from './hourglass-art';
import { drawEntities } from './draw';
import type { MapEntityState } from './types/MapEntity.type';

// Draw the elevated exit after the ground-level rings, including on both minimaps.
export function drawMapOverlay(ctx: CanvasRenderingContext2D, stage: StageDef, entities: MapEntityState[], scale: number) {
  if (!stage.exitBridge) return;
  ctx.save();
  if (stage.art?.style === 'orbital-lock') {
    drawOrbitalArt(ctx, stage, 2);
  } else {
    const points = stage.exitBridge.deck;
    ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
    ctx.fillStyle = '#10232f'; ctx.fill();
  }
  drawEntities(ctx, entities.filter(e => e.shape.collisionLayer === 2), scale, -1, scale > 3, undefined, !!stage.art);
  ctx.restore();
}

// Keep a faint silhouette for tracking a marble while it passes beneath the deck.
export function bridgeBallOpacity(stage: StageDef, ball: { x: number; y: number; onBridge?: boolean }) {
  const bridge = stage.exitBridge;
  if (!bridge || ball.onBridge || ball.y <= bridge.entry.y + bridge.entry.height / 2 + 1) return 1;
  let inside = false, distance = Infinity;
  const points = bridge.deck;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
    if ((a[1] > ball.y) !== (b[1] > ball.y) && ball.x < dx * (ball.y - a[1]) / dy + a[0]) inside = !inside;
    const t = Math.max(0, Math.min(1, ((ball.x - a[0]) * dx + (ball.y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(ball.x - a[0] - t * dx, ball.y - a[1] - t * dy));
  }
  return inside ? 1 - 0.78 * Math.min(1, distance / 0.5) : 1;
}

// Pure scenery: these surfaces, beams and lamps never enter the physics world.
export function drawMapArt(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, stage: StageDef, scale: number
) {
  if (!stage.art) return;
  if (stage.art.style === 'hourglass') {
    drawHourglassArt(ctx, stage);
    return;
  }
  if (stage.art.style === 'orbital-lock') {
    drawOrbitalArt(ctx, stage);
    return;
  }
  if (stage.art.style === 'pinball-cascade' || stage.art.style === 'clocktower') {
    drawArcadeArt(ctx, stage);
    return;
  }
  ctx.save();
  const height = stage.goalY, width = stage.width ?? 48;
  if (stage.art.style === 'jackpot') {
    ctx.beginPath();
    for (const points of stage.art.contours) {
      ctx.moveTo(...points[0]);
      for (const point of points.slice(1)) ctx.lineTo(...point);
      ctx.closePath();
    }
    const glow = ctx.createRadialGradient(24, 37, 2, 24, 37, 25);
    glow.addColorStop(0, '#28102a'); glow.addColorStop(0.65, '#111425'); glow.addColorStop(1, '#0a2026');
    ctx.fillStyle = glow; ctx.fill('evenodd');
    ctx.strokeStyle = '#ef64d82b'; ctx.lineWidth = 0.08;
    for (const r of [2, 12.8, 14.9]) {
      ctx.beginPath(); ctx.arc(24, 37, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.font = '600 0.85px system-ui'; ctx.textAlign = 'center';
    for (const [label, x, y, color] of [
      ['돌풍 발사', 24, 12, '#72eadf'], ['초고속 믹서', 24, 29, '#f5a0e5'],
      ['역풍', 14, 57, '#72eadf'], ['BOOST', 36, 58, '#ffcf67'],
      ['막판 역전', 24, 72, '#ffcf67'],
    ] as const) {
      ctx.fillStyle = color; ctx.fillText(label, x, y);
    }
    ctx.fillStyle = '#c2fff1'; ctx.font = '700 1px system-ui'; ctx.fillText('FINISH', 24, 82);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 10; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#101820' : '#dbfff6';
      ctx.fillRect(21.5 + col * 0.5, 79 + row * 0.5, 0.5, 0.5);
    }
    ctx.restore();
    return;
  }
  for (const x of [6, width - 6]) {
    const metal = ctx.createLinearGradient(x - 0.5, 0, x + 0.5, 0);
    metal.addColorStop(0, '#0a101a'); metal.addColorStop(0.5, '#253747'); metal.addColorStop(1, '#080c13');
    ctx.fillStyle = metal;
    ctx.fillRect(x - 0.4, 15, 0.8, height - 20);
    for (let y = 23; y < height - 7; y += 19) {
      ctx.strokeStyle = '#243646'; ctx.lineWidth = 0.18;
      ctx.beginPath(); ctx.moveTo(x, y + 10);
      ctx.bezierCurveTo(x, y + 4, width / 2, y + 2, width / 2, y + 8); ctx.stroke();
      ctx.fillStyle = '#534330'; ctx.fillRect(x - 0.6, y - 0.25, 1.2, 0.5);
      ctx.shadowColor = '#ffcd79'; ctx.shadowBlur = Math.min(12, scale * 0.5);
      ctx.fillStyle = '#e7ad58'; ctx.fillRect(x - 0.07, y - 2.2, 0.14, 1.8);
      ctx.shadowBlur = 0;
    }
  }
  ctx.beginPath();
  for (const points of stage.art.contours) {
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
  }
  const glass = ctx.createLinearGradient(0, 0, width, height);
  glass.addColorStop(0, '#163143'); glass.addColorStop(0.3, '#0c1927');
  glass.addColorStop(0.6, '#172e3b'); glass.addColorStop(1, '#102636');
  ctx.fillStyle = glass; ctx.fill('evenodd');
  ctx.clip('evenodd');
  // Narrow reflections give the glass depth without hiding the marbles or collision edges.
  ctx.strokeStyle = '#b4eaff0a'; ctx.lineWidth = 0.06;
  for (let y = 10; y < height; y += 2.7) {
    ctx.beginPath(); ctx.moveTo(0, y + 9); ctx.lineTo(width, y - 9); ctx.stroke();
  }
  ctx.strokeStyle = '#b8f2ff90'; ctx.lineWidth = 0.055 + 0.4 / scale;
  for (const [x, y, angle] of stage.art.arrows ?? []) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath();
    for (const offset of [-0.3, 0.3]) {
      ctx.moveTo(offset - 0.25, -0.25); ctx.lineTo(offset + 0.1, 0); ctx.lineTo(offset - 0.25, 0.25);
    }
    ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
