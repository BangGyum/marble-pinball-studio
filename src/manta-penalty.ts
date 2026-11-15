import type { MarbleSquash } from './marble-elasticity';
import { getSceneTheme } from './scene-theme';

export const MANTA_HOLD_SECONDS = 0.8;
export const MANTA_STUN_SECONDS = 2;
export const MANTA_PENALTY_SECONDS = MANTA_HOLD_SECONDS + MANTA_STUN_SECONDS;

// Race time keeps the cue paused and synchronized with LAN playback and game speed.
export function drawMantaPenalty(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  caughtAt: number | undefined,
  elapsed: number,
  scale: number,
  reducedMotion = false
): MarbleSquash | undefined {
  if (caughtAt === undefined) return;
  const age = elapsed - caughtAt;
  if (age < 0 || age >= MANTA_PENALTY_SECONDS) return;
  const held = age < MANTA_HOLD_SECONDS,
    beige = getSceneTheme() === 'beige';
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = beige ? '#7d5723' : '#ffe1a0';
  ctx.strokeStyle = beige ? '#fff8eb' : '#07131c';
  if (held) {
    ctx.font = `700 ${Math.max(0.3, 12 / scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 2 / scale;
    ctx.strokeText('꿀꺽!', x, y - 0.5);
    ctx.fillText('꿀꺽!', x, y - 0.5);
  } else {
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3 + (reducedMotion ? 0 : age * 4),
        sx = x + Math.cos(angle) * 0.4,
        sy = y - 0.4 + Math.sin(angle) * 0.13;
      ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const a = (j * Math.PI) / 4,
          r = j % 2 ? 0.035 : 0.09;
        if (j === 0) ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        else ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  return held
    ? { angle: Math.PI / 2, amount: reducedMotion ? 0.2 : 0.15 + 0.25 * Math.sin((age / MANTA_HOLD_SECONDS) * Math.PI) }
    : undefined;
}
