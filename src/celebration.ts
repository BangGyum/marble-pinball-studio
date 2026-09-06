import type { Ball } from './game';
import type { WinnerOrder } from './model';

export function drawCelebration(
  ctx: CanvasRenderingContext2D,
  winners: Ball[],
  order: WinnerOrder,
  age: number,
  width: number,
  height: number,
  reducedMotion: boolean,
  rightInset = 18
) {
  if (!winners.length) return;
  const ordered = order === 'desc' ? [...winners].reverse() : winners;
  const x = Math.max(20, width - rightInset),
    y = height * 0.5;
  const maxWidth = Math.max(1, Math.min(260, width * 0.35, x - 16) - 24);
  const visibleCount = Math.max(1, Math.min(5, Math.floor((height * 0.5 - 40) / 24)));
  const shown = ordered.slice(0, visibleCount);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, x + 4, height);
  ctx.clip();
  if (!reducedMotion && age < 1.3) {
    const colors = ['#65efda', '#ffd279', '#ba9cff', '#ffffff'];
    for (let i = 0; i < 24; i++) {
      const progress = (age - (i % 4) * 0.045) / 1.1;
      if (progress <= 0 || progress >= 1) continue;
      const angle = i * 2.39996,
        distance = (55 + (i % 5) * 12) * progress;
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.translate(
        x - maxWidth / 2 + Math.cos(angle) * distance,
        y - 28 + Math.sin(angle) * distance + progress * progress * 45
      );
      ctx.rotate(angle + progress * 4);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(-2, -3, 4, 6);
      ctx.restore();
    }
  }
  const reveal = reducedMotion ? 1 : Math.min(1, Math.max(0, age / 0.3));
  ctx.globalAlpha = reveal;
  ctx.translate((1 - reveal) ** 3 * 16, 0);
  ctx.textAlign = 'right';
  ctx.strokeStyle = '#070a0e';
  ctx.lineWidth = 4;
  const label = (text: string, atY: number, font: string, color: string) => {
    ctx.font = font;
    let fitted = text;
    if (ctx.measureText(fitted).width > maxWidth) {
      const letters = Array.from(text);
      do {
        letters.pop();
        fitted = letters.join('') + '…';
      } while (letters.length && ctx.measureText(fitted).width > maxWidth);
    }
    ctx.fillStyle = color;
    ctx.strokeText(fitted, x, atY);
    ctx.fillText(fitted, x, atY);
  };
  label(
    (winners.some((ball) => !ball.rank) ? '당첨 확정 · ' : '최종 당첨 순위 · ') + winners.length + '명',
    y - 54,
    '12px sans-serif',
    '#b5d1cc'
  );
  label('축하합니다!', y - 26, 'bold ' + Math.min(26, Math.max(18, width * 0.024)) + 'px sans-serif', '#65efda');
  shown.forEach((ball, i) =>
    label((ball.rank ? ball.rank + '등 · ' : '당첨 · ') + ball.name, y + 6 + i * 24, 'bold 16px sans-serif', ball.color)
  );
  if (ordered.length > shown.length)
    label(
      '외 ' + (ordered.length - shown.length) + '명 · 전체 결과는 순위 목록에서',
      y + 6 + shown.length * 24,
      '12px sans-serif',
      '#b5d1cc'
    );
  ctx.restore();
}
