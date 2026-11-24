import type { MapEntity } from './types/map-entity';

export const ART_STYLES = [
  'reversal-ladder',
  'shortcut-cascade',
  'seesaw-valley',
  'roundhouse',
  'rapids',
  'jackpot',
  'pinball-cascade',
  'clocktower',
  'orbital-lock',
  'hourglass',
  'fracture-canyon',
  'crossway',
  'switchback-express',
  'infinite-funnel',
  'twin-funnel',
  'bounce-stairs',
  'orbiting-gate',
  'one-bounce',
  'tidal-locks',
] as const;

type BridgeArea = { x: number; y: number; width: number; height: number };
type Bridge = { entry: BridgeArea; deck: [number, number][] };

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
    }
);

// x is the left edge, y is the surface. Current is signed horizontal world units per second.
export type WaterZone = { x: number; y: number; width: number; depth: number; current: number };

export type StageDef = {
  title: string;
  art?: { style: (typeof ART_STYLES)[number]; contours: [number, number][][]; arrows?: [number, number, number][] };
  exitBridge?: Bridge & { transfers?: (Bridge & { exit: BridgeArea })[] };
  spawnX?: number;
  entities?: MapEntity[];
  width?: number;
  randomizeStart?: boolean;
  vortex?: { x: number; y: number; radius: number; speed: number; gust?: number };
  windZones?: WindZone[];
  waterZones?: WaterZone[];
  // World position of the soap ring at the foot of the mine railway.
  bubbleMine?: { x: number; y: number };
  // Circular finish; goalY remains the map height used for framing and the minimap.
  goalArea?: { x: number; y: number; radius: number };
  goalY: number;
  zoomY: number;
};
