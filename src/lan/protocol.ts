import type { StageDef } from '../data/maps';
import type { WinnerOrder } from '../model';
import type { EntityShape, MapEntityState } from '../types/MapEntity.type';
import type { DolphinSettings } from '../dolphin';
export const LAN_PORT = 43190;
export const MAX_LAN_MESSAGE_BYTES = 1024 * 1024;
export type Settings = { names: string; mapId: number; order: WinnerOrder; picks: number; stage?: StageDef; dolphins?: DolphinSettings };
export type Scene = {
  type: 'scene'; raceId: string; revision: number; stage: StageDef; settings: Settings;
  entities: MapEntityState[]; fixed: boolean[];
  balls: { id: number; name: string; color: string }[];
};
type WireEntity = Omit<MapEntityState, 'shape'> & { shapeIndex?: number; shape?: EntityShape };
export type WireScene = Omit<Scene, 'settings' | 'entities'> & {
  settings: Omit<Settings, 'stage'>; customStage: boolean; entities: WireEntity[];
};
export function encodeScene(scene: Scene): WireScene {
  const { names, mapId, order, picks, stage, dolphins } = scene.settings;
  const indexes = new Map((scene.stage.entities ?? []).map((entity, i) => [entity.shape, i]));
  return { ...scene, settings: { names, mapId, order, picks, ...(dolphins ? { dolphins } : {}) }, customStage: !!stage,
    entities: scene.entities.map(({ shape, ...entity }) => {
      const shapeIndex = indexes.get(shape);
      return shapeIndex === undefined ? { ...entity, shape } : { ...entity, shapeIndex };
    }) };
}
export function decodeScene(wire: WireScene): Scene {
  const { customStage, ...scene } = wire;
  return { ...scene, settings: { ...wire.settings, ...(customStage ? { stage: wire.stage } : {}) },
    entities: wire.entities.map((entity) => ({ x: entity.x, y: entity.y, angle: entity.angle, life: entity.life,
      shape: entity.shape ?? wire.stage.entities![entity.shapeIndex!].shape })) };
}
export type Frame = {
  type: 'frame'; raceId: string; revision: number; seq: number; time: number; elapsed: number;
  state: 'ready' | 'running' | 'paused' | 'finished';
  balls: [id: number, x: number, y: number, angle: number, rank: number][];
  angles: number[]; winners: number[]; connected: number; speed: number; playbackRate: number;
  positions?: [entityIndex: number, x: number, y: number][];
  bridgeIds?: number[];
  // Per-recipient real-time cooldown remaining in milliseconds, and physical return lock.
  springs?: [index: number, remainingMs: number, busy: boolean][];
  // Remaining marbles were trapped and ranked by depth.
  stalled?: boolean;
};
export type Identity = { type: 'identity'; role: 'host' | 'viewer' };
export type Info = { maps: { id: number; title: string }[]; addresses: { name: string; url: string }[] };
export type Command = { requestId: string; raceId: string } & (
  | { type: 'configure'; settings: Settings }
  | { type: 'start' | 'pause' | 'reset' }
  | { type: 'speed'; value: number }
  | { type: 'boost'; active: boolean }
  | { type: 'spring'; index: number; revision: number }
);
export type CommandResult = { type: 'result'; requestId: string; ok: boolean; error?: string };
export type ServerMessage = WireScene | Frame | Identity
  | CommandResult;

export function serializeCommand(command: Command): string {
  const data = JSON.stringify(command);
  if (new TextEncoder().encode(data).byteLength > MAX_LAN_MESSAGE_BYTES)
    throw new Error('경기 설정이 너무 커서 전송할 수 없어요. 맵이나 참가자 이름의 크기를 줄여 주세요.');
  return data;
}
