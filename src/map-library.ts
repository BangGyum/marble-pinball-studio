import type { StageDef } from './stage-def';
import { readSavedMaps, saveMaps, type SavedMap } from './model';

export class MapLibrary {
  private saved: SavedMap[] = [];
  constructor(private builtins: StageDef[]) {}

  load(storage: Pick<Storage, 'getItem'>, onInvalid?: (count: number) => void) {
    this.saved = readSavedMaps(storage, onInvalid);
  }

  list(preview?: StageDef): SavedMap[] {
    return [...this.builtins.map((stage, i) => ({ id: 'builtin-' + i, stage })), ...this.saved,
      ...(preview ? [{ id: 'preview', stage: preview }] : [])];
  }

  save(storage: Pick<Storage, 'getItem' | 'setItem'>, stage: StageDef, id: string | null) {
    const nextId = id && !id.startsWith('builtin-') && id !== 'preview' ? id : crypto.randomUUID();
    const next = [...this.saved.filter((map) => map.id !== nextId), { id: nextId, stage }];
    saveMaps(storage, next);
    this.saved = next;
    return nextId;
  }

  remove(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string) {
    const next = this.saved.filter((map) => map.id !== id);
    saveMaps(storage, next);
    this.saved = next;
  }
}
