import { DEFAULT_MAP_INDEX, type StageDef } from './data/maps';
import type { SavedMap } from './model';
import { drawEntities } from './draw';
import { drawMapArt, drawMapOverlay } from './map-art';
import { drawWind } from './wind-render';
import { drawMarble } from './marble-art';
import { el } from './ui';

const details: Record<string, [string, string, string]> = {
  '스프링 놀이터': ['클릭 · 조작', '장치를 클릭해 선택하고 SPACE! 구슬을 밀어내며 1초 만에 돌아오는 스프링.', '#7fe3ff'],
  '회전 차고지': ['기차 · 순환', '반대로 도는 두 기차를 피해, 열린 출구로 탈출하는 순환 철도.', '#bfe5a3'],
  '네온 분기점': ['다섯 갈래', '서로 다른 다섯 파이프, 마지막 항아리에서 만나는 반전.', '#65efda'],
  '욕망의 항아리': ['순환 · 탈출', '빠져나갈 때까지 다시 한 바퀴. 좁은 출구를 노려보세요.', '#91dcff'],
  '네온 잭팟': ['회전 · 역전', '네온 링과 부스터를 지나 마지막 순간까지 뒤집히는 순위.', '#f29fda'],
  '네온 파이프라인': ['곡선 · 질주', '길게 이어지는 굽은 파이프를 타고 끝까지 내려가는 코스.', '#7edcff'],
  '쌍둥이 소용돌이': ['소용돌이', '두 소용돌이와 바람 사이에서 탈출 타이밍을 잡아보세요.', '#c3a4ff'],
  '지그재그 급류': ['급류 · 지름길', '지그재그 급류와 작은 가속 발판, 놓칠 수 없는 지름길.', '#69e7f4'],
  '네온 핀볼 폭포': ['범퍼 · 낙하', '층층이 놓인 플리퍼와 범퍼를 튕기며 내려오는 핀볼.', '#efb979'],
  '카오스 시계탑': ['회전 · 타이밍', '서로 다른 속도의 회전판과 엇갈리는 문을 통과하세요.', '#e8b872'],
  '오비탈 락': ['궤도 · 탈출', '겹겹이 돌아가는 궤도에서 문이 열리는 순간을 기다려요.', '#91bcff'],
  '네온 모래시계': ['게이트 · 방출', '모였다 쏟아지는 구슬, 두 모래시계 속 순위 뒤집기.', '#f0d18a'],
  '균열 협곡': ['협곡 · 급강하', '깊은 암벽 사이의 경사 다리와 스프링 부스터를 달려요.', '#a8d898'],
  '네온 크로스웨이': ['교차 · 합류', '청록과 금빛 선로를 오가며 하나의 결승선으로 합류해요.', '#65e4f5'],
  '스위치백 익스프레스': ['철교 · 지름길', '밤의 철교를 따라 급커브를 돌고, 열린 지름길로 질주해요.', '#edcb8b'],
};

function drawThumbnail(canvas: HTMLCanvasElement, stage: StageDef) {
  const ctx = canvas.getContext('2d')!;
  const w = 280, h = 300, width = stage.width ?? 26, top = -2;
  const scale = Math.min((w - 36) / (width + 2), (h - 40) / (stage.goalY + 4 - top));
  canvas.width = w * 2;
  canvas.height = h * 2;
  ctx.scale(2, 2);
  ctx.translate((w - width * scale) / 2, 20 - top * scale);
  ctx.scale(scale, scale);
  const entities = (stage.entities ?? []).map((entity) => ({
    x: entity.position.x, y: entity.position.y,
    angle: entity.shape.type === 'polyline' ? entity.shape.rotation : 0,
    shape: entity.shape, life: -1,
  }));
  // Draw once at thumbnail resolution; keep the full-resolution game caches untouched.
  drawMapArt(ctx, stage, scale, false);
  drawEntities(ctx, stage.exitBridge ? entities.filter(e => e.shape.collisionLayer !== 2) : entities,
    scale, -1, true, undefined, !!stage.art);
  drawWind(ctx, stage.windZones ?? [], 1, scale);
  drawMapOverlay(ctx, stage, entities, scale, false);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#91f4de';
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash([1.5 / scale, 2 / scale]);
  ctx.beginPath(); ctx.moveTo(0, stage.goalY); ctx.lineTo(width, stage.goalY); ctx.stroke();
  ctx.setLineDash([]);
  ['#80f6de', '#ffd784', '#bdabff'].forEach((color, i) =>
    drawMarble(ctx, (stage.spawnX ?? 12.85) + (i - 1) * 0.85, 4, 0.4, color));
  canvas.dataset.rendered = 'true';
}

