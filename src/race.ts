import { Box2dPhysics } from './physics-box2d';
import type { StageDef } from './data/maps';
import { shuffled, type WinnerOrder } from './model';
import { WallGuard, WALL_GUARD_MAX_SPEED } from './wall-guard';

export type Ball = {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  angle: number;
  stuck: number;
  rank?: number;
  onBridge?: boolean;
  // Position one physics step earlier, for drawing between steps.
  px?: number;
  py?: number;
  // Deepest point reached, when, and how many stillness nudges since then.
  best?: number;
  progressAt?: number;
  shakes?: number;
  // Continuous motion invalidates old nudges without resetting the race-wide depth timeout.
  movingFor?: number;
  motionAt?: number;
};

const STEP = 1 / 60;
// Only a new depth record this far below the previous one counts as progress.
const PROGRESS = 0.5;
// A still marble that this many nudges could not free is wedged in a pocket.
const TRAPPED_SHAKES = 8;
// Moving marbles can circle a mixing bowl for minutes and still get out (up to ~245s measured
// in the jar map). Give up on them only after this long without any progress in the race.
const STALL_LIMIT_SECONDS = 300;

// One simulation, shared by the standalone browser and the authoritative LAN server.
export class Race {
  readonly physics = new Box2dPhysics();
  state: 'ready' | 'running' | 'paused' | 'finished' = 'ready';
  stage!: StageDef;
  balls: Ball[] = [];
  arrivals: Ball[] = [];
  winners: Ball[] = [];
  // 'stalled' when the remaining marbles were ranked by depth instead of arriving.
  finishReason?: 'arrived' | 'stalled';
  // Marbles returned to their previous position after being pushed through a wall.
  rescues = 0;
  protected winnerAt = 0;
  protected winnerOrder: WinnerOrder = 'asc';
  range: [number, number] = [1, 1];
  elapsed = 0;
  onFinish: (winners: Ball[]) => void = () => {};
  private walls?: WallGuard;
  private progressAt = 0;
  // Timed gates may hold every marble on purpose until their permanent release.
  private holdUntil = 0;
  // A wedged marble must also outlast every periodic device that could still free it.
  private trapSeconds = 60;

  prepare(stage: StageDef, names: string[]) {
    this.state = 'ready';
    this.stage = stage;
    this.arrivals = [];
    this.winners = [];
    this.winnerAt = 0;
    this.elapsed = 0;
    this.finishReason = undefined;
    this.rescues = 0;
    this.progressAt = 0;
    const props = (stage.entities ?? []).map((e) => e.props);
    this.holdUntil = Math.max(0, ...props.map((p) => p.timedGate?.releaseAfter ?? 0));
    this.trapSeconds = 2 * Math.max(30, ...(stage.windZones ?? []).map((w) => w.period ?? 0),
      ...props.map((p) => Math.max(p.timedGate?.period ?? 0, p.spinCycle?.period ?? 0,
        p.oscillation?.period ?? 0, p.sliding?.period ?? 0)));
    this.walls = new WallGuard(stage);
    this.physics.clearMarbles();
    this.physics.clear();
    this.physics.createStage(stage);
    const ordered = shuffled(names);
    const spawnOffset = (stage.spawnX ?? 12.85) - 12.85;
    this.balls = ordered.map((name, id) => {
      const x = 10.1 + spawnOffset + (id % 10) * 0.61 + (stage.randomizeStart ? (Math.random() - 0.5) * 0.08 : 0),
        y = 5 - Math.floor(id / 10) * 0.62 + (stage.randomizeStart ? (Math.random() - 0.5) * 0.08 : 0);
      this.physics.createMarble(id, x, y);
      return { id, name,
        color: `hsl(${(id * 137.508) % 360} 85% 72%)`, x, y, angle: 0, stuck: 0 };
    });
  }

  startRace(range: [number, number], order: WinnerOrder = 'asc') {
    if (!this.balls.length) throw new Error('참가자 이름을 먼저 입력해 주세요.');
    this.range = range;
    this.winnerOrder = order;
    this.elapsed = 0;
    this.progressAt = 0;
    this.physics.start();
    this.state = 'running';
  }

  pause() {
    if (this.state === 'running') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'running';
  }

  // Unfinished marbles, deepest first.
  racing() {
    return this.balls.filter((b) => !b.rank).sort((a, b) => b.y - a.y);
  }

  // The marble deciding the last winning place. The camera and the finish slow motion follow it.
  focusBall(racing = this.racing()): Ball | undefined {
    return racing[Math.min(racing.length - 1, Math.max(0, this.range[1] - this.arrivals.length - 1))];
  }

