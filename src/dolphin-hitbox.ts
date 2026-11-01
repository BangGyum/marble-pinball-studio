import { DOLPHIN_PIXEL_OUTLINE, DOLPHIN_SPRITE_RECT, DOLPHIN_SPRITE_WIDTH } from './data/dolphin-outline';

export { DOLPHIN_SPRITE_RECT, DOLPHIN_SPRITE_WIDTH };
export const DOLPHIN_HEIGHT = DOLPHIN_SPRITE_WIDTH * DOLPHIN_SPRITE_RECT[3] / DOLPHIN_SPRITE_RECT[2];
export const DOLPHIN_OUTLINE = DOLPHIN_PIXEL_OUTLINE.map(([x, y]): [number, number] => [
  (x - DOLPHIN_SPRITE_RECT[0] - DOLPHIN_SPRITE_RECT[2] / 2) * DOLPHIN_SPRITE_WIDTH / DOLPHIN_SPRITE_RECT[2],
  (y - DOLPHIN_SPRITE_RECT[1] - DOLPHIN_SPRITE_RECT[3] / 2) * DOLPHIN_SPRITE_WIDTH / DOLPHIN_SPRITE_RECT[2],
]);
const edges = DOLPHIN_OUTLINE.map(([ax, ay], i) => {
  const [bx, by] = DOLPHIN_OUTLINE[(i + 1) % DOLPHIN_OUTLINE.length], dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
  return { ax, ay, bx, by, nx: dy / length, ny: -dx / length };
});
const minX = Math.min(...DOLPHIN_OUTLINE.map(p => p[0])), maxX = Math.max(...DOLPHIN_OUTLINE.map(p => p[0]));
const minY = Math.min(...DOLPHIN_OUTLINE.map(p => p[1])), maxY = Math.max(...DOLPHIN_OUTLINE.map(p => p[1]));
const CELL = .25, columns = Math.floor((maxX - minX) / CELL) + 1, rows = Math.floor((maxY - minY) / CELL) + 1;
const cells = Array.from({ length: columns * rows }, () => [] as number[]);
const edgeRows = Array.from({ length: rows }, () => [] as number[]);
edges.forEach((edge, index) => {
  const left = Math.floor((Math.min(edge.ax, edge.bx) - minX) / CELL), right = Math.floor((Math.max(edge.ax, edge.bx) - minX) / CELL);
  const top = Math.floor((Math.min(edge.ay, edge.by) - minY) / CELL), bottom = Math.floor((Math.max(edge.ay, edge.by) - minY) / CELL);
  for (let y = top; y <= bottom; y++) {
    edgeRows[y].push(index);
    for (let x = left; x <= right; x++) cells[y * columns + x].push(index);
  }
});
const visited = new Float64Array(edges.length);
let query = 0;

// The same local-space outline serves every scale and mirrored/rotated pose, including LAN.
export function dolphinSurface(x: number, y: number, radius: number, clip = { x: 0, y: 1, limit: Infinity }) {
  if (x < minX - radius || x > maxX + radius || y < minY - radius || y > maxY + radius) return;
  let inside = false, nearest = Infinity, qx = 0, qy = 0, edgeNX = 0, edgeNY = 0;
  const row = Math.floor((y - minY) / CELL);
  for (const index of edgeRows[row] ?? []) {
    const { ax, ay, bx, by } = edges[index];
    if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
  }
  inside &&= clip.x * x + clip.y * y <= clip.limit;
  const stamp = ++query;
  // Nearby-edge queries avoid checking all 140 segments for every marble/substep.
  for (let reach = radius;; reach = Math.max(CELL, reach * 2)) {
    const left = Math.max(0, Math.floor((x - reach - minX) / CELL)), right = Math.min(columns - 1, Math.floor((x + reach - minX) / CELL));
    const top = Math.max(0, Math.floor((y - reach - minY) / CELL)), bottom = Math.min(rows - 1, Math.floor((y + reach - minY) / CELL));
    for (let cy = top; cy <= bottom; cy++) for (let cx = left; cx <= right; cx++) for (const index of cells[cy * columns + cx]) {
      if (visited[index] === stamp) continue;
      visited[index] = stamp;
      const edge = edges[index];
      let { ax, ay, bx, by } = edge;
      const a = clip.x * ax + clip.y * ay - clip.limit, b = clip.x * bx + clip.y * by - clip.limit;
      if (a > 0 && b > 0) continue;
      // Clip the real edges, without adding a solid wall along the waterline.
      if (a > 0) { const t = a / (a - b); ax += (bx - ax) * t; ay += (by - ay) * t; }
      else if (b > 0) { const t = a / (a - b); bx = ax + (bx - ax) * t; by = ay + (by - ay) * t; }
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + dx * t, py = ay + dy * t, distance2 = (x - px) ** 2 + (y - py) ** 2;
      if (distance2 < nearest) { nearest = distance2; qx = px; qy = py; edgeNX = edge.nx; edgeNY = edge.ny; }
    }
    if (!inside || nearest <= reach * reach || left === 0 && right === columns - 1 && top === 0 && bottom === rows - 1) break;
  }
  if (!Number.isFinite(nearest) || !inside && nearest >= radius * radius) return;
  const distance = Math.sqrt(nearest), sign = inside ? -1 : 1;
  return { x: qx, y: qy, nx: distance > 1e-8 ? sign * (x - qx) / distance : edgeNX,
    ny: distance > 1e-8 ? sign * (y - qy) / distance : edgeNY };
}
