import type { MapEntity } from './types/MapEntity.type';

export const ART_STYLES = ['reversal-ladder', 'roundhouse', 'rapids', 'jackpot', 'pinball-cascade', 'clocktower', 'orbital-lock', 'hourglass', 'fracture-canyon', 'crossway', 'switchback-express'] as const;

export type WindZone = {
  dutyCycle?: number;
  pulse?: number;
  period?: number;
  phase?: number;
  fan?: { x: number; y: number; radius: number; front?: boolean };
} & (
  | {
      type: 'directional';
      x: number;
      y: number;
      width: number;
      height: number;
      velocityX: number;
      velocityY: number;
      strength?: number;
      turbulence?: number;
    }
  | {
      type: 'vortex';
      x: number;
      y: number;
      radius: number;
      innerRadius?: number;
      speed: number;
      radial?: number;
      gust?: number;
    });

export type StageDef = {
  title: string;
  art?: { style: (typeof ART_STYLES)[number]; contours: [number, number][][]; arrows?: [number, number, number][] };
  exitBridge?: { entry: { x: number; y: number; width: number; height: number }; deck: [number, number][] };
  spawnX?: number;
  entities?: MapEntity[];
  width?: number;
  randomizeStart?: boolean;
  vortex?: { x: number; y: number; radius: number; speed: number; gust?: number };
  windZones?: WindZone[];
  goalY: number;
  zoomY: number;
};
