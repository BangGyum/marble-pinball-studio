import {
  dolphinPose,
  dolphinScale,
  dolphinWaves,
  DOLPHIN_DURATION,
  type DolphinSettings,
  type AnimalOptions,
} from './dolphin';
import { DOLPHIN_HEIGHT, DOLPHIN_SPRITE_WIDTH } from './dolphin-hitbox';
import { MANTA_HEIGHT, MANTA_SPRITE_WIDTH } from './manta-hitbox';
import { mantaPose } from './manta';
import type { StageDef } from './stage-def';

export type AnimalKind = 'dolphin' | 'manta';
export const animalsEnabled = (settings?: DolphinSettings) => !!(settings?.enabled || settings?.manta?.enabled);
export const animalOptions = (settings: DolphinSettings, kind: AnimalKind): AnimalOptions | undefined =>
  kind === 'manta' ? settings.manta : settings;
export const animalPose = (kind: AnimalKind) => (kind === 'manta' ? mantaPose : dolphinPose);
type Wave = { kind: AnimalKind; options: AnimalOptions; wave: number; time: number };

// Stateless race-time scheduling also lets late LAN viewers reconstruct every active wave.
export function animalWaves(settings: DolphinSettings, elapsed: number, preview = false): Wave[] {
  const kind = settings.enabled ? 'dolphin' : 'manta',
    options = animalOptions(settings, kind);
  return options?.enabled ? dolphinWaves(options, elapsed, preview).map((w) => ({ ...w, kind, options })) : [];
}

export function animalPoses(settings: DolphinSettings, stage: StageDef, elapsed: number, dt: number) {
  return animalWaves(settings, elapsed).flatMap(({ kind, options, wave, time }) => {
    const scale = dolphinScale(options),
      speed = options.speed ?? 1;
    if (time + dt * speed > DOLPHIN_DURATION) return [];
    return options.rows.map((row, index) => {
      const direction: 1 | -1 = (wave + index) % 2 ? -1 : 1,
        pose = animalPose(kind),
        before = pose(stage, row, time, direction, scale),
        p = { ...pose(stage, row, time + dt * speed, direction, scale), direction, scale },
        c = Math.abs(Math.cos(p.angle)),
        s = Math.abs(Math.sin(p.angle)),
        width = kind === 'manta' ? MANTA_SPRITE_WIDTH : DOLPHIN_SPRITE_WIDTH,
        height = kind === 'manta' ? MANTA_HEIGHT : DOLPHIN_HEIGHT;
      return {
        kind,
        p,
        wave,
        index,
        motion: {
          vx: (p.x - before.x) / dt,
          vy: (p.y - before.y) / dt,
          omega: (direction * Math.atan2(Math.sin(p.angle - before.angle), Math.cos(p.angle - before.angle))) / dt,
        },
        halfWidth: ((width * c + height * s) * scale) / 2 + 0.25,
        halfHeight: ((width * s + height * c) * scale) / 2 + 0.25,
      };
    });
  });
}
