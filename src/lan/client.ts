import './lan.css';
import { LanView } from './view';
import { Rankings } from '../rankings';
import { Editor } from '../editor';
import { Recorder } from '../recorder';
import { stages, type StageDef } from '../data/maps';
import { parseNames, winningRange, readSavedMaps, saveMaps, type SavedMap, type WinnerOrder } from '../model';
import { el, toast, message } from '../ui';
import type { Command, Frame, Identity, Info, Scene, ServerMessage, Settings } from './protocol';

const view = new LanView(el<HTMLCanvasElement>('game'));
const rankings = new Rankings((id) => selectBall(view.focusedBallId === id ? null : id));
const rankingList = el('ranking-list'), gameView = el('game-view'), panel = el('control-panel');
const names = el<HTMLTextAreaElement>('names'), mapSelect = el<HTMLSelectElement>('map-select');
const order = el<HTMLSelectElement>('winner-mode'), picks = el<HTMLSelectElement>('winner-count'), record = el<HTMLInputElement>('record');
const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
let socket: WebSocket | undefined, scene: Scene | undefined, frame: Frame | undefined;
let identity: Identity = { type: 'identity', role: 'viewer' };
let info: Info, online = false, retry = 0, sequence = 0, uiUpdate = 0;
let preferredPicks = 2, customStage: StageDef | undefined, saved: SavedMap[] = [];
let inputTimer: ReturnType<typeof setTimeout>, boostTimer: ReturnType<typeof setInterval> | undefined;
const namesKey = 'marble-pinball.participant-names';
try { saved = readSavedMaps(localStorage); } catch { toast('저장된 맵을 읽지 못했어요.'); }
const allMaps = () => [
  ...stages.map((stage, i) => ({ id: 'builtin-' + i, stage: stage.title === '네온 파이프라인'
    ? saved.find((m) => m.stage.title === stage.title)?.stage ?? stage : stage })),
  ...saved.filter((m) => m.stage.title !== '네온 파이프라인'),
  ...(customStage ? [{ id: 'preview', stage: customStage }] : []),
];
function refreshMaps(selected = mapSelect.value) {
  mapSelect.replaceChildren(...allMaps().map((m) => new Option(
    (m.id.startsWith('builtin-') ? '' : m.id === 'preview' ? '미리보기 · ' : '내 맵 · ') + m.stage.title, m.id)));
  if (allMaps().some((m) => m.id === selected)) mapSelect.value = selected;
}
function updatePicks(count: number, preferred = preferredPicks) {
  picks.replaceChildren(...Array.from({ length: count }, (_, i) => new Option((i + 1) + '명', String(i + 1))));
  if (!count) picks.add(new Option('0명', '0'));
  picks.value = String(Math.min(count, preferred));
}
function collapse(collapsed: boolean) {
  if (collapsed && panel.contains(document.activeElement)) el('panel-toggle').focus({ preventScroll: true });
  gameView.classList.toggle('controls-collapsed', collapsed); panel.inert = collapsed;
  el('panel-toggle').setAttribute('aria-expanded', String(!collapsed));
  el('panel-toggle-label').textContent = collapsed ? '게임 설정' : '설정 접기';
}
function selectBall(id: number | null) {
  view.focusedBallId = id;
  if (id !== null) view.follow();
  updateStandings();
}
function updateStandings() {
  rankings.update(view, view.focusedBallId);
  const selected = view.balls.find((b) => b.id === view.focusedBallId);
  el('focus-status').textContent = selected ? selected.name + ' 추적 중 · 목록 바깥 클릭 또는 Esc로 해제' : '자동 관전 중';
}
const resultLayout = new ResizeObserver(() => {
  const list = rankingList.getBoundingClientRect();
  view.celebrationRightInset = list.width ? Math.max(18, view.canvas.getBoundingClientRect().right - list.left + 20) : 18;
});
resultLayout.observe(rankingList); resultLayout.observe(view.canvas);
function updateControls() {
  const hosting = identity.role === 'host', playing = frame?.state === 'running' || frame?.state === 'paused';
  document.body.dataset.role = identity.role; view.canControl = hosting;
  document.querySelectorAll<HTMLElement>('[data-host]').forEach((item) => { item.hidden = !hosting; });
  for (const id of ['names', 'map-select', 'winner-mode', 'winner-count', 'shuffle', 'record', 'edit-current', 'editor-open'])
    (el(id) as HTMLInputElement).disabled = !hosting || !online || !!playing;
  record.disabled ||= !Recorder.supported(view.canvas);
  el<HTMLButtonElement>('start').disabled = !hosting || !online || !!playing || !scene?.balls.length;
  el<HTMLButtonElement>('pause').disabled = !hosting || !online || !playing;
  el<HTMLButtonElement>('reset').disabled = !hosting || !online;
  el<HTMLSelectElement>('speed').disabled = !hosting || !online;
  el('pause').textContent = frame?.state === 'paused' ? '계속하기' : '일시정지';
}
function connection(connected: boolean, status: string) {
  online = connected; el('connection').textContent = status;
  el('connection').dataset.offline = String(!connected); updateControls();
}
function updateRaceUI() {
  if (!scene || !frame) return;
  updateControls(); updateStandings();
  el('count').textContent = scene.balls.length + '개의 구슬';
  el('map-caption').textContent = scene.stage.title;
  el('status').textContent = frame.state === 'ready' ? scene.balls.length ? '시작할 준비가 됐어요' : '이름을 입력해 주세요'
    : frame.state === 'paused' ? '잠시 멈췄어요' : frame.state === 'finished' ? '모든 구슬이 도착했어요'
    : (view.recording ? '● 녹화 중 · ' : '') + '경주 중 · ' + Math.floor(frame.elapsed) + '초';
  el('connection').textContent = online ? '실시간 · ' + frame.connected + '개 화면 연결' : '재접속 중';
  el<HTMLSelectElement>('speed').value = String(frame.speed ?? 1);
}
const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const requestPrefix = Math.random().toString(36).slice(2);
type InputCommand = Command extends infer C ? C extends Command ? Omit<C, 'requestId' | 'raceId'> : never : never;
function command(input: InputCommand) {
  return new Promise<void>((resolve, reject) => {
    if (!online || !scene || socket?.readyState !== WebSocket.OPEN) return reject(new Error('서버에 다시 연결될 때까지 기다려 주세요.'));
    const requestId = requestPrefix + '_' + ++sequence;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('응답을 확인하지 못했어요. 현재 경기 상태를 확인해 주세요.')); }, 5000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ ...input, requestId, raceId: scene.raceId }));
  });
}
const run = (input: InputCommand) => command(input).catch((error) => toast(message(error)));
function inputSettings(): Settings {
  const count = parseNames(names.value).length, map = allMaps().find((m) => m.id === mapSelect.value);
  if (!map) throw new Error('맵을 선택해 주세요.');
  updatePicks(count);
  if (count) winningRange(order.value as WinnerOrder, count, Number(picks.value));
  const builtin = map.id.startsWith('builtin-') ? Number(map.id.slice(8)) : 0;
  return { names: names.value, mapId: builtin, order: order.value as WinnerOrder, picks: Number(picks.value),
    ...(map.id.startsWith('builtin-') && map.stage === stages[builtin] ? {} : { stage: map.stage }) };
}
async function prepare(force = false) {
  clearTimeout(inputTimer);
  const settings = inputSettings();
  if (force || JSON.stringify(settings) !== JSON.stringify(scene?.settings)) await command({ type: 'configure', settings });
}
const prepareUI = (force = false) => prepare(force).catch((error) => { el('count').textContent = message(error); toast(message(error)); });
function setAddress() {
  const address = info.addresses[Number(el<HTMLSelectElement>('address').value)];
  if (address) { el<HTMLAnchorElement>('join-url').href = address.url; el('join-url').textContent = address.url; }
}
async function connect() {
  connection(false, retry ? '재접속 중' : '서버에 연결 중');
  try {
    const response = await fetch(isLocal ? '/api/host-session' : '/api/session', { method: 'POST' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    identity = data; info = await (await fetch('/api/info')).json();
    info.maps.forEach((map) => { stages[map.id].title = map.title; });
    refreshMaps();
    el<HTMLSelectElement>('address').replaceChildren(...info.addresses.map((a, i) => new Option(a.name, String(i))));
    setAddress();
    socket = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/live');
    socket.onopen = () => { retry = 0; connection(true, '실시간 연결됨'); };
    socket.onmessage = (event) => {
      const incoming = JSON.parse(event.data) as ServerMessage;
      if (incoming.type === 'scene') {
        const first = !scene, different = scene?.raceId !== incoming.raceId;
        scene = incoming; view.setScene(incoming);
        if (different) {
          frame = undefined; selectBall(null); collapse(false);
          names.value = scene.settings.names; order.value = scene.settings.order; preferredPicks = scene.settings.picks || 2;
          updatePicks(scene.balls.length);
          customStage = scene.settings.stage;
          const match = customStage && allMaps().find((m) => JSON.stringify(m.stage) === JSON.stringify(customStage));
          refreshMaps(customStage ? match?.id ?? 'preview' : 'builtin-' + scene.settings.mapId);
          if (first && identity.role === 'host' && !scene.balls.length) {
            try { names.value = localStorage.getItem(namesKey) ?? '하나, 둘, 셋, 넷'; } catch {}
            void prepareUI();
          }
        }
      } else if (incoming.type === 'frame') {
        if (incoming.raceId !== scene?.raceId || incoming.revision !== scene.revision || (frame && incoming.seq <= frame.seq)) return;
        const stateChanged = frame?.state !== incoming.state;
        frame = incoming; view.push(incoming);
        if (stateChanged) {
          if (incoming.state === 'running') collapse(true);
          if (incoming.state !== 'running') view.onBoost(false);
        }
        if (performance.now() - uiUpdate > 200 || stateChanged) { updateRaceUI(); uiUpdate = performance.now(); }
      } else if (incoming.type === 'identity') {
        identity = incoming; updateControls();
      } else if (incoming.type === 'result') {
        const wait = pending.get(incoming.requestId);
        if (wait) { clearTimeout(wait.timer); pending.delete(incoming.requestId); incoming.ok ? wait.resolve() : wait.reject(new Error(incoming.error)); }
      }
    };
    socket.onclose = () => {
      connection(false, '연결이 끊겼어요 · 재접속 중'); view.onBoost(false);
      for (const wait of pending.values()) { clearTimeout(wait.timer); wait.reject(new Error('연결이 끊겼어요. 다시 연결된 후 시도해 주세요.')); }
      pending.clear(); frame = undefined;
      setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
    };
    socket.onerror = () => socket?.close();
  } catch (error) {
    connection(false, message(error)); setTimeout(connect, Math.min(5000, 1000 * 2 ** retry++));
  }
}
names.addEventListener('input', () => {
  try { localStorage.setItem(namesKey, names.value); } catch {}
  clearTimeout(inputTimer); inputTimer = setTimeout(() => void prepareUI(), 200);
});
mapSelect.addEventListener('change', () => void prepareUI());
order.addEventListener('change', () => void prepareUI());
picks.addEventListener('change', () => { preferredPicks = Number(picks.value) || 2; void prepareUI(); });
el('shuffle').addEventListener('click', () => void prepareUI(true));
el('reset').addEventListener('click', () => {
  void command({ type: 'reset' }).then(() => prepare()).catch((error) => toast(message(error)));
});
el('start').addEventListener('click', () => {
  void (async () => {
    if (frame?.state === 'finished') await prepare(true); else await prepare();
    if (record.checked) view.startRecording();
    try { await command({ type: 'start' }); } catch (error) { view.stopRecording(); throw error; }
  })().catch((error) => toast(message(error)));
});
el('pause').addEventListener('click', () => void run({ type: 'pause' }));
el('speed').addEventListener('change', () => void run({ type: 'speed', value: Number(el<HTMLSelectElement>('speed').value) }));
view.onBoost = (active) => {
  if (!active) {
    if (boostTimer) { clearInterval(boostTimer); boostTimer = undefined; if (online) void run({ type: 'boost', active: false }); }
  } else if (!boostTimer && online && view.canControl) {
    void run({ type: 'boost', active: true });
    boostTimer = setInterval(() => void run({ type: 'boost', active: true }), 500);
  }
};
el('panel-toggle').addEventListener('click', () => collapse(!panel.inert));
view.onZoomChange = (zoom) => {
  el('zoom-reset').textContent = Math.round(zoom * 100) + '%';
  el<HTMLButtonElement>('zoom-out').disabled = zoom <= .35; el<HTMLButtonElement>('zoom-in').disabled = zoom >= 3;
};
el('zoom-out').addEventListener('click', () => view.setZoom(view.zoom / 1.2));
el('zoom-in').addEventListener('click', () => view.setZoom(view.zoom * 1.2));
el('zoom-reset').addEventListener('click', () => view.setZoom(1));
el('follow').addEventListener('click', () => { view.follow(); selectBall(null); });
document.addEventListener('pointerdown', (event) => {
  if (view.focusedBallId !== null && event.target instanceof Node && !rankingList.contains(event.target)) selectBall(null);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { view.follow(); selectBall(null); } });
el('address').addEventListener('change', setAddress);

const editor = new Editor({
  list: () => [...stages.map((stage, i) => ({ id: 'builtin-' + i, stage })), ...saved],
  save(stage, id) {
    const nextId = id && !id.startsWith('builtin-') ? id : crypto.randomUUID();
    const next = [...saved.filter((m) => m.id !== nextId), { id: nextId, stage }];
    saveMaps(localStorage, next); saved = next; customStage = undefined;
    const pipeline = stages.findIndex((s) => s.title === '네온 파이프라인');
    refreshMaps(stage.title === '네온 파이프라인' ? 'builtin-' + pipeline : nextId);
    void prepareUI(true); return nextId;
  },
  remove(id) {
    const selected = mapSelect.value;
    const next = saved.filter((m) => m.id !== id); saveMaps(localStorage, next); saved = next;
    refreshMaps(selected === id ? 'builtin-0' : selected); void prepareUI();
  },
  play(stage) { customStage = stage; refreshMaps('preview'); void prepareUI(true); },
});
el('editor-open').addEventListener('click', () => { if (view.canControl) { view.stopRecording(); editor.open(); } });
el('edit-current').addEventListener('click', () => {
  if (view.canControl && scene) { view.stopRecording(); editor.open(scene.stage, mapSelect.value === 'preview' ? null : mapSelect.value); }
});
view.onZoomChange(1);
void connect();
