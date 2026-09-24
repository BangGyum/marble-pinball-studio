import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = [number, number];
const cache = new WeakMap<StageDef, { canvas: OffscreenCanvas; textured: boolean }>();
const path = (ctx: Context, points: Point[]) => {
  ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
};

function paintCanyon(ctx: Context, stage: StageDef, texture?: HTMLImageElement) {
  const contours = stage.art!.contours, width = stage.width ?? 64, height = stage.goalY + 7;
  ctx.save();
  const voidLight = ctx.createLinearGradient(0, 0, width, 0);
  voidLight.addColorStop(0, '#08120e'); voidLight.addColorStop(0.48, '#030609'); voidLight.addColorStop(1, '#100b1b');
  ctx.fillStyle = voidLight; ctx.fillRect(0, -32, width, height + 32);
  // Both the rock fill and the physics use these same contours.
  ctx.beginPath(); ctx.rect(0, -32, width, height + 32); path(ctx, contours[0]);
  contours.slice(1).forEach(p => path(ctx, p));
  ctx.save(); ctx.clip('evenodd');
  ctx.fillStyle = '#141822'; ctx.fillRect(0, -32, width, height + 32);
  if (texture) {
    ctx.globalAlpha = 0.85;
    for (let y = -32; y < height; y += 24) for (let x = 0; x < width; x += 24)
      ctx.drawImage(texture, x, y, 24, 24);
    ctx.globalAlpha = 1;
  }
  // Large facets keep the rock silhouette legible at both overview and close zoom.
  for (let i = 0; i < 210; i++) {
    const x = ((i * 17.31) % width), y = -25 + ((i * 11.73) % (height + 25));
    const size = 1.2 + (i % 5) * 0.63;
    ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y + size * 0.4);
    ctx.lineTo(x - size * 0.4, y + size * 1.4); ctx.closePath();
    ctx.fillStyle = i % 3 ? '#03071038' : '#c6b4ff12'; ctx.fill();
    if (i % 5 === 0) {
      ctx.strokeStyle = x < width / 2 ? '#98ff634a' : '#aa78ff50'; ctx.lineWidth = 0.045; ctx.stroke();
    }
  }
  const shade = ctx.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, '#020407ce'); shade.addColorStop(0.15, '#00000000');
  shade.addColorStop(0.85, '#00000000'); shade.addColorStop(1, '#020407ce');
  ctx.fillStyle = shade; ctx.fillRect(0, -32, width, height + 32);
  ctx.restore();
  // A wide dark bevel, colored rim and hairline follow the playable boundary exactly.
  contours.forEach((points, i) => {
    ctx.beginPath(); path(ctx, points);
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#00000099'; ctx.lineWidth = 0.55; ctx.stroke();
    ctx.strokeStyle = i % 2 ? '#8cb95755' : '#9a73c755'; ctx.lineWidth = 0.28; ctx.stroke();
  });
  for (const [x, y, angle] of stage.art!.arrows ?? []) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.strokeStyle = x < 32 ? '#aeff78' : '#c89aff'; ctx.lineWidth = 0.14;
    for (const offset of [-0.7, 0, 0.7]) {
      ctx.beginPath(); ctx.moveTo(offset - 0.3, -0.45); ctx.lineTo(offset + 0.2, 0); ctx.lineTo(offset - 0.3, 0.45); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.font = '700 0.65px system-ui'; ctx.fillStyle = '#a3b9aa';
  ctx.fillText('FRACTURE', 13.5, 6); ctx.fillStyle = '#b0a2c4'; ctx.fillText('CANYON', 50.5, 6);
  // The painted finish has an open bottom, matching the real exit.
  for (let row = 0; row < 2; row++) for (let col = 0; col < 12; col++) {
    ctx.fillStyle = (row + col) % 2 ? '#0a1210' : '#a9d6a9';
    ctx.fillRect(29 + col * 0.5, stage.goalY - 1.1 + row * 0.5, 0.5, 0.5);
  }
  ctx.restore();
}

