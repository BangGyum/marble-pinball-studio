import type { StageDef } from './stage-def';

export type DolphinSettings = { enabled: boolean; rows: number[]; interval: number };
export const DOLPHIN_DURATION = 5.8;
export const DOLPHIN_WIDTH = 4;
export const MAX_DOLPHIN_ROWS = 6;
export const dolphinBounds = (stage: StageDef) => ({ min: 8, max: Math.max(8, stage.goalY - 3) });
export function dolphinRows(stage: StageDef, count = 3, gap = 20, first = 12) {
  const { min, max } = dolphinBounds(stage);
  count = Math.max(1, Math.min(MAX_DOLPHIN_ROWS, Math.round(count)));
  gap = count > 1 ? Math.max(.5, Math.floor(Math.min(gap, (max - min) / (count - 1)) * 2 + 1e-6) / 2) : 0;
  first = Math.max(min, Math.min(first, max - gap * (count - 1)));
  return Array.from({ length: count }, (_, i) => Math.min(Math.floor(max * 10) / 10, Math.round((first + i * gap) * 10) / 10));
}
export function validateDolphins(value: unknown, stage: StageDef): DolphinSettings {
  if (value === undefined) return { enabled: false, rows: dolphinRows(stage), interval: 20 };
  const s = value as DolphinSettings, { min, max } = dolphinBounds(stage);
  if (!s || typeof s !== 'object' || Array.isArray(s) ||
    Object.keys(s).some(key => !['enabled', 'rows', 'interval'].includes(key)) || typeof s.enabled !== 'boolean' ||
    !Number.isFinite(s.interval) || s.interval < 6 || s.interval > 120 ||
    !Array.isArray(s.rows) || !s.rows.length || s.rows.length > MAX_DOLPHIN_ROWS ||
    s.rows.some((y, i) => !Number.isFinite(y) || y < min || y > max || (i > 0 && y - s.rows[i - 1] < .5 - 1e-6)))
    throw new Error('돌고래 설정을 확인해 주세요. 줄은 1~6개, 출몰 간격은 6~120초입니다.');
  return { enabled: s.enabled, rows: [...s.rows], interval: s.interval };
}
export type DolphinPose = { x: number; y: number; angle: number; direction: number; waterY: number };
// The same ballistic flight / submerged turn as the approved preview, in world units.
export function dolphinPose(stage: StageDef, row: number, time: number, direction = 1): DolphinPose {
  const p = Math.max(0, Math.min(1, time / DOLPHIN_DURATION)), phase = (p * 3) % 1;
  const period = DOLPHIN_DURATION / 3, swim = .3, airTime = period * (1 - swim), height = 2.5;
  const launch = 4 * height / airTime, gravity = 8 * height / (airTime * airTime);
  let y, vy;
  if (phase >= swim / 2 && phase <= 1 - swim / 2) {
    const u = (phase - swim / 2) / (1 - swim);
    y = row - 4 * height * u * (1 - u); vy = launch * (2 * u - 1);
  } else {
    const u = ((phase - (1 - swim / 2) + 1) % 1) / swim, bend = u * (1 - u), duration = period * swim;
    const a = launch * duration, b = a + gravity * duration * duration / 2;
    y = row + a * bend + b * bend * bend; vy = (1 - 2 * u) * (a + 2 * b * bend) / duration;
  }
  const width = stage.width ?? 26, distance = width + 8;
  return { x: direction === 1 ? -4 + p * distance : width + 4 - p * distance,
    y, angle: Math.atan2(vy, distance / DOLPHIN_DURATION), direction, waterY: row };
}
export function dolphinWave(settings: DolphinSettings, elapsed: number) {
  const wave = Math.floor((elapsed + 1e-9) / settings.interval);
  return { wave, time: Math.max(0, elapsed - wave * settings.interval) };
}
export function dolphinBounce(ball: { x: number; y: number; vx: number; vy: number }, p: DolphinPose,
  motion: { vx: number; vy: number; omega: number }) {
  const c = Math.cos(p.angle), s = Math.sin(p.angle), dx = (ball.x - p.x) * p.direction, dy = ball.y - p.y;
  const x = dx * c + dy * s, y = -dx * s + dy * c, ax = -38 / 36, ay = 10 / 36, sx = 86 / 36, sy = -10 / 36;
  const radius = 14 / 36, t = Math.max(0, Math.min(1, ((x - ax) * sx + (y - ay) * sy) / (sx * sx + sy * sy)));
  const qx = ax + sx * t, qy = ay + sy * t, distance = Math.hypot(x - qx, y - qy);
  if (distance >= radius + .25) return;
  const nx = distance > 1e-8 ? (x - qx) / distance : sy / Math.hypot(sx, sy);
  const ny = distance > 1e-8 ? (y - qy) / distance : -sx / Math.hypot(sx, sy);
  const rx = p.direction * (c * (qx + nx * radius) - s * (qy + ny * radius));
  const ry = s * (qx + nx * radius) + c * (qy + ny * radius);
  if (p.y + ry > p.waterY) return;
  const normalX = p.direction * (c * nx - s * ny), normalY = s * nx + c * ny;
  const inward = (ball.vx - motion.vx + motion.omega * ry) * normalX +
    (ball.vy - motion.vy - motion.omega * rx) * normalY;
  if (inward >= 0) return { vx: ball.vx, vy: ball.vy, hit: false };
  // Velocity only: Box2D resolves walls; the effect never teleports a marble across them.
  const impulse = -(1 + (inward < -.28 ? .55 : 0)) * inward;
  const vx = ball.vx + impulse * normalX, vy = ball.vy + impulse * normalY, speed = Math.hypot(vx, vy);
  const limit = Math.min(1, 30 / Math.max(1e-9, speed));
  return { vx: vx * limit, vy: vy * limit, hit: true };
}
