import type { StageDef } from './stage-def';
import { twinBowls } from './data/twin-funnel';
import { backgroundCache } from './background-cache';
import { getSceneTheme, sceneColor, sceneGlow } from './scene-theme';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
function path(ctx: Context, points: [number, number][]) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
}
function paint(ctx: Context, stage: StageDef, layer: 1 | 2) {
  const beige = getSceneTheme() === 'beige';
  const bridges = [stage.exitBridge!, ...(stage.exitBridge!.transfers ?? [])];
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (layer === 1) {
    for (const [index, bowl] of twinBowls.entries()) {
      const gradient = ctx.createRadialGradient(bowl.x, bowl.y, 1, bowl.x, bowl.y, 25);
      const colors = beige ? ['#a79882', index ? '#d5c3c0' : '#c3c8c3', '#ece2d0', '#cbbfa9']
        : ['#050a15', index ? '#302238' : '#182a40', index ? '#342b48' : '#1b3c50', '#111d2b'];
      colors.forEach((color, i) => gradient.addColorStop([0, .22, .82, 1][i], color));
      ctx.beginPath(); ctx.arc(bowl.x, bowl.y, 25, 0, Math.PI * 2); ctx.fillStyle = gradient; ctx.fill();
    }
    for (const contour of stage.art!.contours) {
      path(ctx, contour); ctx.closePath(); ctx.fillStyle = beige ? '#fff4da50' : '#b8d9ff0b'; ctx.fill();
    }
  } else {
    // Open throats hide the non-colliding tips of the elevated rails.
    ctx.beginPath(); ctx.rect(0, -30, stage.width ?? 70, stage.goalY + 64);
    for (const bridge of bridges) {
      ctx.moveTo(bridge.entry.x + 3.2, bridge.entry.y);
      ctx.arc(bridge.entry.x, bridge.entry.y, 3.2, 0, Math.PI * 2);
    }
    ctx.clip('evenodd');
    for (const bridge of bridges) {
      path(ctx, bridge.deck); ctx.closePath();
      ctx.fillStyle = beige ? '#d1b98c' : '#3b3428';
      ctx.shadowColor = beige ? '#6a543866' : '#000000'; ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = beige ? '#f3dfb660' : '#fbc66b15'; ctx.fill();
    }
  }
  // Rails follow the collision vertices, including edits made in the map editor.
  for (const entity of stage.entities ?? []) {
    const shape = entity.shape;
    if (shape.type !== 'polyline' || (shape.collisionLayer ?? 1) !== layer) continue;
    ctx.save(); ctx.translate(entity.position.x, entity.position.y); ctx.rotate(shape.rotation);
    path(ctx, shape.points); ctx.lineWidth = .65;
    ctx.strokeStyle = beige ? '#ab9b80' : '#172738'; ctx.stroke();
    ctx.lineWidth = .23;
    ctx.strokeStyle = layer === 2 ? sceneColor('#ffd279') : beige
      ? (shape.color === '#d0a4df' ? '#946a7e' : '#567d89') : (shape.color ?? '#85c9ec');
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = sceneGlow(5); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = .045;
    ctx.strokeStyle = beige ? '#fff5df' : '#e3efff'; ctx.stroke(); ctx.restore();
  }
  if (layer === 1) {
    for (const bridge of bridges) {
      const { x, y } = bridge.entry;
      const throat = ctx.createRadialGradient(x, y, .8, x, y, 3.2);
      throat.addColorStop(0, beige ? '#63503d' : '#030810');
      throat.addColorStop(1, beige ? '#b5a389' : '#536075');
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fillStyle = throat; ctx.fill();
      ctx.strokeStyle = sceneColor('#ffd279'); ctx.lineWidth = .14; ctx.stroke();
    }
    ctx.fillStyle = sceneColor('#dce9df'); ctx.textAlign = 'left'; ctx.font = '600 1.5px system-ui';
    ctx.fillText('쌍둥이 와류', 37, 5);
    ctx.font = '500 .9px system-ui'; ctx.fillText('서로 다른 회전, 하나의 출구', 37, 7.2);
    ctx.textAlign = 'center'; ctx.font = '600 1px system-ui'; ctx.fillText('START', 14, 1.8);
    for (const [i, { x, y, direction }] of twinBowls.entries()) {
      ctx.fillStyle = beige ? (i ? '#80576a' : '#486a77') : (i ? '#d0a4df' : '#85c9ec');
      ctx.fillText(i ? '02  반시계 방향' : '01  시계 방향', x, y + 27.5);
      // Small tangent arrows clarify the two opposite currents without adding false walls.
      for (const angle of [0, Math.PI]) {
        ctx.save(); ctx.translate(x + Math.cos(angle) * 21, y + Math.sin(angle) * 21);
        ctx.rotate(angle + direction * Math.PI / 2);
        path(ctx, [[-.8, -.45], [0, 0], [-.8, .45]]);
        ctx.lineWidth = .16; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); ctx.restore();
      }
    }
  } else {
    ctx.strokeStyle = sceneColor('#ffd279'); ctx.lineWidth = .18;
    for (const [x, y, angle] of [[34, 50.4, -.99], [46, 58.1, -.99], [42, 105, 0], [42, 114, 0], [42, 123, 0]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      path(ctx, [[-.65, 0], [0, .65], [.65, 0]]); ctx.stroke(); ctx.restore();
    }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 ? (beige ? '#6e5a3e' : '#ead5aa') : (beige ? '#f4ead5' : '#292b30');
      ctx.fillRect(39.4 + col * .65, stage.goalY - 1.3 + row * .65, .65, .65);
    }
  }
  ctx.restore();
}

export function drawTwinFunnelArt(ctx: Context, stage: StageDef, layer: 1 | 2 = 1, cached = true) {
  if (!cached) { paint(ctx, stage, layer); return; }
  const transform = ctx.getTransform();
  const density = Math.min(24, Math.max(8, Math.ceil(Math.hypot(transform.a, transform.b) / 8) * 8));
  const bounds = layer === 1 ? { x: 0, y: -30, width: stage.width ?? 70, height: stage.goalY + 34 }
    : { x: 22.5, y: 36.5, width: 35, height: stage.goalY + 4 - 36.5 };
  backgroundCache.draw(ctx, stage, `twin-funnel-${layer}`, { ...bounds, density, maxPixels: 6 * 1024 * 1024 }, target => paint(target, stage, layer));
}
