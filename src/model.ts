import type { StageDef } from './data/maps';
import type { MapEntity } from './types/MapEntity.type';

export type WinnerOrder = 'asc' | 'desc';
export type SavedMap = { id: string; stage: StageDef };
export const MAPS_KEY = 'marble-pinball.maps.v1';
export const MAPS_BACKUP_PREFIX = MAPS_KEY + '.recovery.';
export const MAX_MARBLES = 300;
export function parseNames(text: string): string[] {
  const names: string[] = [];
  for (const entry of text
    .split(/[,，\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const match = /^(.*?)\*(\d+)$/.exec(entry);
    const name = (match ? match[1] : entry).trim();
    const count = match ? Number(match[2]) : 1;
    if (!name || name.length > 40) throw new Error('이름은 1~40자로 입력해 주세요.');
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_MARBLES || names.length + count > MAX_MARBLES)
      throw new Error(`구슬은 1~${MAX_MARBLES}개까지 넣을 수 있어요.`);
    names.push(...Array<string>(count).fill(name));
  }
  return names;
}
export function winningRange(order: WinnerOrder, count: number, picks: number): [number, number] {
  if (!count) throw new Error('참가자 이름을 먼저 입력해 주세요.');
  if (order !== 'asc' && order !== 'desc') throw new Error('당첨 방향을 선택해 주세요.');
  if (!Number.isInteger(picks) || picks < 1 || picks > count)
    throw new Error('뽑을 인원은 1~' + count + '명 사이로 선택해 주세요.');
  return order === 'asc' ? [1, picks] : [count - picks + 1, count];
}
export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export const cloneStage = (stage: StageDef): StageDef => JSON.parse(JSON.stringify(stage));
export function blankStage(): StageDef {
  const wall = (points: [number, number][]): MapEntity => ({
    position: { x: 0, y: 0 },
    type: 'static',
    shape: { type: 'polyline', rotation: 0, points },
    props: { density: 1, restitution: 0.15, angularVelocity: 0 },
  });
  return {
    title: '나만의 맵',
    goalY: 70,
    zoomY: 65,
    entities: [
      wall([
        [9.25, -30],
        [9.25, 7],
        [1, 15],
        [1, 70],
      ]),
      wall([
        [16.5, -30],
        [16.5, 7],
        [25, 15],
        [25, 70],
      ]),
    ],
  };
}
const finite = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function validateStage(value: unknown): StageDef {
  const s = value as StageDef;
  if (
    !s ||
    typeof s.title !== 'string' ||
    !s.title.trim() ||
    s.title.length > 60 ||
    !finite(s.goalY, 20, 300) ||
    (s.randomizeStart !== undefined && typeof s.randomizeStart !== 'boolean') ||
    (s.width !== undefined && !finite(s.width, 26, 200)) ||
    (s.spawnX !== undefined && !finite(s.spawnX, 4, (s.width ?? 26) - 4)) ||
    !Array.isArray(s.entities) ||
    s.entities.length > 2000
  )
    throw new Error('올바른 맵 파일이 아니에요. 맵 이름, 결승선, 장애물을 확인해 주세요.');
  if (s.art !== undefined && (!s.art || !['rapids', 'jackpot', 'pinball-cascade', 'clocktower', 'orbital-lock', 'hourglass'].includes(s.art.style) || !Array.isArray(s.art.contours) ||
    s.art.contours.length > 20 || s.art.contours.some((points) => !Array.isArray(points) ||
      points.length < 3 || points.length > 1000 || points.some((p) => !Array.isArray(p) || p.length !== 2 ||
        !finite(p[0], -1000, 1000) || !finite(p[1], -1000, 1000)))))
    throw new Error('맵 배경 장식 좌표가 올바르지 않아요.');
  if (s.art?.arrows !== undefined && (!Array.isArray(s.art.arrows) || s.art.arrows.length > 100 ||
    s.art.arrows.some((a) => !Array.isArray(a) || a.length !== 3 ||
      !finite(a[0], -1000, 1000) || !finite(a[1], -1000, 1000) || !finite(a[2], -100, 100))))
    throw new Error('맵 방향 표시가 올바르지 않아요.');
  if (s.exitBridge !== undefined) {
    const bridge = s.exitBridge, entry = bridge?.entry;
    if (!entry || !finite(entry.x, -1000, 1000) || !finite(entry.y, -1000, 1000) ||
      !finite(entry.width, 0.5, 200) || !finite(entry.height, 0.5, 300) ||
      !Array.isArray(bridge.deck) || bridge.deck.length < 3 || bridge.deck.length > 1000 ||
      bridge.deck.some(p => !Array.isArray(p) || p.length !== 2 || !finite(p[0], -1000, 1000) || !finite(p[1], -1000, 1000)))
      throw new Error('입체 출구의 진입 영역과 바닥 좌표를 확인해 주세요.');
  }
  if (s.vortex && (!finite(s.vortex.x, -1000, 1000) || !finite(s.vortex.y, -1000, 1000) ||
    !finite(s.vortex.radius, 1, 100) || !finite(s.vortex.speed, -30, 30) ||
    (s.vortex.gust !== undefined && !finite(s.vortex.gust, 0, 1))))
    throw new Error('회전 바람 설정이 올바르지 않아요.');
  if (s.windZones !== undefined && (!Array.isArray(s.windZones) || s.windZones.length > 30))
    throw new Error('바람 영역 설정이 올바르지 않아요.');
  for (const wind of s.windZones ?? []) {
    if (!wind || !finite(wind.x, -1000, 1000) || !finite(wind.y, -1000, 1000) ||
      (wind.phase !== undefined && !finite(wind.phase, -100, 100)) ||
      (wind.pulse !== undefined && !finite(wind.pulse, 0, 1)) ||
      (wind.dutyCycle !== undefined && !finite(wind.dutyCycle, 0.1, 1)) ||
      (wind.period !== undefined && !finite(wind.period, 1, 60)) ||
      (wind.fan !== undefined && (!wind.fan || !finite(wind.fan.x, -1000, 1000) ||
        !finite(wind.fan.y, -1000, 1000) || !finite(wind.fan.radius, 0.3, 15) ||
        (wind.fan.front !== undefined && typeof wind.fan.front !== 'boolean'))))
      throw new Error('바람 영역 설정이 올바르지 않아요.');
    if (wind.type === 'directional') {
      if (!finite(wind.width, 0.5, 200) || !finite(wind.height, 0.5, 300) ||
        !finite(wind.velocityX, -50, 50) || !finite(wind.velocityY, -50, 50) ||
        (wind.strength !== undefined && !finite(wind.strength, 0.1, 20)) ||
        (wind.turbulence !== undefined && !finite(wind.turbulence, 0, 20)))
        throw new Error('직선 바람 설정이 올바르지 않아요.');
    } else if (wind.type === 'vortex') {
      if (!finite(wind.radius, 1, 100) || !finite(wind.speed, -30, 30) ||
        (wind.innerRadius !== undefined && (!finite(wind.innerRadius, 0, wind.radius) || wind.innerRadius >= wind.radius)) ||
        (wind.radial !== undefined && !finite(wind.radial, -30, 30)) ||
        (wind.gust !== undefined && !finite(wind.gust, 0, 1)))
        throw new Error('회전 바람 설정이 올바르지 않아요.');
    } else throw new Error('알 수 없는 바람 종류예요.');
  }
  for (const e of s.entities) {
    if (
      !e ||
      !e.position ||
      !finite(e.position.x, -1000, 1000) ||
      !finite(e.position.y, -1000, 1000) ||
      !['static', 'kinematic'].includes(e.type) ||
      !e.props ||
      !finite(e.props.density, 0, 1000) ||
      !finite(e.props.restitution, 0, 2) ||
      !finite(e.props.angularVelocity, -50, 50) ||
      (e.props.life !== undefined && !finite(e.props.life, -1, 10000))
    )
      throw new Error('장애물 위치 또는 물리 설정이 올바르지 않아요.');
    const sh = e.shape;
    if (sh?.collisionLayer !== undefined && (sh.collisionLayer !== 1 && sh.collisionLayer !== 2 ||
      sh.collisionLayer === 2 && !s.exitBridge))
      throw new Error('입체 출구가 있는 맵에서만 두 번째 충돌 층을 사용할 수 있어요.');
    if (sh && 'boostSpeed' in sh && (sh.type !== 'box' || !finite(sh.boostSpeed, 5, 60) ||
      e.type !== 'static' || e.props.angularVelocity !== 0 || e.props.oscillation || e.props.timedGate || e.props.spinCycle || e.props.sliding ||
      (e.props.life !== undefined && e.props.life !== -1)))
      throw new Error('부스터는 고정된 네모 발판이며 속도는 5~60 사이여야 해요.');
    if (e.props.oscillation !== undefined && (!e.props.oscillation || e.type !== 'kinematic' ||
      !finite(e.props.oscillation.amplitude, 0.01, 1.5) || !finite(e.props.oscillation.period, 1, 30)))
      throw new Error('왕복 장치의 각도 또는 주기가 올바르지 않아요.');
    const gate = e.props.timedGate;
    const slide = e.props.sliding;
    if (slide !== undefined && (!slide || e.type !== 'kinematic' || e.props.angularVelocity !== 0 ||
      e.props.oscillation || gate || e.props.spinCycle || (e.props.life !== undefined && e.props.life !== -1) ||
      !finite(slide.amplitude, 0.1, 20) || !finite(slide.period, 1, 30) || !finite(slide.phase, -60, 60)))
      throw new Error('이동 발판의 거리와 주기를 확인해 주세요.');
    if (gate !== undefined && (!gate || e.type !== 'kinematic' || e.props.oscillation ||
      e.props.angularVelocity !== 0 || (e.props.life !== undefined && e.props.life !== -1) ||
      !finite(gate.period, 2, 30) || !finite(gate.openFor, 0.5, gate.period - 0.5) ||
      (gate.releaseAfter !== undefined && !finite(gate.releaseAfter, 5, 180)) ||
      !finite(gate.phase, -60, 60) || !finite(gate.angle, -1.5, 1.5) || Math.abs(gate.angle) < 0.1))
      throw new Error('타이밍 게이트의 열림 각도와 주기를 확인해 주세요.');
    const spin = e.props.spinCycle;
    if (spin !== undefined && (!spin || e.type !== 'kinematic' || e.props.oscillation || gate ||
      !finite(spin.period, 2, 30) || !finite(spin.runFor, 0.5, spin.period - 0.5) ||
      !finite(spin.phase, -60, 60) || !finite(spin.idleSpeed, -5, 5)))
      throw new Error('주기형 회전판의 회전 시간과 주기를 확인해 주세요.');
    if (!sh || (sh.sensor !== undefined && typeof sh.sensor !== 'boolean') ||
      (sh.hidden !== undefined && typeof sh.hidden !== 'boolean') ||
      (sh.color !== undefined && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(sh.color)))
      throw new Error('장애물 색상이 올바르지 않아요.');
    if (sh.type === 'circle') {
      if (!finite(sh.radius, 0.05, 30)) throw new Error('핀 크기가 올바르지 않아요.');
    } else if (sh.type === 'box') {
      if (!finite(sh.width, 0.05, 1000) || !finite(sh.height, 0.05, 1000) || !finite(sh.rotation, -100, 100))
        throw new Error('반사판 크기나 각도가 올바르지 않아요.');
    } else if (sh.type === 'polyline') {
      if (
        !Array.isArray(sh.points) ||
        sh.points.length < 2 ||
        sh.points.length > 1000 ||
        !finite(sh.rotation, -100, 100) ||
        sh.points.some(
          (p) => !Array.isArray(p) || p.length !== 2 || !finite(p[0], -1000, 1000) || !finite(p[1], -1000, 1000)
        )
      )
        throw new Error('벽의 좌표가 올바르지 않아요.');
      if (sh.backing !== undefined && (!finite(sh.backing, -5, 5) || sh.solid || e.type !== 'static'))
        throw new Error('외벽 충돌 두께가 올바르지 않아요.');
      if (sh.solid !== undefined && typeof sh.solid !== 'boolean') throw new Error('벽 채움 설정이 올바르지 않아요.');
      if (sh.solid) {
        const points = sh.points.slice(0, -1),
          last = sh.points[sh.points.length - 1];
        if (points.length < 3 || points.length > 8 || last[0] !== points[0][0] || last[1] !== points[0][1])
          throw new Error('채운 벽은 꼭짓점 3~8개로 닫혀 있어야 해요.');
        let winding = 0;
        for (let i = 0; i < points.length; i++) {
          const a = points[i],
            b = points[(i + 1) % points.length];
          for (let j = 0; j < points.length; j++) {
            if (j === i || j === (i + 1) % points.length) continue;
            const c = points[j],
              cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            if (Math.abs(cross) < 0.0001 || (winding && Math.sign(cross) !== winding))
              throw new Error('채운 벽은 오목하거나 겹치지 않는 볼록 다각형이어야 해요.');
            winding = Math.sign(cross);
          }
        }
      }
    } else throw new Error('지원하지 않는 장애물이에요.');
  }
  return { ...cloneStage(s), title: s.title.trim(), zoomY: s.goalY - 5 };
}
export function readSavedMaps(storage: Pick<Storage, 'getItem'>, onInvalid?: (count: number) => void): SavedMap[] {
  const raw = storage.getItem(MAPS_KEY);
  if (!raw) return [];
  const items: unknown = JSON.parse(raw);
  if (!Array.isArray(items)) throw new Error('저장된 맵 목록을 읽을 수 없어요.');
  let invalid = 0;
  const maps = items.flatMap((item) => {
    try {
      if (!item || typeof item.id !== 'string') throw new Error('저장된 맵 정보가 올바르지 않아요.');
      return [{ id: item.id, stage: validateStage(item.stage) }];
    } catch {
      invalid++;
      return [];
    }
  });
  if (invalid) onInvalid?.(invalid);
  return maps;
}
export function saveMaps(storage: Pick<Storage, 'getItem' | 'setItem'>, maps: SavedMap[]) {
  const next = JSON.stringify(maps.map((m) => ({ id: m.id, stage: validateStage(m.stage) })));
  const raw = storage.getItem(MAPS_KEY);
  if (raw) {
    let damaged = false;
    try { readSavedMaps(storage, () => { damaged = true; }); } catch { damaged = true; }
    if (damaged) {
      const base = MAPS_BACKUP_PREFIX + Date.now();
      let key = base;
      for (let i = 1; storage.getItem(key) != null; i++) key = base + '.' + i;
      // Preserve the original before replacement; failed backups must leave it untouched.
      storage.setItem(key, raw);
    }
  }
  storage.setItem(MAPS_KEY, next);
}
