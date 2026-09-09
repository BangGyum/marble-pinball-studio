import type { MapEntityState } from './types/MapEntity.type';
type ViewBounds = { left: number; right: number; top: number; bottom: number };
export function drawEntities(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  entities: MapEntityState[],
  scale: number,
  selected = -1,
  glow = true,
  view?: ViewBounds
) {
  entities.forEach((e, i) => {
    const shape = e.shape;
    let bounds: ViewBounds | undefined;
    if (view) {
      // Conservative viewport in the entity's local coordinates, including the glow.
      const cos = Math.cos(e.angle), sin = Math.sin(e.angle);
      const x = (view.left + view.right) / 2 - e.x;
      const y = (view.top + view.bottom) / 2 - e.y;
      const halfWidth = (view.right - view.left) / 2;
      const halfHeight = (view.bottom - view.top) / 2;
      const extentX = Math.abs(cos) * halfWidth + Math.abs(sin) * halfHeight + 16 / scale;
      const extentY = Math.abs(sin) * halfWidth + Math.abs(cos) * halfHeight + 16 / scale;
      const localX = cos * x + sin * y, localY = -sin * x + cos * y;
      bounds = { left: localX - extentX, right: localX + extentX, top: localY - extentY, bottom: localY + extentY };
      if (shape.type !== 'polyline') {
        const radius = shape.type === 'circle' ? shape.radius : Math.hypot(shape.width, shape.height);
        if (bounds.left > radius || bounds.right < -radius || bounds.top > radius || bounds.bottom < -radius) return;
      }
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    const color = i === selected ? '#ffffff' : (shape.color ?? (shape.type === 'polyline' ? '#b5edeb' : '#59eada'));
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = (i === selected ? 3 : 1.6) / scale;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow ? (shape.type === 'polyline' ? 7 : 13) : 0;
    if (shape.type === 'box') {
      ctx.rotate(shape.rotation);
      ctx.fillRect(-shape.width, -shape.height, shape.width * 2, shape.height * 2);
      if (i === selected)
        ctx.strokeRect(-shape.width - 0.08, -shape.height - 0.08, shape.width * 2 + 0.16, shape.height * 2 + 0.16);
    } else if (shape.type === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
      ctx.fill();
      if (i === selected) {
        ctx.beginPath();
        ctx.arc(0, 0, shape.radius + 0.15, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (shape.points.length) {
      ctx.beginPath();
      let connected = false;
      for (let j = 1; j < shape.points.length; j++) {
        const a = shape.points[j - 1], b = shape.points[j];
        if (bounds && (
          Math.max(a[0], b[0]) < bounds.left || Math.min(a[0], b[0]) > bounds.right ||
          Math.max(a[1], b[1]) < bounds.top || Math.min(a[1], b[1]) > bounds.bottom
        )) {
          connected = false;
          continue;
        }
        if (!connected) ctx.moveTo(...a);
        ctx.lineTo(...b);
        connected = true;
      }
      ctx.stroke();
    }
    ctx.restore();
  });
}
