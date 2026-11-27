import { Race } from '../race';
import { DEFAULT_MAP_INDEX, stages } from '../data/maps';
import { parseNames, validateStage, winningRange } from '../model';
import { validateDolphins } from '../dolphin';
import { personalSpringEntity, springHasExpired, validatePersonalSpring, type PlacedSpring } from '../personal-spring';
import type { EntityBoxShape, MapEntityState } from '../types/map-entity';
import {
  encodeScene,
  MAX_LAN_MESSAGE_BYTES,
  type Command,
  type CommandResult,
  type Frame,
  type Scene,
  type ServerMessage,
  type Settings,
  type SpringLayout,
} from './protocol';

export type RoomSession = {
  role: 'host' | 'viewer';
  name: string;
  results: Map<string, CommandResult>;
};

export type RoomPeer = {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const allowedKeys = (value: unknown, keys: string[]) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function createRaceRoom(
  simulationNow = () => performance.now(),
  defer = (task: () => void) => {
    const timer = setTimeout(task, 0);
    return () => clearTimeout(timer);
  },
  randomUUID = () => crypto.randomUUID()
) {
  const race = new Race();
  await race.physics.init();
  let settings: Settings = { names: '', mapId: DEFAULT_MAP_INDEX, order: 'desc', picks: 2 };
  let raceId: string, scene: Scene, sceneMessage: string;
  let revision = 0,
    seq = 0;
  const launcherGuides = new Set<number>();
  let guidesSentAt = -1;
  let accumulator = 0,
    lastTick = simulationNow();
  let speed = 1,
    boostUntil = 0;
  let boostOwner: RoomSession | null = null;
  const personalSprings = new Map<RoomSession, PlacedSpring>();
  const activeSprings = new Map<EntityBoxShape, PlacedSpring>();
  const clients = new Map<RoomPeer, { session: RoomSession; count: number; window: number }>();
  function send(peer: RoomPeer, value: ServerMessage | string) {
    if (peer.readyState !== 1) return;
    if (peer.bufferedAmount > 2 * MAX_LAN_MESSAGE_BYTES) return peer.terminate();
    peer.send(typeof value === 'string' ? value : JSON.stringify(value));
  }
  function mapEntities() {
    // Personal bodies are appended, so filtering them preserves map device indices.
    const entities = race.physics.getEntities();
    return activeSprings.size
      ? entities.filter(({ shape }) => shape.type !== 'box' || !activeSprings.has(shape))
      : entities;
  }
  const currentSprings = () =>
    [...personalSprings.values()].filter(
      (spring) =>
        spring.activatedAt === undefined || (race.state !== 'finished' && !springHasExpired(spring, race.elapsed))
    );
  const springLayout = (): SpringLayout => ({
    type: 'spring-layout',
    raceId,
    springs: currentSprings(),
  });
  let springLayoutDirty = false;
  let springStrokePending = false;
  let springBroadcast: (() => void) | undefined;
  function makeScene(entities = mapEntities()) {
    const fixed = new Set(
      (race.stage.entities ?? []).filter((e) => e.type === 'static' && (e.props.life ?? -1) <= 0).map((e) => e.shape)
    );
    scene = {
      type: 'scene',
      raceId,
      revision: ++revision,
      stage: race.stage,
      settings: { ...settings },
      entities,
      fixed: entities.map((e) => fixed.has(e.shape)),
      balls: race.balls.map(({ id, name, color }) => ({ id, name, color })),
    };
    sceneMessage = JSON.stringify(encodeScene(scene));
    for (const ws of clients.keys()) send(ws, sceneMessage);
  }
  function prepare(preservePlacements = false) {
    raceId = randomUUID();
    accumulator = 0;
    boostOwner = null;
    if (!preservePlacements) personalSprings.clear();
    springLayoutDirty = preservePlacements && personalSprings.size > 0;
    springStrokePending = false;
    activeSprings.clear();
    launcherGuides.clear();
    guidesSentAt = -1;
    race.prepare(settings.stage ?? stages[settings.mapId], parseNames(settings.names), settings.dolphins);
    makeScene();
  }
  function playbackRate() {
    return speed * (boostOwner && performance.now() < boostUntil ? 2 : 1) * race.finishSlowdown();
  }
  function syncScene(entities: MapEntityState[]) {
    if (entities.length !== scene.entities.length) makeScene(entities);
  }
  function frame(entities = mapEntities()): Frame {
    syncScene(entities);
    const positions: NonNullable<Frame['positions']> = entities.flatMap((e, i) =>
      e.x !== scene.entities[i].x || e.y !== scene.entities[i].y ? [[i, round(e.x), round(e.y)]] : []
    );
    const mantaCaptures: NonNullable<Frame['mantaCaptures']> = race.balls.flatMap((b) =>
      !b.rank && b.mantaCaughtAt !== undefined ? [[b.id, b.mantaCaughtAt]] : []
    );
    return {
      type: 'frame',
      raceId,
      revision,
      seq: ++seq,
      time: performance.now(),
      elapsed: race.elapsed,
      state: race.state,
      connected: clients.size,
      speed,
      playbackRate: playbackRate(),
      balls: race.balls.map((b) => [b.id, round(b.x), round(b.y), round(b.angle), b.rank ?? 0]),
      ...(mantaCaptures.length ? { mantaCaptures } : {}),
      ...(race.stage.exitBridge ? { bridgeIds: race.balls.filter((b) => b.onBridge).map((b) => b.id) } : {}),
      ...(launcherGuides.size ? { launcherGuides: [...launcherGuides] } : {}),
      ...(race.finishReason === 'stalled' ? { stalled: true } : {}),
      angles: entities.map((e) => round(e.angle)),
      ...(positions.length ? { positions } : {}),
      winners: race.winners.map((b) => b.id),
    };
  }
  function advance() {
    if (guidesSentAt === race.elapsed) launcherGuides.clear();
    race.advance();
    if (springStrokePending) {
      springStrokePending = false;
      springBroadcast ??= defer(broadcast);
    }
    for (const id of race.physics.getLauncherGuideIds()) launcherGuides.add(id);
    for (const [shape, spring] of activeSprings) {
      if (springHasExpired(spring, race.elapsed) || race.state === 'finished') {
        race.physics.removeSpring(shape);
        activeSprings.delete(shape);
      }
    }
  }
  function broadcast() {
    if (springBroadcast) {
      springBroadcast();
      springBroadcast = undefined;
    }
    if (springLayoutDirty) {
      const layout = JSON.stringify(springLayout());
      for (const ws of clients.keys()) send(ws, layout);
      springLayoutDirty = false;
    }
    const entities = mapEntities();
    const snapshot = frame(entities),
      hasSprings = entities.some((e) => e.shape.type === 'box' && e.shape.spring);
    guidesSentAt = race.elapsed;
    for (const [ws, client] of clients)
      if (ws.bufferedAmount < 256 * 1024)
        send(ws, {
          ...snapshot,
          ...(hasSprings ? { springs: race.springStatuses(client.session, entities) } : {}),
          personalSpring: personalSpringStatus(client.session),
        });
    return race.state === 'running' && (hasSprings || activeSprings.size > 0);
  }
  function personalSpringStatus(session: RoomSession): NonNullable<Frame['personalSpring']> {
    const spring = personalSprings.get(session);
    return spring
      ? { state: spring.activatedAt === undefined ? 'placed' : 'used', id: spring.id }
      : { state: 'available' };
  }
  function execute(session: RoomSession, msg: Command) {
    requireThat(
      typeof msg.raceId === 'string' && msg.raceId === raceId,
      '경기가 바뀌었어요. 최신 화면에서 다시 시도해 주세요.'
    );
    const keys = {
      configure: ['settings', 'shuffle'],
      start: [],
      pause: [],
      reset: [],
      speed: ['value'],
      boost: ['active'],
      spring: ['index', 'revision'],
      'place-spring': ['x', 'y', 'direction'],
      'use-spring': [],
    };
    requireThat(
      Object.hasOwn(keys, msg.type) && allowedKeys(msg, ['type', 'requestId', 'raceId', ...keys[msg.type]]),
      '허용되지 않은 요청입니다.'
    );
    if (msg.type === 'place-spring') {
      requireThat(race.state !== 'finished', '다음 경기가 준비되면 배치할 수 있어요.');
      requireThat(!personalSprings.has(session), '이번 경기의 스프링은 이미 배치했어요.');
      validatePersonalSpring(race.stage, msg, currentSprings());
      personalSprings.set(session, {
        id: randomUUID(),
        x: msg.x,
        y: msg.y,
        direction: msg.direction,
        ownerName: session.name,
        placedAt: race.elapsed,
      });
      springLayoutDirty = true;
      return;
    }
    if (msg.type === 'use-spring') {
      requireThat(race.state === 'running', '경기가 진행 중일 때 발동할 수 있어요.');
      const spring = personalSprings.get(session);
      if (!spring || spring.activatedAt !== undefined) throw new Error('배치한 스프링이 없거나 이미 사용했어요.');
      const entity = personalSpringEntity(race.stage, spring);
      race.physics.createEntities([entity]);
      const index = race.physics.getEntities().findIndex((entry) => entry.shape === entity.shape);
      if (!race.activateSpring(index, session)) {
        race.physics.removeSpring(entity.shape);
        throw new Error('스프링을 발동하지 못했어요. 다시 시도해 주세요.');
      }
      spring.activatedAt = race.elapsed;
      activeSprings.set(entity.shape, spring);
      springLayoutDirty = true;
      springStrokePending = true;
      return;
    }
    if (msg.type === 'spring') {
      // A contact may have removed an obstacle since the last scheduled snapshot.
      syncScene(mapEntities());
      requireThat(
        Number.isInteger(msg.revision) && msg.revision === revision,
        '맵 장치가 바뀌었어요. 최신 화면에서 스프링을 다시 선택해 주세요.'
      );
      requireThat(
        Number.isInteger(msg.index) &&
          msg.index >= 0 &&
          msg.index < scene.entities.length &&
          race.activateSpring(msg.index, session),
        '작동 가능한 스프링을 선택하고 쿨타임과 복귀가 끝난 후 다시 눌러 주세요.'
      );
      return;
    }
    requireThat(session.role === 'host', '관람자는 경기를 조작할 수 없습니다.');
    if (msg.type === 'configure') {
      requireThat(race.state !== 'running' && race.state !== 'paused', '진행 중인 경기는 먼저 다시 준비해 주세요.');
      const s = msg.settings;
      requireThat(
        allowedKeys(s, ['names', 'mapId', 'order', 'picks', 'stage', 'dolphins']) &&
          (msg.shuffle === undefined || msg.shuffle === true) &&
          typeof s.names === 'string' &&
          s.names.length <= 15000 &&
          Number.isInteger(s.mapId) &&
          !!stages[s.mapId],
        '경기 설정이 올바르지 않습니다.'
      );
      const names = parseNames(s.names);
      if (names.length) winningRange(s.order, names.length, s.picks);
      else requireThat(['asc', 'desc'].includes(s.order) && s.picks === 0, '경기 설정이 올바르지 않습니다.');
      const stage = s.stage !== undefined ? validateStage(s.stage) : stages[s.mapId];
      const dolphins = s.dolphins === undefined ? {} : { dolphins: validateDolphins(s.dolphins, stage) };
      const next = { ...s, ...dolphins, ...(s.stage !== undefined ? { stage } : {}) };
      const sameReadyMap =
        race.state === 'ready' &&
        next.mapId === settings.mapId &&
        JSON.stringify(next.stage) === JSON.stringify(settings.stage);
      const preserveReadyRace =
        sameReadyMap &&
        !msg.shuffle &&
        next.names === settings.names &&
        (next.order !== settings.order ||
          next.picks !== settings.picks ||
          JSON.stringify(next.dolphins) !== JSON.stringify(settings.dolphins));
      settings = next;
      if (preserveReadyRace) {
        race.dolphins = validateDolphins(settings.dolphins, race.stage);
        makeScene();
      } else prepare(msg.shuffle === true && sameReadyMap);
    } else if (msg.type === 'start') {
      requireThat(race.state === 'ready', '다시 준비한 뒤 시작해 주세요.');
      race.startRace(winningRange(settings.order, race.balls.length, settings.picks), settings.order);
      accumulator = 0;
    } else if (msg.type === 'pause') {
      requireThat(race.state === 'running' || race.state === 'paused', '진행 중인 경기가 없습니다.');
      race.pause();
      accumulator = 0;
      boostOwner = null;
    } else if (msg.type === 'reset') {
      prepare();
    } else if (msg.type === 'speed') {
      requireThat([0.5, 1, 2, 4].includes(msg.value), '지원하지 않는 배속입니다.');
      speed = msg.value;
    } else if (msg.type === 'boost') {
      requireThat(typeof msg.active === 'boolean', '가속 요청이 올바르지 않습니다.');
      if (msg.active) {
        requireThat(race.state === 'running', '경기 중에만 가속할 수 있습니다.');
        boostOwner = session;
        boostUntil = performance.now() + 1500;
      } else if (boostOwner === session) boostOwner = null;
    }
  }
  prepare();
  function connect(peer: RoomPeer, session: RoomSession) {
    clients.set(peer, { session, count: 0, window: Date.now() });
    const entities = mapEntities(),
      snapshot = frame(entities);
    send(peer, sceneMessage);
    send(peer, springLayout());
    send(peer, {
      ...snapshot,
      springs: race.springStatuses(session, entities),
      personalSpring: personalSpringStatus(session),
    });
    send(peer, { type: 'identity', role: session.role, name: session.name });
  }
  function disconnect(peer: RoomPeer) {
    const client = clients.get(peer);
    clients.delete(peer);
    if (client && boostOwner === client.session) boostOwner = null;
  }
  function receive(peer: RoomPeer, data: string) {
    const client = clients.get(peer);
    if (!client) return;
    if (Date.now() - client.window > 1000) {
      client.window = Date.now();
      client.count = 0;
    }
    if (++client.count > 30) return peer.close(1008, 'Too many requests');
    let msg: Command;
    try {
      msg = JSON.parse(data);
    } catch {
      return peer.close(1008, 'Invalid JSON');
    }
    if (!msg || typeof msg.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(msg.requestId))
      return peer.close(1008, 'Invalid request ID');
    const { session } = client;
    const prior = session.results.get(msg.requestId);
    if (prior) return send(peer, prior);
    let result: CommandResult;
    try {
      execute(session, msg);
      result = { type: 'result', requestId: msg.requestId, ok: true };
    } catch (error) {
      result = {
        type: 'result',
        requestId: msg.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    session.results.set(msg.requestId, result);
    if (session.results.size > 64) session.results.delete(session.results.keys().next().value!);
    send(peer, result);
    if (msg.type === 'spring' || msg.type === 'place-spring' || msg.type === 'use-spring')
      springBroadcast ??= defer(broadcast);
    else broadcast();
  }
  const timer = setInterval(() => {
    const tickStarted = performance.now(),
      now = simulationNow(),
      delta = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    if (race.state !== 'running') {
      accumulator = 0;
      return;
    }
    const rate = playbackRate();
    accumulator += delta * rate;
    let steps = 0;
    while (
      accumulator >= 1 / 60 &&
      race.state === 'running' &&
      steps < Math.max(6, Math.ceil(rate * 2)) &&
      performance.now() - tickStarted < 12
    ) {
      advance();
      accumulator -= 1 / 60;
      steps++;
    }
    // Keep collision steps fixed; shed overdue wall time instead of starving connections.
    if (accumulator >= 1 / 60) accumulator %= 1 / 60;
  }, 8);
  // Shorten the interval only in live races with interactive springs.
  function sendSnapshot() {
    const springRace = broadcast();
    snapshots = setTimeout(sendSnapshot, springRace ? 25 : 50);
  }
  let snapshots = setTimeout(sendSnapshot, 50);
  return {
    race,
    advance,
    connect,
    disconnect,
    receive,
    close() {
      springBroadcast?.();
      clearInterval(timer);
      clearTimeout(snapshots);
      for (const peer of clients.keys()) peer.terminate();
      clients.clear();
      race.physics.dispose();
    },
  };
}
