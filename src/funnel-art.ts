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
    const inlet = stage.exitBridge!.entry;
    // A rounded inlet joins the chute; its upper surface is open to ground-level marbles.
    ctx.beginPath(); ctx.ellipse(inlet.x, inlet.y, 2.6, 1.3, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(inlet.x + 2.6, stage.goalY + 4); ctx.lineTo(inlet.x - 2.6, stage.goalY + 4);
    ctx.closePath(); ctx.clip();
    path(ctx, stage.exitBridge!.deck); ctx.closePath();
    ctx.fillStyle = beige ? '#d7cbb4' : '#102d36'; ctx.fill();
    const metal = ctx.createLinearGradient(29.4, 0, 34.6, 0);
    [beige ? '#9e8e72' : '#284853', beige ? '#f4ead5' : '#153642', beige ? '#9e8e72' : '#284853']
      .forEach((color, i) => metal.addColorStop(i / 2, color));
    ctx.fillStyle = metal; ctx.fill();
    const slope = ctx.createLinearGradient(0, inlet.y - 1.3, 0, inlet.y + 4);
    slope.addColorStop(0, beige ? '#ad9e84' : '#0a202a');
    slope.addColorStop(1, beige ? '#ad9e8400' : '#0a202a00');
    ctx.fillStyle = slope; ctx.fill();
    const mouthWidth = inlet.width / 2 + .15, mouthHeight = inlet.height / 2 + .1;
    const throat = ctx.createLinearGradient(0, inlet.y - mouthHeight, 0, inlet.y + 2.5);
    throat.addColorStop(0, beige ? '#51412de6' : '#02090ef2');
    throat.addColorStop(1, beige ? '#51412d00' : '#02090e00');
    ctx.beginPath(); ctx.ellipse(inlet.x, inlet.y, mouthWidth, mouthHeight, 0, Math.PI, Math.PI * 2);
    ctx.bezierCurveTo(inlet.x + mouthWidth, inlet.y + 1, inlet.x + .6, inlet.y + 2, inlet.x + .6, inlet.y + 2.5);
    ctx.lineTo(inlet.x - .6, inlet.y + 2.5);
    ctx.bezierCurveTo(inlet.x - .6, inlet.y + 2, inlet.x - mouthWidth, inlet.y + 1, inlet.x - mouthWidth, inlet.y);
    ctx.closePath();
    ctx.fillStyle = throat; ctx.fill();
    ctx.beginPath(); ctx.ellipse(inlet.x, inlet.y, mouthWidth, mouthHeight, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = beige ? '#e8d4ac' : '#8bc0b8'; ctx.lineWidth = .08; ctx.stroke();
    // Only the lower chute has solid-looking side rails; the entrance stays open.
    ctx.save(); ctx.beginPath(); ctx.rect(0, inlet.y + 3.3, stage.width ?? 64, stage.goalY + 4); ctx.clip();
    ctx.strokeStyle = sceneColor('#ffc96e'); ctx.lineWidth = .25;
    for (const entity of stage.entities ?? []) {
      const shape = entity.shape;
      if (shape.type !== 'polyline' || shape.collisionLayer !== 2) continue;
      ctx.save(); ctx.translate(entity.position.x, entity.position.y); ctx.rotate(shape.rotation);
      path(ctx, shape.points); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = sceneColor('#ffd279'); ctx.lineWidth = .2;
    for (const y of [47.8, 51, 59, 67, 75]) {
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
  // Fade the lane surface before its open end so the contour does not leave a straight seam.
  const lane = ctx.createRadialGradient(funnel.x, funnel.y, funnel.inner + funnel.halfWidth,
    funnel.x, funnel.y, funnel.inner + funnel.halfWidth + 4);
  lane.addColorStop(0, beige ? '#f7f0df00' : '#75ebd300');
  lane.addColorStop(1, beige ? '#f7f0df60' : '#75ebd30c');
  for (const contour of stage.art!.contours) {
    path(ctx, contour); ctx.closePath(); ctx.fillStyle = lane; ctx.fill();
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
    : { x: 28.8, y: stage.exitBridge!.entry.y - 1.6, width: 6.4, height: Math.max(1, stage.goalY + 5.6 - stage.exitBridge!.entry.y) };
  backgroundCache.draw(ctx, stage, `funnel-${layer}`, { ...bounds, density, maxPixels: 6 * 1024 * 1024 }, target => paint(target, stage, layer));
}
