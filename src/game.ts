import { Box2dPhysics } from './physics-box2d';
import type { StageDef } from './data/maps';
import { drawEntities } from './draw';
import { shuffled, type WinnerOrder } from './model';
import { drawCelebration } from './celebration';
import { Recorder } from './recorder';
import { RenderCache } from './render-cache';
import type { MapEntityState } from './types/MapEntity.type';
export type Ball = {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  angle: number;
  stuck: number;
  rank?: number;
};
export class Game {
  readonly physics = new Box2dPhysics();
  state: 'ready' | 'running' | 'paused' | 'finished' = 'ready';
  stage!: StageDef;
  balls: Ball[] = [];
  arrivals: Ball[] = [];
  winners: Ball[] = [];
  private winnerAt = 0;
  private winnerOrder: WinnerOrder = 'asc';
  private reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  speed = 1;
  private fastForward = false;
  zoom = 1;
  celebrationRightInset = 18;
  onZoomChange: (zoom: number) => void = () => {};
  range: [number, number] = [1, 1];
  elapsed = 0;
  recording = false;
  onFinish: (winners: Ball[]) => void = () => {};
  private ctx: CanvasRenderingContext2D;
  private recorder = new Recorder();
  private recordStop: ReturnType<typeof setTimeout> | undefined;
  private last = 0;
  private accumulator = 0;
  private camera = { x: 12.8, y: 3 };
  private manual: { x: number; y: number } | null = null;
  private width = 1000;
  private height = 600;
  private minimap = { x: 18, y: 20, w: 115, h: 400, scale: 4 };
  private frameId = 0;
  private renderCache = new RenderCache();
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    const followMinimap = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top,
        m = this.minimap;
      if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h)
        this.manual = { x: (x - m.x) / m.scale, y: (y - m.y) / m.scale };
      else this.manual = null;
    };
    const releaseSpeed = () => {
      this.fastForward = false;
    };
    canvas.addEventListener('pointerdown', (e) => {
      followMinimap(e);
      if (e.pointerType === 'mouse' && e.button === 0 && this.state === 'running') {
        this.fastForward = true;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointerup', releaseSpeed);
    canvas.addEventListener('lostpointercapture', releaseSpeed);
    window.addEventListener('blur', releaseSpeed);
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) releaseSpeed();
      if (e.pointerType !== 'touch') followMinimap(e);
    });
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch') this.follow();
    });
    canvas.addEventListener('pointercancel', () => {
      releaseSpeed();
      this.follow();
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1);
        this.setZoom(this.zoom * Math.exp(-Math.max(-150, Math.min(150, delta)) * 0.002));
      },
      { passive: false }
    );
  }
  async init(stage: StageDef, names: string[]) {
    await this.physics.init();
    this.prepare(stage, names);
    this.resize();
    this.frameId = requestAnimationFrame((t) => this.frame(t));
  }
  prepare(stage: StageDef, names: string[]) {
    this.stopRecording();
    this.state = 'ready';
    this.fastForward = false;
    this.stage = stage;
    this.renderCache = new RenderCache();
    this.arrivals = [];
    this.winners = [];
    this.winnerAt = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.manual = null;
    this.physics.clearMarbles();
    this.physics.clear();
    this.physics.createStage(stage);
    const ordered = shuffled(names);
    const rows = Math.ceil(ordered.length / 10);
    this.balls = ordered.map((name, id) => {
      const x = 10.1 + (id % 10) * 0.61 + (stage.randomizeStart ? (Math.random() - 0.5) * 0.08 : 0),
        y = 5 - Math.floor(id / 10) * 0.62 + (stage.randomizeStart ? (Math.random() - 0.5) * 0.08 : 0);
      this.physics.createMarble(id, x, y);
      return { id, name, color: `hsl(${(id * 137.508) % 360} 85% 72%)`, x, y, angle: 0, stuck: 0 };
    });
    this.camera = {
      x: ordered.length < 10 ? 10.1 + (Math.max(1, ordered.length) - 1) * 0.305 : 12.85,
      y: 5 - (rows - 1) * 0.31,
    };
    this.render();
  }
  start(range: [number, number], record: boolean, order: WinnerOrder = 'asc') {
    if (!this.balls.length) throw new Error('참가자 이름을 먼저 입력해 주세요.');
    this.fastForward = false;
    this.range = range;
    this.winnerOrder = order;
    this.elapsed = 0;
    this.accumulator = 0;
    if (record) {
      this.recorder.start(this.canvas);
      this.recording = true;
    }
    this.physics.start();
    this.state = 'running';
  }
  pause() {
    this.fastForward = false;
    if (this.state === 'running') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'running';
    this.accumulator = 0;
  }
  follow() {
    this.manual = null;
  }
  setZoom(value: number) {
    if (!Number.isFinite(value)) return;
    this.zoom = Math.max(0.35, Math.min(3, value));
    this.onZoomChange(this.zoom);
  }
  private viewScale() {
    const base =
      this.state === 'ready'
        ? Math.min(this.width / 13, this.height / Math.max(10, Math.ceil(this.balls.length / 10) * 0.7 + 4), 100)
        : Math.min(this.width / 20, this.height / 13, 70);
    return base * this.zoom;
  }
  stopRecording() {
    clearTimeout(this.recordStop);
    this.recorder.stop();
    this.recording = false;
  }
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    // ResizeObserver runs after RAF. Keep the previous bitmap until the next render.
  }
  private frame(now: number) {
    const delta = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    if (this.state === 'running') {
      const candidates = this.balls.filter((b) => !b.rank).sort((a, b) => b.y - a.y);
      const target = candidates[Math.min(candidates.length - 1, Math.max(0, this.range[1] - this.arrivals.length - 1))];
      const slow = !this.winners.length && target && target.y > this.stage.goalY - 4 ? 0.45 : 1;
      this.accumulator += delta * this.speed * (this.fastForward ? 2 : 1) * slow;
      const physicsStart = performance.now();
      const maxSteps = Math.max(1, Math.ceil(this.speed * (this.fastForward ? 2 : 1) * 2));
      let steps = 0;
      while (
        this.accumulator >= 1 / 60 &&
        this.state === 'running' &&
        steps < maxSteps &&
        (steps === 0 || performance.now() - physicsStart < 6)
      ) {
        this.advance();
        this.accumulator -= 1 / 60;
        steps++;
      }
      // Drop overdue wall-clock time, never physics steps: collisions still advance at 1/60.
      // Under load the race slows down instead of creating a catch-up workload next frame.
      if (this.accumulator >= 1 / 60) this.accumulator %= 1 / 60;
    }
    this.render();
    this.frameId = requestAnimationFrame((t) => this.frame(t));
  }
  private advance() {
    this.physics.step(1 / 60);
    this.elapsed += 1 / 60;
    const crossing: { ball: Ball; fraction: number }[] = [];
    for (const ball of this.balls) {
      if (ball.rank) continue;
      const p = this.physics.getMarblePosition(ball.id);
      const oldY = ball.y;
      ball.stuck = Math.hypot(p.x - ball.x, p.y - ball.y) < 0.0002 ? ball.stuck + 1 / 60 : 0;
      if (ball.stuck > 4) {
        this.physics.shakeMarble(ball.id);
        ball.stuck = 0;
      }
      ball.x = p.x;
      ball.y = p.y;
      ball.angle = p.angle;
      if (p.y >= this.stage.goalY)
        crossing.push({ ball, fraction: (this.stage.goalY - oldY) / Math.max(0.000001, p.y - oldY) });
    }
    crossing.sort((a, b) => a.fraction - b.fraction || a.ball.id - b.ball.id);
    for (const { ball } of crossing) {
      ball.rank = this.arrivals.length + 1;
      this.arrivals.push(ball);
      this.physics.removeMarble(ball.id);
    }
    if (!this.winners.length) {
      const trailingWinnersKnown = this.range[1] === this.balls.length && this.arrivals.length >= this.range[0] - 1;
      if (trailingWinnersKnown || this.arrivals.length >= this.range[1]) {
        this.winners = trailingWinnersKnown
          ? [...this.arrivals.slice(this.range[0] - 1), ...this.balls.filter((ball) => !ball.rank)]
          : this.arrivals.slice(this.range[0] - 1, this.range[1]);
        this.winnerAt = performance.now();
      }
    }
    // Membership is fixed at announcement; actual ranks settle as the remaining balls arrive.
    this.winners.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    if (this.arrivals.length === this.balls.length) {
      this.state = 'finished';
      this.fastForward = false;
      this.onFinish(this.winners);
      if (this.recording) this.recordStop = setTimeout(() => this.stopRecording(), 1800);
    }
  }
  private render() {
    if (!this.stage) return;
    const ctx = this.ctx,
      w = this.width,
      h = this.height,
      d = Math.min(devicePixelRatio, 2);
    const pixelWidth = Math.max(1, Math.round(w * d)),
      pixelHeight = Math.max(1, Math.round(h * d));
    // Changing either dimension clears the canvas; resize and paint in the same callback.
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    ctx.setTransform(this.canvas.width / w, 0, 0, this.canvas.height / h, 0, 0);
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(0, 0, w, h);
    const active = this.balls.filter((b) => !b.rank).sort((a, b) => b.y - a.y);
    const target = active[Math.min(active.length - 1, Math.max(0, this.range[1] - this.arrivals.length - 1))];
    const scale = this.viewScale();
    if (this.state !== 'ready' && target && !this.manual) {
      this.camera.x += (target.x - this.camera.x) * 0.06;
      this.camera.y += (target.y - this.camera.y) * 0.13;
    }
    const cam = this.manual ?? this.camera;
    const view = {
      left: cam.x - (w * 0.56) / scale,
      right: cam.x + (w * 0.44) / scale,
      top: cam.y - (h * 0.43) / scale,
      bottom: cam.y + (h * 0.57) / scale,
    };
    const entities = this.physics.getEntities();
    ctx.save();
    ctx.translate(w * 0.56 - cam.x * scale, h * 0.43 - cam.y * scale);
    ctx.scale(scale, scale);
    drawEntities(ctx, entities, scale, -1, true, view);
    if (this.stage.vortex) {
      const wind = this.stage.vortex;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#64f4e050';
      ctx.lineWidth = 1.5 / scale;
      const phase = wind.speed / wind.radius * (this.elapsed +
        (wind.gust ?? 0) * (1 - Math.cos(this.elapsed * 1.7)) / 1.7);
      for (let i = 0; i < 3; i++) {
        const a = phase + i * Math.PI * 2 / 3, r = wind.radius * 0.7;
        ctx.beginPath();
        ctx.arc(wind.x, wind.y, r, a, a + 0.5);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#65efda';
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([0.35, 0.3]);
    ctx.beginPath();
    ctx.moveTo(0, this.stage.goalY);
    ctx.lineTo(this.stage.width ?? 26, this.stage.goalY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${12 / scale}px sans-serif`;
    ctx.fillStyle = '#65efda';
    ctx.fillText('FINISH', 1, this.stage.goalY - 0.4);
    for (const b of active) {
      const labelMargin = Math.max(1, (b.name.length * 17) / scale);
      if (
        b.y < view.top - 1 || b.y > view.bottom + 1 ||
        b.x < view.left - labelMargin || b.x > view.right + labelMargin
      ) continue;
      if (this.renderCache.drawBall(ctx, b, scale, d)) continue;
      ctx.beginPath();
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 7;
      ctx.arc(b.x, b.y, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff60';
      ctx.lineWidth = 1 / scale;
      ctx.stroke();
      ctx.font = `${Math.min(17, Math.max(12, scale * 0.24)) / scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#050a10';
      ctx.lineWidth = 3 / scale;
      ctx.strokeText(b.name, b.x, b.y + 0.55);
      ctx.fillText(b.name, b.x, b.y + 0.55);
    }
    ctx.restore();
    this.renderMinimap(entities);
    ctx.textAlign = 'right';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#728393';
    ctx.fillText(`${this.arrivals.length} / ${this.balls.length} 도착`, w - 24, h - 20);
    if (this.recording) {
      ctx.fillStyle = '#ff777d';
      ctx.beginPath();
      ctx.arc(w - 85, 60, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('REC', w - 40, 64);
    }
    if (this.state === 'ready' && !this.balls.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8496a5';
      ctx.font = '16px sans-serif';
      ctx.fillText('이름을 입력하면 구슬이 나타납니다', w * 0.55, h * 0.45);
    }
    if (this.winners.length) {
      drawCelebration(
        ctx,
        this.winners,
        this.winnerOrder,
        (performance.now() - this.winnerAt) / 1000,
        w,
        h,
        this.reducedMotion,
        this.celebrationRightInset
      );
    }
  }

  private renderMinimap(entities: MapEntityState[] = this.physics.getEntities()) {
    const ctx = this.ctx;
    const mapWidth = this.stage.width ?? 26;
    const scale = Math.min((this.width < 600 ? 75 : 125) / mapWidth, (this.height - 65) / this.stage.goalY);
    const m = (this.minimap = { x: 16, y: 26, w: mapWidth * scale, h: this.stage.goalY * scale, scale });
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.x, m.y, m.w, m.h);
    ctx.clip();
    ctx.translate(m.x, m.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#142027';
    ctx.fillRect(0, 0, mapWidth, this.stage.goalY);
    this.renderCache.drawMinimap(ctx, this.stage, entities, scale, Math.min(devicePixelRatio, 2));
    for (const b of this.balls) {
      if (b.rank) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(0.23, 1.4 / scale), 0, Math.PI * 2);
      ctx.fill();
    }
    const cam = this.manual ?? this.camera;
    ctx.strokeStyle = '#65efda70';
    ctx.lineWidth = 1 / scale;
    const viewScale = this.viewScale();
    ctx.strokeRect(
      cam.x - (this.width * 0.56) / viewScale,
      cam.y - (this.height * 0.43) / viewScale,
      this.width / viewScale,
      this.height / viewScale
    );
    ctx.restore();
    ctx.strokeStyle = '#3f7167';
    ctx.lineWidth = 1;
    ctx.strokeRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = '#7f9a98';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MAP OVERVIEW', m.x, 15);
  }
}
