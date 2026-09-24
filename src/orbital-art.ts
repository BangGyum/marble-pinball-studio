import type { StageDef } from './data/maps';
import { orbitalRings, orbitalTransfers } from './data/orbital-lock';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const backgrounds = new WeakMap<StageDef, Map<number, OffscreenCanvas>>();
const bridges = new WeakMap<StageDef, Map<number, OffscreenCanvas>>();
export function drawOrbitalArt(ctx: Context, stage: StageDef, layer: 1 | 2 = 1, cacheBackground = true) {
  const paint = layer === 2 ? paintOrbitalBridge : paintOrbitalArt, cache = layer === 2 ? bridges : backgrounds;
  if (!cacheBackground || typeof OffscreenCanvas === 'undefined') { paint(ctx, stage); return; }
  const transform = ctx.getTransform();
  // Bucket zoom levels and cap texture size; camera movement only blits this static scenery.
  const resolution = Math.min(24, Math.max(8, Math.ceil(Math.hypot(transform.a, transform.b) / 8) * 8));
  let textures = cache.get(stage);
  if (!textures) { textures = new Map(); cache.set(stage, textures); }
  let canvas = textures.get(resolution);
  const width = (stage.width ?? 64) + 4, height = stage.goalY + 36;
  if (!canvas) {
    canvas = new OffscreenCanvas(Math.ceil(width * resolution), Math.ceil(height * resolution));
    const background = canvas.getContext('2d')!;
    background.setTransform(resolution, 0, 0, resolution, 2 * resolution, 32 * resolution);
    paint(background, stage);
    textures.set(resolution, canvas);
  }
  ctx.drawImage(canvas, -2, -32, width, height);
}

function paintOrbitalBridge(ctx: Context, stage: StageDef) {
  if (!stage.exitBridge) return;
  const points = stage.exitBridge.deck;
  const deck = () => {
    ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
  };
  ctx.save();
  // An offset shadow and a shallow fascia separate the overpass from the continuous rings below.
  ctx.save(); ctx.translate(0.8, 1.1); deck();
  ctx.fillStyle = '#02060dd9'; ctx.shadowColor = '#000b'; ctx.shadowBlur = 12;
  ctx.lineWidth = 0.65; ctx.strokeStyle = '#02060d99'; ctx.fill(); ctx.stroke(); ctx.restore();
  for (const entity of stage.entities ?? []) {
    const shape = entity.shape;
    if (shape.type !== 'polyline' || shape.solid || shape.hidden || shape.collisionLayer !== 2) continue;
    ctx.beginPath(); ctx.moveTo(...shape.points[0]); shape.points.slice(1).forEach(p => ctx.lineTo(...p));
    for (const [x, y] of shape.points.slice().reverse()) {
      const lift = Math.min(1, Math.max(0, (y - points[0][1]) / 4));
      ctx.lineTo(x + 0.55 * lift, y + 0.7 * lift);
    }
    ctx.closePath(); ctx.fillStyle = '#153544'; ctx.fill();
    ctx.strokeStyle = '#427083'; ctx.lineWidth = 0.09; ctx.stroke();
  }
  deck();
  const surface = ctx.createLinearGradient(30, 0, 34, 0);
  surface.addColorStop(0, '#254656'); surface.addColorStop(0.18, '#163442');
  surface.addColorStop(0.7, '#122b39'); surface.addColorStop(1, '#203e4d');
  ctx.fillStyle = surface; ctx.fill();
  ctx.save(); deck(); ctx.clip();
  // Fade into the core at the open mouth; no luminous crossbar suggests a closed gate.
  const ramp = ctx.createLinearGradient(0, 46.7, 0, 51);
  ramp.addColorStop(0, '#12344100'); ramp.addColorStop(0.5, '#75c9d226'); ramp.addColorStop(1, '#75c9d200');
  ctx.fillStyle = ramp; ctx.fillRect(30, 46.7, 4, 4.3);
  ctx.strokeStyle = '#b5dfed15'; ctx.lineWidth = 0.04;
  for (let y = 51; y < 89; y += 2) {
    ctx.beginPath(); ctx.moveTo(27, y); ctx.lineTo(48, y); ctx.stroke();
  }
  ctx.restore();
  drawOrbitalRims(ctx, stage, 2);
  ctx.strokeStyle = '#ffd17a'; ctx.lineWidth = 0.16; ctx.setLineDash([0.55, 0.55]);
  ctx.beginPath(); ctx.moveTo(32, 50.5); ctx.lineTo(32, 70); ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = 0.17;
  for (const y of [47.7, 49]) {
    ctx.beginPath(); ctx.moveTo(31.35, y - 0.35); ctx.lineTo(32, y + 0.2); ctx.lineTo(32.65, y - 0.35); ctx.stroke();
  }
  ctx.fillStyle = '#d8f8f5'; ctx.font = '600 0.65px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('상부 출구', 36, 50.5);
  ctx.strokeStyle = '#87b7c3'; ctx.lineWidth = 0.06;
  ctx.beginPath(); ctx.moveTo(35.5, 50.3); ctx.lineTo(34.7, 50.3); ctx.lineTo(34.15, 51); ctx.stroke();
  ctx.fillStyle = '#79b7b5'; ctx.fillText('하부 궤도', 38, 60);
  ctx.beginPath(); ctx.moveTo(37.5, 59.8); ctx.lineTo(36.5, 59.8); ctx.lineTo(36.2, 56.7); ctx.stroke();
  ctx.fillStyle = '#d8f8f5'; ctx.font = '600 0.9px system-ui'; ctx.fillText('찰나의 직행', 48.5, 74);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 10; col++) {
    ctx.fillStyle = (row + col) % 2 ? '#0a141e' : '#d8fff5';
    ctx.fillRect(27 + col * 0.7, stage.goalY - 1.4 + row * 0.7, 0.7, 0.7);
  }
  ctx.fillStyle = '#a9fff2'; ctx.font = '700 1.1px system-ui'; ctx.textAlign = 'center'; ctx.fillText('FINISH', 30.5, 92);
  ctx.restore();
}

