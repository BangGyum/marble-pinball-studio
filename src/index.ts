import { stages, type StageDef } from './data/maps';
import { Game } from './game';
import { parseNames, readSavedMaps, saveMaps, winningRange, type WinnerOrder, type SavedMap } from './model';
import { Recorder } from './recorder';
import { el, toast, message } from './ui';
import { Editor } from './editor';
import { Rankings } from './rankings';

const titles = ['욕망의 항아리', '네온 분기점', '캐스케이드', '네온 파이프라인'];
stages.forEach((s, i) => (s.title = titles[i] ?? s.title));
let saved: SavedMap[] = [];
try {
  saved = readSavedMaps(localStorage);
} catch {
  toast('저장된 맵을 읽지 못했어요. 브라우저의 저장소 설정을 확인해 주세요.');
}
const allMaps = () => [...stages.map((stage, i) => ({ id: `builtin-${i}`, stage })), ...saved];
const game = new Game(el<HTMLCanvasElement>('game'));
const rankings = new Rankings();
const rankingList = el('ranking-list');
const resultLayout = new ResizeObserver(() => {
  const list = rankingList.getBoundingClientRect();
  game.celebrationRightInset = list.width
    ? Math.max(18, game.canvas.getBoundingClientRect().right - list.left + 20)
    : 18;
});
resultLayout.observe(rankingList);
resultLayout.observe(game.canvas);
const names = el<HTMLTextAreaElement>('names'),
  mapSelect = el<HTMLSelectElement>('map-select');
const namesStorageKey = 'marble-pinball.participant-names';
try {
  names.value = localStorage.getItem(namesStorageKey) ?? names.value;
} catch {
  toast('저장된 참가자 이름을 읽지 못했어요.');
}
let namesStorageWarningShown = false;
function saveParticipantNames() {
  try {
    localStorage.setItem(namesStorageKey, names.value);
  } catch {
    if (!namesStorageWarningShown) toast('참가자 이름을 저장하지 못했어요. 브라우저의 저장소 설정을 확인해 주세요.');
    namesStorageWarningShown = true;
  }
}
const mode = el<HTMLSelectElement>('winner-mode'),
  start = el<HTMLButtonElement>('start');
const record = el<HTMLInputElement>('record');
const winnerCount = el<HTMLSelectElement>('winner-count');
const initialMapIndex = stages.findIndex((stage) => stage.title === '네온 분기점');
let currentStage: StageDef = stages[initialMapIndex];
let initialized = false;
const gameView = el('game-view'),
  panel = el('control-panel'),
  panelToggle = el<HTMLButtonElement>('panel-toggle');
