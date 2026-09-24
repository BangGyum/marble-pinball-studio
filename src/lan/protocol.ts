import type { StageDef } from '../data/maps';
import type { WinnerOrder } from '../model';
import type { MapEntityState } from '../types/MapEntity.type';
export const LAN_PORT = 43190;
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
);
export type ServerMessage = Scene | Frame | Identity
  | { type: 'result'; requestId: string; ok: boolean; error?: string };
