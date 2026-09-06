const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { Game } = require('../src/game.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { neonJunction } = require('../src/data/neon-junction.ts');
const { parseNames, winningRange } = require('../src/model.ts');
global.fetch = undefined;
async function run() {
  if (!process.argv[2]) throw new Error('Usage: node scripts/fairness.cjs input.json [output-directory]');
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const names = parseNames(input.names);
  const range = winningRange(input.order, names.length, input.picks);
  const output = path.resolve(process.argv[3] || 'fairness-results');
  const physics = new Box2dPhysics();
  await physics.init();
  let shakes = 0;
  const shake = physics.shakeMarble.bind(physics);
  physics.shakeMarble = id => { shakes++; shake(id); };
  const game = Object.create(Game.prototype);
  Object.assign(game, { physics, recorder: { stop() {} }, render() {}, onFinish() {} });
  // Unique ticket identifiers keep repeated names separate without changing the physics.
  const tickets = names.map((_, i) => String(i));
  const runs = [];
  for (let run = 1; run <= 100; run++) {
    shakes = 0;
    game.prepare(neonJunction, tickets);
    const starts = game.balls.map(b => ({ position: b.id + 1, ticket: Number(b.name), x: b.x, y: b.y }));
    const routes = new Map();
    const escaped = new Set();
    const checkpoints = new Map(game.balls.map(b => [b.id, {}]));
    game.start(range, false, input.order);
    while (game.state === 'running' && game.elapsed < 180) {
      game.advance();
      for (const b of game.balls) {
        if (b.y > 8 && (b.x < -0.5 || b.x > (neonJunction.width ?? 26) + 0.5)) escaped.add(b.id);
        if (!routes.has(b.id) && b.y >= 100) routes.set(b.id, Math.min(4, Math.max(0, Math.floor((b.x - 0.5) / 13))) + 1);
        const points = checkpoints.get(b.id);
        for (const y of [60, 140, 162, 169]) if (!points[y] && b.y >= y) points[y] = { seconds: game.elapsed, x: b.x };
        if (b.rank && !points.finish) points.finish = { seconds: game.elapsed, x: b.x };
      }
    }
    const arrivals = game.arrivals.map(b => ({ position: b.id + 1, ticket: Number(b.name), rank: b.rank, pipe: routes.get(b.id), checkpoints: checkpoints.get(b.id) }));
    runs.push({ run, finished: game.state === 'finished', seconds: game.elapsed, shakes, escaped: [...escaped], starts, arrivals,
      unfinished: game.balls.filter(b => !b.rank).map(b => ({ position: b.id + 1, x: b.x, y: b.y, pipe: routes.get(b.id) })),
      winners: game.winners.map(b => Number(b.name)) });
    if (run % 10 === 0) console.log(run + '/100 completed');
  }
  physics.clearMarbles(); physics.clear();
  const positions = tickets.map((_, i) => ({ position: i + 1, rowFromBottom: Math.floor(i / 10) + 1,
    columnFromLeft: i % 10 + 1, wins: 0, firsts: 0, rankSum: 0, finishes: 0 }));
  const players = names.map((name, ticket) => ({ ticket, name, wins: 0, firsts: 0, rankSum: 0, finishes: 0 }));
  const pipes = Array.from({length: 5}, (_, i) => ({ pipe: i + 1, entrants: 0, wins: 0, firsts: 0, rankSum: 0 }));
  for (const run of runs) for (const a of run.arrivals) {
    const winner = run.winners.includes(a.ticket);
    for (const row of [positions[a.position - 1], players[a.ticket]]) {
      row.finishes++; row.wins += Number(winner); row.firsts += Number(a.rank === 1); row.rankSum += a.rank;
    }
    if (a.pipe) { const p = pipes[a.pipe - 1]; p.entrants++; p.wins += Number(winner); p.firsts += Number(a.rank === 1); p.rankSum += a.rank; }
  }
  for (const row of [...positions, ...players]) { row.winPercent = row.wins; row.meanRank = row.finishes ? row.rankSum / row.finishes : null; }
  for (const p of pipes) { p.winPercentPerEntry = p.entrants ? p.wins / p.entrants * 100 : null; p.meanRank = p.entrants ? p.rankSum / p.entrants : null; }
  const report = { input, count: names.length, trials: 100, expectedWinsPerTicket: 100 * input.picks / names.length,
    expectedFirstsPerTicket: 100 / names.length, failures: runs.filter(r => !r.finished).length,
    uniqueArrivalOrders: new Set(runs.map(r => r.arrivals.map(a => a.position).join(','))).size,
    totalUnsticking: runs.reduce((n,r) => n + r.shakes, 0),
    totalEscaped: runs.reduce((n, r) => n + r.escaped.length, 0),
    sourceSha256: Object.fromEntries(['src/data/neon-junction.ts', 'src/physics-box2d.ts', 'src/game.ts'].map(file =>
      [file, crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '..', file))).digest('hex')])),
    mapSha256: crypto.createHash('sha256').update(JSON.stringify(neonJunction)).digest('hex'), positions, players, pipes, runs };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  const csv = rows => { const keys = Object.keys(rows[0]); return [keys, ...rows.map(r => keys.map(k => r[k]))].map(r => r.map(v => JSON.stringify(String(v ?? ''))).join(',')).join('\n'); };
  for (const [name, rows] of Object.entries({ positions, players, pipes })) fs.writeFileSync(path.join(output, name + '.csv'), '\ufeff' + csv(rows));
  console.log(JSON.stringify({ count: report.count, failures: report.failures, uniqueArrivalOrders: report.uniqueArrivalOrders, totalUnsticking: report.totalUnsticking, totalEscaped: report.totalEscaped, positions, players, pipes }));
}
run().catch(e => { console.error(e); process.exitCode = 1; });
