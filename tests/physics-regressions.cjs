const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.fetch = undefined;
const { Box2dPhysics } = require('../src/physics-box2d.ts');
const { validateStage } = require('../src/model.ts');

const props = { density: 1, restitution: 1, angularVelocity: 0 };
const fragile = () => ({ position: { x: 0, y: 0 }, type: 'static',
  shape: { type: 'circle', radius: 0.2 }, props: { ...props, life: 1 } });
const wall = { position: { x: 50, y: 0 }, type: 'static',
  shape: { type: 'polyline', rotation: 0, backing: 0.3, points: [[0, -2], [0, 2]] }, props };
const stage = entities => validateStage({ title: 'Physics regression', goalY: 30, entities });

(async () => {
  const physics = new Box2dPhysics();
  await physics.init();
  try {
    for (const [substeps, speed] of [[4, 80], [16, 20], [16, 40], [16, 60]]) {
      physics.clearMarbles(); physics.clear();
      physics.createStage(stage(substeps === 16 ? [fragile(), wall] : [fragile()]));
      physics.createMarble(0, -0.6, 0);
      physics.start();
      physics.vector.Set(speed, 0);
      physics.marbleMap[0].SetLinearVelocity(physics.vector);
      physics.step(1 / 60);
      assert.ok(physics.marbleMap[0].GetLinearVelocity().x < 0, 'the marble physically bounced');
      assert.equal(physics.getEntities().some(e => e.life > 0), false,
        `a transient collision destroys the obstacle with ${substeps} substeps at speed ${speed}`);
      physics.step(1 / 60);
      assert.equal(physics.world.GetBodyCount(), substeps === 16 ? 2 : 1, 'the removed body is destroyed once');
    }
    physics.clearMarbles(); physics.clear();
    physics.createStage(stage([{ position: { x: 0, y: 0 }, type: 'kinematic',
      shape: { type: 'box', width: 0.2, height: 0.2, rotation: 0 },
      props: { ...props, life: 1, angularVelocity: 1,
        spinCycle: { period: 2, runFor: 1, phase: 0, idleSpeed: 0 } } }]));
    physics.createMarble(0, -0.3, 0); physics.start();
    physics.step(1 / 60);
    assert.equal(physics.getEntities().length, 0, 'an initially touching moving obstacle also breaks');
    physics.step(1 / 60);
    assert.equal(physics.world.GetBodyCount(), 1, 'removed moving obstacles are not updated after native destruction');
    console.log('PASS transient breakable collisions in 4 and 16 substeps');

    // Reusing an engine must release JS wrappers as well as native bodies after a reset.
    const B = physics.Box2D;
    const cacheSize = name => Object.keys(B.getCache(B[name])).length;
    const cacheClasses = ['b2Body', 'b2Fixture', 'b2Filter', 'b2ContactEdge', 'b2Contact'];
    const reset = () => {
      physics.clearMarbles(); physics.clear();
      for (const name of cacheClasses) assert.equal(cacheSize(name), 0, `${name} wrappers are released on reset`);
      assert.equal(cacheSize('b2Vec2'), 1, 'only the engine-owned reusable vector remains');
    };
    reset();
    const boost = { position: { x: 2, y: 5 }, type: 'static',
      shape: { type: 'box', width: 2, height: 1, rotation: 0, boostSpeed: 20 }, props: { ...props, life: -1 } };
    const reusable = stage([boost, wall]);
    for (let run = 0; run < 12; run++) {
      physics.createStage(reusable);
      for (let id = 0; id < 4; id++) physics.createMarble(id, 1 + id * 0.6, 5);
      physics.start();
      for (let i = 0; i < 12; i++) physics.step(1 / 60);
      physics.removeMarble(0);
      // Clearing one side must retain live marble wrappers and their object identities.
      const live = physics.marbleMap[1];
      physics.clear();
      assert.strictEqual(B.wrapPointer(B.getPointer(live), B.b2Body), live);
      assert.ok(Number.isFinite(physics.getMarblePosition(1).x));
      reset();
    }
    console.log('PASS wrapper cleanup over repeated maps and live body identity preservation');

    physics.createStage(stage([wall]));
    const fixed = physics.entities[0].body;
    const originalPosition = fixed.GetPosition, originalAngle = fixed.GetAngle;
    let fixedReads = 0;
    fixed.GetPosition = () => { fixedReads++; return originalPosition.call(fixed); };
    fixed.GetAngle = () => { fixedReads++; return originalAngle.call(fixed); };
    physics.step(1 / 60);
    assert.deepEqual(physics.getEntities(0.5)[0], { x: 50, y: 0, angle: 0, shape: wall.shape, life: -1 });
    assert.equal(fixedReads, 0, 'fixed obstacles need no WASM pose reads for stepping or drawing');
    fixed.GetPosition = originalPosition; fixed.GetAngle = originalAngle;
    reset();

    const windModule = require('../src/wind-power.ts'), originalPower = windModule.windPower;
    let powerCalls = 0;
    windModule.windPower = (...args) => { powerCalls++; return originalPower(...args); };
    try {
      physics.createStage({ ...stage([]), windZones: [
        { type: 'directional', x: 0, y: 5, width: 10, height: 10, velocityX: 3, velocityY: -2 },
        { type: 'vortex', x: 0, y: 5, radius: 10, speed: 2 },
      ] });
      for (let id = 0; id < 10; id++) physics.createMarble(id, id * 0.6, 5);
      physics.start();
      for (let i = 0; i < 3; i++) physics.step(1 / 60);
      assert.equal(powerCalls, 6, 'wind timing is evaluated once per zone per step, independent of marble count');
    } finally {
      windModule.windPower = originalPower;
      reset();
    }
    physics.dispose();
    physics.dispose();
    assert.equal(cacheSize('b2Vec2'), 0, 'disposing frees the owned vector');
    assert.equal(cacheSize('b2World'), 0, 'disposing frees the owned world');
    console.log('PASS static pose reads, shared wind timing and idempotent engine disposal');
  } finally {
    physics.dispose();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
