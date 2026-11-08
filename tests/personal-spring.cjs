const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file
  );
global.fetch = undefined;
const { personalSpringEntity } = require('../src/personal-spring.ts');
const { PersonalSpringPlacement } = require('../src/lan/spring-placement.ts');
const { Race } = require('../src/race.ts');
const { stages, hiddenStages } = require('../src/data/maps.ts');
const stage = { title: '참여자 스프링 검증', width: 26, goalY: 60, zoomY: 55, entities: [] };
const valid = { x: 13, y: 20, direction: -Math.PI / 2 };
for (const invalid of [
  { ...valid, x: NaN },
  { ...valid, x: '13' },
  { ...valid, y: Infinity },
  { ...valid, direction: null },
  { ...valid, direction: 4 },
  { ...valid, x: 0 },
  { ...valid, y: 0 },
  { x: 25, y: 20, direction: 0 },
  { x: 13, y: 59, direction: Math.PI / 2 },
])
  assert.throws(() => personalSpringEntity(stage, invalid));
assert.equal(personalSpringEntity(stage, valid).shape.spring.distance, 1.5);
const placement = new PersonalSpringPlacement();
placement.begin(stage);
assert.throws(() => placement.choose({ x: -1, y: 20 }));
assert.equal(placement.origin, undefined, 'invalid click does not lock the location');
assert.equal(placement.choose({ x: 13, y: 20 }), undefined);
assert.throws(() => placement.choose({ x: 13, y: 20 }), 'second tap must indicate a direction');
assert.deepEqual(placement.choose({ x: 13, y: 17 }), valid, 'second click determines the stroke direction');
placement.cancel();
assert.equal(placement.active, false);
placement.begin(stage);
assert.equal(placement.origin, undefined, 'cancel and restart do not retain an old origin');
console.log('PASS two-step placement, invalid coordinates, stroke bounds, cancellation and restart');
(async () => {
  const race = new Race();
  await race.physics.init();
  try {
    for (const direction of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      race.prepare(stage, ['구슬']);
      race.startRace([1, 1]);
      const entity = personalSpringEntity(stage, { ...valid, direction });
      race.physics.createEntities([entity]);
      const dx = Math.cos(direction),
        dy = Math.sin(direction);
      race.physics.placeMarble(0, 13 + dx * 0.6, 20 + dy * 0.6);
      race.physics.setMarbleVelocity(0, 0, 0);
      assert.equal(race.activateSpring(0), true);
      for (let i = 0; i < 8; i++) race.advance();
      const velocity = race.physics.getMarbleVelocity(0);
      assert.ok(
        velocity.vx * dx + velocity.vy * dy > 3,
        'actual Box2D spring launches the marble in its chosen direction'
      );
      race.physics.removeSpring(entity.shape);
      assert.equal(race.physics.getEntities(0.5).length, 0, 'removal invalidates old interpolation indices');
      for (let i = 0; i < 65; i++) race.advance();
      assert.equal(
        race.physics.world.GetBodyCount(),
        Object.keys(race.physics.marbleMap).length,
        'used spring leaves no body or permanent blocker'
      );
      assert.equal(stage.entities.length, 0, 'temporary spring never modifies the saved map');
    }
    console.log('PASS four-direction real collisions, runtime removal, continued simulation and map immutability');
    for (const map of stages.filter((candidate) => !hiddenStages.includes(candidate))) {
      const original = JSON.stringify(map);
      race.prepare(
        map,
        Array.from({ length: 20 }, (_, i) => `구슬${i}`)
      );
      race.startRace([1, 20]);
      const springs = [0, -Math.PI / 2, Math.PI / 2].map((direction, index) =>
        personalSpringEntity(map, {
          x: (map.width ?? 26) / 2,
          y: (map.goalY * (index + 1)) / 4,
          direction,
        })
      );
      race.physics.createEntities(springs);
      springs.forEach((entity) => {
        assert.equal(
          race.activateSpring(race.physics.getEntities().findIndex((entry) => entry.shape === entity.shape)),
          true
        );
      });
      for (let i = 0; i < 65 && race.state === 'running'; i++) race.advance();
      const bodiesBeforeRemoval = race.physics.world.GetBodyCount();
      springs.forEach((entity) => {
        race.physics.removeSpring(entity.shape);
      });
      assert.equal(
        race.physics.world.GetBodyCount(),
        bodiesBeforeRemoval - 3,
        `${map.title}: all temporary bodies removed`
      );
      for (let i = 0; i < 240 && race.state === 'running'; i++) race.advance();
      assert.ok(
        race.balls.every((ball) => [ball.x, ball.y, ball.angle].every(Number.isFinite)),
        `${map.title}: no invalid marble poses after spring removal`
      );
      assert.ok(
        race.physics.getEntities().every((entity) => [entity.x, entity.y, entity.angle].every(Number.isFinite)),
        `${map.title}: no invalid device poses`
      );
      assert.equal(JSON.stringify(map), original, `${map.title}: map data unchanged`);
      console.log(
        `PASS personal springs on ${map.title}: 20 marbles, 3 concurrent strokes, cleanup and continued physics`
      );
    }
  } finally {
    race.physics.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