function setPanelCollapsed(collapsed: boolean) {
  if (collapsed && panel.contains(document.activeElement)) panelToggle.focus({ preventScroll: true });
  gameView.classList.toggle('controls-collapsed', collapsed);
  panel.inert = collapsed;
  panelToggle.setAttribute('aria-expanded', String(!collapsed));
  el('panel-toggle-label').textContent = collapsed ? '게임 설정' : '설정 접기';
}
panelToggle.addEventListener('click', () => setPanelCollapsed(!panel.inert));
function updateZoom(zoom: number) {
  el('zoom-reset').textContent = Math.round(zoom * 100) + '%';
  el<HTMLButtonElement>('zoom-out').disabled = zoom <= 0.35;
  el<HTMLButtonElement>('zoom-in').disabled = zoom >= 3;
}
game.onZoomChange = updateZoom;
el('zoom-out').addEventListener('click', () => game.setZoom(game.zoom / 1.2));
el('zoom-in').addEventListener('click', () => game.setZoom(game.zoom * 1.2));
el('zoom-reset').addEventListener('click', () => game.setZoom(1));
function refreshMaps(selected = mapSelect.value) {
  mapSelect.replaceChildren();
  for (const m of allMaps()) {
    const o = new Option(`${m.id.startsWith('builtin-') ? '' : '내 맵 · '}${m.stage.title}`, m.id);
    mapSelect.add(o);
  }
  if (allMaps().some((m) => m.id === selected)) mapSelect.value = selected;
  el('map-caption').textContent = currentStage.title;
}
function updateWinnerCount(count: number) {
  const selected = Math.min(count, Math.max(1, Number(winnerCount.value) || 1));
  winnerCount.replaceChildren(...Array.from({ length: count }, (_, i) => new Option(i + 1 + '명', String(i + 1))));
  if (!count) winnerCount.add(new Option('0명', '0'));
  winnerCount.value = String(selected);
}
function updateStandings() {
  rankings.update(game);
}
function lockControls(locked: boolean) {
  for (const id of [
    'names',
    'map-select',
    'winner-mode',
    'winner-count',
    'shuffle',
    'record',
    'edit-current',
    'editor-open',
  ])
    (el(id) as HTMLInputElement).disabled = locked;
  winnerCount.disabled = locked || !game.balls.length;
  if (!Recorder.supported(game.canvas)) record.disabled = true;
  el<HTMLButtonElement>('pause').disabled = !locked;
  start.disabled = locked;
  el('pause').textContent = '일시정지';
}
function prepare() {
  if (!initialized) return;
  try {
    const list = parseNames(names.value);
    game.prepare(currentStage, list);
    updateWinnerCount(list.length);
    updateStandings();
    el('count').textContent = `${list.length}개의 구슬`;
    el('status').textContent = list.length ? '시작할 준비가 됐어요' : '이름을 입력해 주세요';
    lockControls(false);
    setPanelCollapsed(false);
    start.disabled = !list.length;
    el('map-caption').textContent = currentStage.title;
  } catch (e) {
    start.disabled = true;
    el('count').textContent = message(e);
  }
}
let inputTimer: ReturnType<typeof setTimeout>;
names.addEventListener('input', () => {
  saveParticipantNames();
  clearTimeout(inputTimer);
  inputTimer = setTimeout(prepare, 200);
});
el('shuffle').addEventListener('click', () => {
  prepare();
  if (!start.disabled) toast('구슬의 출발 위치를 섞었어요.');
});
el('reset').addEventListener('click', prepare);
mapSelect.addEventListener('change', () => {
  currentStage = allMaps().find((m) => m.id === mapSelect.value)!.stage;
  prepare();
});
el('speed').addEventListener('change', () => (game.speed = Number(el<HTMLSelectElement>('speed').value)));
el('follow').addEventListener('click', () => game.follow());
el('pause').addEventListener('click', () => {
  game.pause();
  el('pause').textContent = game.state === 'paused' ? '계속하기' : '일시정지';
});
function startRace() {
  if (!initialized) throw new Error('게임을 불러오는 중이에요.');
  if (game.state === 'running' || game.state === 'paused') throw new Error('이미 진행 중인 경기가 있어요.');
  clearTimeout(inputTimer);
  const list = parseNames(names.value);
  updateWinnerCount(list.length);
  const order = mode.value as WinnerOrder;
  const range = winningRange(order, list.length, Number(winnerCount.value));
  game.prepare(currentStage, list);
  game.start(range, record.checked, order);
  updateStandings();
  setPanelCollapsed(true);
  lockControls(true);
}
start.addEventListener('click', () => {
  try {
    startRace();
  } catch (e) {
    toast(message(e));
  }
});
game.onFinish = () => {
  updateStandings();
  lockControls(false);
  start.disabled = false;
  el('status').textContent = '모든 구슬이 도착했어요';
};
setInterval(() => {
  if (initialized) updateStandings();
  if (game.state === 'running' || game.state === 'paused')
    el('status').textContent =
      game.state === 'paused'
        ? '잠시 멈췄어요'
        : `${game.recording ? '● 녹화 중 · ' : ''}경주 중 · ${Math.floor(game.elapsed)}초`;
}, 300);
refreshMaps('builtin-' + initialMapIndex);
game
  .init(currentStage, [])
  .then(() => {
    initialized = true;
    prepare();
    if (!Recorder.supported(game.canvas)) {
      record.disabled = true;
      record.closest('label')!.title = '이 브라우저는 녹화를 지원하지 않습니다.';
    }
  })
  .catch((e) => {
    el('status').textContent = '게임을 불러오지 못했어요';
    toast(message(e));
  });

