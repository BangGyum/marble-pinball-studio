import type { StageDef } from '../data/maps';
import type { WinnerOrder } from '../model';
import type { MapEntityState } from '../types/MapEntity.type';
export const LAN_PORT = 43190;
export const MAX_LAN_MESSAGE_BYTES = 1024 * 1024;
export type Settings = { names: string; mapId: number; order: WinnerOrder; picks: number; stage?: StageDef };
export type Scene = {
  type: 'scene'; raceId: string; revision: number; stage: StageDef; settings: Settings;
  entities: MapEntityState[]; fixed: boolean[];
  balls: { id: number; name: string; color: string }[];
};
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
export type ServerMessage = Scene | Frame | Identity
  | CommandResult;

export function serializeCommand(command: Command): string {
  const data = JSON.stringify(command);
  if (new TextEncoder().encode(data).byteLength > MAX_LAN_MESSAGE_BYTES)
    throw new Error('경기 설정이 너무 커서 전송할 수 없어요. 맵이나 참가자 이름의 크기를 줄여 주세요.');
  return data;
}
