import type { MapEntityState } from './types/MapEntity.type';
type ViewBounds = { left: number; right: number; top: number; bottom: number };
export function drawEntities(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  entities: MapEntityState[],
  scale: number,
  selected = -1,
  glow = true,
  view?: ViewBounds,
  glass = false
) {
  entities.forEach((e, i) => {
    const shape = e.shape;
    if (shape.hidden && i !== selected) return;
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
      if (shape.boostSpeed !== undefined) {
        ctx.fillStyle = '#251c0ddd';
        ctx.fillRect(-shape.width, -shape.height, shape.width * 2, shape.height * 2);
        ctx.strokeStyle = color; ctx.lineWidth = 0.08 + 1 / scale;
        ctx.strokeRect(-shape.width, -shape.height, shape.width * 2, shape.height * 2);
        ctx.fillStyle = color;
        for (const offset of [-0.55, 0, 0.55]) {
          const x = offset * shape.width, w = shape.width * 0.22, h = shape.height * 0.62;
          ctx.beginPath(); ctx.moveTo(x - w, -h); ctx.lineTo(x, -h); ctx.lineTo(x + w, 0);
          ctx.lineTo(x, h); ctx.lineTo(x - w, h); ctx.lineTo(x, 0); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        return;
      }
      ctx.fillRect(-shape.width, -shape.height, shape.width * 2, shape.height * 2);
      if (glass) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#f4e7ff'; ctx.lineWidth = 1 / scale;
        ctx.strokeRect(-shape.width, -shape.height, shape.width * 2, shape.height * 2);
        ctx.fillStyle = '#080e2540';
        ctx.fillRect(-shape.width + 0.12, 0, Math.max(0, shape.width * 2 - 0.24), shape.height);
        if (shape.width > 1) {
          ctx.beginPath(); ctx.arc(0, 0, 0.36, 0, Math.PI * 2);
          ctx.fillStyle = '#413663'; ctx.fill(); ctx.stroke();
        }
      }
      if (i === selected)
        ctx.strokeRect(-shape.width - 0.08, -shape.height - 0.08, shape.width * 2 + 0.16, shape.height * 2 + 0.16);
    } else if (shape.type === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
      ctx.fill();
      if (glass) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff3d4'; ctx.lineWidth = 1.5 / scale; ctx.stroke();
        ctx.beginPath(); ctx.arc(-shape.radius * 0.2, -shape.radius * 0.25, shape.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#fff2bc80'; ctx.fill();
      }
      if (i === selected) {
        ctx.beginPath();
        ctx.arc(0, 0, shape.radius + 0.15, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (shape.points.length) {
      ctx.beginPath();
      if (glass && shape.solid) {
        ctx.moveTo(...shape.points[0]);
        shape.points.slice(1).forEach(p => ctx.lineTo(...p));
        ctx.fill();
      }
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
      if (glass && i !== selected) {
        ctx.strokeStyle = '#2d6077'; ctx.lineWidth = 0.2; ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 0.08 + 0.8 / scale; ctx.stroke();
        ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 0.025 + 0.4 / scale;
      }
      ctx.stroke();
    }
    ctx.restore();
  });
}
