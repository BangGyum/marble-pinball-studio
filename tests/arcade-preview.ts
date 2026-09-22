import { pinballCascade } from '../src/data/pinball-cascade';
import { chaosClocktower } from '../src/data/chaos-clocktower';
import { Race } from '../src/race';
import { drawEntities } from '../src/draw';
import { drawMapArt } from '../src/map-art';
import { drawWind } from '../src/wind-render';

async function init() {
  const race = new Race(); await race.physics.init();
  const canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
  const map = document.querySelector<HTMLSelectElement>('#map')!, count = document.querySelector<HTMLSelectElement>('#count')!;
  const output = document.querySelector('output')!, trails = new Map<number, [number, number][]>();
  let last = 0, accumulator = 0, first = 0, frames = 0, fps = 0, sampledAt = 0;
  const prepare = () => {
    race.prepare([pinballCascade, chaosClocktower][Number(map.value)], Array.from({ length: Number(count.value) }, (_, i) => String(i + 1)));
    first = 0; accumulator = 0; trails.clear();
    document.querySelector('h1')!.textContent = race.stage.title;
    document.querySelector('#description')!.textContent = Number(map.value)
      ? '6날·4날·3날 회전판이 서로 다른 주기로 섞고, 마지막 게이트에서 한 번 더 순위를 뒤집습니다.'
      : '6단 플리퍼와 돌풍을 지나, 좌우 이동 발판과 마지막 점프 부스터까지 내려옵니다.';
  };
  prepare(); count.onchange = prepare; map.onchange = prepare;
  document.querySelector<HTMLButtonElement>('#start')!.onclick = () => { prepare(); race.startRace([Math.max(1, race.balls.length - 1), race.balls.length], 'desc'); };
  document.querySelector<HTMLButtonElement>('#reset')!.onclick = prepare;
  const frame = (now: number) => {
    accumulator += last ? Math.min(0.1, (now - last) / 1000) : 0; last = now; frames++;
    if (now - sampledAt >= 1000) { fps = Math.round(frames * 1000 / (now - sampledAt)); frames = 0; sampledAt = now; }
    while (accumulator >= 1 / 60) { if (race.state === 'running') race.advance(); accumulator -= 1 / 60; }
    if (!first && race.arrivals.length) first = race.elapsed;
    const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(devicePixelRatio, 2), stage = race.stage;
    if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.fillStyle = '#070a0e'; ctx.fillRect(0, 0, w, h);
    const top = Math.min(-2, 4 - Math.ceil(race.balls.length / 10) * 0.62), scale = Math.min(w / 50, h / (stage.goalY + 4 - top));
    ctx.translate((w - 48 * scale) / 2, -top * scale); ctx.scale(scale, scale);
    drawMapArt(ctx, stage, scale); drawEntities(ctx, race.physics.getEntities(), scale, -1, true, undefined, true);
    drawWind(ctx, stage.windZones ?? [], race.elapsed, scale);
    for (const ball of race.balls) if (!ball.rank) {
      const trail = trails.get(ball.id) ?? []; if (race.state === 'running') trail.push([ball.x, ball.y]);
      if (trail.length > 10) trail.shift(); trails.set(ball.id, trail);
      ctx.strokeStyle = ball.color; ctx.lineWidth = 0.1; ctx.globalAlpha = 0.4; ctx.beginPath();
      trail.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = ball.color; ctx.beginPath(); ctx.arc(ball.x, ball.y, 0.25, 0, Math.PI * 2); ctx.fill();
    }
    output.textContent = `${race.state === 'ready' ? '준비 완료' : race.state === 'finished' ? '전원 도착' : '주행 중'} · ${race.elapsed.toFixed(1)}초\n${race.arrivals.length}/${race.balls.length} 도착${first ? ` · 첫 도착 ${first.toFixed(1)}초` : ''}\n${fps} FPS`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
init();
