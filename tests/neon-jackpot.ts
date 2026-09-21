import { neonJackpot as stage } from '../src/data/neon-jackpot';
import { Race } from '../src/race';
import { drawEntities } from '../src/draw';
import { drawMapArt } from '../src/map-art';
import { drawWind } from '../src/wind-render';

async function init() {
  const race = new Race(); await race.physics.init();
  const canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
  const count = document.querySelector<HTMLSelectElement>('#count')!, output = document.querySelector('output')!;
  const prepare = () => race.prepare(stage, Array.from({ length: Number(count.value) }, (_, i) => String(i + 1)));
  prepare(); count.onchange = prepare;
  document.querySelector<HTMLButtonElement>('#start')!.onclick = () => {
    prepare(); race.startRace([race.balls.length - 1, race.balls.length], 'desc');
  };
  document.querySelector<HTMLButtonElement>('#reset')!.onclick = prepare;
  let last = 0, accumulator = 0, first = 0;
  const trails = new Map<number, [number, number][]>();
  const frame = (now: number) => {
    accumulator += last ? Math.min(0.08, (now - last) / 1000) : 0; last = now;
    if (race.state === 'ready') { trails.clear(); first = 0; }
    while (accumulator >= 1 / 60) {
      if (race.state === 'running') race.advance();
      accumulator -= 1 / 60;
    }
    if (!first && race.arrivals.length) first = race.elapsed;
    const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) {
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.fillStyle = '#070a0e'; ctx.fillRect(0, 0, w, h);
    const scale = Math.min(w / 48, h / 86);
    ctx.translate((w - 48 * scale) / 2, 2 * scale); ctx.scale(scale, scale);
    drawMapArt(ctx, stage, scale);
    drawEntities(ctx, race.physics.getEntities(), scale, -1, true, undefined, true);
    drawWind(ctx, stage.windZones!, race.elapsed, scale);
    for (const ball of race.balls) if (!ball.rank) {
      const trail = trails.get(ball.id) ?? []; trail.push([ball.x, ball.y]); if (trail.length > 7) trail.shift();
      trails.set(ball.id, trail); ctx.strokeStyle = ball.color; ctx.lineWidth = 0.12; ctx.globalAlpha = 0.3;
      ctx.beginPath(); trail.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = ball.color; ctx.beginPath(); ctx.arc(ball.x, ball.y, 0.25, 0, Math.PI * 2); ctx.fill();
    }
    output.textContent = race.state === 'ready' ? `${race.balls.length}개 · 준비 완료`
      : `${race.state === 'finished' ? '전원 도착' : '주행 중'} · ${race.elapsed.toFixed(1)}초\n${race.arrivals.length}/${race.balls.length} 도착${first ? ` · 첫 도착 ${first.toFixed(1)}초` : ''}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
init();
