import { MANTA_PIXEL_OUTLINE, MANTA_SPRITE_RECT, MANTA_SPRITE_WIDTH } from './data/manta-outline';
import { createOutlineSurface } from './outline-surface';

export { MANTA_SPRITE_RECT, MANTA_SPRITE_WIDTH };
export const MANTA_HEIGHT = (MANTA_SPRITE_WIDTH * MANTA_SPRITE_RECT[3]) / MANTA_SPRITE_RECT[2];
export const MANTA_OUTLINE = MANTA_PIXEL_OUTLINE.map(([x, y]): [number, number] => [
  ((x - MANTA_SPRITE_RECT[0] - MANTA_SPRITE_RECT[2] / 2) * MANTA_SPRITE_WIDTH) / MANTA_SPRITE_RECT[2],
  ((y - MANTA_SPRITE_RECT[1] - MANTA_SPRITE_RECT[3] / 2) * MANTA_SPRITE_WIDTH) / MANTA_SPRITE_RECT[2],
]);
export const mantaSurface = createOutlineSurface(MANTA_OUTLINE);
export type MantaPose = { x: number; y: number; angle: number; direction: 1 | -1; scale: number };

// Image and contact share the same center, scale, rotation and horizontal mirror.
export function mantaContact(ball: { x: number; y: number }, pose: MantaPose) {
  const c = Math.cos(pose.angle),
    s = Math.sin(pose.angle),
    dx = (ball.x - pose.x) * pose.direction,
    dy = ball.y - pose.y;
  const surface = mantaSurface((dx * c + dy * s) / pose.scale, (-dx * s + dy * c) / pose.scale, 0.25 / pose.scale);
  if (!surface) return;
  return {
    rx: pose.direction * pose.scale * (c * surface.x - s * surface.y),
    ry: pose.scale * (s * surface.x + c * surface.y),
    normalX: pose.direction * (c * surface.nx - s * surface.ny),
    normalY: s * surface.nx + c * surface.ny,
  };
}
