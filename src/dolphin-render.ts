import type { StageDef } from './stage-def';
import { dolphinPose, dolphinScale, dolphinWave, DOLPHIN_DURATION, DOLPHIN_SWIM, DOLPHIN_WIDTH, type DolphinSettings } from './dolphin';
import { sceneColor } from './scene-theme';

type View = { left: number; right: number; top: number; bottom: number };
export class DolphinRenderer {
  private body?: HTMLCanvasElement;
  private splash?: HTMLCanvasElement;
  private width = -1;
  private effectScale = -1;
  private events: { at: number; x: number }[] = [];
  private guidePath?: Path2D;
  private guideWidth = -1;
  private guideScale = -1;
  private drawBody(ctx: CanvasRenderingContext2D) {
    if (this.body) {
      const height = DOLPHIN_WIDTH * this.body.height / this.body.width;
      ctx.drawImage(this.body, -DOLPHIN_WIDTH / 2, -height / 2, DOLPHIN_WIDTH, height); return;
    }
    // Keep the collision visible while the texture is loading, including late LAN joins.
    ctx.fillStyle = '#76bdce'; ctx.beginPath(); ctx.ellipse(0, 0, 1.5, .4, -.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1.2, -.15); ctx.lineTo(2, .05); ctx.lineTo(1.2, .2);
    ctx.moveTo(-1.3, 0); ctx.lineTo(-2, -.4); ctx.lineTo(-1.8, 0); ctx.lineTo(-2, .4); ctx.lineTo(-1.3, .1);
    ctx.moveTo(-.4, -.3); ctx.lineTo(-.5, -.8); ctx.lineTo(.2, -.35); ctx.fill();
  }
  private load(width = 384) {
    width = Math.min(1675, Math.max(384, width));
    if (this.body && this.body.width >= width && this.splash) return true;
    if (typeof document === 'undefined') return false;
    const crop = (id: string, rect: number[], width: number) => {
      const image = document.getElementById(id) as HTMLImageElement | null;
      if (!image) return;
      image.loading = 'eager';
      if (!image.complete || !image.naturalWidth) return;
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width * rect[3] / rect[2]);
      canvas.getContext('2d')!.drawImage(image, rect[0], rect[1], rect[2], rect[3], 0, 0, canvas.width, canvas.height);
      return canvas;
    };
    if (!this.body || this.body.width < width) this.body = crop('dolphin-sprite', [53, 102, 1675, 626], width) ?? this.body;
    this.splash ??= crop('dolphin-splash', [69, 133, 1651, 671], 320);
    return !!this.body && !!this.splash;
  }
  guides(ctx: CanvasRenderingContext2D, stage: StageDef, settings: DolphinSettings, scale: number, mini = false) {
    if (!settings.enabled) return;
    const width = stage.width ?? 26, factor = dolphinScale(settings);
    if (!mini && (this.guideWidth !== width || this.guideScale !== factor)) {
      this.guidePath = new Path2D(); this.guideWidth = width; this.guideScale = factor;
      for (let i = 0; i <= 90; i++) {
        const p = dolphinPose(stage, 0, i / 90 * DOLPHIN_DURATION, 1, factor);
        i ? this.guidePath.lineTo(p.x, p.y) : this.guidePath.moveTo(p.x, p.y);
      }
    }
    ctx.save(); ctx.strokeStyle = sceneColor('#65efdab0'); ctx.fillStyle = sceneColor('#65efda');
    ctx.lineWidth = 1.3 / scale; ctx.setLineDash([6 / scale, 5 / scale]); ctx.font = `${12 / scale}px sans-serif`; ctx.textAlign = 'left';
    settings.rows.forEach((row, index) => {
      ctx.beginPath(); ctx.moveTo(0, row); ctx.lineTo(width, row); ctx.stroke();
      if (!mini) {
        ctx.fillText(`↕ ${index + 1}번 줄`, .3, row - 5 / scale);
        ctx.save(); ctx.globalAlpha = .35; ctx.translate(0, row); ctx.stroke(this.guidePath!); ctx.restore();
      }
    });
    ctx.restore();
  }
  draw(ctx: CanvasRenderingContext2D, stage: StageDef, settings: DolphinSettings, elapsed: number, view: View, preview = false) {
    if (!settings.enabled) return;
    const transform = ctx.getTransform(), factor = dolphinScale(settings);
    this.load(Math.ceil(DOLPHIN_WIDTH * factor * Math.hypot(transform.a, transform.b) / 128) * 128);
    const { time, wave } = dolphinWave(settings, elapsed, preview);
    if (time > DOLPHIN_DURATION + .65) return;
    if (this.width !== (stage.width ?? 26) || this.effectScale !== factor) {
      this.width = stage.width ?? 26; this.effectScale = factor;
      this.events = Array.from({ length: 6 }, (_, i) => {
        const hop = Math.floor(i / 2), exiting = i % 2 === 0, period = DOLPHIN_DURATION / 3;
        let lo = (hop + (exiting ? 0 : .5)) * period, hi = (hop + (exiting ? DOLPHIN_SWIM / 2 : 1 - DOLPHIN_SWIM / 2)) * period;
        for (let j = 0; j < 24; j++) {
          const at = (lo + hi) / 2, p = dolphinPose(stage, 0, at, 1, factor), front = p.y + Math.sin(p.angle) * 62 / 36 * factor;
          if (exiting ? front > 0 : front < 0) lo = at; else hi = at;
        }
        const at = (lo + hi) / 2, p = dolphinPose(stage, 0, at, 1, factor);
        return { at, x: p.x + Math.cos(p.angle) * 62 / 36 * factor };
      });
    }
    settings.rows.forEach((row, index) => {
      if (row < view.top - 3 * factor || row > view.bottom + 5 * factor) return;
      const direction = (wave + index) % 2 ? -1 : 1, p = dolphinPose(stage, row, time, direction, factor);
      ctx.save();
      for (const event of this.events) {
        const age = time - event.at;
        if (age < 0 || age > .65) continue;
        const progress = age / .65, width = 105 / 36 * factor * (.45 + Math.sin(progress * Math.PI / 2) * .7);
        const x = direction === 1 ? event.x : this.width - event.x;
        if (x + width < view.left || x - width > view.right) continue;
        ctx.globalAlpha = Math.min(1, age / .045) * (1 - progress) * .92;
        if (this.splash) {
          const height = width * this.splash.height / this.splash.width;
          ctx.drawImage(this.splash, x - width / 2, row + 4 / 36 * factor - height, width, height);
        } else {
          ctx.strokeStyle = '#76bdce'; ctx.lineWidth = .04 * factor; ctx.beginPath(); ctx.ellipse(x, row, width / 2, .12 * factor, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (time <= DOLPHIN_DURATION && p.x + 3 * factor >= view.left && p.x - 3 * factor <= view.right) {
        ctx.beginPath(); ctx.rect(view.left, view.top, view.right - view.left, Math.max(0, row - view.top)); ctx.clip();
        ctx.translate(p.x, p.y); ctx.scale(direction * factor, factor); ctx.rotate(p.angle);
        this.drawBody(ctx);
      }
      ctx.restore();
    });
  }
}
