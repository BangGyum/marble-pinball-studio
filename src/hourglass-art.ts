import type { StageDef } from './data/maps';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const backgrounds = new WeakMap<StageDef, Map<number, OffscreenCanvas>>();

export function drawHourglassArt(ctx: Context, stage: StageDef) {
  if (typeof OffscreenCanvas === 'undefined') { paint(ctx, stage); return; }
  const t = ctx.getTransform(), resolution = Math.min(24, Math.max(8, Math.ceil(Math.hypot(t.a, t.b) / 8) * 8));
  let textures = backgrounds.get(stage);
  if (!textures) { textures = new Map(); backgrounds.set(stage, textures); }
  let canvas = textures.get(resolution);
  const width = (stage.width ?? 64) + 4, height = stage.goalY + 36;
  if (!canvas) {
    canvas = new OffscreenCanvas(Math.ceil(width * resolution), Math.ceil(height * resolution));
    const background = canvas.getContext('2d')!;
    background.setTransform(resolution, 0, 0, resolution, 2 * resolution, 32 * resolution);
    paint(background, stage); textures.set(resolution, canvas);
  }
  ctx.drawImage(canvas, -2, -32, width, height);
}

function paint(ctx: Context, stage: StageDef) {
  ctx.save();
  ctx.strokeStyle = '#223c52'; ctx.fillStyle = '#0b1728'; ctx.lineWidth = 0.12;
  for (const x of [24.8, 38]) {
    ctx.fillRect(x - 0.3, 7, 0.6, 76); ctx.strokeRect(x - 0.3, 7, 0.6, 76);
    for (let y = 13; y < 82; y += 9) {
      const side = x < 32 ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * 9, y + 2);
      ctx.lineTo(x + side * 9, y + 4); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + side * 9, y + 2); ctx.stroke();
    }
  }
  ctx.beginPath();
  for (const points of stage.art!.contours) {
    ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
  }
  const glass = ctx.createLinearGradient(14, 6, 48, 87);
  glass.addColorStop(0, '#061a22'); glass.addColorStop(0.4, '#08151e');
  glass.addColorStop(0.7, '#09222b'); glass.addColorStop(1, '#102938');
  ctx.fillStyle = glass; ctx.fill('evenodd');
  ctx.save(); ctx.clip('evenodd');
  // Deterministic golden grains are scenery, cached once and never consume the race RNG.
  let seed = 416;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 1900; i++) {
    const x = 14 + random() * 36, y = 9 + random() * 46;
    if (y > 27 && y < 34 || Math.abs(x - 32) < 3.5) continue;
    ctx.fillStyle = i % 4 ? '#d7a24240' : '#ffcf7566';
    const r = 0.02 + random() * 0.035; ctx.fillRect(x, y, r, r);
  }
  ctx.strokeStyle = '#ffd47b12'; ctx.lineWidth = 0.11;
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(32 + side * 4, 58);
    ctx.bezierCurveTo(32 + side * 4, 63, 32 + side * 21, 64, 32 + side * 16, 72);
    ctx.bezierCurveTo(32 + side * 13, 77, 32 + side * 6, 77, 32 + side * 6, 83); ctx.stroke();
  }
  ctx.restore();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#64f4e0';
  ctx.shadowColor = '#32e8ce'; ctx.shadowBlur = 8; ctx.lineWidth = 0.46;
  for (const e of stage.entities ?? []) {
    const s = e.shape;
    if (s.type !== 'polyline' || s.solid) continue;
    ctx.beginPath(); ctx.moveTo(...s.points[0]); s.points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.textAlign = 'center'; ctx.fillStyle = '#a4fff0'; ctx.font = '700 1.35px system-ui';
  ctx.fillText('START', 32, 2.9);
  ctx.strokeStyle = '#7efce5'; ctx.lineWidth = 0.25;
  for (const y of [4.5, 5.2]) {
    ctx.beginPath(); ctx.moveTo(31.4, y); ctx.lineTo(32, y + 0.5); ctx.lineTo(32.6, y); ctx.stroke();
  }
  ctx.font = '700 1.1px system-ui'; ctx.textAlign = 'left'; ctx.fillText('네온 모래시계', 42, 2.8);
  ctx.font = '600 0.9px system-ui'; ctx.fillStyle = '#dce9ff'; ctx.fillText('쌓였다가 폭발', 3, 20.5);
  ctx.strokeStyle = '#b6d9e5'; ctx.lineWidth = 0.08;
  ctx.beginPath(); ctx.moveTo(12.5, 20.2); ctx.lineTo(19.5, 20.2); ctx.lineTo(27.2, 26.5); ctx.stroke();
  ctx.fillText('숨은 우회로', 54, 44.5);
  ctx.beginPath(); ctx.moveTo(53.5, 44.2); ctx.lineTo(52.7, 44.2); ctx.lineTo(50.7, 45.7); ctx.stroke();
  for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
    ctx.fillStyle = (row + col) % 2 ? '#0a141c' : '#d9fff5';
    ctx.fillRect(21.3 + col * 1.3375, stage.goalY - 1.5 + row * 0.75, 1.3375, 0.75);
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#a4fff0'; ctx.font = '700 1.35px system-ui'; ctx.fillText('» FINISH »', 32, stage.goalY + 2);
  ctx.restore();
}