export class MapGallery {
  private grid = el('map-grid');
  private thumbnails = new WeakMap<StageDef, HTMLCanvasElement>();
  private stages = new WeakMap<HTMLCanvasElement, StageDef>();
  private observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      const canvas = entry.target as HTMLCanvasElement;
      drawThumbnail(canvas, this.stages.get(canvas)!);
      this.observer.unobserve(canvas);
    }
  }, { rootMargin: '240px' });

  constructor(select: (id: string) => void) {
    this.grid.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-id]');
      if (card) select(card.dataset.mapId!);
    });
    el<HTMLImageElement>('canyon-rock-texture').addEventListener('load', () => {
      for (const canvas of this.grid.querySelectorAll<HTMLCanvasElement>('canvas[data-rendered]')) {
        const stage = this.stages.get(canvas)!;
        if (stage.art?.style === 'fracture-canyon') drawThumbnail(canvas, stage);
      }
    });
  }

  refresh(maps: SavedMap[], selected: string) {
    this.observer.disconnect();
    const defaultId = `builtin-${DEFAULT_MAP_INDEX}`;
    const ordered = [...maps.filter(map => map.id === defaultId), ...maps.filter(map => map.id !== defaultId)];
    const cards = ordered.map((map, index) => {
      const custom = !map.id.startsWith('builtin-');
      const [tag, description, color] = custom
        ? ['내 맵', '직접 만든 코스에서 구슬을 굴려보세요.', '#a5baff']
        : details[map.stage.title] ?? ['핀볼', '이 맵에서 새로운 경주를 시작해 보세요.', '#65efda'];
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'map-card';
      card.dataset.mapId = map.id;
      card.setAttribute('aria-label', `${map.stage.title} · 맵 선택`);
      if (map.id === selected) card.setAttribute('aria-current', 'true');
      card.style.setProperty('--map-color', color);
      card.innerHTML = `<span class="map-preview"><span class="map-card-number" aria-hidden="true"></span><span class="map-card-tag"></span></span><span class="map-card-body"><span class="map-card-title"></span><span class="map-card-description"></span><span class="map-card-action">이 맵 선택 <span aria-hidden="true">↗</span></span></span>`;
      card.querySelector('.map-card-number')!.textContent = String(index + 1).padStart(2, '0');
      card.querySelector('.map-card-tag')!.textContent = tag;
      card.querySelector('.map-card-title')!.textContent = map.stage.title;
      card.querySelector('.map-card-description')!.textContent = description;
      let canvas = this.thumbnails.get(map.stage);
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 560; canvas.height = 600; canvas.setAttribute('aria-hidden', 'true');
        this.thumbnails.set(map.stage, canvas); this.stages.set(canvas, map.stage);
      }
      card.querySelector('.map-preview')!.append(canvas);
      return card;
    });
    this.grid.replaceChildren(...cards);
    el('gallery-count').textContent = String(maps.length).padStart(2, '0');
    for (const canvas of this.grid.querySelectorAll<HTMLCanvasElement>('canvas:not([data-rendered])'))
      this.observer.observe(canvas);
  }

  focus(id: string) {
    const card = [...this.grid.querySelectorAll<HTMLButtonElement>('[data-map-id]')].find(c => c.dataset.mapId === id);
    (card ?? el('gallery-title')).focus({ preventScroll: true });
  }
}
