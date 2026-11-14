import { createOutlineSurface } from './outline-surface';
import { DOLPHIN_PIXEL_OUTLINE, DOLPHIN_SPRITE_RECT, DOLPHIN_SPRITE_WIDTH } from './data/dolphin-outline';

export { DOLPHIN_SPRITE_RECT, DOLPHIN_SPRITE_WIDTH };
export const DOLPHIN_HEIGHT = (DOLPHIN_SPRITE_WIDTH * DOLPHIN_SPRITE_RECT[3]) / DOLPHIN_SPRITE_RECT[2];
export const DOLPHIN_OUTLINE = DOLPHIN_PIXEL_OUTLINE.map(([x, y]): [number, number] => [
  ((x - DOLPHIN_SPRITE_RECT[0] - DOLPHIN_SPRITE_RECT[2] / 2) * DOLPHIN_SPRITE_WIDTH) / DOLPHIN_SPRITE_RECT[2],
  ((y - DOLPHIN_SPRITE_RECT[1] - DOLPHIN_SPRITE_RECT[3] / 2) * DOLPHIN_SPRITE_WIDTH) / DOLPHIN_SPRITE_RECT[2],
]);
export const dolphinSurface = createOutlineSurface(DOLPHIN_OUTLINE);
