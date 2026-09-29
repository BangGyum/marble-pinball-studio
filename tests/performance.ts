import { Game } from '../src/game';
import { stages, DEFAULT_MAP_INDEX } from '../src/data/maps';

const params = new URLSearchParams(location.search);
const map = document.querySelector<HTMLSelectElement>('#map')!;
stages.forEach((stage, index) => map.add(new Option(stage.title, String(index))));
map.value = String(Number(params.get('map') ?? DEFAULT_MAP_INDEX));
const count = Math.max(1, Math.min(300, Number(params.get('count') ?? 200)));
const mode = params.get('mode') ?? 'run';
const speed = Number(params.get('speed') ?? 1);
const targetFps = params.get('target') === '60' ? 60 : 120;
document.querySelector<HTMLInputElement>('#count')!.value = String(count);
document.querySelector<HTMLSelectElement>('#mode')!.value = mode;
document.querySelector<HTMLSelectElement>('#speed')!.value = String(speed);
document.querySelector<HTMLSelectElement>('#target')!.value = String(targetFps);
const status = document.querySelector('#status')!, result = document.querySelector('#result')!;
let seed = 123456;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
let measuring = false, sprites = 0, entityReads = 0;
const OriginalCanvas = globalThis.OffscreenCanvas;
if (OriginalCanvas) globalThis.OffscreenCanvas = new Proxy(OriginalCanvas, {
  construct(target, args) { if (measuring) sprites++; return Reflect.construct(target, args); },
});
const game = new Game(document.querySelector<HTMLCanvasElement>('#game')!);
const renderTimes: number[] = [], physicsTimes: number[] = [], intervals: number[] = [], frameWork: number[] = [];
const activeIntervals: number[] = [];
const renderer = game as unknown as { render(): void; frame(now: number): void };
const frame = renderer.frame.bind(game);
renderer.frame = now => {
  const running = game.state === 'running', started = performance.now();
  frame(now);
  if (measuring && running) frameWork.push(performance.now() - started);
};
const render = renderer.render.bind(game);
renderer.render = () => {
  const started = performance.now(); render();
  if (measuring) renderTimes.push(performance.now() - started);
};
const step = game.physics.step.bind(game.physics), entities = game.physics.getEntities.bind(game.physics);
game.physics.step = (dt) => {
  const started = performance.now(); step(dt);
  if (measuring) physicsTimes.push(performance.now() - started);
};
game.physics.getEntities = (blend) => { if (measuring) entityReads++; return entities(blend); };

await game.init(stages[Number(map.value)], Array.from({ length: count }, (_, i) => '구슬 ' + String(i + 1).padStart(3, '0')));
status.textContent = 'Game 캔버스 진단 · 고정 시드 · 워밍업 2초 + 측정 12초 · 순위 DOM/녹화 제외';
if (params.has('start')) {
  game.speed = speed;
  if (mode !== 'idle') game.start([1, 1], false, 'asc');
  const started = performance.now();
  let previous = started, elapsedAtWarmup = 0;
  let wasRunning = game.state === 'running';
  const tick = (now: number) => {
    if (mode === 'zoom') game.setZoom(1.5 + Math.sin((now - started) / 900) * .8);
    if (now - started >= 2000 && !measuring) { measuring = true; previous = now; elapsedAtWarmup = game.elapsed; }
    else if (measuring) {
      intervals.push(now - previous);
      if (wasRunning && game.state === 'running') activeIntervals.push(now - previous);
    }
    previous = now;
    wasRunning = game.state === 'running';
    if (now - started < 14000) { requestAnimationFrame(tick); return; }
    measuring = false;
    const stats = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { mean: values.reduce((a, b) => a + b, 0) / (values.length || 1), p95: sorted[Math.floor(sorted.length * .95)] ?? 0, max: sorted.at(-1) ?? 0 };
    };
    const duration = intervals.reduce((a, b) => a + b, 0) / 1000;
    const activeSeconds = activeIntervals.reduce((a, b) => a + b, 0) / 1000;
    const output = {
      map: stages[Number(map.value)].title, count, mode, speed, seed: 123456,
      cssSize: [game.canvas.clientWidth, game.canvas.clientHeight], dpr: devicePixelRatio,
      seconds: duration, fps: intervals.length / duration, frame: stats(intervals), slowFrames: intervals.filter(t => t > 25).length,
      renders: renderTimes.length, render: stats(renderTimes), physics: stats(physicsTimes), entityReads, sprites,
      simulatedSeconds: game.elapsed - elapsedAtWarmup, state: game.state,
      targetFps, targetFrameMs: 1000 / targetFps,
      activeSeconds, activeFps: activeSeconds ? activeIntervals.length / activeSeconds : null,
      activeFrame: stats(activeIntervals), activeSlowFrameThresholdMs: 1000 / targetFps * 1.5,
      activeSlowFrames: activeIntervals.filter(t => t > 1000 / targetFps * 1.5).length,
      frameWork: stats(frameWork), workOverBudget: frameWork.filter(t => t > 1000 / targetFps).length,
    };
    game.setVisible(false);
    status.textContent = '측정 완료';
    result.textContent = JSON.stringify(output, (_, value) => typeof value === 'number' ? Number(value.toFixed(3)) : value, 2);
  };
  requestAnimationFrame(tick);
}
