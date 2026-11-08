import { SpringControls } from '../spring-controls';
import { drawEntities } from '../draw';
import { drawGoalArea, raceProgress } from '../finish';
import { bridgeBallOpacity, drawMapArt, drawMapOverlay } from '../map-art';
import { drawWind } from '../wind-render';
import { drawCelebration } from '../celebration';
import { drawFunnelEntryCue } from '../funnel-art';
import { RenderCache } from '../render-cache';
import { drawMarble } from '../marble-art';
import { MarbleElasticity } from '../marble-elasticity';
import { Recorder } from '../recorder';
import { toast } from '../ui';
import { SnapshotPlayback } from './playback';
import type { Scene, Frame } from './protocol';
import type { Ball } from '../race';
import type { StageDef } from '../data/maps';
import type { MapEntityState } from '../types/map-entity';
import { DOLPHIN_DURATION, validateDolphins, type DolphinSettings } from '../dolphin';
import { SeaAnimalRenderer as DolphinRenderer } from '../sea-animal-render';
import type { AnimalKind } from '../sea-animals';
import { DolphinDrag } from '../dolphin-drag';
import { PersonalSpringPlacement, drawPlacedSprings } from './spring-placement';
import type { SpringPlacement } from '../personal-spring';

export class LanView {
  private focusedId: number | null = null;
  get focusedBallId() {
    return this.focusedId;
  }
  set focusedBallId(value: number | null) {
    this.focusedId = value;
    this.renderDirty = true;
  }
  canControl = false;
  onSpring: (index: number) => void = () => {};
  onPlaceSpring: (placement: SpringPlacement) => void = () => {};
  onUseSpring: () => void = () => {};
  onPlacementChange: () => void = () => {};
  readonly springPlacement = new PersonalSpringPlacement();
  personalSpring?: Frame['personalSpring'];
  springConnected = false;
  private springView = { x: 0, y: 0, scale: 1 };
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
  private lastFrameDraw = -Infinity;
  private visible = true;
  private renderDirty = true;
  private cameraMoving = false;
  private playbackMoving = false;
  private entities: MapEntityState[] = [];
  private positions = new WeakMap<Frame, Map<number, [number, number]>>();
  private bridgeIds = new WeakMap<Frame, Set<number>>();
  private cache = new RenderCache();
  private marbleElasticity = new MarbleElasticity();
  private elasticFrameSeq = -1;
  private ctx: CanvasRenderingContext2D;
  private camera = { x: 12.85, y: 4 };
  private goalScale = 0;
  private goalFollow = false;
  private manual: { x: number; y: number } | null = null;
  private minimap = { x: 16, y: 26, w: 115, h: 400, scale: 4 };
  private width = 1000;
  private height = 600;
  private winnerAt = 0;
  private reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  private drainCueAt = 0;
  private drainCueDone = false;
  private recorder = new Recorder(() => {
    this.recording = false;
    this.renderDirty = true;
    toast('녹화가 예기치 않게 종료됐어요.');
  });
  private recordStop?: ReturnType<typeof setTimeout>;
  private dolphinRenderer = new DolphinRenderer();
  private dolphinDrag: DolphinDrag;
  private dolphinDraft?: DolphinSettings;
  private dolphinOverview = false;
  private dolphinPreview = true;
  private dolphinPreviewElapsed = DOLPHIN_DURATION / 2;
  private dolphinPreviewLast = 0;
  private readyCamera = { x: 12.85, y: 4 };
  private noDolphins: DolphinSettings = { enabled: false, rows: [], interval: 5 };
  get dolphins() {
    return this.dolphinDraft ?? this.scene?.settings.dolphins ?? this.noDolphins;
  }
  onDolphinChange: (settings: DolphinSettings, commit: boolean) => void = () => {};
  constructor(readonly canvas: HTMLCanvasElement) {
    this.dolphinDrag = new DolphinDrag(
      canvas,
      () => this.canControl && this.state === 'ready' && this.dolphinPreview && !this.springPlacement.active,
      () => (this.dolphinRenderer.kind === 'manta' ? this.dolphins.manta! : this.dolphins),
      () => this.scene?.stage,
      (index, y, commit) => {
        const manta = this.dolphinRenderer.kind === 'manta';
        const options = manta ? this.dolphins.manta! : this.dolphins;
        const rows = [...options.rows];
        rows[index] = y;
        this.setDolphins(manta ? { ...this.dolphins, manta: { ...options, rows } } : { ...this.dolphins, rows });
        this.onDolphinChange(this.dolphins, commit);
      }
    );
    this.springControls = new SpringControls(
      canvas,
      (index) => this.onSpring(index),
      () => this.state === 'running'
    );
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    window.addEventListener('pinball-marble-design-change', () => {
      this.renderDirty = true;
    });
    new ResizeObserver(() => {
      const size = canvas.getBoundingClientRect();
      this.width = Math.max(1, size.width);
      this.height = Math.max(1, size.height);
      this.renderDirty = true;
    }).observe(canvas);
    const followMinimap = (event: PointerEvent) => {
      this.renderDirty = true;
      const r = canvas.getBoundingClientRect(),
        x = event.clientX - r.left,
        y = event.clientY - r.top,
        m = this.minimap;
      this.manual =
        x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h
          ? { x: (x - m.x) / m.scale, y: (y - m.y) / m.scale }
          : null;
    };
    const release = () => this.onBoost(false);
    canvas.addEventListener('pointerdown', (event) => {
      if (this.springPlacement.active) {
        if (event.isPrimary === false || (event.button !== 0 && event.pointerType !== 'touch') || !this.springConnected)
          return;
        event.preventDefault();
        try {
          const placement = this.springPlacement.choose(this.springPoint(event));
          if (placement) {
            this.cancelSpringPlacement();
            this.onPlaceSpring(placement);
          } else this.onPlacementChange();
        } catch (error) {
          toast(error instanceof Error ? error.message : String(error));
        }
        this.renderDirty = true;
        return;
      }
      if (this.springControls.select(event)) {
        release();
        this.renderDirty = true;
        return;
      }
      followMinimap(event);
      if (this.canControl && event.pointerType === 'mouse' && event.button === 0 && this.state === 'running') {
        this.onBoost(true);
        canvas.setPointerCapture(event.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (event) => {
      if (this.springPlacement.active) {
        if (event.isPrimary === false) return;
        this.springPlacement.move(this.springPoint(event));
        this.renderDirty = true;
        return;
      }
      if (event.pointerType === 'mouse' && !(event.buttons & 1)) release();
      if (event.pointerType !== 'touch') followMinimap(event);
    });
    canvas.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') this.follow();
    });
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('pointercancel', () => {
      release();
      this.follow();
    });
    window.addEventListener('blur', release);
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && this.springPlacement.active) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.cancelSpringPlacement();
          return;
        }
        const target = event.target as HTMLElement | null;
        if (
          event.code !== 'Space' ||
          target?.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target?.tagName ?? '') ||
          document.querySelector('dialog[open]')
        )
          return;
        if (!this.springPlacement.active && this.springControls.selected >= 0) return;
        if (this.springPlacement.active || this.personalSpring?.state === 'placed') {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!event.repeat && !this.springPlacement.active && this.springConnected && this.state === 'running')
            this.onUseSpring();
        }
      },
      { capture: true }
    );
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (event.ctrlKey) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
        this.setZoom(this.zoom * Math.exp(-Math.max(-150, Math.min(150, delta)) * 0.002));
      },
      { passive: false }
    );
    const render = (now: number) => {
      this.frame(now);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }
  get arrivals() {
    return this.balls.filter((ball) => ball.rank).sort((a, b) => a.rank! - b.rank!);
  }
  beginSpringPlacement() {
    if (!this.scene || !this.springConnected || this.personalSpring?.state !== 'available' || this.state === 'finished')
      return;
    this.springPlacement.begin(this.scene.stage);
    this.springControls.selected = -1;
    this.dolphinOverview = false;
    this.onBoost(false);
    this.manual = null;
    this.setZoom(1);
    this.onPlacementChange();
  }
  cancelSpringPlacement() {
    this.springPlacement.cancel();
    if (this.state === 'ready') this.camera = { ...this.readyCamera };
    this.renderDirty = true;
    this.onPlacementChange();
  }
  private springPoint(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top,
      m = this.minimap,
      t = this.springView;
    return x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h
      ? { x: (x - m.x) / m.scale, y: (y - m.y) / m.scale }
      : { x: (x - t.x) / t.scale, y: (y - t.y) / t.scale };
  }
  setDolphins(settings: DolphinSettings) {
    if (this.state !== 'ready' || !this.scene || !this.canControl) return;
    this.dolphinDraft = validateDolphins(settings, this.scene.stage);
    if (!(this.dolphinRenderer.kind === 'manta' ? settings.manta?.enabled : settings.enabled) && this.dolphinOverview) {
      this.dolphinOverview = false;
      this.camera = { ...this.readyCamera };
      this.manual = null;
    }
    if (!(this.dolphinRenderer.kind === 'manta' ? settings.manta?.enabled : settings.enabled))
      this.dolphinRenderer.kind = settings.enabled ? 'dolphin' : settings.manta?.enabled ? 'manta' : 'dolphin';
    this.renderDirty = true;
  }
  setDolphinPreview(show: boolean) {
    this.dolphinPreview = show;
    this.dolphinPreviewLast = 0;
    this.renderDirty = true;
  }
  showDolphinLayout(resetZoom = true, kind?: AnimalKind) {
    if (kind) this.dolphinRenderer.kind = kind;
    if (
      this.state !== 'ready' ||
      !this.scene ||
      !(this.dolphinRenderer.kind === 'manta' ? this.dolphins.manta?.enabled : this.dolphins.enabled)
    )
      return;
    this.dolphinOverview = true;
    this.manual = null;
    if (resetZoom) {
      this.zoom = 1;
      this.onZoomChange(1);
    }
    this.camera = {
      x: (this.scene.stage.width ?? 26) / 2,
      y: this.scene.stage.goalY / 2 - (this.height * 0.07) / this.viewScale(),
    };
    this.renderDirty = true;
  }
  follow(closeOverview = false) {
    if (closeOverview && this.state !== 'ready') this.goalFollow = true;
    if (closeOverview && this.state === 'ready' && this.dolphinOverview) {
      this.dolphinOverview = false;
      this.camera = { ...this.readyCamera };
    }
    this.manual = null;
    this.renderDirty = true;
  }
  setZoom(value: number) {
    if (!Number.isFinite(value)) return;
    this.zoom = Math.max(0.35, Math.min(3, value));
    this.renderDirty = true;
    this.onZoomChange(this.zoom);
  }
  startRecording() {
    this.recorder.start(this.canvas);
    this.recording = true;
  }
  stopRecording() {
    clearTimeout(this.recordStop);
    this.recorder.stop();
    this.recording = false;
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    this.dolphinPreviewLast = 0;
    if (visible) {
      this.renderDirty = true;
      this.lastDraw = 0;
    }
  }
  setScene(scene: Scene) {
    const keepPlayback =
      this.scene?.raceId === scene.raceId &&
      JSON.stringify(this.scene.settings) === JSON.stringify(scene.settings) &&
      JSON.stringify(this.scene.entities) === JSON.stringify(scene.entities);
    this.dolphinDraft = undefined;
    if (!scene.settings.dolphins?.manta?.enabled) this.dolphinRenderer.kind = 'dolphin';
    if (
      !(this.dolphinRenderer.kind === 'manta'
        ? scene.settings.dolphins?.manta?.enabled
        : scene.settings.dolphins?.enabled)
    )
      this.dolphinOverview = false;
    if (!keepPlayback && (this.scene?.raceId !== scene.raceId || this.scene.revision !== scene.revision)) {
      this.marbleElasticity.reset();
      this.elasticFrameSeq = -1;
    }
    if (this.scene?.raceId !== scene.raceId) {
      this.springPlacement?.cancel();
      this.personalSpring = undefined;
      if (this.scene && JSON.stringify(this.scene.stage) !== JSON.stringify(scene.stage)) this.setZoom(1);
      this.goalScale = 0;
      this.goalFollow = false;
      this.lastDraw = 0;
      this.dolphinPreviewElapsed = DOLPHIN_DURATION / 2;
      this.dolphinPreviewLast = 0;
      this.drainCueAt = 0;
      this.drainCueDone = false;
      this.stopRecording();
      this.winnerAt = 0;
      this.manual = null;
      this.cache = new RenderCache();
      const count = scene.balls.length,
        rows = Math.ceil(count / 10),
        offset = (scene.stage.spawnX ?? 12.85) - 12.85;
      this.camera = {
        x: offset + (count < 10 ? 10.1 + (Math.max(1, count) - 1) * 0.305 : 12.85),
        y: 5 - (rows - 1) * 0.31,
      };
      this.readyCamera = { ...this.camera };
      this.balls = scene.balls.map((b) => ({ ...b, x: 0, y: 0, angle: 0, stuck: 0 }));
    }
    this.springControls.reset();
    this.scene = scene;
    if (!keepPlayback) this.playback.reset();
    if (this.dolphinOverview && this.state === 'ready') this.showDolphinLayout(false);
    this.renderDirty = true;
    this.entities = scene.entities.map((entity) => ({ ...entity }));
    this.positions = new WeakMap();
    this.bridgeIds = new WeakMap();
    this.minimapStage = {
      ...scene.stage,
      entities: scene.entities
        .filter((_, i) => scene.fixed[i])
        .map((e) => ({
          position: { x: e.x, y: e.y },
          type: 'static',
          shape: e.shape,
          props: { density: 1, restitution: 0, angularVelocity: 0 },
        })),
    };
  }
  push(frame: Frame) {
    if (frame.raceId !== this.scene?.raceId || frame.revision !== this.scene.revision) return;
    if (frame.state === 'finished' && this.state !== 'finished' && this.recording)
      this.recordStop = setTimeout(() => this.stopRecording(), 1800);
    if (frame.state !== this.state) this.renderDirty = true;
    if (frame.state !== 'running') {
      this.marbleElasticity.reset();
      this.elasticFrameSeq = -1;
    }
    this.springControls.setStatuses(frame.springs ?? []);
    this.personalSpring = frame.personalSpring;
    if (this.springPlacement?.active && (frame.personalSpring?.state !== 'available' || frame.state === 'finished'))
      this.cancelSpringPlacement();
    if (frame.state === 'running' && this.state === 'ready' && this.dolphinOverview) {
      this.camera = { ...this.readyCamera };
      this.manual = null;
      this.dolphinOverview = false;
    }
    this.state = frame.state;
    this.playback.push(frame);
  }
  private viewScale() {
    if (this.springPlacement?.active && this.springPlacement.origin)
      return Math.min(this.width / 20, this.height / 13, 70) * this.zoom;
    if (this.springPlacement?.active && this.scene)
      return (
        Math.min(
          Math.max(1, this.width - (this.width < 600 ? 24 : 180)) / ((this.scene.stage.width ?? 26) + 4),
          Math.max(1, this.height - 45) / (this.scene.stage.goalY + 4)
        ) * this.zoom
      );
    if (this.scene?.stage.goalArea && (this.state !== 'ready' || this.dolphinOverview)) {
      const fitted = Math.min(
        Math.max(1, this.width - (this.width < 600 ? 24 : 180)) / ((this.scene.stage.width ?? 26) + 4),
        Math.max(1, this.height - 45) / (this.scene.stage.goalY + 4)
      );
      return (this.state !== 'ready' && this.goalScale ? this.goalScale : fitted) * this.zoom;
    }
    if (this.state === 'ready' && this.dolphinOverview && this.scene)
      return (
        Math.min(
          Math.max(1, this.width - 180) / ((this.scene.stage.width ?? 26) + 4),
          Math.max(1, this.height - 45) / (this.scene.stage.goalY + 4)
        ) * this.zoom
      );
    return (
      (this.state === 'ready'
        ? Math.min(this.width / 13, this.height / Math.max(10, Math.ceil(this.balls.length / 10) * 0.7 + 4), 100)
        : Math.min(this.width / 20, this.height / 13, 70)) * this.zoom
    );
  }
  private frame(now: number) {
    if (!this.visible) {
      this.dolphinPreviewLast = 0;
      return;
    }
    const previewing =
      this.state === 'ready' &&
      this.dolphinPreview &&
      (this.dolphins?.enabled || this.dolphins?.manta?.enabled) &&
      !this.reducedMotion?.matches &&
      (typeof document === 'undefined' || !document.hidden);
    if (previewing) {
      const gap = now - this.dolphinPreviewLast;
      if (this.dolphinPreviewLast && gap < 250) this.dolphinPreviewElapsed += Math.max(0, Math.min(0.1, gap / 1000));
      this.dolphinPreviewLast = now;
    } else this.dolphinPreviewLast = 0;
    if (
      this.state !== 'running' &&
      !previewing &&
      !this.recording &&
      !this.renderDirty &&
      !this.cameraMoving &&
      !this.playbackMoving &&
      !this.cache?.warming &&
      (!this.winnerAt || now - this.winnerAt >= 1400) &&
      (!this.drainCueAt || now - this.drainCueAt >= 450) &&
      now - this.lastFrameDraw < 100
    )
      return;
    this.lastFrameDraw = now;
    this.renderDirty = false;
    this.draw(now);
  }
  private framePositions(frame: Frame) {
    let positions = this.positions.get(frame);
    if (!positions) {
      positions = new Map(frame.positions?.map(([i, x, y]) => [i, [x, y] as [number, number]]));
      this.positions.set(frame, positions);
    }
    return positions;
  }
  private draw(now: number) {
    const { width: w, height: h, scene } = this;
    const ctx = this.ctx;
    const dt = this.lastDraw ? Math.max(0, Math.min(0.1, (now - this.lastDraw) / 1000)) : 1 / 60;
    this.lastDraw = now;
    const dpr = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(w * dpr)) this.canvas.width = Math.round(w * dpr);
    if (this.canvas.height !== Math.round(h * dpr)) this.canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070a0e';
    ctx.fillRect(0, 0, w, h);
    const sample = this.playback.sample(now);
    if (!scene || !sample) return;
    const { before, after, t, elapsed } = sample,
      shown = t >= 1 ? after : before;
    if (this.state === 'running' && before.seq !== this.elasticFrameSeq) {
      this.elasticFrameSeq = before.seq;
      if (before.state === 'running')
        for (const [id, x, y, , rank] of before.balls)
          if (!rank) this.marbleElasticity.sample(id, x, y, before.elapsed, now);
    }
    this.playbackMoving = t < 1 || shown.state !== this.state;
    const mix = (a: number, b: number) => a + (b - a) * t;
    let bridgeIds = this.bridgeIds.get(shown);
    if (!bridgeIds) {
      bridgeIds = new Set(shown.bridgeIds ?? []);
      this.bridgeIds.set(shown, bridgeIds);
    }
    if (
      !this.drainCueDone &&
      scene.stage.art?.style === 'infinite-funnel' &&
      scene.stage.exitBridge &&
      bridgeIds.size
    ) {
      this.drainCueDone = true;
      if (!this.reducedMotion?.matches) this.drainCueAt = now;
    }
    after.balls.forEach((_, i) => {
      const a = before.balls[i],
        b = after.balls[i],
        ball = this.balls[i];
      ball.x = mix(a[1], b[1]);
      ball.y = mix(a[2], b[2]);
      ball.angle = mix(a[3], b[3]);
      ball.rank = (t >= 1 ? b[4] : a[4]) || undefined;
      ball.onBridge = bridgeIds.has(a[0]);
    });
    const { balls } = this;
    const selected = balls.find((b) => b.id === this.focusedBallId);
    const active = balls
      .filter((b) => !b.rank)
      .sort((a, b) => raceProgress(scene.stage, b) - raceProgress(scene.stage, a));
    const lastWinningRank = scene.settings.order === 'desc' ? balls.length : scene.settings.picks;
    const target =
      selected ??
      active[Math.min(active.length - 1, Math.max(0, lastWinningRank - (balls.length - active.length) - 1))] ??
      (scene.stage.goalArea ? balls.find((ball) => ball.rank === balls.length) : undefined);
    const overview = !shown.winners.length && this.zoom <= 1 && !this.goalFollow && !selected;
    this.cameraMoving = false;
    if (scene.stage.goalArea && this.state !== 'ready') {
      const desired = overview
        ? Math.min(
            Math.max(1, w - (w < 600 ? 24 : 180)) / ((scene.stage.width ?? 26) + 4),
            Math.max(1, h - 45) / (scene.stage.goalY + 4)
          )
        : Math.min(w / 20, h / 13, 70);
      this.goalScale = this.goalScale ? this.goalScale + (desired - this.goalScale) * (1 - 0.9 ** (dt * 60)) : desired;
      this.cameraMoving = Math.abs(desired - this.goalScale) > 0.01;
    }
    const scale = this.viewScale();
    if (this.springPlacement?.active) {
      this.camera = this.springPlacement.origin ?? {
        x: (scene.stage.width ?? 26) / 2,
        y: scene.stage.goalY / 2 - (h * 0.07) / scale,
      };
    } else if (
      scene.stage.goalArea &&
      (this.state === 'ready' ? this.dolphinOverview : overview) &&
      !this.manual &&
      !selected
    ) {
      this.camera = { x: (scene.stage.width ?? 26) / 2, y: scene.stage.goalY / 2 - (h * 0.07) / scale };
    } else if (target && !this.manual && (this.state !== 'ready' || selected)) {
      this.camera.x += (target.x - this.camera.x) * (1 - 0.94 ** (dt * 60));
      this.camera.y += (target.y - this.camera.y) * (1 - 0.87 ** (dt * 60));
      this.cameraMoving ||= Math.abs(target.x - this.camera.x) + Math.abs(target.y - this.camera.y) > 0.01;
    }
    const cam = this.manual ?? this.camera;
    this.springView = { x: w * 0.56 - cam.x * scale, y: h * 0.43 - cam.y * scale, scale };
    const view = {
      left: cam.x - (w * 0.56) / scale,
      right: cam.x + (w * 0.44) / scale,
      top: cam.y - (h * 0.43) / scale,
      bottom: cam.y + (h * 0.57) / scale,
    };
    const beforePositions = this.framePositions(before),
      afterPositions = this.framePositions(after),
      entities = this.entities;
    entities.forEach((entity, i) => {
      const a = beforePositions.get(i),
        b = afterPositions.get(i),
        origin = scene.entities[i];
      entity.x = mix(a?.[0] ?? origin.x, b?.[0] ?? origin.x);
      entity.y = mix(a?.[1] ?? origin.y, b?.[1] ?? origin.y);
      entity.angle = mix(before.angles[i], after.angles[i]);
    });
    ctx.save();
    ctx.translate(w * 0.56 - cam.x * scale, h * 0.43 - cam.y * scale);
    ctx.scale(scale, scale);
    drawMapArt(ctx, scene.stage, scale);
    drawEntities(
      ctx,
      scene.stage.exitBridge ? entities.filter((e) => e.shape.collisionLayer !== 2) : entities,
      scale,
      -1,
      true,
      view,
      !!scene.stage.art,
      scene.stage.art?.style === 'reversal-ladder'
    );
    if (scene.stage.vortex) {
      const wind = scene.stage.vortex;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#64f4e050';
      ctx.lineWidth = 1.5 / scale;
      const phase = (wind.speed / wind.radius) * (elapsed + ((wind.gust ?? 0) * (1 - Math.cos(elapsed * 1.7))) / 1.7);
      for (let i = 0; i < 3; i++) {
        const a = phase + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(wind.x, wind.y, wind.radius * 0.7, a, a + 0.5);
        ctx.stroke();
      }
    }
    drawWind(ctx, scene.stage.windZones ?? [], elapsed, scale);
    drawMapOverlay(ctx, scene.stage, entities, scale, true, view);
    if (scene.stage.art?.style === 'reversal-ladder')
      drawEntities(
        ctx,
        entities.filter(
          (entity) =>
            entity.shape.type === 'box' &&
            entity.shape.spring &&
            !scene.stage.entities?.some((definition) => definition.shape === entity.shape)
        ),
        scale
      );
    drawPlacedSprings(ctx, scene.stage, scene.placedSprings ?? [], this.personalSpring?.id, scale);
    this.springPlacement?.draw(ctx, scale);
    if (this.state === 'ready') {
      if (this.dolphinPreview) {
        this.dolphinRenderer.guides(ctx, scene.stage, this.dolphins, scale);
        this.dolphinRenderer.draw(
          ctx,
          scene.stage,
          this.dolphins,
          this.dolphinRenderer.previewTime(
            this.dolphins,
            this.dolphinPreviewElapsed,
            this.reducedMotion?.matches ?? false
          ),
          view,
          true
        );
      }
    } else this.dolphinRenderer.draw(ctx, scene.stage, this.dolphins, elapsed, view);
    if (!drawGoalArea(ctx, scene.stage, scale)) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#65efda';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([0.35, 0.3]);
      ctx.beginPath();
      ctx.moveTo(0, scene.stage.goalY);
      ctx.lineTo(scene.stage.width ?? 26, scene.stage.goalY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 12 / scale + 'px sans-serif';
      ctx.fillStyle = '#65efda';
      ctx.fillText(scene.stage.art?.style === 'switchback-express' ? '200 OK' : 'FINISH', 1, scene.stage.goalY - 0.4);
    }
    this.cache.beginFrame();
    for (const ball of balls) {
      if (ball.rank && ball !== selected) continue;
      const labelMargin = Math.max(1, (ball.name.length * 17) / scale);
      if (
        ball.x < view.left - labelMargin ||
        ball.x > view.right + labelMargin ||
        ball.y < view.top - 1 ||
        ball.y > view.bottom + 1
      )
        continue;
      if (ball === selected) {
        ctx.strokeStyle = '#fff3a8';
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 0.52, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = bridgeBallOpacity(scene.stage, ball);
      const squash = this.marbleElasticity.effect(ball.id, now, this.reducedMotion?.matches ?? false);
      if (!this.cache.drawBall(ctx, ball, scale, dpr, ball.x, ball.y, squash)) {
        drawMarble(ctx, ball.x, ball.y, 0.25, ball.color, squash);
        ctx.fillStyle = ball.color;
        ctx.font = 12 / scale + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ball.name, ball.x, ball.y + 0.55);
      }
      ctx.globalAlpha = 1;
    }
    if (this.drainCueAt && !this.reducedMotion?.matches)
      drawFunnelEntryCue(ctx, scene.stage, (now - this.drainCueAt) / 1000, scale);
    ctx.restore();
    this.renderMinimap(entities, elapsed, cam);
    this.dolphinDrag.setView(
      {
        x: w * 0.56 - cam.x * scale,
        y: h * 0.43 - cam.y * scale,
        scale,
        width: (scene.stage.width ?? 26) * scale,
        height: scene.stage.goalY * scale,
      },
      { x: this.minimap.x, y: this.minimap.y, scale: this.minimap.scale, width: this.minimap.w, height: this.minimap.h }
    );
    this.springControls.draw(ctx, entities, w * 0.56 - cam.x * scale, h * 0.43 - cam.y * scale, scale, h, scene.stage);
    ctx.textAlign = 'right';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#728393';
    ctx.fillText(balls.length - active.length + ' / ' + balls.length + ' 도착', w - 24, h - 20);
    if (this.recording) {
      ctx.fillStyle = '#ff777d';
      ctx.beginPath();
      ctx.arc(w - 85, 60, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('REC', w - 40, 64);
    }
    if (this.state === 'ready' && !balls.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8496a5';
      ctx.font = '16px sans-serif';
      ctx.fillText('이름을 입력하면 구슬이 나타납니다', w * 0.55, h * 0.45);
    }
    if (shown.winners.length) {
      if (!this.winnerAt) this.winnerAt = now;
      drawCelebration(
        ctx,
        shown.winners.map((id) => balls[id]),
        scene.settings.order,
        (now - this.winnerAt) / 1000,
        w,
        h,
        this.reducedMotion?.matches ?? false,
        this.celebrationRightInset
      );
    }
  }
  private renderMinimap(entities: MapEntityState[], elapsed: number, cam: { x: number; y: number }) {
    const { ctx, scene } = this;
    if (!scene) return;
    const mapWidth = scene.stage.width ?? 26;
    const scale = Math.min((this.width < 600 ? 75 : 125) / mapWidth, (this.height - 65) / scene.stage.goalY);
    const m = { x: 16, y: 26, w: mapWidth * scale, h: scene.stage.goalY * scale, scale };
    this.minimap = m;
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.x, m.y, m.w, m.h);
    ctx.clip();
    ctx.translate(m.x, m.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#142027';
    ctx.fillRect(0, 0, mapWidth, scene.stage.goalY);
    this.cache.drawMinimap(ctx, this.minimapStage!, entities, scale, Math.min(devicePixelRatio, 2));
    drawWind(ctx, scene.stage.windZones ?? [], elapsed, scale);
    drawMapOverlay(ctx, scene.stage, entities, scale);
    if (this.state === 'ready' && this.dolphinPreview)
      this.dolphinRenderer.guides(ctx, scene.stage, this.dolphins, scale, true);
    for (const ball of this.balls)
      if (!ball.rank) {
        ctx.globalAlpha = bridgeBallOpacity(scene.stage, ball);
        ctx.fillStyle = ball.id === this.focusedBallId ? '#fff3a8' : ball.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, Math.max(0.23, (ball.id === this.focusedBallId ? 2.5 : 1.4) / scale), 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.globalAlpha = 1;
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
