import { mapPlayKey, type StageDef } from './data/maps';
import type { SavedMap } from './model';
import { drawEntities } from './draw';
import { drawMapArt, drawMapOverlay, usesGlassRails } from './map-art';
import { drawWind } from './wind-render';
import { drawWater } from './water-render';
import { drawGoalArea } from './finish';
import { drawMarble } from './marble-art';
import { getMarbleDesign } from './marble-design';
import { el } from './ui';
import type { MapPlayKey } from './data/map-play-keys';
import { getMapPlayCount, refreshMapPlays } from './map-plays';
import { GalleryIntro } from './gallery-intro';
import { MapSortControl } from './map-sort-control';
import { MapTransition } from './map-transition';
import { getSceneTheme, sceneColor } from './scene-theme';

const details: Record<string, [string, string, string]> = {
  '도트 파도': [
    '물결 핀 · 범퍼',
    '민트색 핀과 금색 범퍼 사이를 지나요. 굽은 측벽은 구슬을 안쪽으로 돌려보내고, 하단은 핀 간격이 넓어요.',
    '#64f4e0',
  ],
  '밀물 갑문': [
    '수차 · 점프',
    '섬 아래 급류로 추월하고 폭포 수차를 통과하세요. 마지막 점프는 배수구와 움직이는 착지대로 갈려요.',
    '#77d4c4',
  ],
  '막차 곤돌라': [
    '곤돌라 · 두 자리',
    '두 자리 막차를 놓쳐도 승부는 계속! 점프대를 건너고 접이식 다리의 지름길을 노려요.',
    '#85ebbf',
  ],
  '떠도는 입구': [
    '회전 · 포획',
    '공도 돌고 입구도 돌아요. 움직이는 틈을 통과해 중앙 배수구에 들어가면 도착!',
    '#ffd184',
  ],
  '끝없는 나선': [
    '깔때기 · 나선',
    '네 바퀴 나선의 턱에서 튕겨 안쪽으로 추월하세요. 마지막 낙하 통로에도 두 번의 역전 기회가 있어요.',
    '#65efda',
  ],
  '쌍둥이 와류': [
    '깔때기 · 교차',
    '시계 방향에서 반시계 방향으로! 두 깔때기의 중심을 고가 통로로 연결합니다.',
    '#a9bde8',
  ],
  '시소 계곡': ['시소 · 갈림길', '세 번째 시소의 금색 문이 열리면 아래층을 건너뛰며 추월할 수 있어요.', '#e2a267'],
  '샛길 캐스케이드': ['지름길 · 스프링', '네 단의 금속 레일을 타고 샛길로 추월하세요.', '#67e8f9'],
  '역전 사다리': [
    '스프링 · 역전',
    '금속 경사로 네 단과 왕복 열차. 스프링을 선택하고 SPACE로 순위를 뒤집어 보세요.',
    '#ebc689',
  ],
  '스프링 놀이터': [
    '클릭 · 조작',
    '장치를 클릭해 선택하고 SPACE! 구슬을 밀어내며 1초 만에 돌아오는 스프링.',
    '#7fe3ff',
  ],
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
  '균열 협곡': ['협곡 · 급강하', '깊은 암벽 사이의 경사 다리와 스프링 부스터를 달려요.', '#a8d898'],
  '네온 크로스웨이': ['교차 · 합류', '청록과 금빛 선로를 오가며 하나의 결승선으로 합류해요.', '#65e4f5'],
  '스위치백 익스프레스': ['철교 · 지름길', '밤의 철교를 따라 급커브를 돌고, 열린 지름길로 질주해요.', '#edcb8b'],
  '원바운드 샷': [
    '발사 · 원바운드',
    '오른쪽에서 날아온 구슬이 민트 발판에 한 번 튀면 왼쪽 컵으로 들어가요.',
    '#65efda',
  ],
  '구슬 발사 시험장': ['조준 · 발사', '스프링 발사기로 반대편 골인 컵을 맞혀 보세요.', '#ffc675'],
  '반동 계단': ['연쇄 반발', '좌우 발판을 번갈아 튕기며 내려가는 탱탱볼 레이스.', '#ffc26e'],
};

