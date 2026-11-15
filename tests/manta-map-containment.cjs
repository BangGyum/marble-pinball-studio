const fs = require('node:fs'),
  path = require('node:path'),
  ts = require('typescript');

require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    f
  );
global.fetch = undefined;
const root = path.resolve(__dirname, '..'),
  { Race } = require(path.join(root, 'src/race.ts')),
  { neonJunction } = require(path.join(root, 'src/data/neon-junction.ts')),
  { orbitalLock } = require(path.join(root, 'src/data/orbital-lock.ts')),
  { WallGuard } = require(path.join(root, 'src/wall-guard.ts')),
  { dolphinRows } = require(path.join(root, 'src/dolphin.ts'));

const out = path.join(root, '.test-build/manta-two-map-containment.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
const report = {
  scope:
    'Real Race/Box2D natural starts. Each solver substep independently checked against immutable map segments and native solid-fixture TestPoint, after sweep recovery. No FPS claim.',
  participants: 100,
  maxSeconds: 600,
  runs: [],
};
(async () => {
  const race = new Race();
  await race.physics.init();
  const phys = race.physics,
    B = phys.Box2D,
    random = Math.random;
  try {
    for (const stage of [neonJunction, orbitalLock])
      for (const initial of [42, 18391, 459817]) {
        let seed = initial;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const size = 100,
          speed = 1,
          rows = dolphinRows(stage, 3, 20);
        race.prepare(
          stage,
          Array.from({ length: 100 }, (_, i) => String(i)),
          { enabled: false, rows, interval: 5, manta: { enabled: true, rows, interval: 5, size, speed } }
        );
        race.startRace([1, 1]);
        const walls = new WallGuard(stage),
          old = new Float64Array(200),
          objects = new Map(phys.entities.map((e) => [B.getPointer(e.body), e])),
          movingOld = new Map(),
          localGuards = new Map();
        for (const e of phys.entities)
          if (e.moving && e.shape.type !== 'circle')
            localGuards.set(
              B.getPointer(e.body),
              new WallGuard({
                title: 'moving audit',
                goalY: 200,
                entities: [
                  {
                    position: { x: 0, y: 0 },
                    type: 'static',
                    shape: e.shape,
                    props: { density: 1, restitution: 0, angularVelocity: 0 },
                  },
                ],
              })
            );
        let checks = 0,
          impacts = 0,
          recoveries = 0,
          inGuard = false,
          substepTime = 0;
        const violations = [],
          captures = new Set();
        for (const body of phys.marbleBodies) {
          const transform = body.SetTransform.bind(body);
          body.SetTransform = (...args) => {
            if (inGuard) recoveries++;
            return transform(...args);
          };
        }
        const worldStep = phys.world.Step.bind(phys.world),
          guard = phys.guardMapCrossings.bind(phys),
          setter = phys.setMarbleVelocity.bind(phys);
        phys.setMarbleVelocity = (...args) => {
          impacts++;
          return setter(...args);
        };
        phys.world.Step = (...args) => {
          for (const ball of race.balls) {
            if (ball.rank) continue;
            if (ball.mantaCaughtAt !== undefined) captures.add(`${ball.id}/${ball.mantaCaughtAt}`);
            const p = phys.getMarblePosition(ball.id);
            old[ball.id * 2] = p.x;
            old[ball.id * 2 + 1] = p.y;
          }
          movingOld.clear();
          for (const e of phys.entities)
            if (e.moving) {
              const p = e.body.GetPosition(),
                a = e.body.GetAngle();
              movingOld.set(B.getPointer(e.body), { e, x: p.x, y: p.y, c: Math.cos(a), s: Math.sin(a) });
            }
          substepTime = phys.motionTime;
          return worldStep(...args);
        };
        const audit = () => {
          const moving = [...movingOld].map(([pointer, m]) => {
            const p = m.e.body.GetPosition(),
              a = m.e.body.GetAngle();
            return { ...m, pointer, nx: p.x, ny: p.y, nc: Math.cos(a), ns: Math.sin(a) };
          });
          for (const ball of race.balls) {
            if (ball.rank) continue;
            const body = phys.marbleMap[ball.id],
              p = body.GetPosition(),
              layer = phys.isMarbleOnBridge(ball.id) ? 2 : 1;
            checks++;
            if (walls.crosses(old[ball.id * 2], old[ball.id * 2 + 1], p.x, p.y, layer) && violations.length < 20)
              violations.push({
                type: 'static crossing',
                id: ball.id,
                time: substepTime,
                from: [old[ball.id * 2], old[ball.id * 2 + 1]],
                to: [p.x, p.y],
              });
            for (const m of moving) {
              if ((m.e.shape.collisionLayer ?? 1) !== layer || m.e.shape.sensor || m.e.life === 0) continue;
              const dx = old[ball.id * 2] - m.x,
                dy = old[ball.id * 2 + 1] - m.y,
                ex = p.x - m.nx,
                ey = p.y - m.ny,
                ax = dx * m.c + dy * m.s,
                ay = -dx * m.s + dy * m.c,
                bx = ex * m.nc + ey * m.ns,
                by = -ex * m.ns + ey * m.nc;
              if (localGuards.get(m.pointer)?.crosses(ax, ay, bx, by, layer) && violations.length < 20)
                violations.push({
                  type: 'moving crossing',
                  shape: m.e.shape.type,
                  id: ball.id,
                  time: substepTime,
                  from: [ax, ay],
                  to: [bx, by],
                });
            }
            let edge = phys.leaks.recordLeak(body.GetContactList());
            while (B.getPointer(edge)) {
              const entity = objects.get(B.getPointer(edge.other));
              if (
                entity &&
                (entity.shape.collisionLayer ?? 1) === layer &&
                (entity.life === -1 || entity.life > 0) &&
                (entity.shape.type !== 'polyline' || entity.shape.solid)
              ) {
                const contact = phys.leaks.recordLeak(edge.contact),
                  a = contact.GetFixtureA(),
                  fixture = B.getPointer(a.GetBody()) === B.getPointer(body) ? contact.GetFixtureB() : a;
                if (!fixture.IsSensor() && fixture.TestPoint(p) && violations.length < 20)
                  violations.push({
                    type: 'solid interior',
                    shape: entity.shape.type,
                    id: ball.id,
                    time: substepTime,
                    point: [p.x, p.y],
                  });
              }
              edge = phys.leaks.recordLeak(edge.next);
            }
          }
        };
        phys.guardMapCrossings = (...args) => {
          inGuard = true;
          try {
            guard(...args);
          } finally {
            inGuard = false;
          }
          audit();
        };
        try {
          for (let i = 0; i < 36000 && race.state === 'running'; i++) race.advance();
        } finally {
          phys.world.Step = worldStep;
          phys.guardMapCrossings = guard;
          phys.setMarbleVelocity = setter;
        }
        const run = {
          map: stage.title,
          seed: initial,
          state: race.state,
          reason: race.finishReason,
          arrivals: race.arrivals.length,
          size,
          speed,
          rows: rows.length,
          elapsed: race.elapsed,
          impacts,
          checks,
          recoveries,
          captures: captures.size,
          violations,
        };
        report.runs.push(run);
        fs.writeFileSync(out, JSON.stringify(report, null, 2));
        console.log(
          `${stage.title} ${size}%/${speed}x: ${violations.length} violations, ${recoveries} recovered substeps, ${impacts} impulses`
        );
      }
    report.passed = report.runs.every(
      (r) => !r.violations.length && r.reason === 'arrived' && r.arrivals === 100 && r.captures > 0
    );
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    if (!report.passed) throw Error('Real-map crossing/interior violations or incomplete arrival observed');
    console.log(`PASS ${report.runs.length} natural real-map collision audits`);
  } finally {
    Math.random = random;
    race.physics.dispose();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