export function drawCanyonArt(ctx: Context, stage: StageDef, cacheBackground = true) {
  const texture = typeof document === 'undefined' ? undefined
    : document.getElementById('canyon-rock-texture') as HTMLImageElement | null;
  const textured = !!texture?.complete && !!texture.naturalWidth;
  if (!cacheBackground || typeof OffscreenCanvas === 'undefined') { paintCanyon(ctx, stage, textured ? texture! : undefined); return; }
  let stored = cache.get(stage);
  if (!stored || stored.textured !== textured) {
    const density = 20, width = stage.width ?? 64, height = stage.goalY + 39;
    const canvas = new OffscreenCanvas(Math.ceil(width * density), Math.ceil(height * density));
    const c = canvas.getContext('2d')!;
    c.scale(density, density); c.translate(0, 32);
    paintCanyon(c, stage, textured ? texture! : undefined);
    stored = { canvas, textured }; cache.set(stage, stored);
  }
  ctx.drawImage(stored.canvas, 0, -32, stage.width ?? 64, stage.goalY + 39);
}

function bridgeDeck(ctx: Context, a: Point, b: Point, color: string) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  ctx.save(); ctx.translate(...a); ctx.rotate(Math.atan2(dy, dx));
  const side = dx > 0 ? 1 : -1;
  const metal = ctx.createLinearGradient(0, 0, 0, side * 0.8);
  metal.addColorStop(0, color); metal.addColorStop(0.16, '#dae4d4'); metal.addColorStop(0.35, '#334138'); metal.addColorStop(1, '#0a1016');
  ctx.fillStyle = metal; ctx.fillRect(0, Math.min(0, side * 0.8), length, 0.8);
  ctx.fillStyle = '#04060c';
  for (let x = 0.65; x < length - 0.65; x += 1.25) {
    ctx.beginPath(); ctx.ellipse(x, side * 0.44, 0.38, 0.11, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = color; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
  ctx.restore();
}

export function drawCanyonDevices(ctx: Context, entities: MapEntityState[], scale: number) {
  ctx.save(); ctx.shadowBlur = 0;
  for (const e of entities) {
    const s = e.shape;
    if (s.hidden) continue;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle);
    if (s.type === 'polyline' && s.points.length === 2 && Math.abs(s.points[1][0] - s.points[0][0]) > 12) {
      bridgeDeck(ctx, s.points[0], s.points[1], s.points[0][0] < s.points[1][0] ? '#a6ff63' : '#b58aff');
    } else if (s.type === 'polyline' && s.solid) {
      bridgeDeck(ctx, s.points[0], s.points[1], '#b58aff');
      ctx.beginPath(); ctx.arc(0, 0, 0.38, 0, Math.PI * 2); ctx.fillStyle = '#9b7fc5'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 0.17, 0, Math.PI * 2); ctx.fillStyle = '#16231b'; ctx.fill();
    } else if (s.type === 'box' && s.boostSpeed === undefined) {
      ctx.rotate(s.rotation);
      const material = ctx.createLinearGradient(0, -s.height, 0, s.height);
      material.addColorStop(0, '#f0fff1'); material.addColorStop(0.45, s.color ?? '#a6ff63'); material.addColorStop(1, '#243228');
      ctx.fillStyle = material; ctx.fillRect(-s.width, -s.height, s.width * 2, s.height * 2);
      ctx.fillStyle = '#12191d'; ctx.beginPath(); ctx.arc(0, 0, 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#caffe1'; ctx.lineWidth = 0.06 + 0.3 / scale; ctx.stroke();
    } else if (s.type === 'box' && s.boostSpeed !== undefined && s.rotation < 0) {
      // The spring is drawn behind the accelerating pad, along its actual impulse direction.
      ctx.rotate(s.rotation); ctx.strokeStyle = '#c7ff94'; ctx.lineWidth = 0.13;
      ctx.beginPath(); ctx.moveTo(-2.3, 0);
      for (let i = 0; i < 13; i++) ctx.lineTo(-2.3 + i * 0.11, i % 2 ? 0.4 : -0.4);
      ctx.lineTo(-0.9, 0); ctx.stroke();
      ctx.fillStyle = '#81aa6e'; ctx.fillRect(-2.5, -0.55, 0.2, 1.1);
    }
    ctx.restore();
  }
  ctx.restore();
}