function drawThumbnail(canvas: HTMLCanvasElement, stage: StageDef) {
  const ctx = canvas.getContext('2d')!;
  const w = 280,
    h = 300,
    width = stage.width ?? 26,
    top = -2;
  const scale = Math.min((w - 36) / (width + 2), (h - 40) / (stage.goalY + 4 - top));
  canvas.width = w * 2;
  canvas.height = h * 2;
  ctx.scale(2, 2);
  ctx.translate((w - width * scale) / 2, 20 - top * scale);
  ctx.scale(scale, scale);
  const entities = (stage.entities ?? []).map((entity) => ({
    x: entity.position.x,
    y: entity.position.y,
    angle: entity.shape.type === 'polyline' ? entity.shape.rotation : 0,
    shape: entity.shape,
    life: -1,
  }));
  // Draw once at thumbnail resolution; keep the full-resolution game caches untouched.
  drawMapArt(ctx, stage, scale, false);
  if (stage.waterZones) drawWater(ctx, stage.waterZones, scale);
  drawEntities(
    ctx,
    stage.exitBridge ? entities.filter((e) => e.shape.collisionLayer !== 2) : entities,
    scale,
    -1,
    true,
    undefined,
    usesGlassRails(stage),
    stage.art?.style === 'reversal-ladder'
  );
  drawWind(ctx, stage.windZones ?? [], 1, scale);
  drawMapOverlay(ctx, stage, entities, scale, false);
  ctx.shadowBlur = 0;
  if (!drawGoalArea(ctx, stage, scale)) {
    ctx.strokeStyle = sceneColor('#91f4de');
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([1.5 / scale, 2 / scale]);
    ctx.beginPath();
    ctx.moveTo(0, stage.goalY);
    ctx.lineTo(width, stage.goalY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ['#80f6de', '#ffd784', '#bdabff'].forEach((color, i) => {
    drawMarble(ctx, (stage.spawnX ?? 12.85) + (i - 1) * 0.85, 4, 0.4, color);
  });
  canvas.dataset.rendered = 'true';
  canvas.dataset.theme = getSceneTheme();
  canvas.dataset.marbleDesign = getMarbleDesign();
}

const playCountFormat = new Intl.NumberFormat('ko-KR');

export class MapGallery {
  readonly intro = new GalleryIntro(el('map-gallery'));
  readonly transition = new MapTransition(el('map-gallery'), el('game-view'));
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private returnHighlight?: Animation;
  private grid = el('map-grid');
  private sort = new MapSortControl(el<HTMLSelectElement>('gallery-sort'), this.grid, el('gallery-sort-status'), () =>
    this.intro.stop()
  );
  private view = el('map-gallery');
  private pendingThumbnails = new Set<HTMLCanvasElement>();
  private thumbnailFrame = 0;
  private maps: SavedMap[] = [];
  private selectedId?: string;
  private group: 'builtin' | 'custom' = 'builtin';
  private thumbnails = new WeakMap<StageDef, HTMLCanvasElement>();
  private stages = new WeakMap<HTMLCanvasElement, StageDef>();
  private observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          const canvas = entry.target as HTMLCanvasElement;
          this.pendingThumbnails.add(canvas);
          this.observer.unobserve(canvas);
        }
      if (this.pendingThumbnails.size && !this.thumbnailFrame) {
        this.thumbnailFrame = requestAnimationFrame(() => this.paintThumbnail());
      }
    },
    { rootMargin: '240px' }
  );

  constructor(select: (id: string) => void, reveal: () => void) {
    for (const group of ['builtin', 'custom'] as const)
      el<HTMLButtonElement>(`gallery-filter-${group}`).addEventListener('click', () => {
        if (this.group === group) return;
        this.intro.stop();
        this.group = group;
        this.render();
      });
    for (const event of ['pinball-theme-change', 'pinball-marble-design-change'])
      window.addEventListener(event, () => {
        this.intro.stop();
        this.resetThumbnailQueue();
        for (const canvas of this.grid.querySelectorAll('canvas')) {
          canvas.removeAttribute('data-rendered');
          this.observer.observe(canvas);
        }
      });
    this.grid.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || this.reduced.matches) return;
      const card = (event.target as HTMLElement).closest<HTMLButtonElement>('.map-card');
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--glow-x', `${event.clientX - bounds.left}px`);
      card.style.setProperty('--glow-y', `${event.clientY - bounds.top}px`);
    });
    this.grid.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-id]');
      if (card) {
        this.returnHighlight?.cancel();
        this.returnHighlight = undefined;
        this.intro.stop();
        this.transition.play(card, () => select(card.dataset.mapId!), reveal);
      }
    });
    for (const [id, style] of [
      ['canyon-rock-texture', 'fracture-canyon'],
      ['roundhouse-train', 'roundhouse'],
    ]) {
      el<HTMLImageElement>(id).addEventListener('load', () => {
        for (const { stage } of this.maps) {
          if (stage.art?.style !== style) continue;
          const canvas = this.thumbnails.get(stage);
          if (canvas?.dataset.rendered) drawThumbnail(canvas, stage);
        }
      });
    }
  }

  private resetThumbnailQueue() {
    this.observer.disconnect();
    cancelAnimationFrame(this.thumbnailFrame);
    this.thumbnailFrame = 0;
    this.pendingThumbnails.clear();
  }

  private paintThumbnail() {
    this.thumbnailFrame = 0;
    if (this.view.hidden) {
      this.pendingThumbnails.clear();
      return;
    }
    // Batch the expensive canvas paints across animation frames.
    const canvas = this.pendingThumbnails.values().next().value;
    if (!canvas) return;
    this.pendingThumbnails.delete(canvas);
    if (this.grid.contains(canvas)) drawThumbnail(canvas, this.stages.get(canvas)!);
    if (this.pendingThumbnails.size) this.thumbnailFrame = requestAnimationFrame(() => this.paintThumbnail());
  }

  refresh(maps: SavedMap[], selected: string) {
    if (this.selectedId !== selected) this.group = selected.startsWith('builtin-') ? 'builtin' : 'custom';
    this.selectedId = selected;
    this.maps = maps;
    this.render();
  }

  private render() {
    this.returnHighlight?.cancel();
    this.returnHighlight = undefined;
    this.resetThumbnailQueue();
    const builtin = this.group === 'builtin';
    const maps = this.maps.filter((map) => map.id.startsWith('builtin-') === builtin);
    el('gallery-list-title').textContent = builtin ? '원래 맵' : '내 맵';
    el('gallery-list-description').textContent = builtin
      ? '출발부터 결승선까지, 한눈에 살펴보세요.'
      : '직접 만든 코스를 골라 보세요.';
    el('gallery-empty').hidden = builtin || maps.length > 0;
    el('gallery-storage-note').hidden = builtin;
    this.grid.setAttribute('aria-label', builtin ? '원래 맵 목록' : '내 맵 목록');
    for (const group of ['builtin', 'custom'] as const)
      el<HTMLButtonElement>(`gallery-filter-${group}`).setAttribute('aria-pressed', String(this.group === group));
    const cards = maps.map((map) => {
      const custom = !map.id.startsWith('builtin-');
      const [tag, description, color] = custom
        ? ['내 맵', '직접 만든 코스에서 구슬을 굴려보세요.', '#a5baff']
        : (details[map.stage.title] ?? ['핀볼', '이 맵에서 새로운 경주를 시작해 보세요.', '#65efda']);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'map-card';
      card.dataset.mapId = map.id;
      card.setAttribute('aria-label', `${map.stage.title} · 맵 선택`);
      if (map.id === this.selectedId) card.setAttribute('aria-current', 'true');
      card.style.setProperty('--map-color', color);
      card.innerHTML = `<span class="map-card-heading"><span class="map-card-number" aria-hidden="true"></span><span class="map-card-title"></span></span><span class="map-preview"><span class="map-card-tag"></span></span><span class="map-card-body"><span class="map-card-description"></span><span class="map-card-play-count" hidden></span><span class="map-card-action">이 맵으로 준비 <span class="map-card-ball" aria-hidden="true"></span></span></span>`;
      card.querySelector('.map-card-tag')!.textContent = tag;
      card.querySelector('.map-card-title')!.textContent = map.stage.title;
      card.querySelector('.map-card-description')!.textContent = description;
      const key = custom ? undefined : mapPlayKey(map.stage);
      if (key) card.querySelector<HTMLElement>('.map-card-play-count')!.dataset.playKey = key;
      let canvas = this.thumbnails.get(map.stage);
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 560;
        canvas.height = 600;
        canvas.setAttribute('aria-hidden', 'true');
        this.thumbnails.set(map.stage, canvas);
        this.stages.set(canvas, map.stage);
      }
      card.querySelector('.map-preview')!.append(canvas);
      if (canvas.dataset.theme !== getSceneTheme() || canvas.dataset.marbleDesign !== getMarbleDesign())
        canvas.removeAttribute('data-rendered');
      return { node: card, title: map.stage.title, key };
    });
    this.grid.replaceChildren();
    this.sort.show(this.group, cards);
    if (builtin) {
      this.updatePlayCounts();
      void refreshMapPlays().then(() => this.updatePlayCounts());
    }
    el('gallery-count').textContent = String(maps.length).padStart(2, '0');
    for (const canvas of this.grid.querySelectorAll<HTMLCanvasElement>('canvas:not([data-rendered])'))
      this.observer.observe(canvas);
  }

  updatePlayCounts() {
    for (const label of this.grid.querySelectorAll<HTMLElement>('[data-play-key]')) {
      const count = getMapPlayCount(label.dataset.playKey as MapPlayKey);
      if (count === undefined) continue;
      label.textContent = playCountFormat.format(count) + '회 플레이';
      label.hidden = false;
      label.closest('button')?.setAttribute('aria-description', label.textContent);
    }
    this.sort.refreshCounts();
  }

  focus(id: string, highlight = false) {
    const card = [...this.grid.querySelectorAll<HTMLButtonElement>('[data-map-id]')].find(
      (c) => c.dataset.mapId === id
    );
    (card ?? el('gallery-title')).focus({ preventScroll: true });
    if (!highlight || !card || document.hidden || this.reduced.matches) return;
    const color = getSceneTheme() === 'beige' ? '#a98b65' : card.style.getPropertyValue('--map-color');
    const shadow = getComputedStyle(card).boxShadow;
    const animation = card.animate(
      [
        { boxShadow: shadow },
        { boxShadow: `0 0 0 2px ${color}, 0 0 22px ${color}55`, offset: 0.45 },
        { boxShadow: shadow },
      ],
      { duration: 280, easing: 'ease-out' }
    );
    this.returnHighlight = animation;
    animation.onfinish = () => {
      if (this.returnHighlight === animation) this.returnHighlight = undefined;
    };
  }
}
