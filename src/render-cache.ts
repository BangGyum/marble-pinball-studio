import type { Ball } from './game';
import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';
import { drawEntities } from './draw';

type Sprite = { canvas: OffscreenCanvas; width: number; height: number; left: number; top: number };

export class RenderCache {
  private balls = new WeakMap<Ball, { key: string; sprite: Sprite }>();
  private minimap?: { stage: StageDef; scale: number; dpr: number; canvas: OffscreenCanvas; fixed: Set<MapEntityState['shape']> };

  drawBall(ctx: CanvasRenderingContext2D, ball: Ball, scale: number, dpr: number) {
    // Older browsers can keep using the vector renderer.
    if (typeof OffscreenCanvas === 'undefined') return false;
    const key = `${scale}/${dpr}/${ball.color}/${ball.name}`;
    let cached = this.balls.get(ball);
    if (!cached || cached.key !== key) {
      const canvas = new OffscreenCanvas(1, 1);
      const spriteCtx = canvas.getContext('2d')!;
      const font = Math.min(17, Math.max(12, scale * 0.24));
      spriteCtx.font = `${font}px sans-serif`;
      const text = spriteCtx.measureText(ball.name);
      const radius = scale * 0.25;
      const left = Math.ceil(Math.max(radius + 14, text.width / 2 + 4));
      const top = Math.ceil(Math.max(radius + 14, font - scale * 0.55 + 4));
      const width = left * 2;
      const height = top + Math.ceil(Math.max(radius + 14, scale * 0.55 + font + 4));
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      spriteCtx.setTransform(dpr, 0, 0, dpr, left * dpr, top * dpr);
      spriteCtx.fillStyle = ball.color;
      spriteCtx.shadowColor = ball.color;
      spriteCtx.shadowBlur = 7;
      spriteCtx.beginPath();
      spriteCtx.arc(0, 0, radius, 0, Math.PI * 2);
      spriteCtx.fill();
      spriteCtx.shadowBlur = 0;
      spriteCtx.strokeStyle = '#ffffff60';
      spriteCtx.lineWidth = 1;
      spriteCtx.stroke();
      spriteCtx.font = `${font}px sans-serif`;
      spriteCtx.textAlign = 'center';
      spriteCtx.strokeStyle = '#050a10';
      spriteCtx.lineWidth = 3;
      spriteCtx.strokeText(ball.name, 0, scale * 0.55);
      spriteCtx.fillText(ball.name, 0, scale * 0.55);
      cached = { key, sprite: { canvas, width: canvas.width / dpr, height: canvas.height / dpr, left, top } };
      this.balls.set(ball, cached);
    }
    const s = cached.sprite;
    ctx.drawImage(s.canvas, ball.x - s.left / scale, ball.y - s.top / scale, s.width / scale, s.height / scale);
    return true;
  }

  drawMinimap(ctx: CanvasRenderingContext2D, stage: StageDef, entities: MapEntityState[], scale: number, dpr: number) {
    if (typeof OffscreenCanvas === 'undefined' || scale <= 0) {
      drawEntities(ctx, entities, scale, -1, false);
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
      drawEntities(mapCtx, entities.filter((e) => fixed.has(e.shape)), scale, -1, false);
      cached = this.minimap = { stage, scale, dpr, canvas, fixed };
    }
    ctx.drawImage(cached.canvas, 0, 0, cached.canvas.width / (scale * dpr), cached.canvas.height / (scale * dpr));
    // Rotors and breakable obstacles stay live, above the fixed map layer.
    drawEntities(ctx, entities.filter((e) => !cached.fixed.has(e.shape)), scale, -1, false);
  }
}
