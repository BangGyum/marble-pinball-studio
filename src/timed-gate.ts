import type { EntityPhysicalProps } from './types/MapEntity.type';

// Hold shut between releases; ease the hinge through the solver at each transition.
export function timedGateAngle(gate: NonNullable<EntityPhysicalProps['timedGate']>, time: number) {
  const cycle = ((time + gate.phase) % gate.period + gate.period) % gate.period;
  const ramp = Math.min(0.45, gate.openFor / 3);
  const release = gate.releaseAfter === undefined ? 0 : Math.min(1, Math.max(0, (time - gate.releaseAfter) / 0.6));
  const progress = Math.max(release, 0, Math.min(1, cycle / ramp, (gate.openFor - cycle) / ramp));
  return gate.angle * progress * progress * (3 - 2 * progress);
}
