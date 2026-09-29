import type { MapEntityState } from './types/MapEntity.type';

export type ViewBounds = { left: number; right: number; top: number; bottom: number };
const radii = new WeakMap<MapEntityState['shape'], number>();

// A rotation-independent radius also includes decorative rims and shadows.
export function visibleArt(entity: MapEntityState, view?: ViewBounds, margin = 3) {
  if (!view) return true;
  const shape = entity.shape;
  let radius = radii.get(shape);
  if (radius === undefined) {
    radius = shape.type === 'circle' ? shape.radius : shape.type === 'box' ? Math.hypot(shape.width, shape.height)
      : shape.points.reduce((largest, [x, y]) => Math.max(largest, Math.hypot(x, y)), 0);
    radii.set(shape, radius);
  }
  radius += margin;
  return entity.x + radius >= view.left && entity.x - radius <= view.right &&
    entity.y + radius >= view.top && entity.y - radius <= view.bottom;
}
