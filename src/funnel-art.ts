import type { StageDef } from './stage-def';
import { funnel } from './data/infinite-funnel';
import { backgroundCache } from './background-cache';
import { getSceneTheme, sceneColor, sceneGlow } from './scene-theme';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
function path(ctx: Context, points: [number, number][]) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
}
function paint(ctx: Context, stage: StageDef, layer: 1 | 2) {
  const beige = getSceneTheme() === 'beige';
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (layer === 2) {
    // The inlet is an open throat: only the outlet below it has visible side rails.
    ctx.beginPath(); ctx.rect(0, funnel.y + 2.8, stage.width ?? 64, stage.goalY + 4); ctx.clip();
    path(ctx, stage.exitBridge!.deck); ctx.closePath();
    ctx.fillStyle = beige ? '#d7cbb4' : '#102d36'; ctx.fill();
    const metal = ctx.createLinearGradient(29.4, 0, 34.6, 0);
    [beige ? '#9e8e72' : '#284853', beige ? '#f4ead5' : '#153642', beige ? '#9e8e72' : '#284853']
      .forEach((color, i) => metal.addColorStop(i / 2, color));
    ctx.fillStyle = metal; ctx.fill();
    ctx.strokeStyle = sceneColor('#ffc96e'); ctx.lineWidth = .25;
    for (const entity of stage.entities ?? []) {
      const shape = entity.shape;
      if (shape.type !== 'polyline' || shape.collisionLayer !== 2) continue;
      ctx.save(); ctx.translate(entity.position.x, entity.position.y); ctx.rotate(shape.rotation);
      path(ctx, shape.points); ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = sceneColor('#ffd279'); ctx.lineWidth = .2;
    for (const y of [51, 59, 67, 75]) {
      ctx.beginPath(); ctx.moveTo(31.2, y); ctx.lineTo(32, y + .7); ctx.lineTo(32.8, y); ctx.stroke();
    }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 ? (beige ? '#6e5a3e' : '#c5eee4') : (beige ? '#f4ead5' : '#14323b');
      ctx.fillRect(29.4 + col * .65, stage.goalY - 1.3 + row * .65, .65, .65);
    }
    ctx.restore(); return;
  }
  const bowl = ctx.createRadialGradient(funnel.x, funnel.y, 1, funnel.x, funnel.y, 31);
  const colors = beige ? ['#a99a80', '#d5c9b3', '#f2e9d8', '#d4c7ae'] : ['#020b12', '#0b202b', '#173d42', '#10252f'];
  colors.forEach((color, i) => bowl.addColorStop([0, .22, .82, 1][i], color));
  ctx.beginPath(); ctx.arc(funnel.x, funnel.y, 31, 0, Math.PI * 2); ctx.fillStyle = bowl; ctx.fill();
  for (const contour of stage.art!.contours) {
    path(ctx, contour); ctx.closePath(); ctx.fillStyle = beige ? '#f7f0df60' : '#75ebd30c'; ctx.fill();
  }
  // Use the actual collision vertices, including edited rails, for every visible edge.
  for (const entity of stage.entities ?? []) {
    const shape = entity.shape;
    if (shape.type !== 'polyline' || shape.collisionLayer === 2) continue;
    ctx.save(); ctx.translate(entity.position.x, entity.position.y); ctx.rotate(shape.rotation);
    path(ctx, shape.points); ctx.strokeStyle = beige ? '#b8a98b' : '#183b48'; ctx.lineWidth = .65; ctx.stroke();
    ctx.strokeStyle = sceneColor(shape.color ?? '#64f4e0'); ctx.lineWidth = .24;
    ctx.shadowColor = sceneColor('#64f4e0'); ctx.shadowBlur = sceneGlow(5); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = beige ? '#fff5df' : '#c0ffed'; ctx.lineWidth = .045; ctx.stroke(); ctx.restore();
  }
  const throat = ctx.createRadialGradient(32, 43.5, .7, 32, 43.5, 2.3);
  throat.addColorStop(0, beige ? '#655239' : '#02090e'); throat.addColorStop(1, beige ? '#b6a78b' : '#32676b');
  ctx.beginPath(); ctx.arc(32, 43.5, 2.3, 0, Math.PI * 2); ctx.fillStyle = throat; ctx.fill();
  ctx.strokeStyle = sceneColor('#ffd279'); ctx.lineWidth = .14; ctx.stroke();
  ctx.fillStyle = sceneColor('#a9fff2'); ctx.textAlign = 'center'; ctx.font = '600 1.1px system-ui';
  ctx.fillText('START', 20, 1.8);
  ctx.textAlign = 'left'; ctx.font = '600 1.25px system-ui'; ctx.fillText('끝없는 나선', 39, 4.5);
  ctx.fillStyle = sceneColor('#dce9df'); ctx.font = '500 .85px system-ui'; ctx.fillText('네 바퀴를 지나 중심으로', 39, 6.5);
  ctx.restore();
}

export function drawFunnelArt(ctx: Context, stage: StageDef, layer: 1 | 2 = 1, cached = true) {
  if (!cached) { paint(ctx, stage, layer); return; }
  const transform = ctx.getTransform();
  const density = Math.min(24, Math.max(8, Math.ceil(Math.hypot(transform.a, transform.b) / 8) * 8));
  const bounds = layer === 1 ? { x: 0, y: -30, width: stage.width ?? 64, height: stage.goalY + 34 }
    : { x: 28.8, y: 46.8, width: 6.4, height: Math.max(1, stage.goalY + 4 - 46.8) };
  backgroundCache.draw(ctx, stage, `funnel-${layer}`, { ...bounds, density, maxPixels: 6 * 1024 * 1024 }, target => paint(target, stage, layer));
}
