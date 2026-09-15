import type { WindZone } from './data/maps';

// Timed fans include a genuine coast interval so a return loop can release its marbles.
export function windPower(wind: WindZone, time: number) {
  const phase = time * (wind.period ? 2 * Math.PI / wind.period : 1.7) + (wind.phase ?? 0);
  if (wind.dutyCycle === undefined) return 1 - (wind.pulse ?? 0) * (0.5 - 0.5 * Math.sin(phase));
  const cycle = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
  const active = cycle < wind.dutyCycle ? Math.sin(Math.PI * cycle / wind.dutyCycle) ** 2 : 0;
  return 1 - (wind.pulse ?? 1) * (1 - active);
}

export function windTravel(wind: WindZone, time: number) {
  const frequency = wind.period ? 2 * Math.PI / wind.period : 1.7;
  const phase = wind.phase ?? 0;
  const pulse = wind.pulse ?? (wind.dutyCycle === undefined ? 0 : 1);
  if (wind.dutyCycle === undefined)
    return time * (1 - pulse / 2) + pulse / 2 * (Math.cos(phase) - Math.cos(time * frequency + phase)) / frequency;
  const duty = wind.dutyCycle;
  const integral = (q: number) => {
    const whole = Math.floor(q), active = Math.min(q - whole, duty);
    return whole * duty / 2 + active / 2 - duty / (4 * Math.PI) * Math.sin(2 * Math.PI * active / duty);
  };
  return time * (1 - pulse) + pulse * 2 * Math.PI / frequency *
    (integral((time * frequency + phase) / (2 * Math.PI)) - integral(phase / (2 * Math.PI)));
}
