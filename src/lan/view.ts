import { SpringControls } from '../spring-controls';
import { drawEntities } from '../draw';
import { bridgeBallOpacity, drawMapArt, drawMapOverlay } from '../map-art';
import { drawWind } from '../wind-render';
import { drawCelebration } from '../celebration';
import { RenderCache } from '../render-cache';
import { drawMarble } from '../marble-art';
import { Recorder } from '../recorder';
import { SnapshotPlayback } from './playback';
import type { Scene, Frame } from './protocol';
import type { Ball } from '../race';
import type { StageDef } from '../data/maps';
import type { MapEntityState } from '../types/MapEntity.type';

export class LanView {
  focusedBallId: number | null = null;
  canControl = false;
  onSpring: (index: number) => void = () => {};
  private springControls: SpringControls;
  zoom = 1;
  celebrationRightInset = 18;
  onZoomChange: (zoom: number) => void = () => {};
  onBoost: (active: boolean) => void = () => {};
  recording = false;
  state: Frame['state'] = 'ready';
  balls: Ball[] = [];
  private scene?: Scene;
  private minimapStage?: StageDef;
  private playback = new SnapshotPlayback();
  private lastDraw = 0;
  private cache = new RenderCache();
  private ctx: CanvasRenderingContext2D;
  private camera = { x: 12.85, y: 4 };
  private manual: { x: number; y: number } | null = null;
  private minimap = { x: 16, y: 26, w: 115, h: 400, scale: 4 };
  private width = 1000;
  private height = 600;
  private winnerAt = 0;
  private reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private recorder = new Recorder();
  private recordStop?: ReturnType<typeof setTimeout>;
  constructor(readonly canvas: HTMLCanvasElement) {
    this.springControls = new SpringControls(canvas, index => this.onSpring(index), () => this.state === 'running');
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    new ResizeObserver(() => {
      const size = canvas.getBoundingClientRect();
      this.width = Math.max(1, size.width); this.height = Math.max(1, size.height);
    }).observe(canvas);
    const followMinimap = (event: PointerEvent) => {
      const r = canvas.getBoundingClientRect(), x = event.clientX - r.left, y = event.clientY - r.top, m = this.minimap;
      this.manual = x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h
        ? { x: (x - m.x) / m.scale, y: (y - m.y) / m.scale } : null;
    };
    const release = () => this.onBoost(false);
    canvas.addEventListener('pointerdown', (event) => {
      if (this.springControls.select(event)) { release(); return; }
      followMinimap(event);
      if (this.canControl && event.pointerType === 'mouse' && event.button === 0 && this.state === 'running') {
        this.onBoost(true); canvas.setPointerCapture(event.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse' && !(event.buttons & 1)) release();
      if (event.pointerType !== 'touch') followMinimap(event);
    });
    canvas.addEventListener('pointerleave', (event) => { if (event.pointerType !== 'touch') this.follow(); });
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('pointercancel', () => { release(); this.follow(); });
    window.addEventListener('blur', release);
    canvas.addEventListener('wheel', (event) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
      this.setZoom(this.zoom * Math.exp(-Math.max(-150, Math.min(150, delta)) * .002));
    }, { passive: false });
    const render = (now: number) => { this.draw(now); requestAnimationFrame(render); };
    requestAnimationFrame(render);
  }
  get arrivals() { return this.balls.filter((ball) => ball.rank).sort((a, b) => a.rank! - b.rank!); }
  follow() { this.manual = null; }
  setZoom(value: number) {
    if (!Number.isFinite(value)) return;
    this.zoom = Math.max(.35, Math.min(3, value)); this.onZoomChange(this.zoom);
  }
  startRecording() { this.recorder.start(this.canvas); this.recording = true; }
  stopRecording() { clearTimeout(this.recordStop); this.recorder.stop(); this.recording = false; }
  setScene(scene: Scene) {
    if (this.scene?.raceId !== scene.raceId) {
      this.stopRecording(); this.winnerAt = 0; this.manual = null;
      this.cache = new RenderCache();
      const count = scene.balls.length, rows = Math.ceil(count / 10), offset = (scene.stage.spawnX ?? 12.85) - 12.85;
      this.camera = { x: offset + (count < 10 ? 10.1 + (Math.max(1, count) - 1) * .305 : 12.85), y: 5 - (rows - 1) * .31 };
      this.balls = scene.balls.map((b) => ({ ...b, x: 0, y: 0, angle: 0, stuck: 0 }));
    }
    this.springControls.reset();
    this.scene = scene; this.playback.reset();
    this.minimapStage = { ...scene.stage, entities: scene.entities.filter((_, i) => scene.fixed[i]).map((e) => ({
      position: { x: e.x, y: e.y }, type: 'static', shape: e.shape,
      props: { density: 1, restitution: 0, angularVelocity: 0 },
    })) };
  }
  push(frame: Frame) {
    if (frame.raceId !== this.scene?.raceId || frame.revision !== this.scene.revision) return;
    if (frame.state === 'finished' && this.state !== 'finished' && this.recording)
      this.recordStop = setTimeout(() => this.stopRecording(), 1800);
    this.springControls.setStatuses(frame.springs ?? []);
    this.state = frame.state; this.playback.push(frame);
  }
  private viewScale() {
    return (this.state === 'ready'
      ? Math.min(this.width / 13, this.height / Math.max(10, Math.ceil(this.balls.length / 10) * .7 + 4), 100)
      : Math.min(this.width / 20, this.height / 13, 70)) * this.zoom;
  }
  private draw(now: number) {
    const { ctx, width: w, height: h, scene } = this;
    const dt = this.lastDraw ? Math.max(0, Math.min(.1, (now - this.lastDraw) / 1000)) : 1 / 60;
    this.lastDraw = now;
    const dpr = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(w * dpr)) this.canvas.width = Math.round(w * dpr);
    if (this.canvas.height !== Math.round(h * dpr)) this.canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#070a0e'; ctx.fillRect(0, 0, w, h);
    const sample = this.playback.sample(now);
    if (!scene || !sample) return;
    const { before, after, t, elapsed } = sample, shown = t >= 1 ? after : before;
    const mix = (a: number, b: number) => a + (b - a) * t;
    const bridgeIds = new Set(shown.bridgeIds ?? []);
    after.balls.forEach((_, i) => {
      const a = before.balls[i], b = after.balls[i];
      Object.assign(this.balls[i], { x: mix(a[1], b[1]), y: mix(a[2], b[2]), angle: mix(a[3], b[3]), rank: (t >= 1 ? b[4] : a[4]) || undefined });
      this.balls[i].onBridge = bridgeIds.has(a[0]);
    });
    const { balls } = this;
    const selected = balls.find((b) => b.id === this.focusedBallId);
    const active = balls.filter((b) => !b.rank).sort((a, b) => b.y - a.y);
    const lastWinningRank = scene.settings.order === 'desc' ? balls.length : scene.settings.picks;
    const target = selected ?? active[Math.min(active.length - 1, Math.max(0, lastWinningRank - (balls.length - active.length) - 1))];
    if (target && !this.manual && (this.state !== 'ready' || selected)) {
      this.camera.x += (target.x - this.camera.x) * (1 - Math.pow(.94, dt * 60));
      this.camera.y += (target.y - this.camera.y) * (1 - Math.pow(.87, dt * 60));
    }
    const scale = this.viewScale(), cam = this.manual ?? this.camera;
    const view = { left: cam.x - w * .56 / scale, right: cam.x + w * .44 / scale,
      top: cam.y - h * .43 / scale, bottom: cam.y + h * .57 / scale };
    const beforePositions = new Map(before.positions?.map(([i, x, y]) => [i, { x, y }]));
    const afterPositions = new Map(after.positions?.map(([i, x, y]) => [i, { x, y }]));
    const entities = scene.entities.map((entity, i) => {
      const a = beforePositions.get(i) ?? entity, b = afterPositions.get(i) ?? entity;
      return { ...entity, x: mix(a.x, b.x), y: mix(a.y, b.y), angle: mix(before.angles[i], after.angles[i]) };
    });
    ctx.save(); ctx.translate(w * .56 - cam.x * scale, h * .43 - cam.y * scale); ctx.scale(scale, scale);
    drawMapArt(ctx, scene.stage, scale);
    drawEntities(ctx, scene.stage.exitBridge ? entities.filter(e => e.shape.collisionLayer !== 2) : entities, scale, -1, true, view, !!scene.stage.art);
    if (scene.stage.vortex) {
      const wind = scene.stage.vortex;
      ctx.shadowBlur = 0; ctx.strokeStyle = '#64f4e050'; ctx.lineWidth = 1.5 / scale;
      const phase = wind.speed / wind.radius * (elapsed + (wind.gust ?? 0) * (1 - Math.cos(elapsed * 1.7)) / 1.7);
      for (let i = 0; i < 3; i++) {
        const a = phase + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(wind.x, wind.y, wind.radius * .7, a, a + .5); ctx.stroke();
      }
    }
    drawWind(ctx, scene.stage.windZones ?? [], elapsed, scale);
    drawMapOverlay(ctx, scene.stage, entities, scale);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#65efda'; ctx.lineWidth = 2 / scale; ctx.setLineDash([.35, .3]);
    ctx.beginPath(); ctx.moveTo(0, scene.stage.goalY); ctx.lineTo(scene.stage.width ?? 26, scene.stage.goalY); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = 12 / scale + 'px sans-serif'; ctx.fillStyle = '#65efda'; ctx.fillText(scene.stage.art?.style === 'switchback-express' ? '200 OK' : 'FINISH', 1, scene.stage.goalY - .4);
    for (const ball of balls) {
      if (ball.rank && ball !== selected) continue;
      const labelMargin = Math.max(1, ball.name.length * 17 / scale);
      if (ball.x < view.left - labelMargin || ball.x > view.right + labelMargin || ball.y < view.top - 1 || ball.y > view.bottom + 1) continue;
      if (ball === selected) {
        ctx.strokeStyle = '#fff3a8'; ctx.lineWidth = 2 / scale; ctx.beginPath(); ctx.arc(ball.x, ball.y, .52, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = bridgeBallOpacity(scene.stage, ball);
      if (!this.cache.drawBall(ctx, ball, scale, dpr)) {
        drawMarble(ctx, ball.x, ball.y, .25, ball.color); ctx.fillStyle = ball.color;
        ctx.font = 12 / scale + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ball.name, ball.x, ball.y + .55);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.renderMinimap(entities, elapsed, cam);
    this.springControls.draw(ctx, entities, w * .56 - cam.x * scale, h * .43 - cam.y * scale, scale, h);
    ctx.textAlign = 'right'; ctx.font = '12px sans-serif'; ctx.fillStyle = '#728393';
    ctx.fillText((balls.length - active.length) + ' / ' + balls.length + ' 도착', w - 24, h - 20);
    if (this.recording) {
      ctx.fillStyle = '#ff777d'; ctx.beginPath(); ctx.arc(w - 85, 60, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillText('REC', w - 40, 64);
    }
    if (this.state === 'ready' && !balls.length) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#8496a5'; ctx.font = '16px sans-serif';
      ctx.fillText('이름을 입력하면 구슬이 나타납니다', w * .55, h * .45);
    }
    if (shown.winners.length) {
      if (!this.winnerAt) this.winnerAt = now;
      drawCelebration(ctx, shown.winners.map((id) => balls[id]), scene.settings.order,
        (now - this.winnerAt) / 1000, w, h, this.reducedMotion, this.celebrationRightInset);
    }
  }
  private renderMinimap(entities: MapEntityState[], elapsed: number, cam: { x: number; y: number }) {
    const { ctx, scene } = this;
    if (!scene) return;
    const mapWidth = scene.stage.width ?? 26;
    const scale = Math.min((this.width < 600 ? 75 : 125) / mapWidth, (this.height - 65) / scene.stage.goalY);
    const m = this.minimap = { x: 16, y: 26, w: mapWidth * scale, h: scene.stage.goalY * scale, scale };
    ctx.save(); ctx.beginPath(); ctx.rect(m.x, m.y, m.w, m.h); ctx.clip(); ctx.translate(m.x, m.y); ctx.scale(scale, scale);
    ctx.fillStyle = '#142027'; ctx.fillRect(0, 0, mapWidth, scene.stage.goalY);
    this.cache.drawMinimap(ctx, this.minimapStage!, entities, scale, Math.min(devicePixelRatio, 2));
    drawWind(ctx, scene.stage.windZones ?? [], elapsed, scale);
    drawMapOverlay(ctx, scene.stage, entities, scale);
    for (const ball of this.balls) if (!ball.rank) {
      ctx.globalAlpha = bridgeBallOpacity(scene.stage, ball);
      ctx.fillStyle = ball.id === this.focusedBallId ? '#fff3a8' : ball.color; ctx.beginPath();
      ctx.arc(ball.x, ball.y, Math.max(.23, (ball.id === this.focusedBallId ? 2.5 : 1.4) / scale), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#65efda70'; ctx.lineWidth = 1 / scale;
    const viewScale = this.viewScale();
    ctx.strokeRect(cam.x - this.width * .56 / viewScale, cam.y - this.height * .43 / viewScale, this.width / viewScale, this.height / viewScale);
    ctx.restore(); ctx.strokeStyle = '#3f7167'; ctx.lineWidth = 1; ctx.strokeRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = '#7f9a98'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('MAP OVERVIEW', m.x, 15);
  }
}
