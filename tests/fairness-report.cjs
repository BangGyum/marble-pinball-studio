const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise each reporting script end to end, including JSON/CSV output, with controlled outcomes.
async function report(file, mode) {
  let run = 0;
  const written = new Map();
  const stage = { title: 'report fixture', goalY: 100, width: 26 };
  class Physics {
    async init() {}
    shakeMarble() {}
    clearMarbles() {}
    clear() {}
  }
  class Game {
    prepare() {
      run++;
      this.balls = Array.from({ length: 3 }, (_, id) => ({ id, name: String(id), x: 10 + id, y: 10, stuck: 0 }));
      this.arrivals = []; this.winners = []; this.elapsed = 0; this.finishReason = undefined; this.rescues = 1;
    }
    start() { this.state = 'running'; }
    advance() {
      const outcome = mode === 'mixed' ? ['timeout', 'arrived', 'stalled'][run % 3] : mode;
      this.elapsed = 600;
      this.state = outcome === 'timeout' ? 'running' : 'finished';
      this.finishReason = outcome === 'timeout' ? undefined : outcome;
      const count = outcome === 'timeout' ? 1 : 3;
      this.balls.forEach((b, i) => {
        if (i < count) {
          b.rank = i + 1; b.y = outcome === 'stalled' && i === 2 ? 50 : 101;
          this.arrivals.push(b);
        }
      });
      // Forced outcomes deliberately favor a different ticket, making accidental mixing visible.
      this.winners = outcome === 'arrived' ? [this.balls[0]] : [this.balls[1]];
    }
  }
  const filename = path.resolve(__dirname, '..', file);
  const scriptRequire = name => {
    if (name === 'node:fs') return {
      readFileSync: (f, ...args) => f === 'input.json' ? JSON.stringify({ names: 'A,B,C', order: 'asc', picks: 1 }) : fs.readFileSync(f, ...args),
      mkdirSync() {}, writeFileSync: (f, data) => written.set(path.basename(f), data),
    };
    if (name === '../src/game.ts') return { Game };
    if (name === '../src/physics-box2d.ts') return { Box2dPhysics: Physics };
    if (name === '../src/data/neon-junction.ts') return { neonJunction: stage };
    if (name === '../src/data/desire-jar.ts') return { desireJar: stage };
    if (name === '../src/data/maps.ts') return { stages: [stage] };
    if (name === '../src/model.ts') return { parseNames: s => s.split(','), winningRange: () => [1, 1] };
    return require(name);
  };
  scriptRequire.extensions = {};
  const processStub = { argv: ['node', file, 'input.json', 'review-output'], exitCode: 0 };
  const context = { require: scriptRequire, __dirname: path.dirname(filename), process: processStub,
    console: { log() {}, error(e) { throw e; } } };
  context.global = context;
  await vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  assert.equal(processStub.exitCode, 0);
  const result = JSON.parse(written.get('results.json'));
  assert.ok(written.has('positions.csv') && written.has('players.csv'));
  return result;
}

(async () => {
  for (const file of ['scripts/fairness.cjs', 'scripts/fairness-jar.cjs']) {
    const mixed = await report(file, 'mixed');
    assert.equal(mixed.trials, 100); assert.equal(mixed.analyzedTrials, 34);
    assert.equal(mixed.stalledTrials, 33); assert.equal(mixed.timedOutTrials, 33); assert.equal(mixed.failures, 66);
    assert.equal(mixed.positions[0].wins, 34); assert.equal(mixed.positions[0].winPercent, 100);
    assert.equal(mixed.positions[1].wins, 0, 'forced winners are excluded from normal completion statistics');
    assert.equal(mixed.expectedWinsPerTicket, 34 / 3);
    assert.equal(mixed.positions[0].finishes, 34);
    const forced = mixed.runs.find(r => r.finishReason === 'stalled');
    assert.equal(forced.finished, true, 'finished still means the game ended, preserving the existing field');
    assert.equal(forced.rescues, 1); assert.equal(forced.arrivals[2].forced, true);
    assert.equal((forced.remaining ?? forced.unfinished).length, 1, 'physically unarrived marbles remain traceable');
    if (forced.arrivals[2].checkpoints) assert.equal(forced.arrivals[2].checkpoints.finish, undefined);
    const none = await report(file, 'stalled');
    assert.equal(none.analyzedTrials, 0); assert.equal(none.failures, 100);
    assert.equal(none.stalledTrials, 100); assert.equal(none.timedOutTrials, 0);
    assert.equal(none.positions[0].winPercent, null, 'no valid trials means unavailable, not zero percent');
    assert.equal(none.positions[0].meanRank, null);
    const all = await report(file, 'arrived');
    assert.equal(all.analyzedTrials, 100); assert.equal(all.failures, 0);
    assert.equal(all.positions[0].winPercent, 100);
    console.log('PASS ' + file + ': normal/stalled/timeout counts, correct denominator, forced ranks, JSON and CSV');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
