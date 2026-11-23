import type { VectorLike } from './types/vector-like';

const ride = 1.75,
  unload = 0.55,
  returnTrip = 1.45;
const smooth = (t: number) => t * t * (3 - 2 * t);

// The cabin's origin is the trolley wheel. The same two marble bodies ride to the other station.
export class GondolaCar {
  private seats: (Box2D.b2Body | undefined)[] = [undefined, undefined];
  private departure?: number;

  constructor(
    private cabin: Box2D.b2Body,
    private origin: VectorLike,
    private travel: VectorLike,
    private vector: Box2D.b2Vec2
  ) {}

  remove(body: Box2D.b2Body) {
    const seat = this.seats.indexOf(body);
    if (seat >= 0) this.seats[seat] = undefined;
  }

  reset() {
    for (const body of this.seats) body?.SetEnabled(true);
    this.seats.fill(undefined);
    this.departure = undefined;
    this.vector.Set(this.origin.x, this.origin.y);
    this.cabin.SetTransform(this.vector, 0);
  }

  step(now: number, marbles: Box2D.b2Body[]) {
    if (this.departure === undefined || now < this.departure) {
      for (const body of marbles) {
        if (!body.IsEnabled()) continue;
        const p = body.GetPosition(),
          x = p.x - this.origin.x,
          y = p.y - this.origin.y;
        if (Math.abs(x) > 0.93 || y < 0.64 || y > 1.46 || body.GetLinearVelocity().y < 0) continue;
        const near = x < 0 ? 0 : 1;
        const index = this.seats[near] ? 1 - near : near;
        if (this.seats[index]) break;
        this.seats[index] = body;
        body.SetEnabled(false);
        this.departure ??= now + 0.8;
        if (this.seats[1 - index]) {
          this.departure = Math.min(this.departure, now + 0.12);
          break;
        }
      }
    }
    if (this.departure === undefined) return;
    const age = Math.max(0, now - this.departure);
    if (age >= ride + unload + returnTrip) {
      this.reset();
      return;
    }
    const progress = age < ride ? smooth(age / ride) : 1 - smooth(Math.max(0, age - ride - unload) / returnTrip);
    const x = this.origin.x + this.travel.x * progress,
      y = this.origin.y + this.travel.y * progress;
    const tip = Math.max(0, Math.min(1, (age - ride) / unload));
    const side = Math.sign(this.travel.x);
    const angle = side * 1.55 * Math.sin(Math.PI * tip);
    this.vector.Set(x, y);
    this.cabin.SetTransform(this.vector, angle);
    for (let i = 0; i < this.seats.length; i++) {
      const body = this.seats[i];
      if (!body) continue;
      const seat = i === 0 ? -0.38 : 0.38;
      this.vector.Set(
        x + seat * Math.cos(angle) - 1.12 * Math.sin(angle),
        y + seat * Math.sin(angle) + 1.12 * Math.cos(angle)
      );
      body.SetTransform(this.vector, body.GetAngle());
      if (tip >= 0.45) {
        body.SetEnabled(true);
        this.vector.Set(side * 4, 1.5);
        body.SetLinearVelocity(this.vector);
        body.SetAwake(true);
        this.seats[i] = undefined;
      }
    }
  }
}
