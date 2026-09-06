import { blankStage, cloneStage, validateStage, type SavedMap } from './model';
import type { StageDef } from './data/maps';
import type { MapEntity } from './types/MapEntity.type';
import { drawEntities } from './draw';
import { el, toast, message } from './ui';

type Tool = 'select' | 'wall' | 'freehand' | 'pin' | 'bumper' | 'ramp' | 'rotor';
type Point = { x: number; y: number };
type EditorActions = {
  list: () => SavedMap[];
  save: (stage: StageDef, id: string | null) => string;
  remove: (id: string) => void;
  play: (stage: StageDef) => void;
};
const SCALE = 25;
const HELP: Record<Tool, string> = {
  select: '장애물을 선택하고 드래그해서 옮기세요. Delete로 삭제할 수 있어요.',
  wall: '시작점부터 끝점까지 드래그하면 벽이 만들어집니다.',
  freehand: '마우스를 누른 채 그리면 곡선 벽이 됩니다. 자유 그리기는 격자에 맞추지 않습니다.',
  pin: '배치할 곳을 클릭하세요. 작은 원형 핀이 만들어집니다.',
  bumper: '배치할 곳을 클릭하세요. 구슬을 튕겨 내는 범퍼가 만들어집니다.',
  ramp: '클릭해서 반사판을 배치한 뒤 속성에서 기울기를 바꾸세요.',
  rotor: '클릭해서 회전 장애물을 배치하세요. 회전 속도를 바꿀 수 있어요.',
};
export class Editor {
  private stage = blankStage();
  private id: string | null = null;
  private dirty = false;
  private hasDraft = false;
  private selected = -1;
  private tool: Tool = 'select';
  private history: StageDef[] = [];
  private future: StageDef[] = [];
  private drag: { start: Point; original: Point; before: StageDef; moved: boolean } | null = null;
  private stroke: Point[] = [];
  private wallEnd: Point | null = null;
  private canvas = el<HTMLCanvasElement>('editor-canvas');
  private ctx = this.canvas.getContext('2d')!;
  private dialog = el<HTMLDialogElement>('editor-dialog');
  constructor(private actions: EditorActions) {
    this.canvas.width = 26 * SCALE;
    el('tools').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tool]');
      if (b) this.setTool(b.dataset.tool as Tool);
    });
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => {
      this.move(e);
      this.up();
    });
    this.canvas.addEventListener('lostpointercapture', () => this.cancelDrag());
    this.canvas.addEventListener('pointercancel', () => this.cancelDrag());
    this.dialog.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).matches('input,textarea,select')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.removeEntity();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? this.redo() : this.undo();
      }
    });
    el('editor-close').addEventListener('click', () => this.dialog.close());
    el('editor-new').addEventListener('click', () => {
      if (this.discardAllowed()) this.load(blankStage(), null);
    });
    el('editor-load').addEventListener('click', () => {
      const selected = this.actions.list().find((m) => m.id === el<HTMLSelectElement>('editor-library').value);
      if (selected && this.discardAllowed()) this.load(selected.stage, selected.id);
    });
    el('editor-delete-map').addEventListener('click', () => {
      const id = el<HTMLSelectElement>('editor-library').value;
      const m = this.actions.list().find((m) => m.id === id);
      if (!m || id.startsWith('builtin-')) {
        toast('기본 맵은 삭제할 수 없어요.');
        return;
      }
      if (!confirm(`“${m.stage.title}”을 이 브라우저에서 삭제할까요?`)) return;
      try {
        this.actions.remove(id);
        if (this.id === id) this.id = null;
        this.refreshLibrary();
        toast('저장된 맵을 삭제했어요.');
      } catch (e) {
        toast(message(e));
      }
    });
    el('editor-save').addEventListener('click', () => {
      try {
        const stage = validateStage(this.stage);
        this.id = this.actions.save(stage, this.id);
        this.dirty = false;
        this.dialog.close();
        toast('이 브라우저에 맵을 저장하고 적용했어요.');
      } catch (e) {
        toast(`저장하지 못했어요. ${message(e)}`);
      }
    });
    el('editor-test').addEventListener('click', () => {
      try {
        this.actions.play(validateStage(this.stage));
        this.dialog.close();
        toast('미리 플레이 중이에요. 위의 맵 편집 버튼으로 돌아갈 수 있어요.');
      } catch (e) {
        toast(message(e));
      }
    });
    el('editor-export').addEventListener('click', () => {
      try {
        const stage = validateStage(this.stage);
        const url = URL.createObjectURL(
          new Blob([JSON.stringify({ format: 'marble-pinball-map', version: 1, stage }, null, 2)], {
            type: 'application/json',
          })
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = `${stage.title.replace(/[<>:"/\\|?*]/g, '_')}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        this.dirty = false;
        el('editor-status').textContent = '맵 파일을 내보냈어요. 브라우저 보관함에는 저장하고 적용을 눌러 주세요.';
      } catch (e) {
        toast(message(e));
      }
    });
    el('editor-import').addEventListener('click', () => el<HTMLInputElement>('map-file').click());
    el('map-file').addEventListener('change', async () => {
      const input = el<HTMLInputElement>('map-file'),
        file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('맵 파일은 2MB 이하로 가져와 주세요.');
        const data = JSON.parse(await file.text());
        if (data.format !== 'marble-pinball-map' || data.version !== 1)
          throw new Error('마블 핀볼에서 내보낸 맵 파일을 선택해 주세요.');
        const stage = validateStage(data.stage);
        if (this.discardAllowed()) {
          this.load(stage, null);
          this.markDirty();
          toast('맵 파일을 불러왔어요. 저장하면 보관함에 추가됩니다.');
        }
      } catch (e) {
        toast(message(e));
      } finally {
        input.value = '';
      }
    });
    el('undo').addEventListener('click', () => this.undo());
    el('redo').addEventListener('click', () => this.redo());
    el('delete-entity').addEventListener('click', () => this.removeEntity());
    el('duplicate').addEventListener('click', () => {
      const e = this.stage.entities?.[this.selected];
      if (!e) return;
      this.checkpoint();
      const copy = JSON.parse(JSON.stringify(e)) as MapEntity;
      copy.position.x += 0.75;
      copy.position.y += 0.75;
      this.stage.entities!.push(copy);
      this.selected = this.stage.entities!.length - 1;
      this.changed();
    });
    el('map-name').addEventListener('change', () => {
      this.checkpoint();
      this.stage.title = el<HTMLInputElement>('map-name').value;
      this.changed();
    });
    el('map-height').addEventListener('change', () => {
      const height = Number(el<HTMLInputElement>('map-height').value);
      if (!Number.isFinite(height) || height < 20 || height > 300) {
        toast('결승선 높이는 20~300 사이로 입력해 주세요.');
        el<HTMLInputElement>('map-height').value = String(this.stage.goalY);
        return;
      }
      this.checkpoint();
      this.stage.goalY = height;
      this.stage.zoomY = height - 5;
      this.changed();
    });
    for (const id of [
      'prop-x',
      'prop-y',
      'prop-width',
      'prop-height',
      'prop-angle',
      'prop-radius',
      'prop-bounce',
      'prop-spin',
      'prop-color',
    ])
      el(id).addEventListener('change', () => this.updateProperty(id));
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
  open(stage?: StageDef, id: string | null = null) {
    if (stage) {
      if (!this.discardAllowed()) return;
      this.load(stage, id);
    } else if (!this.hasDraft) this.load(blankStage(), null);
    this.refreshLibrary();
    this.dialog.showModal();
    this.render();
  }
  private load(stage: StageDef, id: string | null) {
    this.stage = cloneStage(stage);
    this.id = id;
    this.hasDraft = true;
    this.dirty = false;
    this.selected = -1;
    this.history = [];
    this.future = [];
    this.syncFields();
    this.setTool('select');
    el('editor-scroll').scrollTop = 0;
    el('editor-status').textContent = id?.startsWith('builtin-')
      ? '기본 맵을 수정하면 내 맵으로 저장됩니다.'
      : '맵을 편집한 후 저장해 주세요.';
  }
  private discardAllowed() {
    return !this.dirty || confirm('현재 수정한 맵을 저장하지 않고 다른 맵을 열까요?');
  }
  private refreshLibrary() {
    const select = el<HTMLSelectElement>('editor-library');
    select.replaceChildren();
    for (const m of this.actions.list())
      select.add(new Option(`${m.id.startsWith('builtin-') ? '기본 · ' : '내 맵 · '}${m.stage.title}`, m.id));
    if (this.id) select.value = this.id;
  }
  private setTool(tool: Tool) {
    this.cancelDrag();
    this.tool = tool;
    el('tools')
      .querySelectorAll<HTMLButtonElement>('[data-tool]')
      .forEach((b) => b.classList.toggle('selected', b.dataset.tool === tool));
    el('tool-help').textContent = HELP[tool];
    this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }
  private markDirty() {
    this.dirty = true;
    el('editor-status').textContent = '저장하지 않은 변경사항이 있어요.';
  }
  private checkpoint() {
    this.history.push(cloneStage(this.stage));
    if (this.history.length > 60) this.history.shift();
    this.future = [];
  }
  private changed() {
    this.markDirty();
    this.syncFields();
    this.render();
  }
  private undo() {
    if (!this.history.length) return;
    this.future.push(cloneStage(this.stage));
    this.stage = this.history.pop()!;
    this.selected = -1;
    this.changed();
  }
  private redo() {
    if (!this.future.length) return;
    this.history.push(cloneStage(this.stage));
    this.stage = this.future.pop()!;
    this.selected = -1;
    this.changed();
  }
  private point(e: PointerEvent): Point {
    const r = this.canvas.getBoundingClientRect();
    const unit = r.width / (this.stage.width ?? 26);
    let x = (e.clientX - r.left) / unit,
      y = (e.clientY - r.top) / unit;
    if (this.tool !== 'freehand' && el<HTMLInputElement>('snap').checked) {
      x = Math.round(x * 2) / 2;
      y = Math.round(y * 2) / 2;
    }
    return { x: Math.max(0, Math.min(this.stage.width ?? 26, x)), y: Math.max(0, Math.min(this.stage.goalY + 2, y)) };
  }
  private down(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const p = this.point(event);
    this.canvas.setPointerCapture(event.pointerId);
    if (this.tool === 'select') {
      this.selected = this.hit(p);
      const e = this.stage.entities?.[this.selected];
      if (e) this.drag = { start: p, original: { ...e.position }, before: cloneStage(this.stage), moved: false };
      this.syncFields();
      this.render();
      return;
    }
    if (this.tool === 'wall' || this.tool === 'freehand') {
      if ((this.stage.entities?.length ?? 0) >= 2000) {
        toast('장애물은 최대 2,000개까지 만들 수 있어요.');
        return;
      }
      this.stroke = this.tool === 'freehand' ? [p] : [];
      this.drag = { start: p, original: p, before: cloneStage(this.stage), moved: false };
      this.wallEnd = p;
      return;
    }
    if ((this.stage.entities?.length ?? 0) >= 2000) {
      toast('장애물은 최대 2,000개까지 만들 수 있어요.');
      return;
    }
    this.checkpoint();
    const circle = this.tool === 'pin' || this.tool === 'bumper';
    const entity: MapEntity = {
      position: p,
      type: this.tool === 'rotor' ? 'kinematic' : 'static',
      shape: circle
        ? {
            type: 'circle',
            radius: this.tool === 'bumper' ? 0.65 : 0.22,
            color: this.tool === 'bumper' ? '#f2ba6f' : '#65efda',
          }
        : {
            type: 'box',
            width: this.tool === 'rotor' ? 2 : 2.5,
            height: 0.15,
            rotation: this.tool === 'ramp' ? 0.3 : 0,
            color: '#65efda',
          },
      props: {
        density: 1,
        restitution: this.tool === 'bumper' ? 1.25 : 0.35,
        angularVelocity: this.tool === 'rotor' ? 1.5 : 0,
      },
    };
    this.stage.entities!.push(entity);
    this.selected = this.stage.entities!.length - 1;
    this.changed();
  }
  private move(event: PointerEvent) {
    if (!this.drag) return;
    const p = this.point(event);
    if (this.tool === 'freehand') {
      const last = this.stroke.at(-1)!;
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 0.12) {
        this.stroke.push(p);
        if (this.stroke.length === 1000) {
          this.up();
          toast('긴 선을 완성했어요. 이어서 그리려면 다시 눌러 주세요.');
          return;
        }
      }
      this.render();
      return;
    }
    if (this.tool === 'wall') {
      this.wallEnd = p;
      this.render();
      return;
    }
    const e = this.stage.entities?.[this.selected];
    if (!e) return;
    const dx = p.x - this.drag.start.x,
      dy = p.y - this.drag.start.y;
    if (dx || dy) this.drag.moved = true;
    e.position = { x: this.drag.original.x + dx, y: this.drag.original.y + dy };
    this.syncFields();
    this.render();
  }
  private up() {
    if (!this.drag) return;
    if ((this.tool === 'wall' || this.tool === 'freehand') && this.wallEnd) {
      const a = this.drag.start,
        b = this.wallEnd;
      if (this.tool === 'freehand' ? this.stroke.length > 1 : Math.hypot(a.x - b.x, a.y - b.y) > 0.2) {
        this.checkpoint();
        this.stage.entities!.push({
          position: { x: 0, y: 0 },
          type: 'static',
          shape: {
            type: 'polyline',
            rotation: 0,
            points:
              this.tool === 'freehand'
                ? this.stroke.map((p) => [p.x, p.y])
                : [
                    [a.x, a.y],
                    [b.x, b.y],
                  ],
          },
          props: { density: 1, restitution: 0.15, angularVelocity: 0 },
        });
        this.selected = this.stage.entities!.length - 1;
        this.changed();
      }
    } else if (this.drag.moved) {
      this.history.push(this.drag.before);
      this.future = [];
      this.markDirty();
    }
    this.drag = null;
    this.stroke = [];
    this.wallEnd = null;
    this.syncFields();
    this.render();
  }
  private cancelDrag() {
    if (this.drag) {
      this.stage = this.drag.before;
      this.drag = null;
      this.stroke = [];
      this.wallEnd = null;
      this.syncFields();
      this.render();
    }
  }
  private hit(p: Point) {
    const entities = this.stage.entities ?? [];
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i],
        s = e.shape;
      let x = p.x - e.position.x,
        y = p.y - e.position.y;
      if (s.type === 'circle' && Math.hypot(x, y) < s.radius + 0.35) return i;
      if (s.type === 'box') {
        const c = Math.cos(s.rotation),
          sn = Math.sin(s.rotation);
        const localX = x * c + y * sn,
          localY = -x * sn + y * c;
        if (Math.abs(localX) <= s.width + 0.2 && Math.abs(localY) <= s.height + 0.3) return i;
      }
      if (s.type === 'polyline') {
        for (let j = 1; j < s.points.length; j++) {
          const [ax, ay] = s.points[j - 1],
            [bx, by] = s.points[j],
            dx = bx - ax,
            dy = by - ay;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
          if (Math.hypot(x - ax - t * dx, y - ay - t * dy) < 0.4) return i;
        }
      }
    }
    return -1;
  }
  private removeEntity() {
    if (this.selected < 0) return;
    this.checkpoint();
    this.stage.entities!.splice(this.selected, 1);
    this.selected = -1;
    this.changed();
  }
  private updateProperty(id: string) {
    const original = this.stage.entities?.[this.selected];
    if (!original) return;
    const e = JSON.parse(JSON.stringify(original)) as MapEntity;
    const input = el<HTMLInputElement>(id),
      v = Number(input.value);
    if (id !== 'prop-color' && (!input.checkValidity() || !Number.isFinite(v))) {
      toast('속성 값을 확인해 주세요.');
      this.syncFields();
      return;
    }
    if (id === 'prop-x') e.position.x = v;
    else if (id === 'prop-y') e.position.y = v;
    else if (id === 'prop-color') e.shape.color = input.value;
    else if (id === 'prop-bounce') e.props.restitution = v;
    else if (id === 'prop-spin') {
      e.props.angularVelocity = (v * Math.PI) / 180;
      e.type = v ? 'kinematic' : 'static';
    } else if (e.shape.type === 'box') {
      if (id === 'prop-width') e.shape.width = v / 2;
      if (id === 'prop-height') e.shape.height = v / 2;
      if (id === 'prop-angle') e.shape.rotation = (v * Math.PI) / 180;
    } else if (e.shape.type === 'circle' && id === 'prop-radius') e.shape.radius = v;
    try {
      const candidate = cloneStage(this.stage);
      candidate.entities![this.selected] = e;
      validateStage(candidate);
      this.checkpoint();
      this.stage = candidate;
      this.changed();
    } catch (error) {
      toast(message(error));
      this.syncFields();
    }
  }
  private syncFields() {
    el<HTMLInputElement>('map-name').value = this.stage.title;
    el<HTMLInputElement>('map-height').value = String(this.stage.goalY);
    const e = this.stage.entities?.[this.selected];
    el<HTMLFieldSetElement>('entity-properties').disabled = !e;
    el('selection-empty').hidden = !!e;
    el('box-properties').hidden = e?.shape.type !== 'box';
    el('circle-properties').hidden = e?.shape.type !== 'circle';
    el<HTMLButtonElement>('undo').disabled = !this.history.length;
    el<HTMLButtonElement>('redo').disabled = !this.future.length;
    if (!e) return;
    const put = (id: string, v: number) => (el<HTMLInputElement>(id).value = String(Math.round(v * 100) / 100));
    put('prop-x', e.position.x);
    put('prop-y', e.position.y);
    put('prop-bounce', e.props.restitution);
    put('prop-spin', (e.props.angularVelocity * 180) / Math.PI);
    const color = e.shape.color ?? '#65efda';
    el<HTMLInputElement>('prop-color').value =
      color.length === 4 ? '#' + [...color.slice(1)].map((c) => c + c).join('') : color;
    if (e.shape.type === 'box') {
      put('prop-width', e.shape.width * 2);
      put('prop-height', e.shape.height * 2);
      put('prop-angle', (((((e.shape.rotation * 180) / Math.PI + 180) % 360) + 360) % 360) - 180);
    }
    if (e.shape.type === 'circle') put('prop-radius', e.shape.radius);
  }
  private render() {
    this.canvas.width = (this.stage.width ?? 26) * SCALE;
    this.canvas.height = (this.stage.goalY + 3) * SCALE;
    const c = this.ctx;
    c.fillStyle = '#0e181f';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    c.scale(SCALE, SCALE);
    c.strokeStyle = '#23323d';
    c.lineWidth = 0.5 / SCALE;
    for (let x = 0; x <= (this.stage.width ?? 26); x++) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, this.stage.goalY + 3);
      c.stroke();
    }
    for (let y = 0; y <= this.stage.goalY + 3; y++) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(this.stage.width ?? 26, y);
      c.stroke();
    }
    c.fillStyle = '#65efda0e';
    c.fillRect(9.25, 0, 7.25, 6.5);
    c.font = '.45px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#94bdb5';
    c.fillText('출발 영역', 12.8, 2);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = `hsl(${i * 85} 90% 75%)`;
      c.beginPath();
      c.arc(11.8 + i * 0.65, 4, 0.25, 0, Math.PI * 2);
      c.fill();
    }
    const entities = (this.stage.entities ?? []).map((e) => ({
      x: e.position.x,
      y: e.position.y,
      angle: 0,
      shape: e.shape,
      life: e.props.life ?? -1,
    }));
    drawEntities(c, entities, SCALE, this.selected, false);
    c.setLineDash([0.5, 0.3]);
    c.strokeStyle = '#65efda';
    c.lineWidth = 2 / SCALE;
    c.beginPath();
    c.moveTo(0, this.stage.goalY);
    c.lineTo(this.stage.width ?? 26, this.stage.goalY);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#65efda';
    c.font = '.5px sans-serif';
    c.textAlign = 'left';
    c.fillText('FINISH · 결승선', 1, this.stage.goalY + 1);
    if (this.drag && this.wallEnd) {
      c.strokeStyle = '#fff';
      c.lineWidth = 2 / SCALE;
      c.beginPath();
      c.moveTo(this.drag.start.x, this.drag.start.y);
      if (this.tool === 'freehand') this.stroke.forEach((p) => c.lineTo(p.x, p.y));
      else c.lineTo(this.wallEnd.x, this.wallEnd.y);
      c.stroke();
    }
    c.restore();
    el('entity-count').textContent = `장애물 ${entities.length}개`;
  }
}