function paintOrbitalArt(ctx: Context, stage: StageDef) {
  ctx.save();
  // Steel spokes and mounting brackets sit behind the glass tracks.
  ctx.strokeStyle = '#293a55'; ctx.fillStyle = '#101d31'; ctx.lineWidth = 0.16;
  for (let i = 0; i < 12; i++) {
    ctx.save(); ctx.translate(32, 40); ctx.rotate(i * Math.PI / 6);
    ctx.beginPath(); ctx.moveTo(8, -0.12); ctx.lineTo(28.7, -0.12);
    ctx.moveTo(8, 0.12); ctx.lineTo(28.7, 0.12); ctx.stroke();
    for (const x of [8.5, 12.4, 18.5, 22.4, 28.5]) {
      ctx.fillRect(x - 0.45, -0.7, 0.9, 1.4); ctx.strokeRect(x - 0.45, -0.7, 0.9, 1.4);
      ctx.beginPath(); ctx.arc(x, 0, 0.17, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  for (const x of [7, 57]) {
    ctx.strokeRect(x - 0.35, 56, 0.7, 14);
    ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x < 32 ? 18 : 46, 62); ctx.stroke();
  }
  for (const ring of orbitalRings) {
    ctx.beginPath(); ctx.arc(32, 40, ring.outer, 0, Math.PI * 2);
    if (ring.inner) { ctx.moveTo(32 + ring.inner, 40); ctx.arc(32, 40, ring.inner, 0, Math.PI * 2, true); }
    const fill = ctx.createLinearGradient(4, 12, 60, 68);
    fill.addColorStop(0, '#133445'); fill.addColorStop(0.35, '#091725'); fill.addColorStop(0.65, '#102c3b'); fill.addColorStop(1, '#09131e');
    ctx.fillStyle = fill; ctx.fill('evenodd');
    ctx.strokeStyle = '#557e9333'; ctx.lineWidth = 0.07;
    for (const r of [ring.outer - 0.5, ring.outer - 0.9, ring.inner + 0.5]) {
      ctx.beginPath(); ctx.arc(32, 40, r, 0, Math.PI * 2); ctx.stroke();
    }
    if (ring.inner) {
      const r = (ring.outer + ring.inner) / 2;
      ctx.strokeStyle = '#a475ed'; ctx.lineWidth = 0.24;
      for (const degrees of [35, 135, 220]) {
        ctx.save(); ctx.translate(32, 40); ctx.rotate(degrees * Math.PI / 180);
        for (const y of [-0.8, 0, 0.8]) {
          ctx.beginPath(); ctx.moveTo(r - 0.6, y - 0.45); ctx.lineTo(r, y + 0.2); ctx.lineTo(r + 0.6, y - 0.45); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  ctx.fillStyle = '#102736';
  for (const points of orbitalTransfers) {
    ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(26, -20); ctx.lineTo(38, -20); ctx.lineTo(38, 3); ctx.lineTo(36, 7);
  ctx.lineTo(36, 12); ctx.lineTo(28, 12); ctx.lineTo(28, 7); ctx.lineTo(26, 3); ctx.closePath(); ctx.fill();
  drawOrbitalRims(ctx, stage, 1);
  ctx.textAlign = 'center'; ctx.fillStyle = '#a9fff2'; ctx.font = '700 1.35px system-ui'; ctx.fillText('START', 32, 1.8);
  ctx.font = '700 1.2px system-ui'; ctx.fillText('오비탈 락', 11, 7);
  ctx.textAlign = 'left'; ctx.font = '600 0.9px system-ui'; ctx.fillStyle = '#d8f8f5'; ctx.fillText('회전 탈출', 48, 17.5);
  ctx.strokeStyle = '#d8f8f5'; ctx.lineWidth = 0.08;
  ctx.beginPath(); ctx.moveTo(47.5, 17.3); ctx.lineTo(46.4, 17.3); ctx.lineTo(44.8, 20.2); ctx.stroke();
  ctx.strokeStyle = '#ffc653'; ctx.lineWidth = 0.16; ctx.setLineDash([0.6, 0.55]);
  ctx.beginPath(); ctx.moveTo(42.5, 19.7); ctx.lineTo(35.3, 33.3); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

export function drawOrbitalRims(ctx: Context, stage: StageDef, layer: 1 | 2) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#72ffe5'; ctx.shadowColor = '#35e6d1'; ctx.shadowBlur = 9; ctx.lineWidth = 0.4;
  for (const entity of stage.entities ?? []) {
    const shape = entity.shape;
    if (shape.type !== 'polyline' || shape.solid || shape.hidden || (shape.collisionLayer ?? 1) !== layer) continue;
    ctx.beginPath(); ctx.moveTo(...shape.points[0]); shape.points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.stroke();
  }
  ctx.restore();
}
