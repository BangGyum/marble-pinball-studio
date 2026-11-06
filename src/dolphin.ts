import type { StageDef } from './stage-def';
import { dolphinSurface, DOLPHIN_SPRITE_WIDTH } from './dolphin-hitbox';

export type AnimalOptions = { enabled: boolean; rows: number[]; interval: number; size?: number; speed?: number };
export type DolphinSettings = AnimalOptions & { manta?: AnimalOptions };
export const DOLPHIN_DURATION = 4.35;
export const DOLPHIN_WIDTH = DOLPHIN_SPRITE_WIDTH;
export const DOLPHIN_BASE_SCALE = 3;
export const DOLPHIN_SWIM = 0.08;
export const MAX_DOLPHIN_ROWS = 6;
export const dolphinScale = (settings: DolphinSettings) => (DOLPHIN_BASE_SCALE * (settings.size ?? 100)) / 100;
export const dolphinBounds = (stage: StageDef) => ({ min: 8, max: Math.max(8, stage.goalY - 3) });
export function dolphinRows(stage: StageDef, count = 3, gap = 20, first = 12) {
  const { min, max } = dolphinBounds(stage);
  count = Math.max(1, Math.min(MAX_DOLPHIN_ROWS, Math.round(count)));
  gap = count > 1 ? Math.max(0.5, Math.floor(Math.min(gap, (max - min) / (count - 1)) * 2 + 1e-6) / 2) : 0;
  first = Math.max(min, Math.min(first, max - gap * (count - 1)));
  return Array.from({ length: count }, (_, i) =>
    Math.min(Math.floor(max * 10) / 10, Math.round((first + i * gap) * 10) / 10)
  );
}
export function validateDolphins(value: unknown, stage: StageDef): DolphinSettings {
  return validateEffect(value, stage, true);
}
function validateEffect(value: unknown, stage: StageDef, allowManta: boolean): DolphinSettings {
  if (value === undefined) return { enabled: false, rows: dolphinRows(stage), interval: 5 };
  const s = value as DolphinSettings,
    { min, max } = dolphinBounds(stage);
  if (
    !s ||
    typeof s !== 'object' ||
    Array.isArray(s) ||
    Object.keys(s).some(
      (key) => !['enabled', 'rows', 'interval', 'size', 'speed'].includes(key) && !(allowManta && key === 'manta')
    ) ||
    typeof s.enabled !== 'boolean' ||
    !Number.isFinite(s.interval) ||
    s.interval < 5 ||
    s.interval > 120 ||
    (s.size !== undefined && (!Number.isFinite(s.size) || s.size < 50 || s.size > 200)) ||
    (s.speed !== undefined && (!Number.isFinite(s.speed) || s.speed < 0.5 || s.speed > 1.5)) ||
    !Array.isArray(s.rows) ||
    !s.rows.length ||
    s.rows.length > MAX_DOLPHIN_ROWS ||
    s.rows.some((y, i) => !Number.isFinite(y) || y < min || y > max || (i > 0 && y - s.rows[i - 1] < 0.5 - 1e-6))
  )
    throw new Error(
      '동물 효과 설정을 확인해 주세요. 줄은 1~6개, 출몰 간격은 5~120초, 크기는 50~200%, 이동 속도는 0.5~1.5배입니다.'
    );
  return {
    enabled: s.enabled,
    rows: [...s.rows],
    interval: s.interval,
    ...(s.size === undefined ? {} : { size: s.size }),
    ...(s.speed === undefined ? {} : { speed: s.speed }),
    ...(s.manta === undefined ? {} : { manta: validateEffect(s.manta, stage, false) }),
  };
}
export type DolphinPose = { x: number; y: number; angle: number; direction: number; waterY: number; scale?: number };
// Ballistic jumps joined by a short, C2-continuous submerged turn, in world units.
export function dolphinPose(
  stage: StageDef,
  row: number,
  time: number,
  direction = 1,
  scale = DOLPHIN_BASE_SCALE
): DolphinPose {
  const p = Math.max(0, Math.min(1, time / DOLPHIN_DURATION)),
    phase = (p * 3) % 1;
  const period = DOLPHIN_DURATION / 3,
    swim = DOLPHIN_SWIM,
    airTime = period * (1 - swim),
    height = 2.5 * scale;
  const launch = (4 * height) / airTime,
    gravity = (8 * height) / (airTime * airTime);
  let y: number, vy: number;
  if (phase >= swim / 2 && phase <= 1 - swim / 2) {
    const u = (phase - swim / 2) / (1 - swim);
    y = row - 4 * height * u * (1 - u);
    vy = launch * (2 * u - 1);
  } else {
    const u = ((phase - (1 - swim / 2) + 1) % 1) / swim,
      bend = u * (1 - u),
      duration = period * swim;
    const a = launch * duration,
      b = a + (gravity * duration * duration) / 2;
    y = row + a * bend + b * bend * bend;
    vy = ((1 - 2 * u) * (a + 2 * b * bend)) / duration;
  }
  const width = stage.width ?? 26,
    margin = 4 * scale,
    distance = width + margin * 2;
  return {
    x: direction === 1 ? -margin + p * distance : width + margin - p * distance,
    y,
    angle: Math.atan2(vy, distance / DOLPHIN_DURATION),
    direction,
    waterY: row,
    scale,
  };
}
export function dolphinWave(settings: DolphinSettings, elapsed: number, preview = false) {
  const interval = preview ? (DOLPHIN_DURATION + 0.65) / (settings.speed ?? 1) : settings.interval;
  const wave = Math.floor((elapsed + 1e-9) / interval);
  return { wave, time: Math.max(0, elapsed - wave * interval) };
}
// Travel uses the selected speed; appearances keep their race-time interval.
// Include older slow waves so a new appearance never cuts a traversal short.
export function dolphinWaves(settings: DolphinSettings, elapsed: number, preview = false) {
  const latest = dolphinWave(settings, elapsed, preview),
    speed = settings.speed ?? 1;
  const waves: { wave: number; time: number }[] = [];
  for (
    let wave = latest.wave, time = latest.time * speed;
    wave >= 0 && time < DOLPHIN_DURATION + 0.65;
    wave--, time += settings.interval * speed
  ) {
    waves.unshift({ wave, time });
    if (preview) break;
  }
  return waves;
}
export function dolphinContact(ball: { x: number; y: number }, p: DolphinPose) {
  const c = Math.cos(p.angle),
    s = Math.sin(p.angle),
    dx = (ball.x - p.x) * p.direction,
    dy = ball.y - p.y;
  const scale = p.scale ?? 1;
  const surface = dolphinSurface((dx * c + dy * s) / scale, (-dx * s + dy * c) / scale, 0.25 / scale, {
    x: s,
    y: c,
    limit: (p.waterY - p.y) / scale,
  });
  if (!surface) return;
  const { nx, ny } = surface;
  const rx = p.direction * scale * (c * surface.x - s * surface.y);
  const ry = scale * (s * surface.x + c * surface.y);
  const normalX = p.direction * (c * nx - s * ny),
    normalY = s * nx + c * ny;
  return { rx, ry, normalX, normalY };
}
export function dolphinBounce(
  ball: { x: number; y: number; vx: number; vy: number },
  p: DolphinPose,
  motion: { vx: number; vy: number; omega: number },
  initialImpact = true,
  contact = dolphinContact(ball, p)
) {
  if (!contact) return;
  const { rx, ry, normalX, normalY } = contact;
  const wallX = motion.vx - motion.omega * ry,
    wallY = motion.vy + motion.omega * rx;
  const inward = (ball.vx - wallX) * normalX + (ball.vy - wallY) * normalY;
  if (inward >= 0) return { vx: ball.vx, vy: ball.vy, hit: false };
  // Velocity only: Box2D resolves walls; the effect never teleports a marble across them.
  const impulse = -(1 + (initialImpact && inward < -0.28 ? 0.55 : 0)) * inward;
  const vx = ball.vx + impulse * normalX,
    vy = ball.vy + impulse * normalY,
    speed = Math.hypot(vx, vy);
  const limit = Math.min(1, 30 / Math.max(1e-9, speed));
  // A fast surface must still carry the marble outward after limiting the bounce speed.
  const carry = Math.max(0, -((vx * limit - wallX) * normalX + (vy * limit - wallY) * normalY));
  const carriedX = vx * limit + carry * normalX,
    carriedY = vy * limit + carry * normalY;
  // Rapid waterline turns must not turn the contact constraint into an extreme launch.
  const safety = Math.min(1, 60 / Math.max(1e-9, Math.hypot(carriedX, carriedY)));
  return { vx: carriedX * safety, vy: carriedY * safety, hit: true };
}
