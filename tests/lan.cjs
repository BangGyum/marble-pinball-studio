const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocket } = require('ws');
const { createLanServer } = require('../server/lan.cjs');
const { DEFAULT_MAP_INDEX, stages } = require('../.lan-build/data/maps.js');
const { MAX_LAN_MESSAGE_BYTES, decodeScene, serializeCommand } = require('../.lan-build/lan/protocol.js');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function request(
  port,
  route,
  { method = 'GET', cookie, host = `127.0.0.1:${port}`, origin = `http://${host}`, address = '127.0.0.1' } = {}
) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: address,
        port,
        path: route,
        method,
        headers: { Host: host, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, body, cookie: res.headers['set-cookie']?.[0].split(';')[0] })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}
let nextId = 0;
async function connect(port, cookie, options = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/live`, {
    headers: { Cookie: cookie, Origin: options.origin ?? `http://127.0.0.1:${port}` },
  });
  const client = { ws, messages: [], frame: null, scene: null, rawScene: null, identity: null, bytes: 0 };
  ws.on('close', (code, reason) => {
    client.closed = `${code} ${reason.toString()}`;
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    client.messages.push(msg);
    client.bytes += raw.length;
    if (client.messages.length > 1000) client.messages.shift();
    if (msg.type === 'frame') client.frame = msg;
    if (msg.type === 'scene') {
      client.rawScene = msg;
      client.scene = decodeScene(msg);
    }
    if (msg.type === 'identity') client.identity = msg;
  });
  client.until = async (predicate, timeout = 5000) => {
    const deadline = Date.now() + timeout;
    while (!predicate()) {
      if (client.closed) throw new Error(`LAN connection closed: ${client.closed}`);
      if (Date.now() > deadline) throw new Error('Timed out waiting for LAN state');
      await delay(10);
    }
  };
  let nextCommandAt = 0;
  client.command = async (msg, id = `request_${++nextId}`) => {
    // Functional assertions must not accidentally exercise the server's 30 requests/second flood guard.
    const now = performance.now(),
      scheduled = Math.max(now, nextCommandAt);
    nextCommandAt = scheduled + 40;
    if (scheduled > now) await delay(scheduled - now);
    const previous = client.messages.findLast((m) => m.type === 'result' && m.requestId === id);
    ws.send(
      JSON.stringify({
        raceId: client.scene.raceId,
        ...(msg.type === 'spring' ? { revision: client.scene.revision } : {}),
        ...msg,
        requestId: id,
      })
    );
    let result;
    await client.until(() => {
      result = client.messages.findLast((m) => m.type === 'result' && m.requestId === id);
      return result && result !== previous;
    });
    return result;
  };
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  await client.until(() => client.frame && client.scene && client.identity);
  return client;
}

