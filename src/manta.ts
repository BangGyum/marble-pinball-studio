import type { StageDef } from './stage-def';
import { DOLPHIN_BASE_SCALE, DOLPHIN_DURATION } from './dolphin';
import type { MantaPose } from './manta-hitbox';

export function mantaPose(
  stage: StageDef,
  row: number,
  time: number,
  direction: 1 | -1 = 1,
  scale = DOLPHIN_BASE_SCALE
): MantaPose & { waterY: number } {
  const p = Math.max(0, Math.min(1, time / DOLPHIN_DURATION)),
    width = stage.width ?? 26,
    margin = 4 * scale,
    distance = width + 2 * margin,
    phase = p * Math.PI * 6,
    amplitude = 0.85 * scale,
    vy = amplitude * Math.cos(phase) * ((Math.PI * 6) / DOLPHIN_DURATION);
  return {
    x: direction === 1 ? -margin + p * distance : width + margin - p * distance,
    y: row + Math.sin(phase) * amplitude,
    angle: Math.atan2(vy, distance / DOLPHIN_DURATION) * 0.22,
    direction,
    scale,
    // Unlike a jumping dolphin, the whole gliding manta remains visible and solid.
    waterY: Infinity,
  };
}
