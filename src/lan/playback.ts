import type { Frame } from './protocol';

const BUFFER_SECONDS = .12;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Advance one continuous simulation-time cursor; packet arrivals must never reset it.
export class SnapshotPlayback {
  private frames: Frame[] = [];
  private received = 0;
  private lastNow?: number;
  private cursor = 0;
  private started = false;
  private rate = 1;
  reset() {
    this.frames = []; this.lastNow = undefined; this.started = false; this.rate = 1;
  }
  push(frame: Frame, now = performance.now()) {
    const last = this.frames.at(-1);
    if (last && frame.seq <= last.seq) return;
    if (last && last.state !== 'running' && frame.state === 'running') this.reset();
    const previous = this.frames.at(-1);
    // Paused/ready snapshots carry newer metadata but no new physical sample.
    if (previous?.elapsed === frame.elapsed) this.frames[this.frames.length - 1] = frame;
    else this.frames.push(frame);
    if (this.frames.length > 20) this.frames.shift();
    this.received = now;
  }
  sample(now = performance.now()) {
    const latest = this.frames.at(-1), first = this.frames[0];
    if (!latest) return;
    const dt = this.lastNow === undefined ? 0 : Math.max(0, (now - this.lastNow) / 1000);
    const baseRate = latest.playbackRate ?? 1;
    const buffer = BUFFER_SECONDS * baseRate;
    this.lastNow = now;
    if (!this.started || dt > .5) {
      this.cursor = Math.max(first.elapsed, latest.elapsed - buffer);
      this.started = latest.elapsed - first.elapsed >= buffer;
      this.rate = 1;
      if (latest.state !== 'running') this.cursor = latest.elapsed;
    } else {
      if (latest.state === 'running') {
        const age = clamp((now - this.received) / 1000, 0, BUFFER_SECONDS);
        const desired = latest.elapsed + age * baseRate - buffer;
        // Correct long-term clock drift gently, not the frame-to-frame arrival jitter.
        const desiredRate = 1 + clamp((desired - (this.cursor + dt * baseRate)) / baseRate, -.1, .1);
        this.rate += (desiredRate - this.rate) * (1 - Math.exp(-dt / .25));
      }
      this.cursor = clamp(this.cursor + dt * baseRate * this.rate, first.elapsed, latest.elapsed);
    }
    let before = first, after = latest;
    for (const frame of this.frames) {
      if (frame.elapsed <= this.cursor) before = frame;
      else { after = frame; break; }
    }
    const t = before.elapsed === after.elapsed ? 1 : clamp((this.cursor - before.elapsed) / (after.elapsed - before.elapsed), 0, 1);
    return { before, after, t, elapsed: before.elapsed + (after.elapsed - before.elapsed) * t };
  }
}
