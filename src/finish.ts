import type { StageDef } from './stage-def';
import type { Ball } from './race';
import { sceneColor } from './scene-theme';

type Point = { x: number; y: number };

export function raceProgress(stage: StageDef, point: Point) {
  const goal = stage.goalArea;
  return goal ? -Math.hypot(point.x - goal.x, point.y - goal.y) : point.y;
}

export function racingByProgress(stage: StageDef, balls: Ball[]) {
  return balls
    .filter((ball) => !ball.rank)
    .sort((a, b) => raceProgress(stage, b) - raceProgress(stage, a) || a.id - b.id);
}

// First crossing within this step, including a fast marble that exits the circle again.
export function finishFraction(stage: StageDef, from: Point, to: Point): number | undefined {
  const goal = stage.goalArea;
  if (!goal) return to.y >= stage.goalY ? (stage.goalY - from.y) / Math.max(0.000001, to.y - from.y) : undefined;
  return circleEntryFraction(from.x - goal.x, from.y - goal.y, to.x - from.x, to.y - from.y, goal.radius);
}

// Entry along a relative displacement (dx, dy) from the circle-centered point (x, y).
export function circleEntryFraction(x: number, y: number, dx: number, dy: number, radius: number) {
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (!a) return undefined;
  const b = x * dx + y * dy,
    discriminant = b * b - a * c;
  if (discriminant < 0) return undefined;
  const fraction = (-b - Math.sqrt(discriminant)) / a;
  return fraction >= 0 && fraction <= 1 ? fraction : undefined;
}

export function drawGoalArea(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stage: StageDef,
  scale: number
) {
  const goal = stage.goalArea;
  if (!goal)
    return (
      (stage.art?.style === 'bounce-stairs' || stage.art?.style === 'dot-wave') &&
      drawCheckeredFinish(ctx, stage, scale)
    );
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(0.08, 1.5 / scale);
  ctx.strokeStyle = sceneColor('#ffd184');
  ctx.beginPath();
  ctx.arc(goal.x, goal.y, goal.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.28;
  const rim = goal.radius + 0.36;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = sceneColor(pass ? '#ffd184' : '#18313b');
    ctx.beginPath();
    for (let i = pass; i < 16; i += 2) {
      const start = (i * Math.PI) / 8;
      ctx.moveTo(goal.x + rim * Math.cos(start), goal.y + rim * Math.sin(start));
      ctx.arc(goal.x, goal.y, rim, start, ((i + 1) * Math.PI) / 8);
    }
    ctx.stroke();
  }
  if (goal.radius * scale >= 20) {
    ctx.fillStyle = sceneColor('#ffd184');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.min(goal.radius * 0.45, 12 / scale)}px system-ui`;
    ctx.fillText('GOAL', goal.x, goal.y);
  }
  ctx.restore();
  return true;
}

function drawCheckeredFinish(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stage: StageDef,
  scale: number
) {
  const contour = stage.art!.contours[0];
  const y = stage.goalY;
  let left = Infinity,
    right = -Infinity;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const [ax, ay] = contour[j],
      [bx, by] = contour[i];
    if (ay > y === by > y) continue;
    const x = ax + ((y - ay) * (bx - ax)) / (by - ay);
    left = Math.min(left, x);
    right = Math.max(right, x);
  }
  if (left >= right) return false;

  ctx.save();
  ctx.shadowBlur = 0;
  const columns = stage.art?.style === 'dot-wave' ? 32 : 10;
  const cell = (right - left) / columns;
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < columns; col++) {
      ctx.fillStyle = sceneColor((row + col) % 2 ? '#17212b' : '#e8faf3');
      ctx.fillRect(left + col * cell, y - 2 * cell + row * cell, cell, cell);
    }
  ctx.strokeStyle = sceneColor('#65efda');
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([0.35, 0.3]);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  if ((right - left) * scale >= 48) {
    ctx.fillStyle = sceneColor('#65efda');
    ctx.font = `${12 / scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('FINISH', (left + right) / 2, y - 2 * cell);
  }
  ctx.restore();
  return true;
}
