import type { Frame } from '../src/lan/protocol';

// Original LanView formula, kept only to quantify the speed-oscillation regression.
export function legacyElapsed(frames: Frame[], received: number, now: number) {
  const latest = frames.at(-1)!;
  const targetTime = Math.min(latest.time, latest.time + now - received - 100);
  let before = frames[0], after = latest;
  for (const sample of frames) {
    if (sample.time <= targetTime) before = sample;
    else { after = sample; break; }
  }
  const t = before === after ? 1 : Math.max(0, Math.min(1, (targetTime - before.time) / Math.max(1, after.time - before.time)));
  return before.elapsed + (after.elapsed - before.elapsed) * t;
}
