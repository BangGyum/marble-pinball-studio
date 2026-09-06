const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { Game } = require('../src/game.ts');
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { stages } = require('../src/data/maps.ts');
const stage = stages[2];
const { parseNames, winningRange } = require('../src/model.ts');
global.fetch = undefined;
async function run() {
  if (!process.argv[2]) throw new Error('Usage: node scripts/fairness-jar.cjs input.json [output-directory]');
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const names = parseNames(input.names);
  const range = winningRange(input.order, names.length, input.picks);
  const output = path.resolve(process.argv[3] || 'fairness-results/jar/extended');
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
    game.prepare(stage, tickets);
    const starts = game.balls.map(b => ({ position: b.id + 1, ticket: Number(b.name), x: b.x, y: b.y }));
    game.start(range, false, input.order);
    while (game.state === 'running' && game.elapsed < 600) {
      game.advance();
    }
    const arrivals = game.arrivals.map(b => ({ position: b.id + 1, ticket: Number(b.name), rank: b.rank }));
    runs.push({ remaining: game.balls.filter(b => !b.rank).map(b => ({position: b.id + 1, ticket: Number(b.name), x: b.x, y: b.y, stuck: b.stuck})), run, finished: game.state === 'finished', seconds: game.elapsed, shakes, starts, arrivals,
      winners: game.winners.map(b => Number(b.name)) });
    if (run % 10 === 0) console.log(run + '/100 completed');
  }
  physics.clearMarbles(); physics.clear();
  const positions = tickets.map((_, i) => ({ position: i + 1, rowFromBottom: Math.floor(i / 10) + 1,
    columnFromLeft: i % 10 + 1, wins: 0, firsts: 0, rankSum: 0, finishes: 0 }));
  const players = names.map((name, ticket) => ({ ticket, name, wins: 0, firsts: 0, rankSum: 0, finishes: 0 }));
  for (const run of runs) for (const a of run.arrivals) {
    const winner = run.winners.includes(a.ticket);
    for (const row of [positions[a.position - 1], players[a.ticket]]) {
      row.finishes++; row.wins += Number(winner); row.firsts += Number(a.rank === 1); row.rankSum += a.rank;
    }
  }
  for (const row of [...positions, ...players]) { row.winPercent = row.wins; row.meanRank = row.finishes ? row.rankSum / row.finishes : null; }
  const report = { timeLimitSeconds: 600, map: '욕망의 항아리', builtinIndex: 2, sourceHashes: Object.fromEntries(['src/game.ts', 'src/physics-box2d.ts', 'src/model.ts', 'src/data/maps.ts'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])), input, count: names.length, trials: 100, expectedWinsPerTicket: 100 * input.picks / names.length,
    expectedFirstsPerTicket: 100 / names.length, failures: runs.filter(r => !r.finished).length,
    uniqueArrivalOrders: new Set(runs.map(r => r.arrivals.map(a => a.position).join(','))).size,
    totalUnsticking: runs.reduce((n,r) => n + r.shakes, 0),
    mapSha256: crypto.createHash('sha256').update(JSON.stringify(stage)).digest('hex'), positions, players, runs };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  const csv = rows => { const keys = Object.keys(rows[0]); return [keys, ...rows.map(r => keys.map(k => r[k]))].map(r => r.map(v => JSON.stringify(String(v ?? ''))).join(',')).join('\n'); };
  for (const [name, rows] of Object.entries({ positions, players })) fs.writeFileSync(path.join(output, name + '.csv'), '\ufeff' + csv(rows));
  console.log(JSON.stringify({ count: report.count, failures: report.failures, uniqueArrivalOrders: report.uniqueArrivalOrders, totalUnsticking: report.totalUnsticking, positions, players }));
}
run().catch(e => { console.error(e); process.exitCode = 1; });
