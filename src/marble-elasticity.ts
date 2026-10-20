export type MarbleSquash = { angle: number; amount: number };

type Motion = {
  x: number; y: number; time: number; sampledAt: number; vx?: number; vy?: number;
  hitAt?: number; angle?: number; peak?: number;
};

const DURATION = 240;

// Position samples come from physics steps locally and network snapshots in LAN mode.
export class MarbleElasticity {
  private motions = new Map<number, Motion>();

  reset() { this.motions.clear(); }

  sample(id: number, x: number, y: number, time: number, now: number) {
    const previous = this.motions.get(id);
    const dt = previous ? time - previous.time : 0;
    // LAN simulation time advances faster at 4/8x; only wall-time gaps invalidate samples.
    if (!previous || dt < 0 || now - previous.sampledAt > 120) {
      this.motions.set(id, { x, y, time, sampledAt: now });
      return;
    }
    if (dt === 0) return;
    const vx = (x - previous.x) / dt, vy = (y - previous.y) / dt;
    if (previous.vx !== undefined && previous.vy !== undefined) {
      const dx = vx - previous.vx, dy = vy - previous.vy;
      const impulse = Math.hypot(dx, dy);
      const approach = impulse ? -(previous.vx * dx + previous.vy * dy) / impulse : 0;
      if (impulse > 8 && approach > 3 && now - (previous.hitAt ?? -Infinity) > 130) {
        previous.hitAt = now;
        previous.angle = Math.atan2(dy, dx);
        previous.peak = Math.min(0.17, 0.08 + (impulse - 8) * 0.007);
      }
    }
    previous.x = x; previous.y = y; previous.time = time; previous.sampledAt = now;
    previous.vx = vx; previous.vy = vy;
  }

  effect(id: number, now: number, reducedMotion = false): MarbleSquash | undefined {
    const motion = this.motions.get(id);
    if (reducedMotion || motion?.hitAt === undefined || motion.angle === undefined || motion.peak === undefined) return;
    const phase = (now - motion.hitAt) / DURATION;
    if (phase < 0 || phase >= 1) return;
    const amount = motion.peak * (1 - phase) ** 2 * Math.cos(phase * Math.PI * 2);
    return Math.abs(amount) >= 0.004 ? { angle: motion.angle, amount } : undefined;
  }
}
