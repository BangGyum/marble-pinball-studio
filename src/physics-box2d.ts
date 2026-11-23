// Adapted from lazygyu/roulette (MIT). See LICENSE and THIRD_PARTY.md.
import Box2DFactory from 'box2d-wasm';
import type { StageDef, WindZone } from './data/maps';
import { windPower } from './wind-power';
import {
  BARREL_LENGTH,
  BARREL_RAILS,
  BARREL_TILT,
  LAUNCHER_ENTRY_HALF_WIDTH,
  LAUNCHER_ENTRY_Y,
  LAUNCHER_GATE_HALF_WIDTH,
  LAUNCHER_GATE_OPEN_ANGLE,
  LAUNCHER_PISTON_REST,
  LAUNCH_SPEED,
  launcherGate,
  launcherPiston,
} from './marble-launcher';
import { timedGateAngle } from './timed-gate';
import { rotorPower } from './rotor-cycle';
import type { IPhysics } from './i-physics';
import type { EntityBoxShape, MapEntity, MapEntityState } from './types/map-entity';
import { PERSONAL_SPRING_DURATION, personalSpringExtension } from './personal-spring';

type PhysicsEntity = {
  body: Box2D.b2Body;
  moving: boolean;
  springAt?: number;
  sliding?: MapEntity['props']['sliding'];
  oscillation?: MapEntity['props']['oscillation'];
  timedGate?: MapEntity['props']['timedGate'];
  spinCycle?: MapEntity['props']['spinCycle'];
  spin: number;
  launcherPiston?: boolean;
  sweepPose?: {
    x: number;
    y: number;
    cos: number;
    sin: number;
    nextX: number;
    nextY: number;
    nextCos: number;
    nextSin: number;
  };
  sweepRadius?: number;
} & MapEntityState;

type SweepHit = { entity: PhysicsEntity; fraction: number; nx: number; ny: number };
type Launcher = {
  entity: PhysicsEntity;
  gate?: PhysicsEntity;
  piston?: PhysicsEntity;
  pistonTravel?: number;
  loaded?: { body: Box2D.b2Body; at: number; x: number; y: number };
};
const MARBLE_RADIUS = 0.25;
// Leave a small margin when recovering onto a hit face.
const SWEEP_CLEARANCE = 0.255;
const RECOVERY_DIRECTIONS = Array.from({ length: 128 }, (_, i) => [
  Math.cos((i * Math.PI) / 64),
  Math.sin((i * Math.PI) / 64),
]);

const inBridgeArea = (x: number, y: number, area: NonNullable<StageDef['exitBridge']>['entry']) =>
  Math.abs(x - area.x) <= area.width / 2 && Math.abs(y - area.y) <= area.height / 2;

export class Box2dPhysics implements IPhysics {
  private Box2D!: typeof Box2D & EmscriptenModule;
  private world!: Box2D.b2World;
  private vector!: Box2D.b2Vec2;
  private leaks!: Box2D.LeakMitigator;
  private disposed = false;
  private marbleMap: Record<number, Box2D.b2Body> = {};
  private marbleBodies: Box2D.b2Body[] = [];
  private entities: PhysicsEntity[] = [];
  private entityBodies = new Map<number, PhysicsEntity>();
  private movingEntities: PhysicsEntity[] = [];
  private sweepPositions = new Float64Array(0);
  private sweepCallback?: Box2D.JSRayCastCallback;
  private sweepEnd?: Box2D.b2Vec2;
  private sweepBody = 0;
  private sweepLayer = 1;
  private sweepHit?: SweepHit;
  private springs: PhysicsEntity[] = [];
  private sliders: PhysicsEntity[] = [];
  private rotators: PhysicsEntity[] = [];
  private boosters: PhysicsEntity[] = [];
  private launchers: Launcher[] = [];
  private launcherApproaches = new Float64Array(0);
  private breakables: PhysicsEntity[] = [];
  private broken = new Set<PhysicsEntity>();
  private breakableContacts = new Map<PhysicsEntity, Set<number>>();
  private motionTime = 0;
  private randomizeStart = false;
  private vortex: StageDef['vortex'];
  private windZones: WindZone[] = [];
  private winds: { wind: WindZone; pulse: number; blend: number; speed: number; radial: number }[] = [];
  private exitBridge: StageDef['exitBridge'];
  private bridgeBodies = new Set<Box2D.b2Body>();
  private windTime = 0;
  private collisionSubsteps = 4;
  private deleteCandidates: Box2D.b2Body[] = [];
  // Moving obstacle poses (x, angle) before the latest step, for drawing between steps.
  private previousPoses = new Float64Array(0);
  private previousCount = -1;
  private previousY = new Float64Array(0);

