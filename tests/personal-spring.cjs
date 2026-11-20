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
const {
  personalSpringEntity,
  personalSpringExtension,
  PERSONAL_SPRING_DURATION,
  validatePersonalSpring,
} = require('../src/personal-spring.ts');
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
assert.throws(() => validatePersonalSpring(stage, valid, [valid]), /겹쳐요/);
assert.throws(() => validatePersonalSpring(stage, valid, [{ x: 14.5, y: 19, direction: Math.PI }]), /겹쳐요/);
assert.doesNotThrow(() => validatePersonalSpring(stage, valid, [{ ...valid, x: 15 }]));
const fixedSpringStage = { ...stage, entities: [personalSpringEntity(stage, valid)] };
assert.throws(() => validatePersonalSpring(fixedSpringStage, valid, []), /맵 스프링/);
assert.equal(personalSpringExtension(0), 0);
assert.ok(personalSpringExtension(0.04) > 0.8, 'snappy outward stroke reaches most of its travel in 40ms');
assert.equal(personalSpringExtension(0.1), 1, 'brief extended hold remains visible between LAN snapshots');
assert.ok(personalSpringExtension(0.3) < 0.7 && personalSpringExtension(0.3) > 0.4);
assert.equal(personalSpringExtension(0.5), 0);
assert.equal(personalSpringExtension(PERSONAL_SPRING_DURATION), 0);
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
    race.prepare(stage, ['위쪽 발사']);
    race.startRace([1, 1]);
    const upward = personalSpringEntity(stage, { x: 13, y: 3, direction: -Math.PI / 2 });
    race.physics.createEntities([upward]);
    race.physics.placeMarble(0, 13, 2.4);
    assert.equal(race.activateSpring(0), true);
    let highest = Infinity;
    for (let i = 0; i < 90; i++) {
      race.advance();
      highest = Math.min(highest, race.balls[0].y);
      if (i === 39) race.physics.removeSpring(upward.shape);
    }
    assert.ok(highest > -15 && highest < -14.6, `upward spring hits the ceiling, highest y = ${highest}`);
    assert.ok(race.balls[0].y > 0, 'the spring-launched marble returns to the track');
    for (const map of stages) {
      race.prepare(
        map,
        Array.from({ length: 300 }, (_, i) => String(i))
      );
      assert.ok(
        race.balls.every(({ y }) => y > -14.6),
        `${map.title}: all spawn rows fit below the ceiling`
      );
      for (const [vx, vy] of [
        [0, -75],
        [-5, -160],
        [5, -160],
      ]) {
        race.prepare(map, ['위쪽 경계']);
        race.startRace([1, 1]);
        race.physics.placeMarble(0, map.spawnX ?? 12.85, -1);
        race.physics.setMarbleVelocity(0, vx, vy);
        for (let tick = 0; tick < 60; tick++) {
          race.advance();
          assert.ok(race.balls[0].y > -15, `${map.title}: upper boundary at speeds ${vx}, ${vy}`);
        }
      }
    }
    console.log(
      `PASS upward spring and three upward shots per map across ${stages.length} maps; 300 spawn slots per map`
    );
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
      const peak = race.physics.getEntities()[0];
      assert.ok((peak.x - valid.x) * dx + (peak.y - valid.y) * dy > 1.4, 'real piston extends fully before retracting');
      const velocity = race.physics.getMarbleVelocity(0);
      assert.ok(
        velocity.vx * dx + velocity.vy * dy > 10,
        'actual Box2D spring launches the marble in its chosen direction'
      );
      for (let i = 0; i < 25; i++) race.advance();
      const returned = race.physics.getEntities()[0];
      assert.ok(
        Math.hypot(returned.x - valid.x, returned.y - valid.y) < 1e-4,
        'piston physically returns before removal'
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
    race.prepare(
      {
        ...stage,
        entities: [
          {
            type: 'static',
            position: { x: 0, y: 0 },
            shape: {
              type: 'polyline',
              rotation: 0,
              points: [
                [16, 0],
                [16, 60],
              ],
            },
            props: { density: 1, restitution: 0.8, angularVelocity: 0 },
          },
        ],
      },
      ['벽 충돌']
    );
    race.startRace([1, 1]);
    const fastSpring = personalSpringEntity(stage, { ...valid, direction: 0 });
    race.physics.createEntities([fastSpring]);
    race.physics.placeMarble(0, 13.6, 20);
    race.physics.setMarbleVelocity(0, 0, 0);
    assert.equal(race.activateSpring(1), true);
    for (let i = 0; i < 60; i++) {
      race.advance();
      assert.ok(race.physics.getMarblePosition(0).x <= 15.76, 'fast launch cannot cross a thin map wall');
    }
    race.physics.removeSpring(fastSpring.shape);
    console.log('PASS fast participant spring impact remains on the safe side of a thin wall');
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
