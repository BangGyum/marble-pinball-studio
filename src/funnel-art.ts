import type { StageDef } from './stage-def';
import { funnel } from './data/infinite-funnel';
import { backgroundCache } from './background-cache';
import { getSceneTheme, sceneColor, sceneGlow } from './scene-theme';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
function path(ctx: Context, points: [number, number][]) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
}
function drain(stage: StageDef) {
  const deck = stage.exitBridge!.deck, xs = deck.map(p => p[0]);
  const left = Math.min(...xs), right = Math.max(...xs);
  return { cx: (left + right) / 2, cy: funnel.y, radius: (right - left) / 2, hole: 1.6,
    bottom: Math.max(...deck.map(p => p[1])) };
}
function paint(ctx: Context, stage: StageDef, layer: 1 | 2) {
  const beige = getSceneTheme() === 'beige';
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (layer === 2) {
    // The drain sits at the exact spiral centre; the chute is one rounded piece that starts around it.
    const { cx, cy, radius, hole, bottom } = drain(stage);
    const chute = () => {
      ctx.beginPath(); ctx.moveTo(cx - radius, bottom); ctx.lineTo(cx - radius, cy);
      ctx.arc(cx, cy, radius, Math.PI, Math.PI * 2); ctx.lineTo(cx + radius, bottom); ctx.closePath();
    };
    // Only the lower chute casts a bridge shadow; the spiral entrance stays open.
    ctx.save(); ctx.beginPath(); ctx.rect(0, cy + 2.8, stage.width ?? 64, stage.goalY + 8); ctx.clip();
    ctx.translate(.3, .5); chute();
    ctx.fillStyle = beige ? '#6a54383a' : '#000000a6'; ctx.fill(); ctx.restore();
    chute();
    const metal = ctx.createLinearGradient(cx - radius, 0, cx + radius, 0);
    [beige ? '#9e8e72' : '#284853', beige ? '#f4ead5' : '#153642', beige ? '#9e8e72' : '#284853']
      .forEach((color, i) => metal.addColorStop(i / 2, color));
    ctx.fillStyle = metal; ctx.fill();
    // Recessed drain: dark at the far wall, a lit lower lip where marbles drop into the chute.
    const pit = ctx.createRadialGradient(cx, cy - hole * .25, hole * .1, cx, cy, hole);
    pit.addColorStop(0, beige ? '#3a2c1d' : '#000204');
    pit.addColorStop(.7, beige ? '#4f3e29' : '#031018');
    pit.addColorStop(1, beige ? '#77623f' : '#0f3039');
    ctx.beginPath(); ctx.arc(cx, cy, hole, 0, Math.PI * 2); ctx.fillStyle = pit; ctx.fill();
    ctx.lineWidth = .3; ctx.strokeStyle = beige ? '#8c7a5c' : '#0b222b'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, hole + .1, Math.PI * .15, Math.PI * .85);
    ctx.lineWidth = .08; ctx.strokeStyle = beige ? '#fff6e2' : '#7fd9cc'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, hole + .1, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = beige ? '#c4b18e' : '#2f6f72'; ctx.stroke();
    // Fade the rail heads through the open entrance, then show solid rails below it.
    const railFade = ctx.createLinearGradient(0, cy, 0, cy + 2.8);
    railFade.addColorStop(0, sceneColor('#ffc96e00'));
    railFade.addColorStop(1, sceneColor('#ffc96e'));
    ctx.lineWidth = .25;
    for (const [start, end, color] of [
      [cy, cy + 2.8, railFade], [cy + 2.8, bottom, sceneColor('#ffc96e')],
    ] as [number, number, string | CanvasGradient][]) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, start, stage.width ?? 64, end - start); ctx.clip();
      ctx.strokeStyle = color;
      for (const entity of stage.entities ?? []) {
        const shape = entity.shape;
        if (shape.type !== 'polyline' || shape.collisionLayer !== 2) continue;
        ctx.save(); ctx.translate(entity.position.x, entity.position.y); ctx.rotate(shape.rotation);
        path(ctx, shape.points); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    ctx.strokeStyle = sceneColor('#ffd279'); ctx.lineWidth = .2;
    for (let y = cy + hole + 2; y < stage.goalY - 4; y += 8) {
      ctx.beginPath(); ctx.moveTo(cx - .8, y); ctx.lineTo(cx, y + .7); ctx.lineTo(cx + .8, y); ctx.stroke();
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
  let bounds = { x: 0, y: -30, width: stage.width ?? 64, height: stage.goalY + 34 };
  if (layer === 2) {
    const { cx, cy, radius, bottom } = drain(stage);
    const top = Math.min(cy - radius, stage.exitBridge!.entry.y) - .6;
    bounds = { x: cx - radius - .6, y: top, width: radius * 2 + 1.5, height: Math.max(1, bottom + 1 - top) };
  }
  backgroundCache.draw(ctx, stage, `funnel-${layer}`, { ...bounds, density, maxPixels: 6 * 1024 * 1024 }, target => paint(target, stage, layer));
}

export function drawFunnelEntryCue(ctx: CanvasRenderingContext2D, stage: StageDef, age: number, scale: number) {
  if (!stage.exitBridge || age < 0 || age >= .45) return;
  const { cx, cy, hole } = drain(stage), progress = age / .45;
  ctx.save();
  ctx.globalAlpha = (1 - progress) * .8;
  ctx.strokeStyle = sceneColor('#ffd279');
  ctx.lineWidth = 2 / scale;
  ctx.beginPath();
  ctx.arc(cx, cy, hole + .2 + progress * 1.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
