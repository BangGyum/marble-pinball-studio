import type { StageDef } from './stage-def';
import type { EntityPhysicalProps, MapEntityState } from './types/map-entity';
import { visibleArt, type ViewBounds } from './art-visibility';
import { backgroundCache } from './background-cache';
import { sceneColor } from './scene-theme';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = [number, number];

function path(ctx: Ctx, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
}

function copper(ctx: Ctx, x: number, end: number) {
  const g = ctx.createLinearGradient(x, 0, end, 0);
  for (const [i, color] of ['#824421', '#f7c08a', '#b66d3c', '#784125', '#da9561', '#ffe1ac'].entries()) {
    g.addColorStop(i / 5, color);
  }
  return g;
}

function rivet(ctx: Ctx, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.5, 0, x, y, r);
  g.addColorStop(0, '#fff2c1');
  g.addColorStop(0.4, '#dca369');
  g.addColorStop(0.83, '#86522d');
  g.addColorStop(1, '#43281c');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = '#f8cc89';
  ctx.stroke();
  path(ctx, [
    [x - r * 0.44, y + r * 0.16],
    [x + r * 0.44, y - r * 0.16],
  ]);
  ctx.strokeStyle = '#4a3026';
  ctx.lineWidth = r * 0.19;
  ctx.stroke();
}

function strip(ctx: Ctx, rim: Point[], base: Point[]) {
  const face = [...rim, ...base];
  ctx.save();
  ctx.translate(0.18, 0.38);
  path(ctx, face);
  ctx.closePath();
  ctx.fillStyle = '#100b09';
  ctx.fill();
  ctx.restore();
  path(ctx, face);
  ctx.closePath();
  ctx.fillStyle = copper(ctx, rim[0][0], rim.at(-1)![0] + 0.001);
  ctx.fill();
  path(ctx, base);
  ctx.lineWidth = 0.11;
  ctx.strokeStyle = '#754929';
  ctx.stroke();
  path(ctx, rim);
  ctx.lineWidth = 0.1;
  ctx.strokeStyle = '#ffe2b9';
  ctx.stroke();
}

function gauge(ctx: Ctx, gate: NonNullable<EntityPhysicalProps['timedGate']>, elapsed: number, open: boolean) {
  ctx.save();
  ctx.translate(-2.1, 3.5);
  ctx.fillStyle = '#9d6237';
  path(ctx, [
    [1.95, -3.5],
    [0, -0.9],
  ]);
  ctx.strokeStyle = '#996c46';
  ctx.lineWidth = 0.22;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 1.38, 0, 2 * Math.PI);
  ctx.fillStyle = copper(ctx, -1.38, 1.38);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 1.15, 0, 2 * Math.PI);
  ctx.fillStyle = '#302318';
  ctx.fill();
  for (let tick = -4; tick <= 4; tick++) {
    ctx.save();
    ctx.rotate(tick * 0.3);
    ctx.fillStyle = '#f1cd94';
    ctx.fillRect(-0.025, -1.03, 0.05, tick % 2 ? 0.12 : 0.24);
    ctx.restore();
  }
  const turn = Math.PI * 2;
  const phase = (((elapsed + gate.phase) % gate.period) + gate.period) % gate.period;
  ctx.beginPath();
  ctx.arc(0, 0, 0.99, -Math.PI / 2, -Math.PI / 2 + (turn * gate.openFor) / gate.period);
  ctx.lineWidth = 0.16;
  ctx.strokeStyle = open ? '#ffec8a' : '#c99647';
  ctx.stroke();
  ctx.fillStyle = open ? '#ffe892' : '#d5b995';
  ctx.font = 'bold 0.72px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(open ? '열림' : '지름길', 0, 2.25);
  ctx.rotate((turn * phase) / gate.period);
  path(ctx, [
    [0, 0],
    [0, -0.89],
  ]);
  ctx.lineWidth = 0.1;
  ctx.strokeStyle = '#ffb65e';
  ctx.stroke();
  rivet(ctx, 0, 0, 0.13);
  ctx.restore();
}

