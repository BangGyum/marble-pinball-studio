import { bubbleRadius, minePose, mineRail } from './bubble-mine';
import type { VectorLike } from './types/vector-like';
import { sceneColor } from './scene-theme';
import { backgroundCache } from './background-cache';
import type { ViewBounds } from './art-visibility';
import type { StageDef } from './stage-def';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const localOrigin = { x: 0, y: 0 };
let track: Path2D | undefined, sleepers: Path2D | undefined;

function traceRail(ctx: CanvasPath) {
  for (let i = 0; i <= 48; i++) {
    const p = mineRail(localOrigin, i / 48);
    if (!i) ctx.moveTo(p.x - 1.5, p.y + 0.82);
    ctx.lineTo(p.x, p.y + 0.82);
  }
}

function traceSleepers(ctx: CanvasPath) {
  for (let i = 0; i <= 24; i++) {
    const p = mineRail(localOrigin, i / 24);
    const q = mineRail(localOrigin, i / 24 + 0.001);
    const angle = Math.atan2(q.y - p.y, q.x - p.x);
    const dx = -Math.sin(angle) * 0.32,
      dy = Math.cos(angle) * 0.32;
    ctx.moveTo(p.x - dx, p.y + 0.82 - dy);
    ctx.lineTo(p.x + dx, p.y + 0.82 + dy);
  }
}

export function drawMineRail(ctx: Context, origin: VectorLike) {
  if (!track && typeof Path2D !== 'undefined') {
    track = new Path2D();
    sleepers = new Path2D();
    traceRail(track);
    traceSleepers(sleepers);
  }
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.lineCap = 'round';
  ctx.strokeStyle = sceneColor('#c9a365');
  ctx.lineWidth = 0.16;
  if (track) ctx.stroke(track);
  else {
    ctx.beginPath();
    traceRail(ctx);
    ctx.stroke();
  }
  ctx.lineWidth = 0.12;
  if (sleepers) ctx.stroke(sleepers);
  else {
    ctx.beginPath();
    traceSleepers(ctx);
    ctx.stroke();
  }
  ctx.fillStyle = sceneColor('#bd925a');
  ctx.fillRect(-0.3, 0.05, 0.6, 0.42);
  ctx.beginPath();
  ctx.ellipse(0, 0, bubbleRadius * 1.3, 0.12, 0, 0, 2 * Math.PI);
  ctx.strokeStyle = sceneColor('#ffe2a0');
  ctx.stroke();
  ctx.restore();
}

function paintCart(ctx: Context) {
  for (const x of [-0.69, 0.69]) {
    ctx.beginPath();
    ctx.arc(x, 0.56, 0.25, 0, 2 * Math.PI);
    ctx.fillStyle = sceneColor('#28313a');
    ctx.fill();
    ctx.strokeStyle = sceneColor('#b3c1c4');
    ctx.lineWidth = 0.075;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-1.18, -0.51);
  ctx.lineTo(-0.88, 0.34);
  ctx.quadraticCurveTo(0, 0.62, 0.88, 0.34);
  ctx.lineTo(1.18, -0.51);
  ctx.lineTo(0.87, -0.51);
  ctx.quadraticCurveTo(0, 0.58, -0.87, -0.51);
  ctx.closePath();
  ctx.fillStyle = sceneColor('#bd8951');
  ctx.fill();
  ctx.strokeStyle = sceneColor('#ffda93');
  ctx.stroke();
}

function paintBubble(ctx: Context, burst = 0) {
  const r = bubbleRadius * (1 + burst * 0.65);
  const rim = ctx.createLinearGradient(-r, -r, r, r);
  rim.addColorStop(0, sceneColor('#9df5ef'));
  rim.addColorStop(0.36, sceneColor('#e4b8f5'));
  rim.addColorStop(0.66, sceneColor('#ffe5ae'));
  rim.addColorStop(1, sceneColor('#8ccddf'));
  ctx.strokeStyle = rim;
  ctx.lineWidth = r * 0.09;
  if (!burst) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.fillStyle = sceneColor('#6bcad921');
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-0.4 * r, -0.77 * r, 0.3 * r, 0.1 * r, -0.56, 0, 2 * Math.PI);
    ctx.fillStyle = sceneColor('#e4fffa');
    ctx.fill();
  } else {
    ctx.globalAlpha *= 1 - burst;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, r, angle, angle + 0.64 * (1 - burst));
      ctx.stroke();
    }
  }
}

function inView(p: VectorLike, r: number, view?: ViewBounds) {
  return !view || (p.x + r >= view.left && p.x - r <= view.right && p.y + r >= view.top && p.y - r <= view.bottom);
}

export function drawMineRide(
  ctx: Context,
  stage: StageDef,
  time: number,
  scale: number,
  cached: boolean,
  view?: ViewBounds
) {
  const pose = minePose(stage.bubbleMine!, time);
  const density = scale > 64 ? 192 : 96;
  if (inView(pose.cart, 1.6, view)) {
    ctx.save();
    ctx.translate(pose.cart.x, pose.cart.y);
    ctx.rotate(pose.tilt);
    if (cached)
      backgroundCache.draw(
        ctx,
        stage,
        'mine/cart',
        { x: -1.3, y: -0.65, width: 2.6, height: 1.55, density },
        paintCart
      );
    else paintCart(ctx);
    ctx.restore();
  }
  if ((!pose.rising && (pose.burst < 0 || pose.burst >= 1)) || !inView(pose.bubble, 1.8 * bubbleRadius, view)) return;
  ctx.save();
  ctx.translate(pose.bubble.x, pose.bubble.y);
  if (cached && pose.rising)
    backgroundCache.draw(
      ctx,
      stage,
      'mine/bubble',
      { x: -0.36, y: -0.36, width: 0.72, height: 0.72, density },
      paintBubble
    );
  else paintBubble(ctx, pose.rising ? 0 : pose.burst);
  ctx.restore();
}
