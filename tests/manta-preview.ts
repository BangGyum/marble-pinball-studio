import { MANTA_HEIGHT, MANTA_OUTLINE, MANTA_SPRITE_RECT, MANTA_SPRITE_WIDTH, mantaContact } from '../src/manta-hitbox';
import type { MantaPose } from '../src/manta-hitbox';

const sprite = new Image();
const canvases = ['dark', 'beige'].map((id) => document.getElementById(id) as HTMLCanvasElement),
  pause = document.getElementById('pause') as HTMLButtonElement,
  direction = document.getElementById('direction') as HTMLButtonElement,
  size = document.getElementById('size') as HTMLSelectElement,
  outline = document.getElementById('outline') as HTMLInputElement,
  status = document.getElementById('status')!;
let time = 4.1,
  previous = 0,
  paused = matchMedia('(prefers-reduced-motion: reduce)').matches,
  facing: 1 | -1 = 1;
const pointers = new Map<HTMLCanvasElement, { x: number; y: number }>();
const path = new Path2D();
MANTA_OUTLINE.forEach(([x, y], i) => {
  if (i) path.lineTo(x, y);
  else path.moveTo(x, y);
});
path.closePath();

function poseAt(at: number): MantaPose {
  const scale = Number(size.value),
    p = (at % 10) / 10,
    distance = 44 + scale * 4.4,
    phase = p * Math.PI * 6,
    vy = scale * 0.75 * Math.cos(phase) * ((Math.PI * 6) / 10);
  return {
    x: facing === 1 ? -2.2 * scale + p * distance : 44 + 2.2 * scale - p * distance,
    y: 8.3 + Math.sin(phase) * scale * 0.75,
    angle: Math.atan2(vy, distance / 10) * 0.22,
    direction: facing,
    scale,
  };
}

function render() {
  if (!sprite.complete || !sprite.naturalWidth) return;
  const pose = poseAt(time);
  for (const canvas of canvases) {
    const width = canvas.clientWidth,
      height = width / 2.65,
      dpr = Math.min(2, devicePixelRatio),
      scale = width / 44,
      beige = canvas.id === 'beige';
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = beige ? '#f2ecdd' : '#14222c';
    ctx.fillRect(0, 0, width, height);
    ctx.scale(scale, scale);
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = beige ? '#d8d3c6' : '#273a45';
    ctx.beginPath();
    for (let x = 0; x < 44; x += 2) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height / scale);
    }
    for (let y = 0; y < height / scale; y += 2) {
      ctx.moveTo(0, y);
      ctx.lineTo(44, y);
    }
    ctx.stroke();
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.scale(pose.direction * pose.scale, pose.scale);
    ctx.rotate(pose.angle);
    ctx.drawImage(
      sprite,
      ...MANTA_SPRITE_RECT,
      -MANTA_SPRITE_WIDTH / 2,
      -MANTA_HEIGHT / 2,
      MANTA_SPRITE_WIDTH,
      MANTA_HEIGHT
    );
    if (outline.checked) {
      ctx.strokeStyle = beige ? '#267f70' : '#8cf5d9';
      ctx.lineWidth = 1.4 / (scale * pose.scale);
      ctx.stroke(path);
    }
    ctx.restore();
    // Fixed-size reference marbles make the large fins and empty tail gaps readable.
    for (const [x, y] of [
      [6, 3],
      [13, 13],
      [32, 4],
      [38, 12],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.25, 0, Math.PI * 2);
      ctx.fillStyle = beige ? '#b47945' : '#e7c784';
      ctx.fill();
    }
    const pointer = pointers.get(canvas);
    if (pointer) {
      const hit = mantaContact(pointer, pose);
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 0.25, 0, Math.PI * 2);
      ctx.fillStyle = hit ? '#f47772' : '#70cbae';
      ctx.fill();
      if (hit) {
        ctx.beginPath();
        ctx.moveTo(pose.x + hit.rx, pose.y + hit.ry);
        ctx.lineTo(pose.x + hit.rx + hit.normalX, pose.y + hit.ry + hit.normalY);
        ctx.strokeStyle = '#ef776f';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
    }
  }
  status.textContent = `${MANTA_OUTLINE.length}점 외곽선 · ${paused ? '정지' : '지그재그 이동'}`;
}
for (const canvas of canvases) {
  canvas.addEventListener('pointermove', (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointers.set(canvas, {
      x: ((event.clientX - bounds.left) * 44) / bounds.width,
      y: ((event.clientY - bounds.top) * 44) / bounds.width,
    });
    render();
  });
  canvas.addEventListener('pointerleave', () => {
    pointers.delete(canvas);
    render();
  });
}
pause.addEventListener('click', () => {
  paused = !paused;
  pause.textContent = paused ? '계속 재생' : '일시정지';
  render();
});
direction.addEventListener('click', () => {
  facing = facing === 1 ? -1 : 1;
  direction.textContent = `진행 방향: ${facing === 1 ? '오른쪽 →' : '← 왼쪽'}`;
  render();
});
size.addEventListener('change', render);
outline.addEventListener('change', render);
window.addEventListener('resize', render);
sprite.onload = () => {
  pause.textContent = paused ? '계속 재생' : '일시정지';
  render();
  function frame(now: number) {
    if (previous && !paused) time += Math.min(0.25, (now - previous) / 1000);
    previous = now;
    if (!paused) render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
sprite.onerror = () => {
  status.textContent = '이미지를 불러오지 못했습니다.';
};
sprite.src = new URL('../src/assets/effects/manta-v1/manta.png', import.meta.url).href;
