import type { VectorLike } from './VectorLike';

export type EntityShapeTypes = 'box' | 'circle' | 'polyline';

export interface EntityShapeBase {
  type: EntityShapeTypes;
  color?: string;
  bloomColor?: string;
  // Decorative collision-free geometry (for example a hinge cap).
  sensor?: boolean;
  // Physics-only back faces can be represented by scenery instead of a visible wall.
  hidden?: boolean;
  // Layer 2 is the elevated outlet; ordinary tracks remain on layer 1.
  collisionLayer?: 1 | 2;
}

export interface EntityBoxShape extends EntityShapeBase {
  type: 'box';
  boostSpeed?: number;
  width: number;
  height: number;
  rotation: number;
}

export interface EntityCircleShape extends EntityShapeBase {
  type: 'circle';
  radius: number;
}

export interface EntityPolylineShape extends EntityShapeBase {
  type: 'polyline';
  solid?: boolean;
  // Signed collision depth on the right-hand side of the directed wall.
  backing?: number;
  rotation: number;
  points: [number, number][];
}

export type EntityShape = EntityBoxShape | EntityCircleShape | EntityPolylineShape;

export type EntityPhysicalProps = {
  density: number;
  restitution: number;
  angularVelocity: number;
  oscillation?: { amplitude: number; period: number };
  sliding?: { amplitude: number; period: number; phase: number };
  timedGate?: { period: number; openFor: number; phase: number; angle: number; releaseAfter?: number };
  spinCycle?: { period: number; runFor: number; phase: number; idleSpeed: number };
  life?: number;
};

export interface MapEntity {
  position: VectorLike;
  type: 'static' | 'kinematic';
  shape: EntityShape;
  props: EntityPhysicalProps;
}

export interface MapEntityState {
  x: number;
  y: number;
  angle: number;
  shape: EntityShape;
  life: number;
}
