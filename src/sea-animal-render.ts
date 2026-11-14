import { DolphinRenderer } from './dolphin-render';
import { DOLPHIN_DURATION, type DolphinSettings } from './dolphin';
import type { AnimalKind } from './sea-animals';

export class SeaAnimalRenderer {
  kind: AnimalKind = 'dolphin';
  private dolphin = new DolphinRenderer();
  private manta = new DolphinRenderer('manta');
  previewTime(settings: DolphinSettings, elapsed: number, reducedMotion: boolean) {
    if (!reducedMotion) return elapsed;
    const manta = settings.manta;
    if (manta?.enabled && !settings.enabled) return DOLPHIN_DURATION / (2 * (manta.speed ?? 1));
    return DOLPHIN_DURATION / (2 * (settings.speed ?? 1));
  }
  guides(...args: Parameters<DolphinRenderer['guides']>) {
    (this.kind === 'manta' ? this.manta : this.dolphin).guides(...args);
  }
  draw(...args: Parameters<DolphinRenderer['draw']>) {
    this.dolphin.draw(...args);
    this.manta.draw(...args);
  }
}
