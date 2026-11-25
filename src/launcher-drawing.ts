type LauncherDrawBall = {
  id: number;
  x: number;
  y: number;
  px?: number;
  py?: number;
  rank?: number;
  onBridge?: boolean;
};

export type LauncherDrawing = { snap: Set<number>; round: Set<number> };

export function updateLauncherDrawing(
  drawing: LauncherDrawing,
  guideIds: readonly number[],
  balls: readonly LauncherDrawBall[],
  minSeparation = 0.4999
) {
  drawing.snap.clear();
  drawing.round.clear();
  for (const id of guideIds) {
    const guide = balls[id];
    if (!guide || guide.rank) continue;
    const previousX = guide.px ?? guide.x,
      previousY = guide.py ?? guide.y;
    const nearby = [id];
    let overlap = false;
    for (const ball of balls) {
      if (ball === guide || ball.rank || ball.onBridge !== guide.onBridge) continue;
      const x0 = (ball.px ?? ball.x) - previousX,
        y0 = (ball.py ?? ball.y) - previousY,
        x1 = ball.x - guide.x,
        y1 = ball.y - guide.y;
      const dx = x1 - x0,
        dy = y1 - y0;
      const length = dx * dx + dy * dy;
      const t = length > 0 ? Math.max(0, Math.min(1, -(x0 * dx + y0 * dy) / length)) : 0;
      const closest = (x0 + dx * t) ** 2 + (y0 + dy * t) ** 2;
      // Include balls that could reach the guide after it switches to the current step.
      const nearCurrent =
        Math.min(ball.px ?? ball.x, ball.x) <= guide.x + 0.6 &&
        Math.max(ball.px ?? ball.x, ball.x) >= guide.x - 0.6 &&
        Math.min(ball.py ?? ball.y, ball.y) <= guide.y + 0.6 &&
        Math.max(ball.py ?? ball.y, ball.y) >= guide.y - 0.6;
      if (closest < 0.6 ** 2 || nearCurrent) nearby.push(ball.id);
      if (closest < minSeparation ** 2) overlap = true;
    }
    for (const id of nearby) {
      drawing.round.add(id);
      if (overlap) drawing.snap.add(id);
    }
  }
}
