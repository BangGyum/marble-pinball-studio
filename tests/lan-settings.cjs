const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');
const ts = require('typescript');
const { WebSocket } = require('ws');
const { createLanServer } = require('../server/lan.cjs');
const { decodeScene, serializeCommand } = require('../.lan-build/lan/protocol.js');
const { validateDolphins } = require('../.lan-build/dolphin.js');
const { stages } = require('../.lan-build/data/maps.js');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'LAN settings response timeout');
    await delay(5);
  }
}
const file = ts.createSourceFile('client.ts', fs.readFileSync('src/lan/client.ts', 'utf8'), ts.ScriptTarget.ES2022);
function findNode(node, predicate) {
  return predicate(node) ? node : ts.forEachChild(node, (child) => findNode(child, predicate));
}
const messageHandler = findNode(
  file,
  (node) => ts.isBinaryExpression(node) && node.left.getText(file) === 'socket.onmessage'
);
const listener = (expression, event) =>
  findNode(
    file,
    (node) =>
      ts.isCallExpression(node) && node.expression.getText(file) === expression && node.arguments[0]?.text === event
  ).arguments[1];
const functions = file.statements.filter(
  (node) => ts.isFunctionDeclaration(node) && ['command', 'prepare'].includes(node.name?.text)
);
assert.equal(functions.length, 2);
const code = ts.transpileModule(
  [
    ...functions.map((node) => node.getText(file)),
    `const receive = ${messageHandler.right.getText(file)};`,
    `const editNames = ${listener('names.addEventListener', 'input').getText(file)};`,
    `const startRace = ${listener("el('start').addEventListener", 'click').getText(file)};`,
  ].join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }
).outputText;

