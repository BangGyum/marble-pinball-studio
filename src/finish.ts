import type { StageDef } from './stage-def';
import { sceneColor } from './scene-theme';

type Point = { x: number; y: number };

export function raceProgress(stage: StageDef, point: Point) {
  const goal = stage.goalArea;
  return goal ? -Math.hypot(point.x - goal.x, point.y - goal.y) : point.y;
}

// First crossing within this step, including a fast marble that exits the circle again.
export function finishFraction(stage: StageDef, from: Point, to: Point): number | undefined {
  const goal = stage.goalArea;
  if (!goal) return to.y >= stage.goalY ? (stage.goalY - from.y) / Math.max(0.000001, to.y - from.y) : undefined;
  const x = from.x - goal.x,
    y = from.y - goal.y;
  const c = x * x + y * y - goal.radius * goal.radius;
  if (c <= 0) return 0;
  const dx = to.x - from.x,
    dy = to.y - from.y,
    a = dx * dx + dy * dy;
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
  if (!goal) return false;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(0.08, 1.5 / scale);
  ctx.strokeStyle = sceneColor('#ffd184');
  ctx.beginPath();
  ctx.arc(goal.x, goal.y, goal.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.28;
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = sceneColor(i % 2 ? '#ffd184' : '#18313b');
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, goal.radius + 0.36, (i * Math.PI) / 8, ((i + 1) * Math.PI) / 8);
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
