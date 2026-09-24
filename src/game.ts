import { Race } from './race';
import type { StageDef } from './data/maps';
import { drawEntities } from './draw';
import { bridgeBallOpacity, drawMapArt, drawMapOverlay } from './map-art';
import { drawWind } from './wind-render';
import type { WinnerOrder } from './model';
import { drawCelebration } from './celebration';
import { Recorder } from './recorder';
import { RenderCache } from './render-cache';
import { drawMarble } from './marble-art';
import type { MapEntityState } from './types/MapEntity.type';
export type { Ball } from './race';
export class Game extends Race {
  private reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  speed = 1;
  private visible = true;
  private fastForward = false;
  zoom = 1;
  celebrationRightInset = 18;
  onZoomChange: (zoom: number) => void = () => {};
  recording = false;
  private ctx: CanvasRenderingContext2D;
  private recorder = new Recorder();
  private recordStop: ReturnType<typeof setTimeout> | undefined;
  private last = 0;
  private lastRender = 0;
  private accumulator = 0;
  // Blending needs a step taken since the last start, pause or resume.
  private stepped = false;
  private camera = { x: 12.8, y: 3 };
  private manual: { x: number; y: number } | null = null;
  private width = 1000;
  private height = 600;
  private minimap = { x: 18, y: 20, w: 115, h: 400, scale: 4 };
  private frameId = 0;
  private renderCache = new RenderCache();
  constructor(readonly canvas: HTMLCanvasElement) {
    super();
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
    this.fastForward = false;
    this.renderCache = new RenderCache();
    this.accumulator = 0;
    this.stepped = false;
    this.manual = null;
    super.prepare(stage, names);
    const rows = Math.ceil(names.length / 10);
    const spawnOffset = (stage.spawnX ?? 12.85) - 12.85;
    this.camera = {
      x: spawnOffset + (names.length < 10 ? 10.1 + (Math.max(1, names.length) - 1) * 0.305 : 12.85),
      y: 5 - (rows - 1) * 0.31,
    };
    this.render();
  }
  start(range: [number, number], record: boolean, order: WinnerOrder = 'asc') {
    if (!this.balls.length) throw new Error('참가자 이름을 먼저 입력해 주세요.');
    this.fastForward = false;
    this.accumulator = 0;
    this.stepped = false;
    if (record) {
      this.recorder.start(this.canvas);
      this.recording = true;
    }
    this.startRace(range, order);
  }
  pause() {
    this.fastForward = false;
    super.pause();
    this.accumulator = 0;
    this.stepped = false;
  }
  follow() {
    this.manual = null;
  }
  setZoom(value: number) {
    if (!Number.isFinite(value)) return;
    this.zoom = Math.max(0.35, Math.min(3, value));
    this.onZoomChange(this.zoom);
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    this.accumulator = 0;
    this.last = 0;
    if (visible) {
      this.resize();
      this.render();
    }
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
    if (!this.visible) {
      this.accumulator = 0;
      this.frameId = requestAnimationFrame((t) => this.frame(t));
      return;
    }
    if (this.state === 'running') {
      this.accumulator += delta * this.speed * (this.fastForward ? 2 : 1) * this.finishSlowdown();
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
  advance() {
    super.advance();
    this.stepped = true;
    if (this.state === 'finished') {
      this.fastForward = false;
      if (this.recording) this.recordStop = setTimeout(() => this.stopRecording(), 1800);
    }
  }
  private render() {
    if (!this.stage || !this.visible) return;
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
    const now = performance.now();
    const dt = this.lastRender ? Math.max(0, Math.min(0.1, (now - this.lastRender) / 1000)) : 1 / 60;
    this.lastRender = now;
    // Draw between the last two physics steps: motion stays smooth at any refresh rate or speed.
    const blend = this.state === 'running' && this.stepped ? Math.min(1, this.accumulator * 60) : 1;
    const at = (from: number | undefined, to: number) => (from === undefined ? to : from + (to - from) * blend);
    const active = this.racing();
    const target = this.focusBall(active);
    const scale = this.viewScale();
    if (this.state !== 'ready' && target && !this.manual) {
      // Same easing as 0.06 / 0.13 per frame at 60Hz, independent of the display refresh rate.
      this.camera.x += (at(target.px, target.x) - this.camera.x) * (1 - Math.pow(0.94, dt * 60));
      this.camera.y += (at(target.py, target.y) - this.camera.y) * (1 - Math.pow(0.87, dt * 60));
    }
    const cam = this.manual ?? this.camera;
    const view = {
      left: cam.x - (w * 0.56) / scale,
      right: cam.x + (w * 0.44) / scale,
      top: cam.y - (h * 0.43) / scale,
      bottom: cam.y + (h * 0.57) / scale,
    };
    const entities = this.physics.getEntities(blend);
    ctx.save();
    ctx.translate(w * 0.56 - cam.x * scale, h * 0.43 - cam.y * scale);
    ctx.scale(scale, scale);
    drawMapArt(ctx, this.stage, scale);
    drawEntities(ctx, this.stage.exitBridge ? entities.filter(e => e.shape.collisionLayer !== 2) : entities, scale, -1, true, view, !!this.stage.art);
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
    drawWind(ctx, this.stage.windZones ?? [], this.elapsed, scale);
    drawMapOverlay(ctx, this.stage, entities, scale);
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
    ctx.fillText(this.stage.art?.style === 'switchback-express' ? '200 OK' : 'FINISH', 1, this.stage.goalY - 0.4);
    for (const b of active) {
      const x = at(b.px, b.x), y = at(b.py, b.y);
      const labelMargin = Math.max(1, (b.name.length * 17) / scale);
      if (
        y < view.top - 1 || y > view.bottom + 1 ||
        x < view.left - labelMargin || x > view.right + labelMargin
      ) continue;
      ctx.globalAlpha = bridgeBallOpacity(this.stage, { x, y, onBridge: b.onBridge });
      if (this.renderCache.drawBall(ctx, b, scale, d, x, y)) { ctx.globalAlpha = 1; continue; }
      drawMarble(ctx, x, y, 0.25, b.color);
      ctx.fillStyle = b.color;
      ctx.font = `${Math.min(17, Math.max(12, scale * 0.24)) / scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#050a10';
      ctx.lineWidth = 3 / scale;
      ctx.strokeText(b.name, x, y + 0.55);
      ctx.fillText(b.name, x, y + 0.55);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.renderMinimap(entities, blend);
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

  private renderMinimap(entities: MapEntityState[] = this.physics.getEntities(), blend = 1) {
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
    drawWind(ctx, this.stage.windZones ?? [], this.elapsed, scale);
    drawMapOverlay(ctx, this.stage, entities, scale);
    for (const b of this.balls) {
      if (b.rank) continue;
      const x = b.px === undefined ? b.x : b.px + (b.x - b.px) * blend;
      const y = b.py === undefined ? b.y : b.py + (b.y - b.py) * blend;
      ctx.globalAlpha = bridgeBallOpacity(this.stage, { x, y, onBridge: b.onBridge });
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.23, 1.4 / scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
