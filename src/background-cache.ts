import type { StageDef } from './data/maps';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Bounds = { x: number; y: number; width: number; height: number; density: number; maxPixels?: number };
type Entry = { stage: StageDef; key: string; canvas: OffscreenCanvas; pixels: number };

// Share one pixel budget across map styles and resolution variants, including inactive maps.
export class BackgroundCache {
  private stages = new Map<StageDef, Map<string, Entry>>();
  private recent = new Set<Entry>();
  private pixels = 0;
  constructor(private budget = 24 * 1024 * 1024, private imageLimit = 16 * 1024 * 1024) {}

  draw(ctx: Context, stage: StageDef, layer: string, bounds: Bounds, paint: (ctx: Context) => void) {
    if (typeof OffscreenCanvas === 'undefined') { paint(ctx); return; }
    const { x, y, width, height } = bounds;
    const density = Math.min(bounds.density, Math.sqrt(Math.min(this.budget, this.imageLimit, bounds.maxPixels ?? this.imageLimit) / (width * height)));
    const pixelWidth = Math.max(1, Math.floor(width * density)), pixelHeight = Math.max(1, Math.floor(height * density));
    const key = `${layer}/${pixelWidth}/${pixelHeight}`;
    let entry = this.stages.get(stage)?.get(key);
    if (!entry) {
      const pixels = pixelWidth * pixelHeight;
      while (this.pixels + pixels > this.budget && this.recent.size) {
        const oldest = this.recent.values().next().value!;
        this.recent.delete(oldest); this.pixels -= oldest.pixels;
        const variants = this.stages.get(oldest.stage)!;
        variants.delete(oldest.key);
        if (!variants.size) this.stages.delete(oldest.stage);
        oldest.canvas.width = oldest.canvas.height = 1;
      }
      const canvas = new OffscreenCanvas(pixelWidth, pixelHeight), target = canvas.getContext('2d')!;
      target.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, -x * pixelWidth / width, -y * pixelHeight / height);
      paint(target);
      entry = { stage, key, canvas, pixels };
      let variants = this.stages.get(stage);
      if (!variants) this.stages.set(stage, variants = new Map());
      variants.set(key, entry); this.pixels += pixels;
    }
    this.recent.delete(entry); this.recent.add(entry);
    ctx.drawImage(entry.canvas, x, y, width, height);
  }
}

export const backgroundCache = new BackgroundCache();