  async init() {
    if (this.world && !this.disposed) return;
    this.Box2D = await Box2DFactory();
    this.vector = new this.Box2D.b2Vec2(0, 10);
    this.world = new this.Box2D.b2World(this.vector);
    this.leaks = new this.Box2D.LeakMitigator();
    this.disposed = false;
  }
  dispose() {
    if (!this.world || this.disposed) return;
    this.clearMarbles();
    this.clear();
    if (this.sweepCallback) this.Box2D.destroy(this.sweepCallback);
    this.sweepCallback = undefined;
    this.Box2D.destroy(this.world);
    this.Box2D.destroy(this.vector);
    this.disposed = true;
  }
  private releaseWrappers() {
    // Borrowed Box2D objects belong to the world: only remove their JS cache entries.
    // Wait until both stage and marbles are gone so live body identities stay stable.
    if (this.world && !this.disposed && this.world.GetBodyCount() === 0) this.leaks.freeLeaked();
  }
  clear() {
    for (const launcher of this.launchers) launcher.loaded?.body.SetEnabled(true);
    this.launchers = [];
    this.vortex = undefined;
    this.windZones = [];
    this.winds = [];
    this.exitBridge = undefined;
    this.bridgeBodies.clear();
    for (const entity of this.entities) this.world.DestroyBody(entity.body);
    for (const body of this.deleteCandidates) this.world.DestroyBody(body);
    this.entities = [];
    this.entityBodies.clear();
    this.movingEntities = [];
    this.sweepHit = undefined;
    if (this.sweepEnd) this.Box2D.destroy(this.sweepEnd);
    this.sweepEnd = undefined;
    this.springs = [];
    this.sliders = [];
    this.rotators = [];
    this.boosters = [];
    this.breakables = [];
    this.broken.clear();
    this.breakableContacts.clear();
    this.deleteCandidates = [];
    this.previousCount = -1;
    this.releaseWrappers();
  }
  clearMarbles() {
    for (const launcher of this.launchers) launcher.loaded = undefined;
    for (const body of Object.values(this.marbleMap)) this.world.DestroyBody(body);
    this.marbleMap = {};
    this.marbleBodies = [];
    this.bridgeBodies.clear();
    this.releaseWrappers();
  }
  createStage(stage: StageDef) {
    this.motionTime = 0;
    this.vortex = stage.vortex;
    this.windZones = stage.windZones ?? [];
    this.winds = [...(this.vortex ? [{ type: 'vortex' as const, ...this.vortex }] : []), ...this.windZones].map(
      (wind) => ({ wind, pulse: 0, blend: 0, speed: 0, radial: 0 })
    );
    this.exitBridge = stage.exitBridge;
    this.windTime = 0;
    this.randomizeStart = stage.randomizeStart === true;
    this.collisionSubsteps = stage.entities?.some((e) => e.shape.type === 'polyline' && e.shape.backing) ? 16 : 4;
    this.createEntities(
      (stage.entities ?? []).map((entity) =>
        this.randomizeStart &&
        !entity.props.oscillation &&
        !entity.props.timedGate &&
        !entity.props.sliding &&
        !(entity.shape.type === 'box' && entity.shape.spring) &&
        entity.position.y < 28 &&
        entity.type === 'kinematic' &&
        entity.shape.type === 'box'
          ? { ...entity, shape: { ...entity.shape, rotation: entity.shape.rotation + Math.random() * Math.PI * 2 } }
          : entity
      )
    );
  }
  createEntities(entities: MapEntity[]) {
    const B = this.Box2D;
    const newChutes: Launcher[] = [];
    for (const entity of entities) {
      const def = new B.b2BodyDef();
      def.set_type(entity.type === 'kinematic' ? B.b2_kinematicBody : B.b2_staticBody);
      this.vector.Set(entity.position.x, entity.position.y);
      def.set_position(this.vector);
      const body = this.leaks.recordLeak(this.world.CreateBody(def));
      B.destroy(def);
      const fixture = new B.b2FixtureDef();
      fixture.set_density(entity.props.density);
      fixture.set_restitution(entity.props.restitution);
      const s = entity.shape;
      const filter = fixture.get_filter();
      filter.set_categoryBits(s.collisionLayer ?? 1);
      filter.set_maskBits(s.collisionLayer ?? 1);
      fixture.set_filter(filter);
      fixture.set_isSensor(s.sensor === true || (s.type === 'box' && s.boostSpeed !== undefined));
      if (s.type === 'box') {
        const shape = new B.b2PolygonShape();
        this.vector.Set(0, 0);
        shape.SetAsBox(s.width, s.height, this.vector, s.rotation);
        fixture.set_shape(shape);
        this.leaks.recordLeak(body.CreateFixture(fixture));
        B.destroy(shape);
      } else if (s.type === 'circle') {
        const shape = new B.b2CircleShape();
        shape.set_m_radius(s.radius);
        fixture.set_shape(shape);
        this.leaks.recordLeak(body.CreateFixture(fixture));
        B.destroy(shape);
        if (s.launcher === 'chute') {
          const rail = new B.b2PolygonShape();
          const length = (BARREL_LENGTH + BARREL_RAILS.end) / 2;
          const along = BARREL_RAILS.end - length;
          const offset = (BARREL_RAILS.inner + BARREL_RAILS.outer) / 2;
          fixture.set_isSensor(false);
          for (const side of [-1, 1]) {
            const across = side * offset;
            this.vector.Set(
              along * Math.cos(BARREL_TILT) - across * Math.sin(BARREL_TILT),
              along * Math.sin(BARREL_TILT) + across * Math.cos(BARREL_TILT)
            );
            rail.SetAsBox(length, (BARREL_RAILS.outer - BARREL_RAILS.inner) / 2, this.vector, BARREL_TILT);
            fixture.set_shape(rail);
            this.leaks.recordLeak(body.CreateFixture(fixture));
          }
          B.destroy(rail);
        }
      } else if (s.solid) {
        const shape = new B.b2PolygonShape();
        const points = s.points.slice(0, -1);
        const pointer = B._malloc(points.length * 8);
        for (let i = 0; i < points.length; i++) {
          B.HEAPF32[(pointer >> 2) + i * 2] = points[i][0];
          B.HEAPF32[(pointer >> 2) + i * 2 + 1] = points[i][1];
        }
        shape.Set(pointer, points.length);
        B._free(pointer);
        fixture.set_shape(shape);
        this.leaks.recordLeak(body.CreateFixture(fixture));
        B.destroy(shape);
      } else {
        const shape = new B.b2EdgeShape(),
          endpoint = new B.b2Vec2(0, 0);
        for (let i = 1; i < s.points.length; i++) {
          const a = s.points[i - 1],
            b = s.points[i];
          if (a[0] === b[0] && a[1] === b[1]) continue;
          this.vector.Set(a[0], a[1]);
          endpoint.Set(b[0], b[1]);
          shape.SetTwoSided(this.vector, endpoint);
          fixture.set_shape(shape);
          this.leaks.recordLeak(body.CreateFixture(fixture));
          if (s.backing) {
            // Solid backing prevents paddles from squeezing a marble through a zero-width edge.
            const dx = b[0] - a[0],
              dy = b[1] - a[1],
              length = Math.hypot(dx, dy);
            const nx = (dy / length) * s.backing,
              ny = (-dx / length) * s.backing;
            const polygon = new B.b2PolygonShape();
            const pointer = B._malloc(32);
            const vertices = [a, b, [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]];
            vertices.forEach((point, j) => {
              B.HEAPF32[(pointer >> 2) + j * 2] = point[0];
              B.HEAPF32[(pointer >> 2) + j * 2 + 1] = point[1];
            });
            polygon.Set(pointer, 4);
            B._free(pointer);
            fixture.set_shape(polygon);
            this.leaks.recordLeak(body.CreateFixture(fixture));
            B.destroy(polygon);
          }
        }
        B.destroy(shape);
        B.destroy(endpoint);
      }
      B.destroy(fixture);
      B.LeakMitigator.freeFromCache(filter);
      if (entity.props.sliding) {
        const slide = entity.props.sliding,
          offset = slide.amplitude * Math.sin(slide.phase),
          direction = slide.direction ?? 0;
        this.vector.Set(
          entity.position.x + Math.cos(direction) * offset,
          entity.position.y + Math.sin(direction) * offset
        );
        body.SetTransform(this.vector, 0);
      }
      if (entity.props.timedGate) {
        this.vector.Set(entity.position.x, entity.position.y);
        body.SetTransform(this.vector, timedGateAngle(entity.props.timedGate, 0));
      }
      body.SetAngularVelocity(entity.props.angularVelocity);
      const state: PhysicsEntity = {
        body,
        moving: entity.type === 'kinematic',
        sliding: entity.props.sliding,
        oscillation: entity.props.oscillation,
        timedGate: entity.props.timedGate,
        spinCycle: entity.props.spinCycle,
        spin: entity.props.angularVelocity,
        x: entity.position.x,
        y: entity.position.y,
        angle: 0,
        shape: s,
        life: entity.props.life ?? -1,
      };
      this.entities.push(state);
      this.entityBodies.set(B.getPointer(body), state);
      if (state.moving) {
        state.sweepRadius =
          s.type === 'box'
            ? Math.hypot(s.width, s.height)
            : s.type === 'circle'
              ? s.launcher === 'chute'
                ? BARREL_LENGTH + BARREL_RAILS.outer
                : s.radius
              : Math.max(...s.points.map(([x, y]) => Math.hypot(x, y))) + Math.abs(s.backing ?? 0);
        this.movingEntities.push(state);
      }
      if (state.moving) this.leaks.recordLeak(body.GetPosition());
      if (s.type === 'box' && s.spring) this.springs.push(state);
      if (s.type === 'circle' && s.launcher) {
        const launcher = { entity: state };
        this.launchers.push(launcher);
        if (s.launcher === 'chute') newChutes.push(launcher);
      }
      if (state.sliding) this.sliders.push(state);
      if (state.oscillation || state.timedGate || state.spinCycle) this.rotators.push(state);
      if (s.type === 'box' && s.boostSpeed !== undefined) this.boosters.push(state);
      if (state.life > 0) this.breakables.push(state);
    }
    for (const launcher of newChutes) {
      const { x, y, shape } = launcher.entity;
      const gateDefinition = launcherGate(x, y);
      if (shape.collisionLayer) gateDefinition.shape.collisionLayer = shape.collisionLayer;
      const index = this.entities.length;
      this.createEntities([gateDefinition, launcherPiston(x, y)]);
      const gate = this.entities[index],
        piston = this.entities[index + 1];
      this.vector.Set(gate.x, gate.y);
      gate.body.SetTransform(this.vector, LAUNCHER_GATE_OPEN_ANGLE);
      gate.body.SetEnabled(false);
      piston.launcherPiston = true;
      piston.body.SetEnabled(false);
      launcher.gate = gate;
      launcher.piston = piston;
    }
  }
  createMarble(id: number, x: number, y: number) {
    const B = this.Box2D,
      shape = new B.b2CircleShape();
    shape.set_m_radius(MARBLE_RADIUS);
    const def = new B.b2BodyDef();
    def.set_type(B.b2_dynamicBody);
    this.vector.Set(x, y);
    def.set_position(this.vector);
    const body = this.leaks.recordLeak(this.world.CreateBody(def));
    const fixture = this.leaks.recordLeak(body.CreateFixture(shape, 1));
    const filter = this.leaks.recordLeak(fixture.GetFilterData());
    this.leaks.recordLeak(body.GetPosition());
    this.leaks.recordLeak(body.GetLinearVelocity());
    filter.set_maskBits(1);
    fixture.SetFilterData(filter);
    body.SetBullet(true);
    body.SetAwake(false);
    body.SetEnabled(false);
    this.marbleMap[id] = body;
    this.marbleBodies.push(body);
    B.destroy(shape);
    B.destroy(def);
  }
  shakeMarble(id: number) {
    const body = this.marbleMap[id];
    if (body) {
      this.vector.Set(Math.random() * 2 - 1, -0.5 - Math.random());
      body.ApplyLinearImpulseToCenter(this.vector, true);
    }
  }
  removeMarble(id: number) {
    const body = this.marbleMap[id];
    if (body) {
      for (const launcher of this.launchers) {
        if (launcher.loaded?.body === body) launcher.loaded = undefined;
      }
      this.world.DestroyBody(body);
      this.bridgeBodies.delete(body);
      delete this.marbleMap[id];
      this.marbleBodies.splice(this.marbleBodies.indexOf(body), 1);
      this.releaseWrappers();
    }
  }
  getMarblePosition(id: number) {
    const body = this.marbleMap[id];
    if (!body) return { x: 0, y: 0, angle: 0 };
    const p = body.GetPosition();
    return { x: p.x, y: p.y, angle: body.GetAngle() };
  }
  getMarbleSpeed(id: number) {
    const body = this.marbleMap[id];
    if (!body) return 0;
    const v = body.GetLinearVelocity();
    return Math.hypot(v.x, v.y);
  }
  getMarbleVelocity(id: number) {
    const v = this.marbleMap[id].GetLinearVelocity();
    return { vx: v.x, vy: v.y };
  }
  setMarbleVelocity(id: number, vx: number, vy: number) {
    const body = this.marbleMap[id];
    this.vector.Set(vx, vy);
    body.SetLinearVelocity(this.vector);
    body.SetAwake(true);
  }
  placeMarble(id: number, x: number, y: number) {
    const body = this.marbleMap[id];
    if (!body) return;
    this.vector.Set(x, y);
    body.SetTransform(this.vector, body.GetAngle());
    this.vector.Set(0, 0);
    body.SetLinearVelocity(this.vector);
    body.SetAwake(true);
  }
  isMarbleOnBridge(id: number) {
    return this.bridgeBodies.has(this.marbleMap[id]);
  }
  getEntities(blend = 1): MapEntityState[] {
    // A breakable obstacle removed in the last step shifts indices; draw that frame unblended.
    const previous = blend < 1 && this.previousCount === this.entities.length ? this.previousPoses : undefined;
    return this.entities.map((e, i) => {
      const spring = e.shape.type === 'box' && e.shape.spring;
      const position = e.sliding || spring || e.launcherPiston ? e.body.GetPosition() : undefined;
      let x = position ? position.x : e.x,
        y = position ? position.y : e.y,
        angle = e.moving ? e.body.GetAngle() : 0;
      if (previous && e.moving) {
        x = previous[i * 2] + (x - previous[i * 2]) * blend;
        y = this.previousY[i] + (y - this.previousY[i]) * blend;
        angle = previous[i * 2 + 1] + (angle - previous[i * 2 + 1]) * blend;
      }
      return { x, y, angle, shape: e.shape, life: e.life };
    });
  }
  private recordPoses() {
    if (this.previousPoses.length < this.entities.length * 2)
      this.previousPoses = new Float64Array(this.entities.length * 2);
    if (this.previousY.length < this.entities.length) this.previousY = new Float64Array(this.entities.length);
    this.entities.forEach((e, i) => {
      if (!e.moving) return;
      const position =
        e.sliding || e.launcherPiston || (e.shape.type === 'box' && e.shape.spring) ? e.body.GetPosition() : undefined;
      this.previousY[i] = position ? position.y : e.y;
      this.previousPoses[i * 2] = position ? position.x : e.x;
      this.previousPoses[i * 2 + 1] = e.body.GetAngle();
    });
    this.previousCount = this.entities.length;
  }
  private recordSweep() {
    if (this.sweepPositions.length < this.marbleBodies.length * 2)
      this.sweepPositions = new Float64Array(this.marbleBodies.length * 2);
    this.marbleBodies.forEach((body, i) => {
      const p = body.GetPosition();
      this.sweepPositions[i * 2] = p.x;
      this.sweepPositions[i * 2 + 1] = p.y;
    });
    for (const entity of this.movingEntities) {
      const p = entity.body.GetPosition();
      entity.sweepPose ??= { x: 0, y: 0, cos: 1, sin: 0, nextX: 0, nextY: 0, nextCos: 1, nextSin: 0 };
      const pose = entity.sweepPose,
        angle = entity.body.GetAngle();
      pose.x = p.x;
      pose.y = p.y;
      pose.cos = Math.cos(angle);
      pose.sin = Math.sin(angle);
    }
  }
  private castMapRay(x: number, y: number, end: Box2D.b2Vec2, body: number, layer: number): SweepHit | undefined {
    const B = this.Box2D;
    if (!this.sweepCallback) {
      this.sweepCallback = new B.JSRayCastCallback();
      this.sweepCallback.ReportFixture = (fixture, _point, normal, fraction) => {
        const f = typeof fixture === 'number' ? B.wrapPointer(fixture, B.b2Fixture) : fixture;
        const pointer = B.getPointer(f.GetBody()),
          entity = this.entityBodies.get(pointer);
        if (
          !entity ||
          (this.sweepBody ? pointer !== this.sweepBody : entity.moving) ||
          (entity.shape.collisionLayer ?? 1) !== this.sweepLayer ||
          f.IsSensor()
        )
          return -1;
        const n = typeof normal === 'number' ? B.wrapPointer(normal, B.b2Vec2) : normal;
        this.sweepHit = { entity, fraction, nx: n.x, ny: n.y };
        // Ray normals are borrowed from the callback's native stack.
        B.LeakMitigator.freeFromCache(n);
        return fraction;
      };
    }
    this.sweepHit = undefined;
    this.sweepBody = body;
    this.sweepLayer = layer;
    this.vector.Set(x, y);
    this.world.RayCast(this.sweepCallback, this.vector, end);
    return this.sweepHit;
  }
  private recoveryClear(oldX: number, oldY: number, x: number, y: number, layer: number) {
    this.sweepEnd ??= new this.Box2D.b2Vec2(0, 0);
    this.sweepEnd.Set(x, y);
    if (Math.abs(x - oldX) + Math.abs(y - oldY) > 1e-8 && this.castMapRay(oldX, oldY, this.sweepEnd, 0, layer))
      return false;
    for (const entity of this.movingEntities) {
      const pose = entity.sweepPose!,
        dx = oldX - pose.x,
        dy = oldY - pose.y,
        lx = dx * pose.cos + dy * pose.sin,
        ly = -dx * pose.sin + dy * pose.cos,
        fromX = pose.nextX + pose.nextCos * lx - pose.nextSin * ly,
        fromY = pose.nextY + pose.nextSin * lx + pose.nextCos * ly,
        mx = x - fromX,
        my = y - fromY,
        length2 = mx * mx + my * my;
      if (length2 < 1e-16) continue;
      const t = Math.max(0, Math.min(1, ((pose.nextX - fromX) * mx + (pose.nextY - fromY) * my) / length2));
      if (Math.hypot(fromX + mx * t - pose.nextX, fromY + my * t - pose.nextY) > entity.sweepRadius!) continue;
      if (this.castMapRay(fromX, fromY, this.sweepEnd, this.Box2D.getPointer(entity.body), layer)) return false;
    }
    return true;
  }
  private guardMapCrossings() {
    for (const entity of this.movingEntities) {
      const p = entity.body.GetPosition(),
        pose = entity.sweepPose!;
      pose.nextX = p.x;
      pose.nextY = p.y;
      const angle = entity.body.GetAngle();
      pose.nextCos = Math.cos(angle);
      pose.nextSin = Math.sin(angle);
    }
    this.marbleBodies.forEach((body, i) => {
      const p = body.GetPosition(),
        x = p.x,
        y = p.y,
        oldX = this.sweepPositions[i * 2],
        oldY = this.sweepPositions[i * 2 + 1],
        layer = this.bridgeBodies.has(body) ? 2 : 1;
      let hit: SweepHit | undefined,
        safeX = oldX,
        safeY = oldY;
      if (Math.abs(x - oldX) + Math.abs(y - oldY) > 1e-8) {
        hit = this.castMapRay(oldX, oldY, p, 0, layer);
        if (hit) {
          safeX = oldX + (x - oldX) * hit.fraction + hit.nx * SWEEP_CLEARANCE;
          safeY = oldY + (y - oldY) * hit.fraction + hit.ny * SWEEP_CLEARANCE;
        }
      }
      for (const entity of this.movingEntities) {
        const previous = entity.sweepPose!,
          dx = oldX - previous.x,
          dy = oldY - previous.y,
          lx = dx * previous.cos + dy * previous.sin,
          ly = -dx * previous.sin + dy * previous.cos,
          fromX = previous.nextX + previous.nextCos * lx - previous.nextSin * ly,
          fromY = previous.nextY + previous.nextSin * lx + previous.nextCos * ly,
          moveX = x - fromX,
          moveY = y - fromY,
          length2 = moveX * moveX + moveY * moveY;
        if (length2 < 1e-16) continue;
        const t = Math.max(
          0,
          Math.min(1, ((previous.nextX - fromX) * moveX + (previous.nextY - fromY) * moveY) / length2)
        );
        const closestX = fromX + moveX * t - previous.nextX,
          closestY = fromY + moveY * t - previous.nextY;
        if (closestX * closestX + closestY * closestY > entity.sweepRadius! * entity.sweepRadius!) continue;
        if (Math.abs(x - fromX) + Math.abs(y - fromY) > 1e-8) {
          const candidate = this.castMapRay(fromX, fromY, p, this.Box2D.getPointer(entity.body), layer);
          if (candidate && (!hit || candidate.fraction < hit.fraction)) {
            hit = candidate;
            safeX = fromX;
            safeY = fromY;
          }
        }
      }
      if (!hit) return;
      // Carrying a point with a moving obstacle must not take it through a fixed wall.
      if (hit.entity.moving && Math.abs(safeX - oldX) + Math.abs(safeY - oldY) > 1e-8) {
        this.sweepEnd ??= new this.Box2D.b2Vec2(0, 0);
        this.sweepEnd.Set(safeX, safeY);
        const fixed = this.castMapRay(oldX, oldY, this.sweepEnd, 0, layer);
        if (fixed) {
          hit = fixed;
          safeX = oldX + (safeX - oldX) * fixed.fraction + fixed.nx * SWEEP_CLEARANCE;
          safeY = oldY + (safeY - oldY) * fixed.fraction + fixed.ny * SWEEP_CLEARANCE;
        }
      }
      // Recovery must not cross a different obstacle. Keep the old point when
      // possible, otherwise use a clear path within one marble diameter.
      if (!this.recoveryClear(oldX, oldY, safeX, safeY, layer)) {
        let found = this.recoveryClear(oldX, oldY, oldX, oldY, layer);
        if (found) {
          safeX = oldX;
          safeY = oldY;
        }
        for (const distance of [0.01, 0.025, 0.05, 0.1, 0.2, 0.35, 0.5]) {
          if (found) break;
          for (const [dx, dy] of RECOVERY_DIRECTIONS) {
            const candidateX = oldX + dx * distance,
              candidateY = oldY + dy * distance;
            if (!this.recoveryClear(oldX, oldY, candidateX, candidateY, layer)) continue;
            safeX = candidateX;
            safeY = candidateY;
            found = true;
            break;
          }
        }
      }
      // Restore the last safe side; a moving surface carries that point with it.
      this.vector.Set(safeX, safeY);
      body.SetTransform(this.vector, body.GetAngle());
      const velocity = body.GetLinearVelocity(),
        surface = this.leaks.recordLeak(hit.entity.body.GetLinearVelocityFromWorldPoint(this.vector)),
        inward = Math.min(0, (velocity.x - surface.x) * hit.nx + (velocity.y - surface.y) * hit.ny);
      this.vector.Set(velocity.x - inward * hit.nx, velocity.y - inward * hit.ny);
      body.SetLinearVelocity(this.vector);
    });
  }
  isSpringBusy(index: number) {
    const e = this.entities[index];
    const duration = e?.shape.type === 'box' && e.shape.spring?.personal ? PERSONAL_SPRING_DURATION : 1;
    return !!e && e.springAt !== undefined && this.motionTime - e.springAt < duration;
  }
  removeSpring(shape: EntityBoxShape) {
    const spring = this.springs.find((entity) => entity.shape === shape);
    if (!spring) return;
    this.entityBodies.delete(this.Box2D.getPointer(spring.body));
    this.world.DestroyBody(spring.body);
    this.entities = this.entities.filter((entity) => entity !== spring);
    this.movingEntities = this.movingEntities.filter((entity) => entity !== spring);
    this.springs = this.springs.filter((entity) => entity !== spring);
    this.previousCount = -1;
  }
  activateSpring(index: number) {
    const e = this.entities[index];
    if (!e || e.shape.type !== 'box' || !e.shape.spring || this.isSpringBusy(index)) return false;
    e.springAt = this.motionTime;
    return true;
  }
  start() {
    for (const body of Object.values(this.marbleMap)) {
      if (this.randomizeStart) {
        this.vector.Set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2);
        body.SetLinearVelocity(this.vector);
      }
      body.SetEnabled(true);
      body.SetAwake(true);
    }
  }
  private recordLauncherApproaches() {
    const bodies = this.marbleBodies;
    if (this.launcherApproaches.length < bodies.length * 2)
      this.launcherApproaches = new Float64Array(bodies.length * 2);
    for (let i = 0; i < bodies.length; i++) {
      const pos = bodies[i].GetPosition();
      this.launcherApproaches[i * 2] = pos.x;
      this.launcherApproaches[i * 2 + 1] = pos.y;
    }
  }
  private findChuteMarble(e: PhysicsEntity) {
    const mouthY = e.y + LAUNCHER_ENTRY_Y;
    const elevated = e.shape.collisionLayer === 2;
    let first: Box2D.b2Body | undefined;
    let earliest = Infinity;
    for (let i = 0; i < this.marbleBodies.length; i++) {
      const beforeY = this.launcherApproaches[i * 2 + 1];
      if (beforeY >= mouthY || beforeY < mouthY - 4) continue;
      const body = this.marbleBodies[i];
      const pos = body.GetPosition();
      if (
        pos.y < mouthY ||
        Math.abs(pos.x - e.x) > 0.85 ||
        !body.IsEnabled() ||
        this.bridgeBodies.has(body) !== elevated
      )
        continue;
      const fraction = (mouthY - beforeY) / (pos.y - beforeY);
      const beforeX = this.launcherApproaches[i * 2];
      const crossingX = beforeX + (pos.x - beforeX) * fraction;
      if (Math.abs(crossingX - e.x) <= LAUNCHER_ENTRY_HALF_WIDTH && fraction < earliest) {
        earliest = fraction;
        first = body;
      }
    }
    return first;
  }
  private moveLauncherGates(dt: number) {
    for (const { entity, gate, loaded } of this.launchers) {
      if (!gate) continue;
      if (loaded && gate.body.IsEnabled()) continue;
      if (gate.body.IsEnabled()) gate.body.SetEnabled(false);
      const angle = gate.body.GetAngle();
      const target = loaded ? 0 : LAUNCHER_GATE_OPEN_ANGLE;
      if (angle !== Math.fround(target)) {
        this.vector.Set(gate.x, gate.y);
        gate.body.SetTransform(this.vector, angle + Math.max(-24 * dt, Math.min(24 * dt, target - angle)));
      }
      // Only close the solid stop when clear; swinging a solid arm can squeeze a marble against a rail.
      if (loaded && gate.body.GetAngle() === 0) {
        const occupied = this.marbleBodies.some((body) => {
          const pos = body.GetPosition();
          return (
            Math.abs(pos.y - gate.y) < 0.34 &&
            Math.abs(pos.x - entity.x) < LAUNCHER_GATE_HALF_WIDTH + 0.26 &&
            this.bridgeBodies.has(body) === (entity.shape.collisionLayer === 2) &&
            body.IsEnabled()
          );
        });
        if (!occupied) gate.body.SetEnabled(true);
      }
    }
  }
  private separateLauncherMarbles(
    held: Box2D.b2Body,
    x: number,
    y: number,
    barrel: PhysicsEntity,
    gate: PhysicsEntity
  ) {
    // The piston carries a disabled marble, so Box2D cannot separate it from the queue.
    const elevated = this.bridgeBodies.has(held);
    const diameter = 2 * MARBLE_RADIUS;
    const layer = elevated ? 2 : 1;
    for (const body of this.marbleBodies) {
      if (body === held) continue;
      const pos = body.GetPosition();
      const dx = pos.x - x,
        dy = pos.y - y;
      if (dx * dx + dy * dy >= diameter * diameter || !body.IsEnabled() || this.bridgeBodies.has(body) !== elevated)
        continue;
      const angle = dx || dy ? Math.atan2(dy, dx) : -Math.PI / 2;
      this.sweepEnd ??= new this.Box2D.b2Vec2(0, 0);
      // Start with the shortest separation. A rail can require sliding around the carried marble.
      for (const offset of [0, -0.35, 0.35, -0.7, 0.7, -1.05, 1.05]) {
        const nx = Math.cos(angle + offset),
          ny = Math.sin(angle + offset);
        this.sweepEnd.Set(x + nx * diameter, y + ny * diameter);
        if (
          this.castMapRay(pos.x, pos.y, this.sweepEnd, 0, layer) ||
          this.castMapRay(pos.x, pos.y, this.sweepEnd, this.Box2D.getPointer(barrel.body), layer) ||
          this.castMapRay(pos.x, pos.y, this.sweepEnd, this.Box2D.getPointer(gate.body), layer)
        )
          continue;
        body.SetTransform(this.sweepEnd, body.GetAngle());
        const v = body.GetLinearVelocity(),
          inward = Math.min(0, v.x * nx + v.y * ny);
        this.vector.Set(v.x - inward * nx, v.y - inward * ny);
        body.SetLinearVelocity(this.vector);
        break;
      }
    }
  }
  private stepLaunchers(dt: number) {
    for (const launcher of this.launchers) {
      const e = launcher.entity;
      if (!launcher.loaded && launcher.gate) {
        const body = this.findChuteMarble(e);
        if (body) {
          const pos = body.GetPosition();
          launcher.loaded = { body, at: this.motionTime, x: pos.x, y: pos.y };
          body.SetEnabled(false);
        }
      } else if (!launcher.loaded) {
        let edge = this.leaks.recordLeak(e.body.GetContactList());
        while (this.Box2D.getPointer(edge)) {
          const body = edge.other;
          if (body.GetType() === this.Box2D.b2_dynamicBody && this.leaks.recordLeak(edge.contact).IsTouching()) {
            const pos = body.GetPosition();
            launcher.loaded = { body, at: this.motionTime, x: pos.x, y: pos.y };
            body.SetEnabled(false);
            break;
          }
          edge = this.leaks.recordLeak(edge.next);
        }
      }
      const ball = launcher.loaded;
      const age = ball ? this.motionTime - ball.at : 0;
      const angle = BARREL_TILT + e.body.GetAngle();
      const travel = Math.max(0, (age - (launcher.gate ? 0.195 : 0.32)) * LAUNCH_SPEED);
      const distance = Math.min(BARREL_LENGTH, travel);
      if (launcher.piston) {
        launcher.pistonTravel = ball ? distance : Math.max(0, (launcher.pistonTravel ?? 0) - dt * LAUNCH_SPEED * 2);
        const along = LAUNCHER_PISTON_REST - launcher.pistonTravel;
        this.vector.Set(e.x + Math.cos(angle) * along, e.y + Math.sin(angle) * along);
        launcher.piston.body.SetTransform(this.vector, e.body.GetAngle());
      }
      if (!ball) continue;
      const intake = Math.min(1, age / (launcher.gate ? 0.15 : 0.18));
      const dx = -Math.cos(angle),
        dy = -Math.sin(angle);
      const x = ball.x + (e.x - ball.x) * intake + dx * distance,
        y = ball.y + (e.y - ball.y) * intake + dy * distance;
      if (launcher.gate) this.separateLauncherMarbles(ball.body, x, y, e, launcher.gate);
      this.vector.Set(x, y);
      ball.body.SetTransform(this.vector, ball.body.GetAngle());
      if (travel < BARREL_LENGTH) continue;
      ball.body.SetEnabled(true);
      this.vector.Set(dx * LAUNCH_SPEED, dy * LAUNCH_SPEED);
      ball.body.SetLinearVelocity(this.vector);
      ball.body.SetAwake(true);
      launcher.loaded = undefined;
    }
  }
  step(seconds: number, beforeSubstep?: (dt: number, offset: number) => void) {
    this.recordPoses();
    const bodies = this.marbleBodies;
    if (this.launchers.some(({ gate, loaded }) => gate && !loaded)) this.recordLauncherApproaches();
    if (this.winds.length) {
      this.windTime += seconds;
      for (const sample of this.winds) {
        const wind = sample.wind,
          pulse = windPower(wind, this.windTime);
        sample.pulse = pulse;
        sample.blend = 1 - Math.exp(-(wind.type === 'directional' ? (wind.strength ?? 2.4) : 2) * pulse * seconds);
        if (wind.type === 'vortex') {
          const phase = this.windTime * (wind.period ? (Math.PI * 2) / wind.period : 1.7) + (wind.phase ?? 0);
          const gust = wind.gust ?? 0;
          sample.speed = wind.speed * (1 + gust * Math.sin(phase)) * pulse;
          sample.radial =
            ((wind.radial ?? 2) - gust * (12 + 12 * Math.sin(this.windTime * 1.1 + (wind.phase ?? 0)))) * pulse;
        }
      }
      for (const body of bodies) {
        if (this.bridgeBodies.has(body)) continue;
        const p = body.GetPosition();
        let vx = 0,
          vy = 0,
          totalBlend = 0,
          gravityCompensation = 0;
        for (const { wind, pulse, blend: zoneBlend, speed, radial } of this.winds) {
          if (wind.type === 'directional') {
            if (Math.abs(p.x - wind.x) > wind.width / 2 || Math.abs(p.y - wind.y) > wind.height / 2) continue;
            const turbulence = wind.turbulence ?? 0;
            const wobble = turbulence * Math.sin(this.windTime * 3.1 + p.x * 1.7 + p.y * 0.37);
            vx += (wind.velocityX * pulse + wobble) * zoneBlend;
            vy += (wind.velocityY * pulse + turbulence * 0.35 * Math.cos(this.windTime * 2.3 + p.x)) * zoneBlend;
            totalBlend += zoneBlend;
            gravityCompensation += zoneBlend * pulse;
          } else {
            const dx = p.x - wind.x,
              dy = p.y - wind.y,
              distance = Math.hypot(dx, dy);
            if (distance < Math.max(0.1, wind.innerRadius ?? 0) || distance >= wind.radius) continue;
            vx += ((-dy / distance) * speed + (dx / distance) * radial) * zoneBlend;
            vy += ((dx / distance) * speed + (dy / distance) * radial) * zoneBlend;
            totalBlend += zoneBlend;
            gravityCompensation += zoneBlend * pulse;
          }
        }
        if (!totalBlend) continue;
        const blend = Math.min(0.45, totalBlend);
        vx /= totalBlend;
        vy /= totalBlend;
        const v = body.GetLinearVelocity();
        this.vector.Set(
          v.x + (vx - v.x) * blend,
          v.y + (vy - v.y) * blend - 10 * seconds * Math.min(1, gravityCompensation / totalBlend)
        );
        body.SetLinearVelocity(this.vector);
      }
    }
    for (const body of this.deleteCandidates) this.world.DestroyBody(body);
    this.deleteCandidates.length = 0;
    // Smaller angular increments keep rotating paddles from pushing marbles through thin walls.
    for (let i = 0; i < this.collisionSubsteps; i++) {
      const dt = seconds / this.collisionSubsteps;
      this.motionTime += dt;
      if (this.launchers.length) this.moveLauncherGates(dt);
      for (const e of this.springs)
        if (e.shape.type === 'box' && e.shape.spring) {
          const spring = e.shape.spring;
          const t = e.springAt === undefined ? 1 : Math.min(1, this.motionTime - e.springAt);
          // Move both stroke profiles through Box2D so marbles receive the impact.
          const fraction = spring.personal
            ? personalSpringExtension(t)
            : t < 0.12
              ? Math.sin(((t / 0.12) * Math.PI) / 2)
              : ((1 - t) / 0.88) ** 2;
          const p = e.body.GetPosition(),
            amount = spring.distance * fraction;
          this.vector.Set(
            (e.x + Math.cos(spring.direction) * amount - p.x) / dt,
            (e.y + Math.sin(spring.direction) * amount - p.y) / dt
          );
          e.body.SetLinearVelocity(this.vector);
        }
      for (const e of this.sliders)
        if (e.sliding) {
          const offset =
            e.sliding.amplitude * Math.sin((this.motionTime * Math.PI * 2) / e.sliding.period + e.sliding.phase);
          const direction = e.sliding.direction ?? 0,
            p = e.body.GetPosition();
          this.vector.Set(
            (e.x + Math.cos(direction) * offset - p.x) / dt,
            (e.y + Math.sin(direction) * offset - p.y) / dt
          );
          e.body.SetLinearVelocity(this.vector);
        }
      for (const e of this.rotators)
        if (e.oscillation || e.timedGate) {
          const target = e.timedGate
            ? timedGateAngle(e.timedGate, this.motionTime)
            : e.oscillation!.amplitude * Math.sin((this.motionTime * Math.PI * 2) / e.oscillation!.period);
          // Move through the solver, rather than teleporting a paddle across marbles.
          e.body.SetAngularVelocity((target - e.body.GetAngle()) / dt);
        } else if (e.spinCycle) {
          e.body.SetAngularVelocity(
            e.spinCycle.idleSpeed + (e.spin - e.spinCycle.idleSpeed) * rotorPower(e.spinCycle, this.motionTime)
          );
        }
      beforeSubstep?.(dt, i * dt);
      // Check the short solver path: a full-frame chord can skip a thin wall under pressure.
      const guard = !!beforeSubstep && this.entities.length > 0;
      if (guard) this.recordSweep();
      this.world.Step(dt, 8, this.collisionSubsteps === 4 ? 4 : 8);
      if (guard) this.guardMapCrossings();
      if (this.exitBridge) {
        for (const body of bodies) {
          const elevated = this.bridgeBodies.has(body);
          if (elevated && !this.exitBridge.transfers?.length) continue;
          const p = body.GetPosition();
          let crossing = !elevated && inBridgeArea(p.x, p.y, this.exitBridge.entry);
          for (const transfer of this.exitBridge.transfers ?? []) {
            if (inBridgeArea(p.x, p.y, elevated ? transfer.exit : transfer.entry)) {
              crossing = true;
              break;
            }
          }
          if (!crossing) continue;
          const layer = elevated ? 1 : 2;
          const fixture = body.GetFixtureList(),
            filter = fixture.GetFilterData();
          filter.set_categoryBits(layer);
          filter.set_maskBits(layer);
          fixture.SetFilterData(filter);
          if (elevated) this.bridgeBodies.delete(body);
          else this.bridgeBodies.add(body);
        }
      }
      for (const e of this.boosters)
        if (e.shape.type === 'box' && e.shape.boostSpeed !== undefined) {
          const dx = Math.cos(e.shape.rotation),
            dy = Math.sin(e.shape.rotation);
          let edge = this.leaks.recordLeak(e.body.GetContactList());
          while (this.Box2D.getPointer(edge)) {
            if (
              this.leaks.recordLeak(edge.contact).IsTouching() &&
              edge.other.GetType() === this.Box2D.b2_dynamicBody
            ) {
              const body = edge.other,
                v = body.GetLinearVelocity();
              // Only add speed along the arrow; preserve momentum after leaving the pad.
              const gain = Math.max(0, e.shape.boostSpeed - (v.x * dx + v.y * dy)) * (1 - Math.exp(-18 * dt));
              this.vector.Set(v.x + dx * gain, v.y + dy * gain);
              body.SetLinearVelocity(this.vector);
            }
            edge = this.leaks.recordLeak(edge.next);
          }
        }
      // A brief bounce can end before the last substep; count each new marble contact once.
      for (const e of this.breakables) {
        if (this.broken.has(e)) continue;
        const previous = this.breakableContacts.get(e),
          touching = new Set<number>();
        let edge = this.leaks.recordLeak(e.body.GetContactList());
        while (this.Box2D.getPointer(edge)) {
          if (edge.other.GetType() === this.Box2D.b2_dynamicBody && this.leaks.recordLeak(edge.contact).IsTouching()) {
            const pointer = this.Box2D.getPointer(edge.other);
            if (!touching.has(pointer)) {
              touching.add(pointer);
              if (!previous?.has(pointer) && --e.life <= 0) {
                this.broken.add(e);
                break;
              }
            }
          }
          edge = this.leaks.recordLeak(edge.next);
        }
        this.breakableContacts.set(e, touching);
      }
    }
    if (this.launchers.length) this.stepLaunchers(seconds);
    if (this.broken.size) {
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i];
        if (!this.broken.has(e)) continue;
        this.entityBodies.delete(this.Box2D.getPointer(e.body));
        this.deleteCandidates.push(e.body);
        this.entities.splice(i, 1);
      }
      this.springs = this.springs.filter((e) => !this.broken.has(e));
      this.movingEntities = this.movingEntities.filter((e) => !this.broken.has(e));
      this.sliders = this.sliders.filter((e) => !this.broken.has(e));
      this.rotators = this.rotators.filter((e) => !this.broken.has(e));
      this.boosters = this.boosters.filter((e) => !this.broken.has(e));
      this.breakables = this.breakables.filter((e) => !this.broken.has(e));
      for (const e of this.broken) this.breakableContacts.delete(e);
      this.broken.clear();
    }
  }
}
