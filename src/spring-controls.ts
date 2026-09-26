import type { MapEntityState } from './types/MapEntity.type';
// Selection is local; activation is performed by the authoritative race.
export class SpringControls {
  selected = -1;
  private selectedShape?: MapEntityState['shape'];
  private entities: MapEntityState[] = [];
  private statuses = new Map<number, { until: number; busy: boolean }>();
  setStatuses(statuses: [number, number, boolean][]) {
    const now = performance.now();
    this.statuses = new Map(statuses.map(([i, remaining, busy]) => [i, { until: now + remaining, busy }]));
  }
  private label(index: number) {
    const shape = this.entities[index]?.shape;
    if (shape?.type !== 'box' || !shape.spring) return '';
    const scope = shape.spring.cooldown?.scope === 'shared' ? '공통' : '개인';
    const status = this.statuses.get(index), seconds = Math.max(0, (status?.until ?? 0) - performance.now()) / 1000;
    return scope + ' · ' + (seconds > 0 ? Math.ceil(seconds) + '초' : status?.busy ? '복귀 중' : '사용 가능');
  }
  private transform = { x: 0, y: 0, scale: 1 };
  constructor(private canvas: HTMLCanvasElement, private activate: (index: number) => void, private running: () => boolean) {
    window.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || event.repeat || this.selected < 0 || !this.running() ||
        target?.isContentEditable || ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(target?.tagName ?? '') ||
        !this.canvas.getBoundingClientRect().width || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      const status = this.statuses.get(this.selected);
      if (!status?.busy && (status?.until ?? 0) <= performance.now()) this.activate(this.selected);
    });
  }
  reset() { this.selected = -1; this.entities = []; this.statuses.clear(); }
  select(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType !== 'touch') return false;
    const r = this.canvas.getBoundingClientRect(), t = this.transform;
    const x = (event.clientX - r.left - t.x) / t.scale, y = (event.clientY - r.top - t.y) / t.scale;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i], s = e.shape;
      if (s.type !== 'box' || !s.spring) continue;
      const a = -(e.angle + s.rotation), dx = x-e.x, dy = y-e.y;
      if (Math.abs(dx*Math.cos(a)-dy*Math.sin(a)) <= s.width + 0.35 &&
        Math.abs(dx*Math.sin(a)+dy*Math.cos(a)) <= s.height + 0.35) {
        this.selected = i; this.selectedShape = s;
        // Remove button focus so Space operates the device instead of clicking Start again.
        (document.activeElement as HTMLElement | null)?.blur();
        return true;
      }
    }
    this.selected = -1; return false;
  }
  draw(ctx: CanvasRenderingContext2D, entities: MapEntityState[], x: number, y: number, scale: number, height: number) {
    if (this.selected >= 0 && entities[this.selected]?.shape !== this.selectedShape) this.selected = -1;
    this.entities = entities; this.transform = {x,y,scale};
    if (!entities.some(e => e.shape.type === 'box' && e.shape.spring)) return;
    ctx.save();ctx.shadowBlur=0;ctx.textAlign='center';ctx.textBaseline='bottom';ctx.font='600 12px sans-serif';
    entities.forEach((e,i)=>{
      if(e.shape.type!=='box'||!e.shape.spring)return;
      const label=this.label(i), px=x+e.x*scale, py=y+(e.y-e.shape.height)*scale-9;
      const width=ctx.measureText(label).width+14;
      ctx.fillStyle='#0a1c26ed';ctx.fillRect(px-width/2,py-17,width,21);
      ctx.fillStyle=e.shape.spring.cooldown?.scope==='shared'?'#ffd77c':'#aee9ed';ctx.fillText(label,px,py);
    });ctx.restore();
    const selected = entities[this.selected];
    ctx.save(); ctx.shadowBlur = 0;
    if (selected?.shape.type === 'box' && selected.shape.spring) {
      const s = selected.shape;
      ctx.translate(x + selected.x * scale, y + selected.y * scale);ctx.rotate(selected.angle+s.rotation);
      ctx.strokeStyle = '#fff3aa';ctx.lineWidth=2;ctx.setLineDash([5,3]);
      ctx.strokeRect(-(s.width+.18)*scale,-(s.height+.18)*scale,(s.width+.18)*2*scale,(s.height+.18)*2*scale);
    }
    ctx.restore();ctx.save();ctx.shadowBlur=0;ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.font='600 13px sans-serif';ctx.fillStyle='#10232ce8';ctx.fillRect(16,height-47,330,30);
    ctx.fillStyle=this.selected<0?'#aee9ed':'#fff3aa';
    ctx.fillText(this.selected<0?'스프링 장치 클릭 → SPACE로 밀어내기':this.running()?this.label(this.selected)+' · SPACE로 발사':'스프링 선택됨 · 경기 시작 후 SPACE',26,height-32);
    ctx.restore();
  }
}