(async () => {
  const frozenTime = performance.now();
  let realtime = false;
  // Functional assertions advance physics explicitly; socket latency must not move a spring meanwhile.
  const app = await createLanServer({ port: 0, simulationNow: () => (realtime ? performance.now() : frozenTime) });
  const clients = [];
  try {
    const port = app.port;
    for (const route of ['http://[', 'http://127.0.0.1:invalid/']) {
      const response = await request(port, route);
      assert.equal(response.status, 400, 'malformed request targets are rejected without terminating the server');
      const body = JSON.parse(response.body);
      assert.deepEqual(Object.keys(body), ['error']);
      assert.equal(typeof body.error, 'string');
      const health = await request(port, '/api/health');
      assert.equal(health.status, 200, 'the server still serves requests after each invalid URL');
      assert.equal(JSON.parse(health.body).ok, true);
    }
    console.log('PASS malformed unauthenticated URLs return JSON 400 and LAN health stays available');
    const serialized = serializeCommand({ type: 'start', requestId: 'size_check', raceId: 'race' });
    assert.equal(JSON.parse(serialized).type, 'start');
    const emptyCommand = {
      type: 'configure',
      requestId: 'size_check',
      raceId: 'race',
      settings: { names: '', mapId: 0, order: 'asc', picks: 1 },
    };
    const sizeAtLimit = {
      ...emptyCommand,
      settings: {
        ...emptyCommand.settings,
        names: 'x'.repeat(MAX_LAN_MESSAGE_BYTES - Buffer.byteLength(serializeCommand(emptyCommand))),
      },
    };
    assert.equal(
      Buffer.byteLength(serializeCommand(sizeAtLimit)),
      MAX_LAN_MESSAGE_BYTES,
      'exact message byte limit is accepted'
    );
    assert.throws(
      () =>
        serializeCommand({
          ...sizeAtLimit,
          settings: { ...sizeAtLimit.settings, names: sizeAtLimit.settings.names + 'x' },
        }),
      /너무 커서 전송할 수 없어요/,
      'one extra byte is rejected'
    );
    assert.throws(
      () =>
        serializeCommand({
          type: 'configure',
          requestId: 'size_check',
          raceId: 'race',
          settings: { names: '가'.repeat(Math.ceil(MAX_LAN_MESSAGE_BYTES / 3)), mapId: 0, order: 'asc', picks: 1 },
        }),
      /너무 커서 전송할 수 없어요/,
      'UTF-8 message size is rejected before opening a pending request'
    );
    assert.equal(app.info().maps[0].title, '네온 잭팟', 'map order must never overwrite a different map title');
    assert.equal(app.info().maps.length, 17);
    assert.ok(!app.info().maps.some((map) => ['네온 모래시계', '스프링 놀이터', '역전 사다리'].includes(map.title)));
    assert.ok(
      app.info().maps.every((map) => stages[map.id].title === map.title),
      'hidden maps do not shift the exposed LAN ids'
    );
    const guestSession = await request(port, '/api/session', { method: 'POST' });
    const guest2Session = await request(port, '/api/session', { method: 'POST' });
    const hostSession = await request(port, '/api/host-session', { method: 'POST' });
    assert.equal(hostSession.status, 200);
    assert.deepEqual(JSON.parse(hostSession.body), { type: 'identity', role: 'host' });
    assert.deepEqual(JSON.parse(guestSession.body), { type: 'identity', role: 'viewer' });
    const host = await connect(port, hostSession.cookie),
      guest = await connect(port, guestSession.cookie),
      guest2 = await connect(port, guest2Session.cookie);
    clients.push(host, guest, guest2);
    while (guest.messages.length < 1000) guest.messages.push({ type: 'frame' });
    const fullLogResult = await guest.command({ type: 'pause' }, 'full_log_result');
    const replayedLogResult = await guest.command({ type: 'pause' }, 'full_log_result');
    assert.equal(fullLogResult.ok, false, 'viewer commands still receive a rejection with a full message log');
    assert.notEqual(replayedLogResult, fullLogResult, 'duplicate request IDs must wait for a fresh response');
    assert.ok(guest.messages.length <= 1000, 'response matching preserves the bounded message log');
    console.log('PASS command replies and duplicate IDs after the bounded message log rolls over');
    for (let i = 0; i < 35; i++)
      assert.equal(
        (await guest.command({ type: 'pause' })).ok,
        false,
        'functional commands stay within the rate limit'
      );
    console.log('PASS repeated functional commands stay connected below the production rate limit');
    const flooded = await connect(port, guestSession.cookie);
    clients.push(flooded);
    for (let i = 0; i < 31; i++)
      flooded.ws.send(JSON.stringify({ type: 'pause', raceId: flooded.scene.raceId, requestId: `flood_${i}` }));
    await flooded.until(() => flooded.closed);
    assert.equal(flooded.closed, '1008 Too many requests', 'raw flooding still triggers the production guard');
    console.log('PASS an intentional 31-command burst is rejected by the unchanged production flood guard');
    const oversized = await connect(port, guestSession.cookie);
    clients.push(oversized);
    let oversizedCode;
    oversized.ws.once('close', (code) => {
      oversizedCode = code;
    });
    oversized.ws.send(
      JSON.stringify({ ...sizeAtLimit, settings: { ...sizeAtLimit.settings, names: sizeAtLimit.settings.names + 'x' } })
    );
    await oversized.until(() => oversizedCode !== undefined);
    assert.ok([1006, 1009].includes(oversizedCode), 'oversized payload closes the connection before command handling');
    assert.equal(app.race.state, 'ready');
    assert.equal(
      (await request(port, '/api/host-session', { method: 'POST', origin: 'https://evil.example' })).status,
      403
    );
    assert.equal((await request(port, '/api/session', { method: 'POST', host: `evil.example:${port}` })).status, 403);
    assert.equal((await request(port, '/api/qr', { cookie: guestSession.cookie })).status, 404);
    assert.equal((await request(port, '/api/qr', { cookie: hostSession.cookie })).status, 404);
    const lan = app.info().addresses.find((a) => !a.url.includes('127.0.0.1'));
    if (lan) {
      const url = new URL(lan.url);
      assert.equal(
        (await request(port, '/api/host-session', { method: 'POST', address: url.hostname, host: url.host })).status,
        403,
        'LAN clients cannot bootstrap a host session'
      );
      assert.equal(
        (await request(port, '/api/host-session', { method: 'POST', address: url.hostname })).status,
        403,
        'forged localhost Host header cannot grant a LAN client admin access'
      );
      const copiedSession = await request(port, '/api/session', {
        method: 'POST',
        address: url.hostname,
        host: url.host,
        cookie: hostSession.cookie,
      });
      assert.equal(JSON.parse(copiedSession.body).role, 'viewer', 'host cookie cannot be reused over LAN');
      assert.equal((await request(port, '/api/health', { address: url.hostname, host: url.host })).status, 200);
    }
    await assert.rejects(connect(port, guestSession.cookie, { origin: 'https://evil.example' }));
    assert.deepEqual(guest.scene.settings, { names: '', mapId: DEFAULT_MAP_INDEX, order: 'desc', picks: 2 });
    assert.equal(guest.scene.stage.title, '네온 분기점');
    const settings = { names: '동명이인, 동명이인, 참가자*26', mapId: 4, order: 'desc', picks: 2 };
    for (const command of [
      { type: 'configure', settings },
      { type: 'start' },
      { type: 'pause' },
      { type: 'reset' },
      { type: 'claim', code: '0123456789' },
      { type: 'release', participantId: 'x' },
      { type: 'skill', skill: 'jump' },
      { type: 'focus', ballId: 0 },
      { type: 'position', ballId: 0, x: 0, y: 100 },
      { type: 'speed', value: 4 },
      { type: 'boost', active: true },
    ])
      assert.equal((await guest.command(command)).ok, false, 'viewers cannot mutate the race through any command');
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, mapId: -1 } })).ok, false);
    assert.equal(
      (await host.command({ type: 'configure', settings: { ...settings, skills: true } })).ok,
      false,
      'removed skill setting is not accepted'
    );
    assert.equal((await host.command({ type: 'configure', settings })).ok, true);
    await guest.until(() => guest.scene.balls.length === 28);
    assert.equal(guest.frame.state, 'ready');
    const [first, second] = guest.scene.balls.filter((b) => b.name === '동명이인');
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.color, second.color, 'same-name marbles remain individually selectable');
    assert.ok(
      guest.scene.balls.every((b) => b.name && b.color && Object.keys(b).sort().join() === 'color,id,name'),
      'all names and colors are available before the race without ownership or codes'
    );
    assert.equal(
      host.messages.some((m) => m.type === 'invitations'),
      false
    );
    assert.deepEqual(guest.scene.balls, guest2.scene.balls, 'everyone sees the same prepared roster');
    const viewerCookie = guestSession.cookie;
    guest.ws.close();
    await delay(40);
    const resumedSession = await request(port, '/api/session', { method: 'POST', cookie: viewerCookie });
    assert.equal(resumedSession.cookie, viewerCookie);
    const resumed = await connect(port, viewerCookie);
    clients.push(resumed);
    assert.deepEqual(resumed.identity, { type: 'identity', role: 'viewer' });
    assert.deepEqual(resumed.scene.balls, guest2.scene.balls, 'reconnect restores the full selectable roster');
    assert.equal((await host.command({ type: 'start' })).ok, true);
    assert.equal((await host.command({ type: 'configure', settings })).ok, false, 'cannot reconfigure a live race');
    assert.equal(
      (await resumed.command({ type: 'skill', skill: 'jump' })).ok,
      false,
      'spectators cannot use skills during play'
    );
    assert.equal((await host.command({ type: 'pause' }, 'pause_once')).ok, true);
    const pausedAt = app.race.elapsed;
    await delay(120);
    assert.equal(app.race.elapsed, pausedAt);
    assert.equal((await host.command({ type: 'pause' }, 'pause_once')).ok, true);
    assert.equal(app.race.state, 'paused', 'retrying the same pause request does not resume the race');
    const pausedBalls = resumed.frame.balls;
    for (const command of [
      { type: 'pause' },
      { type: 'reset' },
      { type: 'skill', skill: 'jump' },
      { type: 'position', ballId: first.id, y: 100 },
    ])
      assert.equal((await resumed.command(command)).ok, false);
    assert.deepEqual(resumed.frame.balls, pausedBalls, 'spectator requests leave simulation positions untouched');
    assert.equal((await host.command({ type: 'pause' })).ok, true);
    // Advance the real engine clock without wall-clock waiting, then inspect actual socket snapshots.
    while (app.race.state !== 'finished' && app.race.elapsed < 120) app.race.advance();
    assert.equal(app.race.state, 'finished');
    await resumed.until(() => resumed.frame.state === 'finished');
    await guest2.until(() => guest2.frame.state === 'finished');
    assert.deepEqual(
      resumed.frame.balls,
      guest2.frame.balls,
      'every viewer receives identical final positions and ranks'
    );
    assert.deepEqual(
      resumed.frame.winners,
      app.race.arrivals.slice(-2).map((b) => b.id),
      'DESC selects last two'
    );
    const oldRaceId = resumed.scene.raceId;
    assert.equal((await host.command({ type: 'reset' })).ok, true);
    await resumed.until(() => resumed.scene.raceId !== oldRaceId);
    assert.equal(resumed.frame.state, 'ready');
    assert.equal(resumed.scene.balls.length, 28);
    assert.equal((await host.command({ type: 'start', raceId: oldRaceId })).ok, false, 'stale round rejected');
    console.log(
      'PASS localhost-only admin, origins, forged LAN host/cookie rejection, read-only spectators, no QR/codes/skills, prepared roster, duplicate names, reconnect, idempotency, pause, finish, DESC 2 and reset'
    );

    assert.equal((await host.command({ type: 'speed', value: 9 })).ok, false);
    assert.equal((await host.command({ type: 'speed', value: 2 })).ok, true);
    assert.equal(host.frame.speed, 2);
    assert.equal((await host.command({ type: 'start' })).ok, true);
    assert.equal((await host.command({ type: 'boost', active: true })).ok, true);
    assert.equal(host.frame.playbackRate, 4, 'held host mouse doubles shared simulation speed');
    assert.equal((await guest2.command({ type: 'boost', active: false })).ok, false);
    assert.equal((await host.command({ type: 'boost', active: false })).ok, true);
    assert.equal(host.frame.playbackRate, 2);
    await host.command({ type: 'pause' });
    const paused = app.race.elapsed;
    await delay(60);
    assert.equal(app.race.elapsed, paused);
    await host.command({ type: 'reset' });
    await host.command({ type: 'speed', value: 1 });
    const custom = { ...host.scene.stage, title: '편집 맵 검증' };
    assert.equal(
      (await host.command({ type: 'configure', settings: { ...settings, stage: { ...custom, goalY: -1 } } })).ok,
      false
    );
    const revision = host.scene.revision,
      raceId = host.scene.raceId;
    for (const style of ['twin-funnel', 'crossway', 'fracture-canyon', 'bounce-stairs']) {
      const invalid = { ...custom, exitBridge: undefined, art: { style, contours: [] } };
      const result = await host.command({ type: 'configure', settings: { ...settings, stage: invalid } });
      assert.equal(result.ok, false, 'invalid scenery cannot be broadcast to LAN renderers');
      assert.match(result.error, /입체 출구|배경 장식/);
      assert.equal(host.scene.revision, revision, 'rejected scenery preserves the current scene');
      assert.equal(host.scene.raceId, raceId, 'rejected scenery preserves the prepared race');
    }
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, stage: custom } })).ok, true);
    await guest2.until(() => guest2.scene.stage.title === custom.title);
    assert.equal(app.race.stage.title, custom.title);
    assert.deepEqual(
      guest2.scene.settings.stage,
      { ...custom, zoomY: custom.goalY - 5 },
      'editor map uses the same normalization as saved maps'
    );
    assert.equal(guest2.rawScene.settings.stage, undefined, 'the stage is not repeated in scene settings');
    assert.ok(
      guest2.rawScene.entities.every((e) => e.shapeIndex !== undefined || e.shape),
      'every entity resolves a shape'
    );
    assert.deepEqual(
      guest2.scene.entities.map((e) => e.shape),
      app.race.physics.getEntities().map((e) => e.shape),
      'compact entity shapes reconstruct the authoritative scene'
    );
    assert.ok(
      Buffer.byteLength(JSON.stringify(guest2.rawScene)) < Buffer.byteLength(JSON.stringify(guest2.scene)) * 0.7,
      'the custom map scene is materially smaller on the wire'
    );
    assert.equal((await guest2.command({ type: 'configure', settings: { ...settings, stage: custom } })).ok, false);
    const rapids = stages.find((s) => s.title === '지그재그 급류');
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, stage: rapids } })).ok, true);
    await guest2.until(() => guest2.scene.stage.title === rapids.title);
    assert.deepEqual(
      guest2.scene.stage.art,
      rapids.art,
      'LAN viewers receive the same glass track and direction markings'
    );
    assert.deepEqual(
      guest2.scene.stage.entities,
      rapids.entities,
      'LAN viewers receive the same swing device definitions'
    );
    const boostStage = {
      ...rapids,
      entities: [
        {
          position: { x: 23, y: 30 },
          type: 'static',
          shape: { type: 'box', width: 2.5, height: 1, rotation: Math.PI / 2, boostSpeed: 35, color: '#ffc653' },
          props: { density: 1, restitution: 0, angularVelocity: 0 },
        },
      ],
    };
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, stage: boostStage } })).ok, true);
    await guest2.until(() => guest2.scene.stage.entities[0]?.shape.boostSpeed === 35);
    assert.deepEqual(guest2.scene.stage.entities, boostStage.entities, 'LAN guests retain booster direction and speed');
    const jackpot = stages.find((s) => s.title === '네온 잭팟');
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, stage: jackpot } })).ok, true);
    await guest2.until(() => guest2.scene.stage.title === jackpot.title);
    assert.deepEqual(
      guest2.scene.stage.entities,
      jackpot.entities,
      'LAN retains timed gates and five-blade spin cycles'
    );
    assert.deepEqual(guest2.scene.stage.art, jackpot.art, 'LAN retains jackpot scenery');
    const moving = jackpot.entities
      .map((e, i) => (e.props.timedGate || e.props.spinCycle ? i : -1))
      .filter((i) => i >= 0);
    assert.ok(
      moving.every((i) => !guest2.scene.fixed[i]),
      'gates and rotor blades must never enter the static cache'
    );
    await host.command({ type: 'start' });
    for (let i = 0; i < 390; i++) app.race.advance();
    await host.command({ type: 'pause' });
    await guest2.until(() => guest2.frame.state === 'paused');
    const states = app.race.physics.getEntities();
    for (const i of moving)
      assert.ok(
        Math.abs(guest2.frame.angles[i] - states[i].angle) <= 0.001,
        'viewer angles match authoritative gate and blade angles'
      );
    await host.command({ type: 'reset' });
    assert.equal(
      (
        await host.command({
          type: 'configure',
          settings: { ...settings, stage: { ...rapids, art: { style: 'unknown', contours: [] } } },
        })
      ).ok,
      false
    );
    for (const title of ['네온 핀볼 폭포', '카오스 시계탑', '오비탈 락', '끝없는 나선', '쌍둥이 와류', '떠도는 입구']) {
      // Keep independent map scenarios below the real server's 30 commands/second limit.
      await delay(1050);
      const stage = stages.find((s) => s.title === title),
        mapId = stages.indexOf(stage);
      assert.equal((await host.command({ type: 'configure', settings: { ...settings, mapId } })).ok, true);
      await guest2.until(() => guest2.scene.stage.title === title);
      assert.deepEqual(guest2.scene.stage.entities, stage.entities, 'builtin arcade devices reach spectators intact');
      assert.deepEqual(guest2.scene.stage.art, stage.art);
      assert.deepEqual(
        guest2.scene.stage.exitBridge,
        stage.exitBridge,
        'spectators receive the same elevated outlet geometry'
      );
      assert.deepEqual(
        guest2.scene.stage.windZones,
        stage.windZones,
        'annular wind boundaries survive scene serialization'
      );
      assert.deepEqual(guest2.scene.stage.goalArea, stage.goalArea, 'central finish reaches spectators intact');
      const slides = stage.entities.flatMap((e, i) => (e.props.sliding ? [i] : []));
      assert.ok(
        slides.every((i) => !guest2.scene.fixed[i]),
        'moving platforms cannot be statically cached'
      );
      await host.command({ type: 'start' });
      for (let i = 0; i < 90; i++) app.race.advance();
      if (stage.exitBridge) {
        while (!app.race.balls.some((b) => b.onBridge) && app.race.elapsed < 60) app.race.advance();
        assert.ok(
          app.race.balls.some((b) => b.onBridge),
          'race reaches its open bridge entrance'
        );
      }
      await host.command({ type: 'pause' });
      await guest2.until(() => guest2.frame.state === 'paused');
      if (stage.exitBridge) {
        const bridgeIds = app.race.balls.filter((b) => b.onBridge).map((b) => b.id);
        assert.deepEqual(guest2.frame.bridgeIds, bridgeIds, 'spectators render the authoritative floor at crossings');
        const lateSession = await request(port, '/api/session', { method: 'POST' });
        const late = await connect(port, lateSession.cookie);
        clients.push(late);
        assert.deepEqual(late.frame.bridgeIds, bridgeIds, 'mid-race join restores the upper-floor marbles');
        if (stage.exitBridge.transfers) {
          const id = bridgeIds[0];
          await host.command({ type: 'pause' });
          while (app.race.balls[id].onBridge && app.race.elapsed < 60) app.race.advance();
          assert.equal(app.race.balls[id].onBridge, false, 'transfer returns the marble to the lower bowl');
          await host.command({ type: 'pause' });
          await guest2.until(() => guest2.frame.state === 'paused' && !guest2.frame.bridgeIds.includes(id));
          assert.deepEqual(
            guest2.frame.bridgeIds,
            app.race.balls.filter((b) => b.onBridge).map((b) => b.id),
            'bridge return reaches spectators'
          );
        }
      }
      const positions = new Map((guest2.frame.positions ?? []).map(([i, x, y]) => [i, { x, y }]));
      const entities = app.race.physics.getEntities();
      if (slides.length) assert.ok(positions.size > 0, 'server sends physical platform translations');
      for (const i of slides) {
        const received = positions.get(i) ?? guest2.scene.entities[i];
        assert.ok(
          Math.abs(received.x - entities[i].x) < 0.001 && Math.abs(received.y - entities[i].y) < 0.001,
          'spectator translations match authoritative physics'
        );
      }
      await host.command({ type: 'reset' });
      if (stage.exitBridge) {
        await guest2.until(() => guest2.frame.state === 'ready');
        assert.deepEqual(guest2.frame.bridgeIds, [], 'reset clears bridge membership on spectators');
      }
    }
    console.log('PASS arcade builtins, scenery, moving platforms, authoritative translations, pause and reset');
    await delay(1050);
    const springStage = stages.find((s) => s.title === '스프링 놀이터');
    await host.command({ type: 'configure', settings: { ...settings, mapId: stages.indexOf(springStage) } });
    await guest2.until(() => guest2.scene.stage.title === springStage.title);
    const springIndex = springStage.entities.findIndex((e) => e.shape.spring);
    assert.deepEqual(guest2.scene.stage, springStage, 'spring configuration is shared');
    assert.equal(guest2.scene.fixed[springIndex], false, 'spring remains a live obstacle');
    assert.equal((await guest2.command({ type: 'spring', index: springIndex })).ok, false, 'not before start');
    await host.command({ type: 'start' });
    assert.equal(
      (await guest2.command({ type: 'spring', index: springIndex, revision: undefined })).ok,
      false,
      'spring request requires its scene revision'
    );
    assert.equal(
      (await guest2.command({ type: 'spring', index: springIndex })).ok,
      true,
      'viewer can activate marked spring'
    );
    assert.equal(
      (await resumed.command({ type: 'spring', index: springIndex })).ok,
      false,
      'global cooldown stops simultaneous repeats'
    );
    assert.equal((await guest2.command({ type: 'spring', index: 0 })).ok, false, 'walls cannot be activated');
    assert.equal((await guest2.command({ type: 'spring', index: -1 })).ok, false);
    for (let i = 0; i < 7; i++) app.race.advance();
    await host.command({ type: 'pause' });
    await guest2.until(() => guest2.frame.state === 'paused');
    const springPosition = guest2.frame.positions.find((p) => p[0] === springIndex);
    assert.ok(
      springPosition && springPosition[2] < springStage.entities[springIndex].position.y - 1.0,
      'viewer sees authoritative vertical stroke'
    );
    assert.equal((await guest2.command({ type: 'spring', index: springIndex })).ok, false, 'paused spring rejected');
    await host.command({ type: 'reset' });
    console.log('PASS viewer spring activation, shared cooldown, server motion, pause and invalid target rejection');
    await delay(1050);
    let springClock = Date.now();
    app.race.springCooldowns.now = () => springClock;
    const springIndices = springStage.entities.flatMap((e, i) => (e.shape.spring ? [i] : [])),
      [common, personal, other] = springIndices;
    await host.command({ type: 'start' });
    assert.equal((await guest2.command({ type: 'spring', index: common })).ok, true);
    assert.equal((await resumed.command({ type: 'spring', index: common })).ok, false);
    assert.equal((await guest2.command({ type: 'spring', index: personal })).ok, true);
    assert.equal((await resumed.command({ type: 'spring', index: personal })).ok, false);
    await resumed.until(() => resumed.frame.springs?.find((s) => s[0] === personal)?.[2]);
    assert.equal(
      resumed.frame.springs.find((s) => s[0] === personal)[1],
      0,
      'rejected busy input never charges cooldown'
    );
    assert.equal((await guest2.command({ type: 'spring', index: other })).ok, true, 'personal devices are independent');
    for (let i = 0; i < 65; i++) app.race.advance();
    assert.equal(
      (await resumed.command({ type: 'spring', index: personal })).ok,
      true,
      'other session may use returned spring'
    );
    assert.equal((await guest2.command({ type: 'spring', index: personal })).ok, false, 'own cooldown remains');
    const reconnected = await connect(port, guest2Session.cookie);
    clients.push(reconnected);
    assert.equal(
      reconnected.frame.springs.find((s) => s[0] === personal)[1],
      10000,
      'reconnect restores personal cooldown'
    );
    assert.equal(reconnected.frame.springs.find((s) => s[0] === common)[1], 5000, 'reconnect restores common cooldown');
    springClock += 5000;
    for (let i = 0; i < 65; i++) app.race.advance();
    assert.equal(
      (await resumed.command({ type: 'spring', index: common })).ok,
      true,
      'common cooldown expires in real time'
    );
    assert.equal((await guest2.command({ type: 'spring', index: personal })).ok, false);
    springClock += 5000;
    assert.equal(
      (await reconnected.command({ type: 'spring', index: personal })).ok,
      true,
      'personal cooldown expires in real time'
    );
    await host.command({ type: 'reset' });
    await reconnected.until(() => reconnected.frame.state === 'ready');
    assert.ok(
      reconnected.frame.springs.every((s) => s[1] === 0 && !s[2]),
      'new race clears both cooldown scopes'
    );
    app.race.springCooldowns.now = () => Date.now();
    console.log('PASS LAN per-session cooldowns, independent devices, reconnect preservation, actual time and reset');

    const spring = (x) => ({
      position: { x, y: 4 },
      type: 'kinematic',
      shape: { type: 'box', width: 1, height: 0.1, rotation: 0, spring: { distance: 1, direction: 0 } },
      props: { density: 1, restitution: 0, angularVelocity: 0 },
    });
    const changingStage = {
      title: '파괴 장치와 스프링',
      goalY: 60,
      zoomY: 55,
      entities: [
        {
          position: { x: 0, y: 0 },
          type: 'static',
          shape: { type: 'circle', radius: 0.2 },
          props: { density: 1, restitution: 1, angularVelocity: 0, life: 1 },
        },
        spring(5),
        spring(10),
        {
          position: { x: 50, y: 0 },
          type: 'static',
          shape: {
            type: 'polyline',
            points: [
              [0, 0],
              [0, 1],
            ],
            rotation: 0,
            backing: 0.1,
          },
          props: { density: 1, restitution: 0, angularVelocity: 0 },
        },
      ],
    };
    await host.command({
      type: 'configure',
      settings: { ...settings, names: '회귀 검증', picks: 1, stage: changingStage },
    });
    await guest2.until(() => guest2.scene.stage.title === changingStage.title);
    const staleRevision = guest2.scene.revision;
    await host.command({ type: 'start' });
    app.race.physics.placeMarble(0, -0.6, 0);
    app.race.physics.vector.Set(10, 0);
    app.race.physics.marbleMap[0].SetLinearVelocity(app.race.physics.vector);
    app.race.advance();
    assert.equal(app.race.physics.getEntities().length, 3, 'actual contact removes the leading obstacle');
    assert.equal(app.race.physics.getEntities()[1].x, 10, 'old spring index now points at a different device');
    assert.equal(
      (await guest2.command({ type: 'spring', index: 1, revision: staleRevision })).ok,
      false,
      'delayed spring request cannot activate a different device after entity removal'
    );
    assert.equal(app.race.physics.isSpringBusy(1), false, 'rejected stale index leaves the other spring untouched');
    await guest2.until(() => guest2.scene.revision > staleRevision);
    assert.equal(
      (await guest2.command({ type: 'spring', index: 0 })).ok,
      true,
      'latest scene can still activate the intended spring'
    );
    assert.equal(app.race.physics.isSpringBusy(0), true);
    await host.command({ type: 'reset' });
    console.log('PASS delayed spring revision rejection after real obstacle removal and refreshed activation');
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, names: '', picks: 0 } })).ok, true);
    assert.equal(host.scene.balls.length, 0);
    assert.equal((await host.command({ type: 'start' })).ok, false);
    console.log(
      'PASS restored host speed/held acceleration/pause, validated editor maps, spectator restrictions and empty roster'
    );

    const rulesStage = { title: '승자 조건과 배치 보존', width: 26, goalY: 60, zoomY: 55, entities: [] };
    let rulesSettings = { ...settings, names: '가,나,다,라', order: 'asc', picks: 1, stage: rulesStage };
    assert.equal((await host.command({ type: 'configure', settings: rulesSettings })).ok, true);
    await Promise.all([resumed, guest2].map((client) => client.until(() => client.scene.raceId === host.scene.raceId)));
    for (const [client, x] of [
      [host, 8],
      [resumed, 13],
      [guest2, 18],
    ])
      assert.equal((await client.command({ type: 'place-spring', x, y: 20, direction: -Math.PI / 2 })).ok, true);
    const rulesRaceId = host.scene.raceId;
    const preparedRulesBalls = app.race.balls;
    const placedRulesSprings = structuredClone(host.scene.placedSprings);
    for (const change of [{ picks: 2 }, { order: 'desc' }, { picks: 3 }]) {
      rulesSettings = { ...rulesSettings, ...change };
      assert.equal((await host.command({ type: 'configure', settings: rulesSettings })).ok, true);
      assert.equal(host.scene.raceId, rulesRaceId, 'winner settings preserve the prepared race');
      assert.equal(app.race.balls, preparedRulesBalls, 'winner settings never reshuffle the prepared marbles');
      for (const client of [host, resumed, guest2]) {
        await client.until(
          () =>
            client.scene.settings.order === rulesSettings.order &&
            client.scene.settings.picks === rulesSettings.picks &&
            client.frame.revision === client.scene.revision
        );
        assert.deepEqual(
          client.scene.placedSprings,
          placedRulesSprings,
          'every placement retains its id and direction'
        );
        assert.equal(client.frame.personalSpring.state, 'placed', 'each participant keeps their placed spring');
      }
    }
    assert.equal((await host.command({ type: 'start' })).ok, true);
    assert.equal(
      (await guest2.command({ type: 'use-spring' })).ok,
      true,
      'a preserved spring remains usable after start'
    );
    for (const ball of preparedRulesBalls) {
      app.race.physics.placeMarble(ball.id, 13, 61);
      app.race.advance();
    }
    await resumed.until(() => resumed.frame.state === 'finished');
    assert.deepEqual(
      resumed.frame.winners,
      preparedRulesBalls.slice(-3).map((ball) => ball.id),
      'the actual race applies the changed DESC three-winner rule'
    );
    assert.equal((await host.command({ type: 'reset' })).ok, true);
    await guest2.until(() => guest2.frame.personalSpring.state === 'available');
    assert.notEqual(host.scene.raceId, rulesRaceId, 'reset still prepares a new race');
    assert.equal(host.scene.placedSprings.length, 0);
    for (const change of [{ names: '가,나,다,라,마' }, { stage: { ...rulesStage, goalY: 65 } }, {}]) {
      assert.equal((await guest2.command({ type: 'place-spring', x: 13, y: 20, direction: 0 })).ok, true);
      const beforeReset = host.scene.raceId;
      rulesSettings = { ...rulesSettings, ...change };
      assert.equal((await host.command({ type: 'configure', settings: rulesSettings })).ok, true);
      await guest2.until(
        () => guest2.scene.raceId === host.scene.raceId && guest2.frame.revision === guest2.scene.revision
      );
      assert.notEqual(host.scene.raceId, beforeReset, 'roster/map edits and an explicit identical shuffle still reset');
      assert.equal(guest2.scene.placedSprings.length, 0);
      assert.equal(guest2.frame.personalSpring.state, 'available');
    }
    console.log(
      'PASS winner rule edits preserve every placement and prepared roster; start, finish, reset and shuffle remain correct'
    );

    const personalStage = { title: '참여자 일회용 스프링', width: 26, goalY: 60, zoomY: 55, entities: [] };
    await host.command({
      type: 'configure',
      settings: { ...settings, names: '한 번만', picks: 1, stage: personalStage },
    });
    await guest2.until(
      () => guest2.scene.stage.title === personalStage.title && guest2.frame.personalSpring?.state === 'available'
    );
    assert.equal((await guest2.command({ type: 'use-spring' })).ok, false, 'cannot use an unplaced spring');
    for (const invalid of [
      { x: '13', y: 20, direction: 0 },
      { x: 0, y: 20, direction: 0 },
      { x: 13, y: 20, direction: 99 },
      { x: 13, y: 20, direction: 0, extra: true },
    ])
      assert.equal((await guest2.command({ type: 'place-spring', ...invalid })).ok, false);
    const place = { type: 'place-spring', x: 13, y: 20, direction: -Math.PI / 2 };
    assert.equal((await guest2.command(place, 'personal_place_once')).ok, true);
    assert.equal(
      (await guest2.command(place, 'personal_place_once')).ok,
      true,
      'retry of the same request is idempotent'
    );
    assert.equal((await guest2.command(place)).ok, false, 'second placement is rejected');
    await host.until(() => host.scene.placedSprings.length === 1);
    assert.equal(app.race.physics.getEntities().length, 0, 'unfired spring cannot block the track');
    assert.equal(host.frame.personalSpring.state, 'available', 'inventory is per participant');
    assert.deepEqual(
      guest2.scene.placedSprings,
      host.scene.placedSprings,
      'placement and direction are public scene data'
    );
    assert.equal((await host.command({ type: 'place-spring', x: 18, y: 15, direction: 0 })).ok, true);
    assert.equal((await guest2.command({ type: 'use-spring' })).ok, false, 'ready state does not consume the use');
    await host.command({ type: 'start' });
    await host.command({ type: 'pause' });
    assert.equal((await guest2.command({ type: 'use-spring' })).ok, false, 'pause does not consume the use');
    guest2.ws.close();
    await delay(30);
    const personalReconnect = await connect(port, guest2Session.cookie);
    clients.push(personalReconnect);
    assert.equal(personalReconnect.frame.personalSpring.state, 'placed', 'refresh/reconnect retains the placed spring');
    assert.equal((await personalReconnect.command(place)).ok, false, 'reconnect does not grant an extra spring');
    await host.command({ type: 'pause' });
    app.race.physics.placeMarble(0, 13, 19.4);
    assert.equal((await personalReconnect.command({ type: 'use-spring' }, 'personal_use_once')).ok, true);
    assert.equal((await personalReconnect.command({ type: 'use-spring' }, 'personal_use_once')).ok, true);
    assert.equal(app.race.physics.getEntities().length, 1, 'retry creates only one physical spring');
    assert.equal((await personalReconnect.command({ type: 'use-spring' })).ok, false);
    assert.equal((await personalReconnect.command(place)).ok, false);
    await host.until(() => host.scene.entities.length === 1);
    assert.equal(
      (await host.command({ type: 'spring', index: 0 })).ok,
      false,
      'other players cannot activate a personal spring through the legacy command'
    );
    assert.equal(
      (await personalReconnect.command({ type: 'spring', index: 0 })).ok,
      false,
      'legacy command cannot bypass the one-use limit'
    );
    for (let i = 0; i < 8; i++) app.race.advance();
    assert.ok(app.race.physics.getMarblePosition(0).y < 19, 'the server physically launches the marble');
    await personalReconnect.until(() =>
      personalReconnect.frame.positions?.some(([index, , y]) => index === 0 && y < 20)
    );
    for (let i = 0; i < 60; i++) app.race.advance();
    await host.until(() => host.scene.entities.length === 0);
    assert.equal(app.race.physics.world.GetBodyCount(), 1, 'spring body disappears after the single return stroke');
    assert.equal(host.frame.personalSpring.state, 'placed', 'another participant retains their own use');
    assert.equal(
      (await resumed.command({ type: 'use-spring' })).ok,
      false,
      'an unplaced spring cannot be fired during a race'
    );
    assert.equal(
      (await resumed.command({ type: 'place-spring', x: 18, y: 35, direction: 0 })).ok,
      true,
      'participants can also place a spring after the race starts'
    );
    const afterUse = await connect(port, guest2Session.cookie);
    clients.push(afterUse);
    assert.equal(afterUse.frame.personalSpring.state, 'used', 'used state survives refresh and another tab');
    assert.equal((await afterUse.command({ type: 'use-spring' })).ok, false);
    await host.command({ type: 'reset' });
    await afterUse.until(() => afterUse.frame.personalSpring.state === 'available');
    assert.equal(afterUse.scene.placedSprings.length, 0, 'new race removes every old placement');
    assert.equal((await afterUse.command(place)).ok, true, 'new race grants one new spring');
    await host.command({ type: 'start' });
    app.race.physics.placeMarble(0, 13, 61);
    app.race.advance();
    await host.until(() => host.frame.state === 'finished');
    assert.equal(
      (await host.command({ type: 'place-spring', x: 10, y: 20, direction: 0 })).ok,
      false,
      'finished race rejects new placements'
    );
    assert.equal((await afterUse.command({ type: 'use-spring' })).ok, false);
    console.log(
      'PASS personal spring placement, public preview, four-state gating, ownership, one use, duplicate requests, reconnect, physical launch/removal and new-race reset'
    );

    await host.command({ type: 'reset' });
    await Promise.all(
      [host, resumed, afterUse].map((client) =>
        client.until(() => client.frame.state === 'ready' && client.frame.personalSpring.state === 'available')
      )
    );
    const placements = await Promise.all([
      host.command({ type: 'place-spring', x: 18, y: 15, direction: 0 }),
      resumed.command({ type: 'place-spring', x: 8, y: 35, direction: Math.PI }),
      afterUse.command(place),
    ]);
    assert.ok(
      placements.every((result) => result.ok),
      'independent participants can place concurrently'
    );
    await host.until(() => host.scene.placedSprings.length === 3);
    assert.equal(new Set(host.scene.placedSprings.map((spring) => spring.id)).size, 3);
    await host.command({ type: 'start' });
    const uses = await Promise.all([
      host.command({ type: 'use-spring' }),
      resumed.command({ type: 'use-spring' }),
      afterUse.command({ type: 'use-spring' }),
      personalReconnect.command({ type: 'use-spring' }),
    ]);
    assert.equal(
      uses.filter((result) => result.ok).length,
      3,
      'two tabs racing on the same session still get only one use'
    );
    assert.equal(
      app.race.physics.getEntities().length,
      3,
      'concurrent requests create exactly one body per participant'
    );
    await Promise.all(
      [host, resumed, afterUse].map((client) => client.until(() => client.frame.personalSpring.state === 'used'))
    );
    for (let i = 0; i < 65; i++) app.race.advance();
    await host.until(() => host.scene.entities.length === 0);
    assert.equal(
      app.race.physics.world.GetBodyCount(),
      Object.keys(app.race.physics.marbleMap).length,
      'all simultaneous spring bodies are removed'
    );
    console.log(
      'PASS simultaneous participant placement/use, same-session racing requests and complete physical cleanup'
    );

    const slidingStage = {
      ...personalStage,
      title: '배치 목록과 움직이는 장치',
      entities: [
        {
          position: { x: 13, y: 30 },
          type: 'kinematic',
          shape: { type: 'box', width: 2, height: 0.2, rotation: 0 },
          props: { density: 1, restitution: 0.8, angularVelocity: 0, sliding: { amplitude: 4, period: 4, phase: 0 } },
        },
      ],
    };
    await host.command({ type: 'reset' });
    await host.command({
      type: 'configure',
      settings: { ...settings, names: '기준점 검사', picks: 1, stage: slidingStage },
    });
    await resumed.until(() => resumed.scene.stage.title === slidingStage.title);
    const originalBases = structuredClone(resumed.scene.entities),
      staleRaceId = resumed.scene.raceId;
    await host.command({ type: 'start' });
    for (let i = 0; i < 15; i++) app.race.advance();
    assert.notEqual(app.race.physics.getEntities()[0].x, originalBases[0].x);
    assert.equal((await resumed.command({ type: 'place-spring', x: 18, y: 20, direction: 0 })).ok, true);
    assert.deepEqual(
      resumed.scene.entities,
      originalBases,
      'preview-only changes keep old frame position bases even while a device moves'
    );
    await resumed.until(() => resumed.frame.positions?.some(([index, x]) => index === 0 && x !== originalBases[0].x));
    await host.command({ type: 'reset' });
    await resumed.until(
      () => resumed.scene.raceId !== staleRaceId && resumed.frame.personalSpring.state === 'available'
    );
    assert.equal(
      (await resumed.command({ ...place, raceId: staleRaceId })).ok,
      false,
      'delayed old-race placement cannot consume the new allocation'
    );
    assert.equal(
      (await resumed.command({ type: 'use-spring', raceId: staleRaceId })).ok,
      false,
      'delayed old-race activation cannot affect the new race'
    );
    assert.equal(resumed.frame.personalSpring.state, 'available');
    assert.equal(resumed.scene.placedSprings.length, 0);
    console.log('PASS moving-device frame bases across placement and delayed placement/use rejection after reset');

    await host.command({ type: 'reset' });
    await host.command({ type: 'configure', settings: { ...settings, names: '부하테스트*300', mapId: 8 } });
    for (let i = 0; i < 7; i++) {
      const session = await request(port, '/api/session', { method: 'POST' });
      clients.push(await connect(port, session.cookie));
    }
    const watchers = clients.filter((c) => c.ws.readyState === WebSocket.OPEN);
    realtime = true;
    await host.command({ type: 'start' });
    const firstSeqs = watchers.map((c) => c.frame.seq),
      firstBytes = watchers.map((c) => c.bytes);
    const wallStart = performance.now(),
      elapsedStart = app.race.elapsed;
    await delay(5000);
    const wallSeconds = (performance.now() - wallStart) / 1000,
      simulated = app.race.elapsed - elapsedStart;
    const frameCounts = watchers.map((c, i) => c.frame.seq - firstSeqs[i]);
    assert.ok(watchers.every((c) => c.frame.balls.length === 300));
    assert.ok(Math.min(...frameCounts) >= 50, '10 viewers keep receiving live frames at useful frequency');
    assert.ok(simulated > 3, '300-marble server remains responsive during real-time load');
    console.log(
      `PASS 300 marbles / ${watchers.length} connections: ${wallSeconds.toFixed(1)}s wall, ${simulated.toFixed(1)}s simulated, ${Math.min(...frameCounts)}+ frames, ~${Math.round((watchers[0].bytes - firstBytes[0]) / wallSeconds / 1024)} KiB/s per viewer`
    );
    const lateSession = await request(port, '/api/session', { method: 'POST' });
    const late = await connect(port, lateSession.cookie);
    clients.push(late);
    assert.equal(late.frame.state, 'running');
    assert.equal(late.frame.balls.length, 300);
    assert.ok(late.frame.elapsed >= simulated, 'mid-race arrival receives current snapshot');
    console.log('PASS mid-race join and full state synchronization');
  } finally {
    clients.forEach((c) => {
      c.ws.terminate();
    });
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
