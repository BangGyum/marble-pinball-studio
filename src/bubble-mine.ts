import type { VectorLike } from './types/vector-like';
import { circleEntryFraction } from './finish';

// All poses use race time, including LAN playback and paused frames.
const approach = 2.4,
  skim = 1.2,
  drift = 1.35,
  rise = approach + skim + drift,
  drop = 0.6,
  ride = 1.95,
  tip = 0.3,
  back = 1.1;
const depart = rise + drop,
  arrive = depart + ride,
  release = arrive + tip;
const period = release + back;
const smooth = (t: number) => t * t * (3 - 2 * t);
const cartEntranceX = 11;
export const bubbleRadius = 0.32;

export function mineRail(origin: VectorLike, t: number) {
  const u = 1 - t;
  return {
    x: origin.x + cartEntranceX * u ** 3 + 3 * 13 * u * u * t + 3 * 16 * u * t * t + 17 * t ** 3,
    y: origin.y - 28 + 3 * u * t * t * 25 + 32 * t ** 3,
  };
}

export function minePose(origin: VectorLike, time: number) {
  const age = (time + 0.1) % period;
  // Skim the first downhill ledge before peeling away towards the waiting cart.
  const lift = Math.min(1, age / approach);
  const acrossLedge = Math.max(0, Math.min(1, (age - approach) / skim));
  const toCart = Math.max(0, Math.min(1, (age - approach - skim) / drift));
  const ascent = 0.88 * lift + 0.028 * acrossLedge + 0.092 * toCart;
  const bend = smooth(toCart);
  const transit =
    age <= depart
      ? 0
      : age < arrive
        ? smooth((age - depart) / ride)
        : age <= release
          ? 1
          : 1 - smooth((age - release) / back);
  const cart = mineRail(origin, transit);
  const tilt =
    age >= arrive && age < release
      ? 0.75 * smooth((age - arrive) / tip)
      : age >= release
        ? 0.75 * Math.max(0, 1 - (age - release) / tip)
        : 0;
  return {
    age,
    cart,
    tilt,
    bubble: {
      x: origin.x + cartEntranceX * bend + (1 - bend) * 0.85 * Math.sin(ascent * 8),
      y: origin.y - 29.8 * ascent,
    },
    rising: age < rise,
    burst: (age - rise) / 0.35,
    falling: age >= rise && age < depart,
    dropProgress: Math.max(0, Math.min(1, (age - rise) / drop)),
    unloading: age >= release,
  };
}

export class BubbleMineRide {
  passenger?: Box2D.b2Body;
  private caughtAt = 0;
  private offset = { x: 0, y: 0 };

  constructor(
    private origin: VectorLike,
    private vector: Box2D.b2Vec2
  ) {}

  clear() {
    this.passenger?.SetEnabled(true);
    this.passenger = undefined;
  }

  needsSweep(now: number, dt: number) {
    return !this.passenger && (now + 0.1) % period < rise + dt;
  }

  step(
    now: number,
    dt: number,
    bodies: Box2D.b2Body[],
    starts: Float64Array,
    marbleRadius: number,
    capturing: boolean
  ) {
    if (!capturing && !this.passenger) return;
    const pose = minePose(this.origin, now);
    if (capturing) {
      // Clip the solver step to the bubble's lifetime, including its first/last partial step.
      const from = Math.max(0, 1 - pose.age / dt);
      const to = Math.min(1, 1 + (rise - pose.age) / dt);
      const start = from > 0 ? this.origin : minePose(this.origin, now - dt).bubble;
      let first = Infinity;
      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (!body.IsEnabled()) continue;
        const p = body.GetPosition();
        const x = starts[2 * i],
          y = starts[2 * i + 1];
        const vx = p.x - x,
          vy = p.y - y;
        const rx = x + vx * from - start.x,
          ry = y + vy * from - start.y;
        const dx = vx * (to - from) - (pose.bubble.x - start.x);
        const dy = vy * (to - from) - (pose.bubble.y - start.y);
        const hit = circleEntryFraction(rx, ry, dx, dy, bubbleRadius + marbleRadius);
        if (hit === undefined || hit >= first) continue;
        first = hit;
        this.passenger = body;
        this.offset = { x: rx + dx * hit, y: ry + dy * hit };
        this.caughtAt = now - dt + dt * (from + (to - from) * hit);
      }
      this.passenger?.SetEnabled(false);
    }
    const body = this.passenger;
    if (!body) return;
    const settle = Math.max(0, 1 - (now - this.caughtAt) / 0.14);
    if (pose.rising) this.vector.Set(pose.bubble.x + this.offset.x * settle, pose.bubble.y + this.offset.y * settle);
    else if (pose.falling) this.vector.Set(pose.cart.x, pose.bubble.y + 1.8 * pose.dropProgress ** 2);
    else this.vector.Set(pose.cart.x + 0.55 * Math.sin(pose.tilt), pose.cart.y);
    body.SetTransform(this.vector, body.GetAngle());
    if (pose.unloading) {
      this.clear();
      this.vector.Set(3, 1.5);
      body.SetLinearVelocity(this.vector);
      body.SetAwake(true);
    }
  }
}