export function drawSeesaws(ctx: Ctx, stage: StageDef, entities: MapEntityState[], elapsed: number, view?: ViewBounds) {
  for (const [index, entity] of entities.entries()) {
    const sh = entity.shape;
    if (sh.type !== 'polyline' || !sh.hidden || sh.backing || sh.points.length < 5) continue;
    if (!visibleArt(entity, view, 7)) continue;
    ctx.save();
    ctx.translate(entity.x, entity.y);
    const gate = stage.entities?.[index]?.props.timedGate;
    if (gate) gauge(ctx, gate, elapsed, entity.angle > gate.angle * 0.5);
    ctx.rotate(entity.angle);
    const half = Math.floor(sh.points.length / 2);
    strip(ctx, sh.points.slice(0, half), sh.points.slice(half, -1));
    if (gate) {
      const tip = sh.points[half - 1];
      path(ctx, [[0, 0], tip]);
      ctx.lineWidth = 0.19;
      ctx.strokeStyle = '#ffd575';
      ctx.stroke();
    }
    const lip = sh.points.slice(0, half);
    const axisX = lip.every(([x]) => x > 0) ? lip[0][0] : lip.every(([x]) => x < 0) ? lip[half - 1][0] : 0;
    rivet(ctx, axisX, 0.23, gate ? 0.36 : 0.58);
    ctx.restore();
  }
}

function paint(ctx: Ctx, stage: StageDef) {
  const width = stage.width ?? 46,
    h = stage.goalY;
  ctx.save();
  const felt = ctx.createRadialGradient(width * 0.49, h * 0.5, 1, width * 0.49, h * 0.5, h * 0.65);
  felt.addColorStop(0, sceneColor('#352720'));
  felt.addColorStop(1, sceneColor('#151313'));
  ctx.fillStyle = felt;
  ctx.fillRect(0, -2, width, h + 5);
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 10000; i++) {
    ctx.fillStyle = i % 2 ? '#d6ab8121' : '#130c0c28';
    ctx.fillRect(width * random(), -2 + random() * (h + 5), 0.04 + random() * 0.13, 0.04);
  }
  for (const x of [0, width - 0.9]) {
    ctx.fillStyle = copper(ctx, x, x + 0.9);
    ctx.fillRect(x, -2, 0.9, h + 5);
    for (let y = 4; y < h; y += 17) rivet(ctx, x + 0.45, y, 0.21);
  }
  for (const e of stage.entities ?? []) {
    const s = e.shape;
    if (e.type !== 'static' || s.type !== 'polyline' || !s.hidden || !s.backing) continue;
    ctx.save();
    ctx.translate(e.position.x, e.position.y);
    const rim = s.points;
    const base = rim
      .slice()
      .reverse()
      .map(([x, y]): Point => [x + (rim.length > 18 ? (x < width / 2 ? -0.45 : 0.45) : 0), y + 0.48]);
    strip(ctx, rim, base);
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = copper(ctx, 15, 31);
  ctx.beginPath();
  ctx.roundRect(15, 0.55, 16, 2.3, 0.45);
  ctx.fill();
  ctx.fillStyle = '#302219';
  ctx.font = 'bold 1.45px system-ui';
  ctx.fillText('시소 계곡', 23, 2.24);
  rivet(ctx, 15.7, 1.7, 0.2);
  rivet(ctx, 30.3, 1.7, 0.2);
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 12; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#37271e' : '#ecd5a7';
      ctx.fillRect(19 + (c * 2) / 3, h - 1.34 + (r * 2) / 3, 2 / 3, 2 / 3);
    }
  ctx.restore();
}

export function drawShortcutDeck(ctx: Ctx, stage: StageDef) {
  const bridge = stage.exitBridge!;
  path(ctx, bridge.deck);
  ctx.closePath();
  ctx.fillStyle = sceneColor('#3c291ba8');
  ctx.fill();
  const { x, y } = bridge.entry;
  const end = bridge.transfers?.[0]?.exit.y ?? y;
  for (let h = y + 3; h < end - 1; h += 4) {
    path(ctx, [
      [x - 0.7, h],
      [x, h + 0.45],
      [x + 0.7, h],
    ]);
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = sceneColor('#ffcf8078');
    ctx.stroke();
  }
}
export function drawSeesawCabinet(ctx: Ctx, stage: StageDef, cached = true) {
  if (!cached) {
    paint(ctx, stage);
    return;
  }
  backgroundCache.draw(
    ctx,
    stage,
    'seesaw-valley',
    { x: 0, y: -2, width: stage.width ?? 46, height: stage.goalY + 5, density: 22 },
    (c) => paint(c, stage)
  );
}
