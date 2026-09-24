import type { StageDef } from './data/maps';

const CELL = 2;
// A marble whose path wraps half-way around a sharp wall tip travels at least π·r (≈0.79) in one step.
// Below this distance a straight chord through a wall can only mean the marble went through it.
const MAX_PATH = 0.6;
const key = (cx: number, cy: number) => (cx + 2048) * 4096 + cy + 2048;

// Static walls bucketed on a coarse grid. The solver can squeeze a slow marble through a wall
// under pressure; continuous collision only protects fast ones.
export class WallGuard {
  private segments: number[] = [];
  private cells = new Map<number, number[]>();

  constructor(stage: StageDef) {
    for (const entity of stage.entities ?? []) {
      const s = entity.shape;
      // Moving and breakable obstacles change shape over time; pins have no edges to cross.
      if (entity.type !== 'static' || s.sensor || (entity.props.life ?? -1) > 0 || s.type === 'circle') continue;
      const { x, y } = entity.position, layer = s.collisionLayer ?? 1;
      if (s.type === 'polyline') {
        for (let i = 1; i < s.points.length; i++) {
          const a = s.points[i - 1], b = s.points[i];
          this.add(x + a[0], y + a[1], x + b[0], y + b[1], layer);
        }
      } else if (s.boostSpeed === undefined) {
        const cos = Math.cos(s.rotation), sin = Math.sin(s.rotation);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
          [x + u * s.width * cos - v * s.height * sin, y + u * s.width * sin + v * s.height * cos]);
        corners.forEach((a, i) => { const b = corners[(i + 1) % 4]; this.add(a[0], a[1], b[0], b[1], layer); });
      }
    }
  }

  private add(ax: number, ay: number, bx: number, by: number, layer: number) {
    if (ax === bx && ay === by) return;
    const index = this.segments.length;
    this.segments.push(ax, ay, bx, by, layer);
    for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++)
      for (let cy = Math.floor(Math.min(ay, by) / CELL); cy <= Math.floor(Math.max(ay, by) / CELL); cy++) {
        const k = key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(index);
        else this.cells.set(k, [index]);
      }
  }

  // True when the straight move from (ax, ay) to (bx, by) passes through a wall of this collision layer.
  crosses(ax: number, ay: number, bx: number, by: number, layer: number) {
    if (Math.hypot(bx - ax, by - ay) > MAX_PATH) return false;
    const s = this.segments;
    for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++)
      for (let cy = Math.floor(Math.min(ay, by) / CELL); cy <= Math.floor(Math.max(ay, by) / CELL); cy++) {
        for (const i of this.cells.get(key(cx, cy)) ?? []) {
          if (s[i + 4] !== layer) continue;
          const px = s[i], py = s[i + 1], qx = s[i + 2], qy = s[i + 3];
          // Strict orientation tests: grazing an endpoint or running along a wall is not a crossing.
          const d1 = (qx - px) * (ay - py) - (qy - py) * (ax - px);
          const d2 = (qx - px) * (by - py) - (qy - py) * (bx - px);
          if (d1 * d2 >= 0) continue;
          const d3 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
          const d4 = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
          if (d3 * d4 < 0) return true;
        }
      }
    return false;
  }
}

export const WALL_GUARD_MAX_SPEED = MAX_PATH * 60;
