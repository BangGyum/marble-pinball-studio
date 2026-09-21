import type { EntityPhysicalProps } from './types/MapEntity.type';

export function rotorPower(cycle: NonNullable<EntityPhysicalProps['spinCycle']>, time: number) {
  const phase = ((time + cycle.phase) % cycle.period + cycle.period) % cycle.period;
  const ramp = Math.min(0.5, cycle.runFor / 3);
  return Math.max(0, Math.min(1, phase / ramp, (cycle.runFor - phase) / ramp));
}
