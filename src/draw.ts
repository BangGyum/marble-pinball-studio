import type { MapEntityState } from './types/MapEntity.type';
export function drawEntities(
  ctx: CanvasRenderingContext2D,
  entities: MapEntityState[],
  scale: number,
  selected = -1,
  glow = true
) {
  entities.forEach((e, i) => {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    const shape = e.shape;
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
      shape.points.forEach((p, j) => (j ? ctx.lineTo(...p) : ctx.moveTo(...p)));
      ctx.stroke();
    }
    ctx.restore();
  });
}
