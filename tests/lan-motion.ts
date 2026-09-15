import type { Frame, Scene } from '../src/lan/protocol';
import { SnapshotPlayback } from '../src/lan/playback';
import { legacyElapsed } from './legacy-lan-playback';
const playback = new SnapshotPlayback();
const canvas = document.getElementById('motion') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const output = document.getElementById('metrics')!;
let frames: Frame[] = [], received = 0, scene: Scene | undefined, lastNow = 0, lastElapsed = 0, lastSmooth = 0, began = 0;
let speeds: number[] = [], smoothSpeeds: number[] = [], paints: number[] = [], packets: number[] = [], serverSpeeds: number[] = [];
const reset = () => { speeds = []; smoothSpeeds = []; paints = []; packets = []; serverSpeeds = []; lastNow = 0; began = performance.now(); };
document.getElementById('clear')!.addEventListener('click', reset);
function summary(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const value = (q: number) => Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(3));
  return { p05: value(.05), median: value(.5), p95: value(.95), min: value(0), max: value(1) };
}
const trim = (values: number[]) => { if (values.length > 1800) values.shift(); };
async function connect() {
  const response = await fetch('/api/session', { method: 'POST' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const socket = new WebSocket(`ws://${location.host}/live`);
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data) as Frame | Scene;
    if (message.type === 'scene') {
      if (scene?.raceId !== message.raceId || scene.revision !== message.revision) { frames = []; playback.reset(); reset(); }
      scene = message;
    } else if (message.type === 'frame' && message.raceId === scene?.raceId && message.revision === scene.revision) {
      const now = performance.now(), previous = frames.at(-1);
      if (previous && message.seq <= previous.seq) return;
      if (message.state === 'running' && previous?.state !== 'running') reset();
      if (previous?.state === 'running' && message.state === 'running') {
        packets.push(now - received); trim(packets);
        serverSpeeds.push((message.elapsed - previous.elapsed) * 1000 / (message.time - previous.time)); trim(serverSpeeds);
      }
      frames.push(message); if (frames.length > 8) frames.shift(); received = now;
      playback.push(message, now);
    }
  };
  socket.onclose = () => { output.textContent = '연결 종료 · 새로고침해 주세요.'; };
}
function draw(now: number) {
  const latest = frames.at(-1);
  if (latest) {
    const elapsed = legacyElapsed(frames, received, now);
    const smooth = playback.sample(now)!.elapsed;
    if (latest.state === 'running' && now - began > 1000 && lastNow) {
      const dt = now - lastNow;
      speeds.push((elapsed - lastElapsed) * 1000 / dt); paints.push(dt); trim(speeds); trim(paints);
      smoothSpeeds.push((smooth - lastSmooth) * 1000 / dt); trim(smoothSpeeds);
    }
    lastNow = now; lastElapsed = elapsed; lastSmooth = smooth;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffb39a'; ctx.font = '18px system-ui'; ctx.fillText('기존 화면 재생', 20, 35);
    ctx.beginPath(); ctx.arc(20 + (elapsed * 150) % 1150, 70, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8ae8d3'; ctx.fillText('수정된 화면 재생', 20, 115);
    ctx.beginPath(); ctx.arc(20 + (smooth * 150) % 1150, 150, 12, 0, Math.PI * 2); ctx.fill();
    if (speeds.length % 30 === 0 || latest.state !== 'running') {
      output.textContent = JSON.stringify({ state: latest.state, count: latest.balls.length, samples: speeds.length,
        oldPlaybackSpeed: summary(speeds), backwards: speeds.filter((v) => v < 0).length,
        newPlaybackSpeed: summary(smoothSpeeds), newBackwards: smoothSpeeds.filter((v) => v < 0).length,
        rafMs: summary(paints), packetMs: summary(packets), serverPhysicsSpeed: summary(serverSpeeds) }, null, 2);
    }
  }
  requestAnimationFrame(draw);
}
void connect().catch((error) => { output.textContent = String(error); });
requestAnimationFrame(draw);
