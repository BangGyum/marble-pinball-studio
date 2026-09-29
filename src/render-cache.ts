import { drawLadderArt } from './ladder-art';
import type { Ball } from './game';
import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';
import { drawEntities } from './draw';
import { drawMarble } from './marble-art';

type Sprite = { canvas: OffscreenCanvas; width: number; height: number; left: number; top: number };

export class RenderCache {
  private balls = new WeakMap<Ball, { key: string; sprite: Sprite }>();
  private labels = new WeakMap<Ball, { key: string; sprite: Sprite }>();
  private minimap?: { stage: StageDef; scale: number; dpr: number; canvas: OffscreenCanvas; fixed: Set<MapEntityState['shape']> };

  drawBall(ctx: CanvasRenderingContext2D, ball: Ball, scale: number, dpr: number, x = ball.x, y = ball.y) {
    // Older browsers can keep using the vector renderer.
    if (typeof OffscreenCanvas === 'undefined') return false;
    // Rasterize in small resolution buckets; continuous zoom reuses these bitmaps.
    const resolution = Math.ceil(scale / 8) * 8;
    const key = `${resolution}/${dpr}/${ball.color}`;
    let cached = this.balls.get(ball);
    if (!cached || cached.key !== key) {
      const radius = resolution * 0.25, edge = Math.ceil(radius + 14);
      const canvas = new OffscreenCanvas(Math.ceil(edge * 2 * dpr), Math.ceil(edge * 2 * dpr));
      const spriteCtx = canvas.getContext('2d')!;
      spriteCtx.setTransform(dpr, 0, 0, dpr, edge * dpr, edge * dpr);
      drawMarble(spriteCtx, 0, 0, radius, ball.color);
      cached = { key, sprite: { canvas, width: canvas.width / dpr, height: canvas.height / dpr, left: edge, top: edge } };
      this.balls.set(ball, cached);
    }
    const marble = cached.sprite;
    ctx.drawImage(marble.canvas, x - marble.left / resolution, y - marble.top / resolution, marble.width / resolution, marble.height / resolution);
    // Labels keep the original 12–17 CSS pixel policy, independently of marble zoom.
    const font = Math.min(17, Math.max(12, scale * 0.24)), rasterFont = Math.ceil(font);
    const labelKey = `${rasterFont}/${dpr}/${ball.color}/${ball.name}`;
    let label = this.labels.get(ball);
    if (!label || label.key !== labelKey) {
      const canvas = new OffscreenCanvas(1, 1), spriteCtx = canvas.getContext('2d')!;
      spriteCtx.font = `${rasterFont}px sans-serif`;
      const left = Math.ceil(spriteCtx.measureText(ball.name).width / 2 + 4), top = rasterFont + 4;
      canvas.width = Math.ceil(left * 2 * dpr); canvas.height = Math.ceil((top + 8) * dpr);
      spriteCtx.setTransform(dpr, 0, 0, dpr, left * dpr, top * dpr);
      spriteCtx.fillStyle = ball.color;
      spriteCtx.font = `${rasterFont}px sans-serif`;
      spriteCtx.textAlign = 'center';
      spriteCtx.strokeStyle = '#050a10';
      spriteCtx.lineWidth = 3;
      spriteCtx.strokeText(ball.name, 0, 0); spriteCtx.fillText(ball.name, 0, 0);
      label = { key: labelKey, sprite: { canvas, width: canvas.width / dpr, height: canvas.height / dpr, left, top } };
      this.labels.set(ball, label);
    }
    const s = label.sprite, labelScale = font / rasterFont / scale;
    ctx.drawImage(s.canvas, x - s.left * labelScale, y + 0.55 - s.top * labelScale, s.width * labelScale, s.height * labelScale);
    return true;
  }

  drawMinimap(ctx: CanvasRenderingContext2D, stage: StageDef, entities: MapEntityState[], scale: number, dpr: number) {
    if (typeof OffscreenCanvas === 'undefined' || scale <= 0) {
      if (stage.art?.style === 'reversal-ladder') drawLadderArt(ctx, stage, false);
      drawEntities(ctx, entities, scale, -1, false, undefined, false, stage.art?.style === 'reversal-ladder');
      return;
    }
    let cached = this.minimap;
    if (!cached || cached.stage !== stage || cached.scale !== scale || cached.dpr !== dpr) {
      const fixed = new Set((stage.entities ?? [])
        .filter((e) => e.type === 'static' && (e.props.life ?? -1) <= 0)
        .map((e) => e.shape));
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.ceil((stage.width ?? 26) * scale * dpr)),
        Math.max(1, Math.ceil(stage.goalY * scale * dpr))
      );
      const mapCtx = canvas.getContext('2d')!;
      mapCtx.scale(scale * dpr, scale * dpr);
      if (stage.art?.style === 'reversal-ladder') drawLadderArt(mapCtx, stage, false);
      drawEntities(mapCtx, entities.filter((e) => fixed.has(e.shape)), scale, -1, false, undefined, false, stage.art?.style === 'reversal-ladder');
      cached = this.minimap = { stage, scale, dpr, canvas, fixed };
    }
    ctx.drawImage(cached.canvas, 0, 0, cached.canvas.width / (scale * dpr), cached.canvas.height / (scale * dpr));
    // Rotors and breakable obstacles stay live, above the fixed map layer.
    drawEntities(ctx, entities.filter((e) => !cached.fixed.has(e.shape)), scale, -1, false, undefined, false, stage.art?.style === 'reversal-ladder');
  }
}
