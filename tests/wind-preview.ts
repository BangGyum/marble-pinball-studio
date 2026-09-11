import { headwindElevator } from '../src/data/headwind-elevator';
import { twinVortex } from '../src/data/twin-vortex';
import { gustFork } from '../src/data/gust-fork';
import { drawEntities } from '../src/draw';
import { drawWind } from '../src/wind-render';
import { Game } from '../src/game';
import { Box2dPhysics } from '../src/physics-box2d';

async function init() {
  for (const stage of [headwindElevator, twinVortex, gustFork]) {
    const card = document.createElement('article');
    card.innerHTML = `<h2>${stage.title}</h2><canvas></canvas><button>28개 실제 주행</button><output>실제 맵 · 바람 표시</output>`;
    document.querySelector('#maps')!.append(card);
    const canvas = card.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
    const output = card.querySelector('output')!;
    const physics = new Box2dPhysics();
    await physics.init();
    const game: Game = Object.create(Game.prototype);
    Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
    const prepare = () => game.prepare(stage, Array.from({ length: 28 }, (_, i) => String(i + 1)));
    prepare();
    card.querySelector('button')!.onclick = () => { prepare(); game.start([27, 28], false, 'desc'); };
    let last = 0, accumulator = 0;
    const frame = (now: number) => {
      accumulator += last ? Math.min((now - last) / 1000, 0.08) : 0;
      last = now;
      while (accumulator >= 1 / 60) {
        if (game.state === 'running') Reflect.get(game, 'advance').call(game);
        accumulator -= 1 / 60;
      }
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.round(w * devicePixelRatio);
      canvas.height = Math.round(h * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.fillStyle = '#070a0e'; ctx.fillRect(0, 0, w, h);
      const scale = Math.min((w - 18) / stage.width!, (h - 24) / (stage.goalY + 4));
      ctx.translate((w - scale * stage.width!) / 2, 8); ctx.scale(scale, scale);
      drawEntities(ctx, physics.getEntities(), scale);
      drawWind(ctx, stage.windZones!, game.elapsed, scale);
      for (const ball of game.balls) if (!ball.rank) {
        ctx.fillStyle = ball.color; ctx.beginPath(); ctx.arc(ball.x, ball.y, 0.3, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.fillStyle = '#b5edeb'; ctx.font = '1.1px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('START', 12.8, 1.5);
      ctx.fillText('FINISH', 22, stage.goalY + 2);
      if (game.state !== 'ready') output.textContent = `${game.elapsed.toFixed(1)}초 · ${game.arrivals.length}/28 도착 · DESC 2명`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
init();