  finishSlowdown() {
    const target = this.focusBall();
    return !this.winners.length && target && target.y > this.stage.goalY - 4 ? 0.45 : 1;
  }

  advance() {
    this.physics.step(STEP);
    this.elapsed += STEP;
    const crossing: { ball: Ball; fraction: number }[] = [];
    let trapped = true;
    for (const ball of this.balls) {
      if (ball.rank) continue;
      let p = this.physics.getMarblePosition(ball.id);
      const onBridge = this.stage.exitBridge ? this.physics.isMarbleOnBridge(ball.id) : undefined;
      // Changing layers mid-step legitimately passes walls of the other layer.
      if (this.walls && onBridge === ball.onBridge && this.walls.crosses(ball.x, ball.y, p.x, p.y, onBridge ? 2 : 1) &&
        this.physics.getMarbleSpeed(ball.id) < WALL_GUARD_MAX_SPEED) {
        this.physics.placeMarble(ball.id, ball.x, ball.y);
        p = { x: ball.x, y: ball.y, angle: ball.angle };
        this.rescues++;
      }
      const oldY = ball.y;
      const still = Math.hypot(p.x - ball.x, p.y - ball.y) < 0.0002;
      ball.stuck = still ? ball.stuck + STEP : 0;
      if (!still) ball.movingFor = (ball.movingFor ?? 0) + STEP;
      else if (ball.stuck >= 1) ball.movingFor = 0;
      // Ignore a brief nudge, but give a marble that resumes moving a fresh trapping window.
      if (!still && (ball.movingFor ?? 0) >= 4) {
        ball.shakes = 0;
        ball.motionAt = this.elapsed;
      }
      if (ball.stuck > 4) {
        this.physics.shakeMarble(ball.id);
        ball.stuck = 0;
        ball.shakes = (ball.shakes ?? 0) + 1;
      }
      if (ball.best === undefined || p.y > ball.best + PROGRESS) {
        ball.best = p.y;
        ball.progressAt = this.progressAt = this.elapsed;
        ball.shakes = 0;
      }
      // A bounce after a nudge is short; rolling on for 2s means the marble got free. Checking for
      // stillness right now instead would need every wedged marble between bounces at once.
      trapped &&= (ball.movingFor ?? 0) < 2 && (ball.shakes ?? 0) >= TRAPPED_SHAKES &&
        this.elapsed - Math.max(ball.progressAt ?? 0, ball.motionAt ?? 0, this.holdUntil) > this.trapSeconds;
      ball.px = ball.x;
      ball.py = ball.y;
      ball.x = p.x;
      ball.y = p.y;
      ball.angle = p.angle;
      if (onBridge !== undefined) ball.onBridge = onBridge;
      if (p.y >= this.stage.goalY)
        crossing.push({ ball, fraction: (this.stage.goalY - oldY) / Math.max(0.000001, p.y - oldY) });
    }
    crossing.sort((a, b) => a.fraction - b.fraction || a.ball.id - b.ball.id);
    for (const { ball } of crossing) this.arrive(ball);
    if (crossing.length) this.progressAt = this.elapsed;
    if (this.arrivals.length < this.balls.length &&
      (trapped || this.elapsed - Math.max(this.progressAt, this.holdUntil) > STALL_LIMIT_SECONDS)) {
      // The rest can no longer finish: rank them by depth instead of running forever.
      for (const ball of this.racing()) this.arrive(ball);
      this.finishReason = 'stalled';
    }
    if (!this.winners.length) {
      const trailingWinnersKnown = this.range[1] === this.balls.length && this.arrivals.length >= this.range[0] - 1;
      if (trailingWinnersKnown || this.arrivals.length >= this.range[1]) {
        this.winners = trailingWinnersKnown
          ? [...this.arrivals.slice(this.range[0] - 1), ...this.balls.filter((ball) => !ball.rank)]
          : this.arrivals.slice(this.range[0] - 1, this.range[1]);
        this.winnerAt = performance.now();
      }
    }
    // Membership is fixed at announcement; actual ranks settle as the remaining balls arrive.
    this.winners.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    if (this.arrivals.length === this.balls.length) {
      this.finishReason ??= 'arrived';
      this.state = 'finished';
      this.onFinish(this.winners);
    }
  }

  private arrive(ball: Ball) {
    ball.rank = this.arrivals.length + 1;
    this.arrivals.push(ball);
    this.physics.removeMarble(ball.id);
  }
}
