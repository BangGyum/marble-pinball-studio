import { Box2dPhysics } from './physics-box2d';
import type { StageDef } from './data/maps';
import { shuffled, type WinnerOrder } from './model';

export type Ball = {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  angle: number;
  stuck: number;
  rank?: number;
};

// One simulation, shared by the standalone browser and the authoritative LAN server.
export class Race {
  readonly physics = new Box2dPhysics();
  state: 'ready' | 'running' | 'paused' | 'finished' = 'ready';
  stage!: StageDef;
  balls: Ball[] = [];
  arrivals: Ball[] = [];
  winners: Ball[] = [];
  protected winnerAt = 0;
  protected winnerOrder: WinnerOrder = 'asc';
  range: [number, number] = [1, 1];
  elapsed = 0;
  onFinish: (winners: Ball[]) => void = () => {};

  prepare(stage: StageDef, names: string[]) {
    this.state = 'ready';
    this.stage = stage;
    this.arrivals = [];
    this.winners = [];
    this.winnerAt = 0;
    this.elapsed = 0;
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
    this.physics.start();
    this.state = 'running';
  }

  pause() {
    if (this.state === 'running') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'running';
  }

  advance() {
    this.physics.step(1 / 60);
    this.elapsed += 1 / 60;
    const crossing: { ball: Ball; fraction: number }[] = [];
    for (const ball of this.balls) {
      if (ball.rank) continue;
      const p = this.physics.getMarblePosition(ball.id);
      const oldY = ball.y;
      ball.stuck = Math.hypot(p.x - ball.x, p.y - ball.y) < 0.0002 ? ball.stuck + 1 / 60 : 0;
      if (ball.stuck > 4) {
        this.physics.shakeMarble(ball.id);
        ball.stuck = 0;
      }
      ball.x = p.x;
      ball.y = p.y;
      ball.angle = p.angle;
      if (p.y >= this.stage.goalY)
        crossing.push({ ball, fraction: (this.stage.goalY - oldY) / Math.max(0.000001, p.y - oldY) });
    }
    crossing.sort((a, b) => a.fraction - b.fraction || a.ball.id - b.ball.id);
    for (const { ball } of crossing) {
      ball.rank = this.arrivals.length + 1;
      this.arrivals.push(ball);
      this.physics.removeMarble(ball.id);
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
      this.state = 'finished';
      this.onFinish(this.winners);
    }
  }
}