const editor = new Editor({
  list: allMaps,
  save(stage, id) {
    const nextId = id && !id.startsWith('builtin-') ? id : crypto.randomUUID();
    const next = [...saved.filter((m) => m.id !== nextId), { id: nextId, stage }];
    saveMaps(localStorage, next);
    saved = next;
    currentStage = stage;
    refreshMaps(nextId);
    prepare();
    return nextId;
  },
  remove(id) {
    const next = saved.filter((m) => m.id !== id);
    saveMaps(localStorage, next);
    saved = next;
    if (mapSelect.value === id) {
      currentStage = stages[0];
      refreshMaps('builtin-0');
      prepare();
    } else refreshMaps();
  },
  play(stage) {
    currentStage = stage;
    refreshMaps();
    mapSelect.add(new Option(`미리보기 · ${stage.title}`, 'preview'));
    mapSelect.value = 'preview';
    prepare();
    el('editor-open').textContent = '맵 편집으로 돌아가기 ↗';
  },
});
el('editor-open').addEventListener('click', () => {
  if (initialized) {
    game.stopRecording();
    editor.open();
  }
});
el('edit-current').addEventListener('click', () => {
  if (initialized) {
    game.stopRecording();
    editor.open(currentStage, mapSelect.value.startsWith('preview') ? null : mapSelect.value);
  }
});

type AgentTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
const modelContext = (
  document as Document & {
    modelContext?: { registerTool: (tool: AgentTool, options: { signal: AbortSignal }) => void | Promise<void> };
  }
).modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const tools: AgentTool[] = [
    {
      name: 'get_marble_draw',
      title: '바울 추첨 상태 읽기',
      description: '현재 경기 상태, 결과, 선택 가능한 맵을 읽습니다.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        state: game.state,
        map: currentStage.title,
        count: game.balls.length,
        maps: allMaps().map((m) => ({ id: m.id, title: m.stage.title })),
        results: game.arrivals.map((b) => ({ name: b.name, rank: b.rank })),
      }),
    },
    {
      name: 'configure_marble_draw',
      title: '바울 추첨 설정',
      description: '콤마로 구분한 참가자 이름과 맵을 선택하고 구슬을 준비합니다. 경기를 시작하지 않습니다.',
      inputSchema: {
        type: 'object',
        properties: { names: { type: 'string' }, mapId: { type: 'string' } },
        required: ['names', 'mapId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        const v = input as { names?: unknown; mapId?: unknown };
        if (!initialized || game.state === 'running' || game.state === 'paused')
          throw new Error('현재는 추첨 설정을 바꿀 수 없습니다.');
        if (!v || typeof v.names !== 'string' || typeof v.mapId !== 'string')
          throw new Error('참가자 이름과 맵 ID가 필요합니다.');
        const list = parseNames(v.names),
          map = allMaps().find((m) => m.id === v.mapId);
        if (!list.length || !map) throw new Error('참가자 이름 또는 맵이 올바르지 않습니다.');
        names.value = v.names;
        saveParticipantNames();
        currentStage = map.stage;
        mapSelect.value = map.id;
        mode.value = 'asc';
        winnerCount.value = '1';
        record.checked = false;
        prepare();
        return { count: list.length, map: map.stage.title, state: game.state };
      },
    },
    {
      name: 'start_marble_draw',
      title: '바울 추첨 시작',
      description: '화면에 준비된 이름과 당첨 순위 설정으로 경기를 시작합니다.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        startRace();
        return { state: game.state, count: game.balls.length };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {
      /* Older browsers may not support this optional registry. */
    }
  }
}
