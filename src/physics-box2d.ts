// Adapted from lazygyu/roulette (MIT). See LICENSE and THIRD_PARTY.md.
import Box2DFactory from 'box2d-wasm';
import type { StageDef, WindZone } from './data/maps';
import type { IPhysics } from './IPhysics';
import type { MapEntity, MapEntityState } from './types/MapEntity.type';

export class Box2dPhysics implements IPhysics {
  private Box2D!: typeof Box2D & EmscriptenModule;
  private world!: Box2D.b2World;
  private vector!: Box2D.b2Vec2;
  private marbleMap: Record<number, Box2D.b2Body> = {};
  private entities: ({ body: Box2D.b2Body } & MapEntityState)[] = [];
  private randomizeStart = false;
  private vortex: StageDef['vortex'];
  private windZones: WindZone[] = [];
  private windTime = 0;
  private collisionSubsteps = 4;
  private deleteCandidates: Box2D.b2Body[] = [];

  async init() {
    this.Box2D = await Box2DFactory();
    this.vector = new this.Box2D.b2Vec2(0, 10);
    this.world = new this.Box2D.b2World(this.vector);
  }
  clear() {
    this.vortex = undefined;
    this.windZones = [];
    for (const entity of this.entities) this.world.DestroyBody(entity.body);
    for (const body of this.deleteCandidates) this.world.DestroyBody(body);
    this.entities = [];
    this.deleteCandidates = [];
  }
  clearMarbles() {
    for (const body of Object.values(this.marbleMap)) this.world.DestroyBody(body);
    this.marbleMap = {};
  }
  createStage(stage: StageDef) {
    this.vortex = stage.vortex;
    this.windZones = stage.windZones ?? [];
    this.windTime = 0;
    this.randomizeStart = stage.randomizeStart === true;
    this.collisionSubsteps = stage.entities?.some((e) => e.shape.type === 'polyline' && e.shape.backing) ? 16 : 4;
    this.createEntities(
      (stage.entities ?? []).map((entity) =>
        this.randomizeStart && entity.position.y < 28 && entity.type === 'kinematic' && entity.shape.type === 'box'
          ? { ...entity, shape: { ...entity.shape, rotation: entity.shape.rotation + Math.random() * Math.PI * 2 } }
          : entity
      )
    );
  }
  createEntities(entities: MapEntity[]) {
    const B = this.Box2D;
    for (const entity of entities) {
      const def = new B.b2BodyDef();
      def.set_type(entity.type === 'kinematic' ? B.b2_kinematicBody : B.b2_staticBody);
      this.vector.Set(entity.position.x, entity.position.y);
      def.set_position(this.vector);
      const body = this.world.CreateBody(def);
      B.destroy(def);
      const fixture = new B.b2FixtureDef();
      fixture.set_density(entity.props.density);
      fixture.set_restitution(entity.props.restitution);
      const s = entity.shape;
      if (s.type === 'box') {
        const shape = new B.b2PolygonShape();
        this.vector.Set(0, 0);
        shape.SetAsBox(s.width, s.height, this.vector, s.rotation);
        fixture.set_shape(shape);
        body.CreateFixture(fixture);
        B.destroy(shape);
      } else if (s.type === 'circle') {
        const shape = new B.b2CircleShape();
        shape.set_m_radius(s.radius);
        fixture.set_shape(shape);
        body.CreateFixture(fixture);
        B.destroy(shape);
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
        body.CreateFixture(fixture);
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
          body.CreateFixture(fixture);
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
            body.CreateFixture(fixture);
            B.destroy(polygon);
          }
        }
        B.destroy(shape);
        B.destroy(endpoint);
      }
      B.destroy(fixture);
      body.SetAngularVelocity(entity.props.angularVelocity);
      this.entities.push({
        body,
        x: entity.position.x,
        y: entity.position.y,
        angle: 0,
        shape: s,
        life: entity.props.life ?? -1,
      });
    }
  }
  createMarble(id: number, x: number, y: number) {
    const B = this.Box2D,
      shape = new B.b2CircleShape();
    shape.set_m_radius(0.25);
    const def = new B.b2BodyDef();
    def.set_type(B.b2_dynamicBody);
    this.vector.Set(x, y);
    def.set_position(this.vector);
    const body = this.world.CreateBody(def);
    body.CreateFixture(shape, 1);
    body.SetBullet(true);
    body.SetAwake(false);
    body.SetEnabled(false);
    this.marbleMap[id] = body;
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
      this.world.DestroyBody(body);
      delete this.marbleMap[id];
    }
  }
  getMarblePosition(id: number) {
    const body = this.marbleMap[id];
    if (!body) return { x: 0, y: 0, angle: 0 };
    const p = body.GetPosition();
    return { x: p.x, y: p.y, angle: body.GetAngle() };
  }
  getEntities(): MapEntityState[] {
    return this.entities.map((e) => ({ x: e.x, y: e.y, angle: e.body.GetAngle(), shape: e.shape, life: e.life }));
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
  step(seconds: number) {
    const winds: WindZone[] = [
      ...(this.vortex ? [{ type: 'vortex' as const, ...this.vortex }] : []),
      ...this.windZones,
    ];
    if (winds.length) {
      this.windTime += seconds;
      for (const body of Object.values(this.marbleMap)) {
        const p = body.GetPosition();
        let vx = 0, vy = 0, totalBlend = 0, gravityCompensation = 0;
        for (const wind of winds) {
          const phase = this.windTime * (wind.period ? Math.PI * 2 / wind.period : 1.7) + (wind.phase ?? 0);
          const pulse = 1 - (wind.pulse ?? 0) * (0.5 - 0.5 * Math.sin(phase));
          if (wind.type === 'directional') {
            if (Math.abs(p.x - wind.x) > wind.width / 2 || Math.abs(p.y - wind.y) > wind.height / 2) continue;
            const turbulence = wind.turbulence ?? 0;
            const wobble = turbulence * Math.sin(this.windTime * 3.1 + p.x * 1.7 + p.y * 0.37);
            const zoneBlend = 1 - Math.exp(-(wind.strength ?? 2.4) * pulse * seconds);
            vx += (wind.velocityX * pulse + wobble) * zoneBlend;
            vy += (wind.velocityY * pulse + turbulence * 0.35 * Math.cos(this.windTime * 2.3 + p.x)) * zoneBlend;
            totalBlend += zoneBlend;
            gravityCompensation += zoneBlend * pulse;
          } else {
            const dx = p.x - wind.x, dy = p.y - wind.y, distance = Math.hypot(dx, dy);
            if (distance < 0.1 || distance >= wind.radius) continue;
            const gust = wind.gust ?? 0;
            const speed = wind.speed * (1 + gust * Math.sin(phase)) * pulse;
            const radial = ((wind.radial ?? 2) - gust * (12 + 12 * Math.sin(this.windTime * 1.1 + (wind.phase ?? 0)))) * pulse;
            const zoneBlend = 1 - Math.exp(-2 * pulse * seconds);
            vx += (-dy / distance * speed + dx / distance * radial) * zoneBlend;
            vy += (dx / distance * speed + dy / distance * radial) * zoneBlend;
            totalBlend += zoneBlend;
            gravityCompensation += zoneBlend * pulse;
          }
        }
        if (!totalBlend) continue;
        const blend = Math.min(0.45, totalBlend);
        vx /= totalBlend;
        vy /= totalBlend;
        const v = body.GetLinearVelocity();
        this.vector.Set(v.x + (vx - v.x) * blend,
          v.y + (vy - v.y) * blend - 10 * seconds * Math.min(1, gravityCompensation / totalBlend));
        body.SetLinearVelocity(this.vector);
      }
    }
    for (const body of this.deleteCandidates) this.world.DestroyBody(body);
    this.deleteCandidates = [];
    // Smaller angular increments keep rotating paddles from pushing marbles through thin walls.
    for (let i = 0; i < this.collisionSubsteps; i++)
      this.world.Step(seconds / this.collisionSubsteps, 8, this.collisionSubsteps === 4 ? 4 : 8);
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.life <= 0) continue;
      let edge = e.body.GetContactList();
      while (this.Box2D.getPointer(edge)) {
        if (edge.contact.IsTouching()) {
          this.deleteCandidates.push(e.body);
          this.entities.splice(i, 1);
          break;
        }
        edge = edge.next;
      }
    }
  }
}
