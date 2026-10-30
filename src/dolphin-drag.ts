import { dolphinBounds, type DolphinSettings } from './dolphin';
import type { StageDef } from './stage-def';

type Transform = { x: number; y: number; scale: number; width: number; height: number };
export class DolphinDrag {
  private view?: Transform;
  private mini?: Transform;
  private row = -1;
  private pointer = -1;
  private transform?: Transform;
  private touchAction = '';
  private grabOffset = 0;
  constructor(private canvas: HTMLCanvasElement, private editable: () => boolean,
    private settings: () => DolphinSettings, private stage: () => StageDef | undefined,
    private move: (index: number, y: number, commit: boolean) => void) {
    const point = (event: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; };
    const hit = (event: PointerEvent) => {
      if (!editable() || !settings().enabled || !this.view) return;
      const p = point(event), m = this.mini;
      const transform = m && p.x >= m.x && p.x <= m.x + m.width && p.y >= m.y && p.y <= m.y + m.height ? m : this.view;
      if (p.x < transform.x || p.x > transform.x + transform.width) return;
      let index = -1, closest = 10;
      settings().rows.forEach((y, i) => { const d = Math.abs(p.y - transform.y - y * transform.scale); if (d < closest) { closest = d; index = i; } });
      return index < 0 ? undefined : { index, transform };
    };
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const row = hit(event); if (!row) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.row = row.index; this.transform = row.transform; this.pointer = event.pointerId;
      this.grabOffset = point(event).y - row.transform.y - settings().rows[row.index] * row.transform.scale;
      this.touchAction = canvas.style.touchAction; canvas.style.touchAction = 'none'; canvas.setPointerCapture(event.pointerId);
    }, true);
    canvas.addEventListener('pointermove', event => {
      if (this.row < 0) { if (editable()) canvas.style.cursor = hit(event) ? 'ns-resize' : ''; return; }
      if (event.pointerId !== this.pointer) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!editable() || !settings().enabled || this.row >= settings().rows.length) { this.end(); return; }
      const rows = settings().rows, bounds = dolphinBounds(stage()!);
      const min = this.row ? rows[this.row - 1] + .5 : bounds.min;
      const max = this.row < rows.length - 1 ? rows[this.row + 1] - .5 : bounds.max;
      const y = Math.max(min, Math.min(max, Math.round((point(event).y - this.grabOffset - this.transform!.y) / this.transform!.scale * 10) / 10));
      move(this.row, y, false);
    }, true);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, event => {
      if (this.row < 0 || event.pointerId !== this.pointer) return;
      event.stopImmediatePropagation(); this.end();
    }, true);
    window.addEventListener('blur', () => this.end());
    canvas.addEventListener('wheel', () => this.end(), true);
  }
  setView(view: Transform, mini: Transform) { this.view = view; this.mini = mini; }
  private end() {
    if (this.row < 0) return;
    const row = this.row, pointer = this.pointer; this.row = -1; this.pointer = -1;
    this.canvas.style.touchAction = this.touchAction; this.canvas.style.cursor = '';
    if (this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    if (this.editable() && this.settings().enabled && row < this.settings().rows.length) this.move(row, this.settings().rows[row], true);
  }
}