(async () => {
  const now = performance.now();
  const app = await createLanServer({ port: 0, host: '127.0.0.1', simulationNow: () => now });
  let socket,
    context,
    hold = false;
  const messages = [],
    held = [],
    sent = [],
    errors = [];
  try {
    const cookie = await new Promise((resolve, reject) => {
      const request = http.request(
        `http://127.0.0.1:${app.port}/api/host-session`,
        {
          method: 'POST',
          headers: { Origin: `http://127.0.0.1:${app.port}` },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.headers['set-cookie'][0].split(';')[0]));
        }
      );
      request.on('error', reject);
      request.end();
    });
    socket = new WebSocket(`ws://127.0.0.1:${app.port}/live`, {
      headers: { Cookie: cookie, Origin: `http://127.0.0.1:${app.port}` },
    });
    let wireScene, latestFrame;
    socket.on('message', (raw) => {
      const data = raw.toString(),
        message = JSON.parse(data);
      messages.push(message);
      if (message.type === 'scene') wireScene = message;
      if (message.type === 'frame') latestFrame = message;
      if (!context) return;
      if (hold) held.push(data);
      else context.receive({ data });
    });
    await until(() => wireScene && latestFrame);
    const dolphins = validateDolphins(undefined, stages[0]);
    socket.send(
      serializeCommand({
        type: 'configure',
        requestId: 'bootstrap',
        raceId: wireScene.raceId,
        settings: { names: 'A,B,C,D', mapId: 0, order: 'asc', picks: 1, dolphins },
      })
    );
    await until(
      () => messages.some((message) => message.requestId === 'bootstrap') && latestFrame.revision === wireScene.revision
    );
    assert.equal(messages.find((message) => message.requestId === 'bootstrap').ok, true);
    const names = { value: 'A,B,C,D' },
      order = { value: 'asc' },
      picks = { value: '1' };
    const mapSelect = { value: 'builtin-0' };
    const dolphinPanel = {
      value: structuredClone(dolphins),
      setStage(_stage, value) {
        if (value) this.value = structuredClone(value);
      },
    };
    const inputSettings = () => ({
      names: names.value,
      mapId: Number(mapSelect.value.slice(8)),
      order: order.value,
      picks: Number(picks.value),
      dolphins: structuredClone(dolphinPanel.value),
    });
    context = vm.createContext({
      online: true,
      scene: decodeScene(wireScene),
      frame: latestFrame,
      socket: {
        get readyState() {
          return socket.readyState;
        },
        send(data) {
          sent.push(JSON.parse(data));
          socket.send(data);
        },
      },
      WebSocket,
      serializeCommand,
      decodeScene,
      validateDolphins,
      sequence: 0,
      requestPrefix: 'settings',
      pending: new Map(),
      pendingPreparations: 0,
      prepareQueue: Promise.resolve(),
      inputTimer: undefined,
      setTimeout,
      clearTimeout,
      performance,
      uiUpdate: Infinity,
      names,
      order,
      picks,
      mapSelect,
      dolphinPanel,
      preferredPicks: 1,
      inputSettings,
      identity: { role: 'host' },
      namesKey: 'names',
      localStorage: { setItem() {} },
      view: { setScene() {}, push() {}, onBoost() {}, stopRecording() {} },
      record: { checked: false },
      selectBall() {},
      collapse() {},
      updateControls() {},
      updateRaceUI() {},
      updatePicks(count) {
        picks.value = String(Math.min(count, context.preferredPicks));
      },
      allMaps: () => [],
      refreshMaps(selected) {
        mapSelect.value = selected;
      },
      el: () => ({}),
      message: (error) => error.message,
      toast: (error) => errors.push(error),
    });
    vm.runInContext(
      code + '\nglobalThis.receive = receive; globalThis.editNames = editNames; globalThis.startRace = startRace;',
      context
    );
    context.prepareUI = () => context.prepare().catch((error) => errors.push(error.message));
    const edit = (settings) => {
      if (settings.names !== undefined) names.value = settings.names;
      if (settings.mapId !== undefined) mapSelect.value = 'builtin-' + settings.mapId;
      if (settings.order !== undefined) order.value = settings.order;
      if (settings.picks !== undefined) {
        picks.value = String(settings.picks);
        context.preferredPicks = settings.picks;
      }
      if (settings.dolphins) dolphinPanel.value = structuredClone(settings.dolphins);
    };
    const release = () => {
      hold = false;
      for (const data of held.splice(0)) context.receive({ data });
    };
    const deliverScene = async () => {
      await until(() => held.some((data) => JSON.parse(data).type === 'scene'));
      const index = held.findIndex((data) => JSON.parse(data).type === 'scene');
      context.receive({ data: held.splice(index, 1)[0] });
    };

    hold = true;
    edit({ mapId: 1 });
    const first = context.prepare();
    first.catch(() => {});
    edit({
      mapId: 0,
      order: 'desc',
      picks: 3,
      dolphins: { ...dolphins, enabled: true, rows: [12], interval: 7, size: 150 },
    });
    const second = context.prepare();
    second.catch(() => {});
    const expected = inputSettings();
    await deliverScene();
    assert.deepEqual(inputSettings(), expected, 'an intermediate scene must not overwrite newer local inputs');
    release();
    await Promise.all([first, second]);
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.scene.settings)),
      expected,
      'the latest map, winner rules and dolphin settings reach the server'
    );
    assert.deepEqual(inputSettings(), expected);
    assert.ok(messages.filter((message) => message.requestId?.startsWith('settings_')).every((message) => message.ok));
    console.log(
      'PASS delayed scene responses preserve the latest LAN inputs and serialized requests use the current race'
    );

    hold = true;
    edit({ mapId: 1 });
    const away = context.prepare();
    away.catch(() => {});
    edit({ mapId: 0 });
    const back = context.prepare();
    back.catch(() => {});
    await deliverScene();
    release();
    await Promise.all([away, back]);
    assert.equal(context.scene.settings.mapId, 0, 'A to B to A still returns to A while the first change is pending');
    const preparedId = context.scene.raceId,
      beforeNoop = sent.length;
    await context.prepare();
    assert.equal(sent.length, beforeNoop, 'unchanged preparation does not send an extra configure');
    await context.prepare(true);
    assert.notEqual(context.scene.raceId, preparedId, 'an explicit shuffle still creates a fresh race');
    console.log('PASS rapid map reversal, unchanged preparation and explicit shuffle');

    const draftNames = '새 이름 A,새 이름 B,새 이름 C,새 이름 D';
    names.value = draftNames;
    context.editNames();
    await context.command({ type: 'reset' });
    assert.equal(names.value, draftNames, 'a scene arriving during the name debounce cannot replace the draft');
    await until(
      () => context.scene.settings.names === draftNames && context.pendingPreparations === 0 && !context.inputTimer
    );
    assert.deepEqual(errors, []);
    console.log('PASS debounced names survive a new scene and are applied after the response');

    edit({ picks: 99 });
    const invalid = context.prepare();
    invalid.catch(() => {});
    edit({ picks: 2 });
    const valid = context.prepare();
    valid.catch(() => {});
    const results = await Promise.allSettled([invalid, valid]);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled', 'a rejected request does not poison later valid settings');
    assert.equal(context.scene.settings.picks, 2);
    console.log('PASS rejected configuration releases the queue and the next valid edit succeeds');

    hold = true;
    edit({ mapId: 1 });
    const beforeStart = context.prepare();
    beforeStart.catch(() => {});
    edit({ mapId: 0, picks: 3 });
    context.startRace();
    edit({ mapId: 1, order: 'asc', picks: 1 });
    const latest = context.prepare();
    latest.catch(() => {});
    const startedWith = inputSettings();
    await deliverScene();
    release();
    await Promise.all([beforeStart, latest]);
    await until(() => context.frame.state === 'running');
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.scene.settings)),
      startedWith,
      'start waits for the newest settings queued while it is waiting'
    );
    assert.equal(sent.at(-1).type, 'start');
    assert.equal(context.pendingPreparations, 0);
    assert.equal(context.pending.size, 0);
    assert.deepEqual(errors, []);
    console.log('PASS start waits for all pending settings, preserves the final inputs and clears pending requests');
  } finally {
    if (context) {
      clearTimeout(context.inputTimer);
      for (const wait of context.pending.values()) {
        clearTimeout(wait.timer);
        wait.reject(new Error('test cleanup'));
      }
    }
    socket?.terminate();
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
