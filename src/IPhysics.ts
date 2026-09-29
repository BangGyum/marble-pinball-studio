import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';

export interface IPhysics {
  init(): Promise<void>;

  dispose(): void;

  clear(): void;

  clearMarbles(): void;

  createStage(stage: StageDef): void;

  createMarble(id: number, x: number, y: number): void;

  shakeMarble(id: number): void;

  removeMarble(id: number): void;

  getMarblePosition(id: number): { x: number; y: number; angle: number };

  getMarbleSpeed(id: number): number;

  placeMarble(id: number, x: number, y: number): void;

  isMarbleOnBridge(id: number): boolean;

  // blend < 1 mixes moving obstacles back toward their pose before the last step.
  getEntities(blend?: number): MapEntityState[];

  activateSpring(index: number): boolean;

  isSpringBusy(index: number): boolean;

  start(): void;

  step(deltaSeconds: number): void;
}
