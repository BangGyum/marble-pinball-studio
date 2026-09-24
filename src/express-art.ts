import type { StageDef } from './data/maps';
import { expressGates, expressTracks, type Railway } from './data/switchback-express';
import type { MapEntityState } from './types/MapEntity.type';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = [number, number];
const tau = Math.PI * 2, cache = new WeakMap<StageDef, OffscreenCanvas>();
function path(ctx: Context, points: Point[]) {
  ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p));
}
function metal(ctx: Context, x: number, y: number, size: number, gold = false) {
  const gradient = ctx.createLinearGradient(x, y - size, x + size * 0.4, y + size);
  ['#f1f7f8', '#7b909d', '#203340', '#9bacb6', '#25333c'].forEach((c, i) =>
    gradient.addColorStop(i / 4, gold ? ['#fff2c0', '#bc9150', '#463420', '#e3bf77', '#4d3824'][i] : c));
  return gradient;
}
function bolt(ctx: Context, x: number, y: number, radius = 0.11) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, tau); ctx.fillStyle = '#b8cbd4'; ctx.fill();
  ctx.strokeStyle = '#26343d'; ctx.lineWidth = 0.045;
  path(ctx, [[x - radius * 0.5, y], [x + radius * 0.5, y]]); ctx.stroke();
}
function samples(track: Railway, spacing: number, callback: (x: number, y: number, angle: number, index: number) => void) {
  let next = 0, distance = 0, index = 0;
  for (let i = 1; i < track.points.length; i++) {
    const a = track.points[i - 1], b = track.points[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    while (next <= distance + length) {
      const t = (next - distance) / length;
      callback(a[0] + dx * t, a[1] + dy * t, Math.atan2(dy, dx), index++); next += spacing;
    }
    distance += length;
  }
}
function plate(ctx: Context, x: number, y: number, width: number, title: string, subtitle = '') {
  const h = subtitle ? 3.2 : 2;
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = metal(ctx, 0, 0, h, true);
  ctx.beginPath(); ctx.roundRect(-width / 2, -h / 2, width, h, 0.4); ctx.fill();
  ctx.fillStyle = '#0a141d'; ctx.beginPath(); ctx.roundRect(-width / 2 + 0.16, -h / 2 + 0.16, width - 0.32, h - 0.32, 0.3); ctx.fill();
  ctx.strokeStyle = '#ddc28b'; ctx.lineWidth = 0.045; ctx.stroke();
  ctx.fillStyle = '#f9ddab'; ctx.font = '700 0.84px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(title, 0, subtitle ? -0.08 : 0.28);
  if (subtitle) { ctx.font = '500 0.44px system-ui'; ctx.fillStyle = '#9db5c0'; ctx.fillText(subtitle, 0, 0.96); }
  for (const side of [-1, 1]) bolt(ctx, side * (width / 2 - 0.5), 0);
  ctx.restore();
}
function pine(ctx: Context, x: number, y: number, height: number) {
  ctx.fillStyle = '#253027'; ctx.fillRect(x - 0.09, y - height, 0.18, height);
  for (let i = 0; i < 4; i++) {
    const w = height * (0.14 + i * 0.07), top = y - height + i * height * 0.15;
    path(ctx, [[x, top], [x + w, top + height * 0.43], [x - w, top + height * 0.43]]); ctx.closePath();
    ctx.fillStyle = ['#203e38', '#1e3933', '#18332f', '#122a27'][i]; ctx.fill();
  }
}
function paint(ctx: Context, stage: StageDef) {
  ctx.save();
  // Arched viaducts sit behind the track; they never masquerade as playable ledges.
  for (const [x, y] of [[13, 13], [43, 18], [19, 38], [42, 60], [20, 82], [42, 106]]) {
    ctx.fillStyle = '#101b24'; ctx.fillRect(x - 1.1, y + 2, 2.2, 11);
    ctx.fillStyle = '#1a2b38'; ctx.fillRect(x - 1.1, y + 2, 0.35, 11);
    ctx.strokeStyle = '#45515b'; ctx.lineWidth = 0.1;
    for (let k = 0; k < 5; k++) { path(ctx, [[x - 1, y + 3 + k * 2], [x + 1, y + 3 + k * 2]]); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x + 1, y + 4); ctx.bezierCurveTo(x + 4, y + 4, x + 4, y + 8, x + 4, y + 11);
    ctx.strokeStyle = '#21323e'; ctx.lineWidth = 0.6; ctx.stroke();
  }
  // Repeated steel trestles follow the underside of each long run.
  for (const [start, end] of [[18,34], [50,66], [82,98], [114,130], [146,162]]) {
    const points = expressTracks[0].points.slice(start, end);
    samples({points, halfWidth:0}, 5.3, (x, y) => {
      ctx.fillStyle = '#17242e'; ctx.fillRect(x - 0.44, y + 3.2, 0.88, 6.7);
      ctx.fillStyle = '#32434f'; ctx.fillRect(x - 0.44, y + 3.2, 0.15, 6.7);
      ctx.fillStyle = metal(ctx, x, y + 9.6, 0.35); ctx.fillRect(x - 0.8, y + 9.6, 1.6, 0.45);
      ctx.strokeStyle = '#40515b'; ctx.lineWidth = 0.13;
      path(ctx, [[x - 0.3, y + 4], [x + 0.3, y + 7], [x - 0.3, y + 9]]); ctx.stroke();
      for (let k = 0; k < 3; k++) bolt(ctx, x, y + 4.1 + k * 1.8, 0.085);
    });
  }
  // Deterministic faceted rock clusters and tiny pines give the trestles depth.
  for (const [x, y, size] of [[6, 22, 4], [47, 42, 5], [12, 61, 4], [46, 84, 5], [11, 112, 4], [43, 131, 3]]) {
    for (let n = 0; n < 9; n++) {
      const px = x + Math.sin(n * 13.7) * size, py = y + Math.cos(n * 7.1) * size;
      const r = size * (0.18 + (n % 3) * 0.09);
      const points: Point[] = [[px - r, py], [px - r * 0.6, py - r], [px + r * 0.4, py - r * 1.2], [px + r, py - r * 0.1], [px + r * 0.3, py + r * 0.7]];
      path(ctx, points); ctx.closePath(); ctx.fillStyle = n % 2 ? '#26313e' : '#1a2833'; ctx.fill();
      path(ctx, [points[1], points[2], [px, py]]); ctx.closePath(); ctx.fillStyle = '#384957'; ctx.fill();
      ctx.strokeStyle = '#090f16'; ctx.lineWidth = 0.08; ctx.stroke();
    }
    pine(ctx, x, y - 1, 3); pine(ctx, x + 2, y + 1, 2.2);
  }
  ctx.beginPath();
  for (const points of stage.art!.contours) {
    ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
  }
  ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#142831'; ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath();
  for (const points of stage.art!.contours) { ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath(); }
  ctx.clip();
  for (const [index, track] of expressTracks.entries()) {
    samples(track, 1.05, (x, y, angle) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = '#080f15'; ctx.fillRect(-0.35, -track.halfWidth + 0.15, 0.7, track.halfWidth * 2 - 0.3);
      const wood = ctx.createLinearGradient(-0.24, 0, 0.24, 0);
      wood.addColorStop(0, '#8d6748'); wood.addColorStop(0.25, '#665039'); wood.addColorStop(1, '#2c2824');
      ctx.fillStyle = wood; ctx.fillRect(-0.24, -track.halfWidth + 0.25, 0.48, track.halfWidth * 2 - 0.5);
      for (const side of [-1, 1]) bolt(ctx, 0, side * (track.halfWidth - 0.5), 0.08);
      ctx.restore();
    });
    // Thin floor inlays, visually distinct from cyan collision rails.
    path(ctx, track.points); ctx.strokeStyle = index ? '#dcba6950' : '#72e5e51c'; ctx.lineWidth = track.halfWidth * 1.5; ctx.stroke();
    samples(track, 0.35, (x, y, angle) => {
      const nx = -Math.sin(angle), ny = Math.cos(angle), dx = Math.cos(angle) * 0.22, dy = Math.sin(angle) * 0.22;
      for (const side of [-1, 1]) {
        const offset = side * (track.halfWidth - 0.65);
        path(ctx, [[x + nx * offset - dx, y + ny * offset - dy], [x + nx * offset + dx, y + ny * offset + dy]]);
        ctx.strokeStyle = '#a6c3c9'; ctx.lineWidth = 0.1; ctx.stroke();
      }
    });
  }
  ctx.restore();
  // The rail bevel uses exactly the same side and depth as the collision backing.
  for (const e of stage.entities ?? []) {
    const shape = e.shape;
    if (e.type !== 'static' || shape.type !== 'polyline' || shape.hidden) continue;
    const points = shape.points, depth = shape.backing ?? 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = (b[1] - a[1]) / length * depth, ny = (a[0] - b[0]) / length * depth;
      path(ctx, [a, b, [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]]); ctx.closePath();
      ctx.fillStyle = metal(ctx, a[0], a[1], 0.7); ctx.fill();
    }
    path(ctx, points); ctx.lineWidth = 0.3; ctx.strokeStyle = '#07262e'; ctx.stroke();
    ctx.lineWidth = 0.14; ctx.strokeStyle = shape.color!; ctx.shadowColor = shape.color!; ctx.shadowBlur = 9; ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 0.035; ctx.strokeStyle = '#e4ffff'; ctx.stroke();
    samples({points, halfWidth: 0}, 5.5, (x, y, angle) => {
      if (y < 0 || y > stage.goalY + 2) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = metal(ctx, 0, 0, 0.7); ctx.fillRect(-0.18, -0.15, 0.36, Math.sign(depth) * -0.85);
      bolt(ctx, 0, Math.sign(depth) * -0.48, 0.1); ctx.restore();
    });
  }
  // Warm platform lamps, signal furniture and destination signs.
  for (const [x, y] of [[18, 9], [43, 13], [41, 38], [18, 57], [43, 82], [18, 102], [46, 127]]) {
    ctx.fillStyle = '#7f7968'; ctx.fillRect(x - 0.09, y, 0.18, 1.6);
    ctx.fillStyle = '#1b242b'; ctx.fillRect(x - 0.36, y - 0.8, 0.72, 1.1);
    ctx.fillStyle = '#ffd68a'; ctx.shadowColor = '#ffae49'; ctx.shadowBlur = 12;
    ctx.fillRect(x - 0.2, y - 0.68, 0.4, 0.75); ctx.shadowBlur = 0;
  }
  // The departure gantry frames the waiting marbles without covering them.
  for (const x of [6.1, 13.4]) {
    ctx.fillStyle = metal(ctx, x, 2, 1); ctx.fillRect(x, -0.5, 0.5, 7.5);
    for (let y = 0; y < 7; y += 1.6) bolt(ctx, x + 0.25, y);
  }
  plate(ctx, 10, 2.4, 8.5, '501', 'NOT IMPLEMENTED');
  ctx.save(); ctx.translate(35, 3.5); ctx.scale(1.3, 1.3);
  plate(ctx, 0, 0, 27, '스위치백 익스프레스', 'HTTP STATUS RUN · 501 → 200'); ctx.restore();
  plate(ctx, 17, 25, 10, '500', 'INTERNAL SERVER ERROR'); plate(ctx, 46, 39, 9, '429', 'TOO MANY REQUESTS');
  plate(ctx, 30, 46, 17, '404', 'NOT FOUND · RECONNECTING');
  plate(ctx, 32, 69, 13, '307', 'TEMPORARY REDIRECT'); plate(ctx, 39, 91, 9, '302', 'FOUND · TAKE A TURN');
  plate(ctx, 30, 113, 16, '201', 'CREATED · ALMOST THERE');
  plate(ctx, 32, 142, 10, '200 OK', 'REQUEST COMPLETE');
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
    ctx.fillStyle = (row + col) % 2 ? '#17212b' : '#e7f0eb';
    ctx.fillRect(28.6 + col * 0.85, stage.goalY - 3.4 + row * 0.85, 0.85, 0.85);
  }
  ctx.restore();
}
export function drawExpressArt(ctx: Context, stage: StageDef, cacheBackground = true) {
  if (!cacheBackground || typeof OffscreenCanvas === 'undefined') { paint(ctx, stage); return; }
  let canvas = cache.get(stage);
  if (!canvas) {
    const density = 36;
    canvas = new OffscreenCanvas((stage.width ?? 64) * density, (stage.goalY + 35) * density);
    const target = canvas.getContext('2d')!; target.scale(density, density); target.translate(0, 30);
    paint(target, stage); cache.set(stage, canvas);
  }
  ctx.drawImage(canvas, 0, -30, stage.width ?? 64, stage.goalY + 35);
}
export function drawExpressDevices(ctx: Context, entities: MapEntityState[]) {
  ctx.save();
  for (const e of entities) {
    const shape = e.shape;
    if (shape.type === 'box' && shape.boostSpeed === undefined) {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle + shape.rotation);
      ctx.beginPath(); ctx.arc(0, 0, 0.55, 0, tau); ctx.fillStyle = '#233847'; ctx.fill();
      ctx.fillStyle = metal(ctx, 0, 0, 0.65, true);
      ctx.beginPath(); ctx.roundRect(-shape.width, -shape.height, shape.width * 2, shape.height * 2, 0.12); ctx.fill();
      ctx.strokeStyle = '#fff1cb'; ctx.lineWidth = 0.06; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.24, 0, tau); ctx.fillStyle = metal(ctx, 0, 0, 0.3); ctx.fill();
      bolt(ctx, 0, 0); ctx.restore();
    } else if (shape.type === 'circle') {
      const r = shape.radius;
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, tau); ctx.fillStyle = metal(ctx, 0, 0, r); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, tau); ctx.fillStyle = '#6d3228'; ctx.fill();
      ctx.strokeStyle = '#ffe4ae'; ctx.lineWidth = 0.09; ctx.stroke();
      const star: Point[] = Array.from({length:10}, (_, i) => {
        const a = i * Math.PI / 5 - Math.PI / 2, radius = r * (i % 2 ? 0.28 : 0.62);
        return [Math.cos(a) * radius, Math.sin(a) * radius];
      });
      path(ctx, star); ctx.closePath(); ctx.fillStyle = metal(ctx, 0, 0, r, true); ctx.fill(); ctx.restore();
    } else if (shape.type === 'polyline' && shape.solid) {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle);
      path(ctx, shape.points); ctx.closePath(); ctx.fillStyle = metal(ctx, 0, 0, 1.8); ctx.fill();
      ctx.strokeStyle = '#e7c68c'; ctx.lineWidth = 0.12; ctx.stroke();
      ctx.save(); ctx.scale(0.8, 0.8); path(ctx, shape.points); ctx.closePath(); ctx.fillStyle = '#112532'; ctx.fill(); ctx.restore();
      path(ctx, [[-0.1, -0.32], [0.55, 0], [-0.1, 0.32]]); ctx.strokeStyle = '#8bffff'; ctx.lineWidth = 0.12; ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.7, 0, 0.28, 0, tau); ctx.fillStyle = metal(ctx, 0, 0, 0.35, true); ctx.fill();
      bolt(ctx, -0.7, 0); ctx.restore();
    } else if (shape.type === 'polyline' && shape.points.length === 2 && !shape.backing) {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle);
      const length = shape.points[1][0];
      ctx.fillStyle = '#f4e0b5'; ctx.fillRect(0, -0.15, length, 0.3);
      ctx.fillStyle = '#b85445';
      for (let x = 0.3; x < length - 0.2; x += 0.8) {
        path(ctx, [[x, -0.15], [x + 0.35, -0.15], [x + 0.65, 0.15], [x + 0.3, 0.15]]); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, 0.4, 0, tau); ctx.fillStyle = metal(ctx, 0, 0, 0.4); ctx.fill(); bolt(ctx, 0, 0);
      ctx.restore();
    }
  }
  for (const gate of expressGates) {
    const live = entities.find(e => e.x === gate.x && e.y === gate.y && e.shape.type === 'polyline');
    const open = Math.abs(live?.angle ?? 0) > 0.75, x = gate.x + 6.5, y = gate.y + 1.5;
    ctx.fillStyle = '#72858b'; ctx.fillRect(x - 0.1, y, 0.2, 3.6);
    ctx.fillStyle = '#15212a'; ctx.beginPath(); ctx.roundRect(x - 0.58, y - 1.7, 1.16, 2.5, 0.5); ctx.fill();
    ctx.strokeStyle = '#a6a78b'; ctx.lineWidth = 0.12; ctx.stroke();
    for (let i = 0; i < 2; i++) {
      const active = i === (open ? 1 : 0), color = i ? '#a4ff7b' : '#ff6651';
      ctx.fillStyle = active ? color : '#29332e'; ctx.shadowColor = color; ctx.shadowBlur = active ? 12 : 0;
      ctx.beginPath(); ctx.arc(x, y - 1.05 + i * 1.08, 0.29, 0, tau); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
