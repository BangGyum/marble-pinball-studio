const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocket } = require('ws');
const { createLanServer } = require('../server/lan.cjs');
const { DEFAULT_MAP_INDEX } = require('../.lan-build/data/maps.js');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function request(port, route, { method = 'GET', cookie, host = `127.0.0.1:${port}`, origin = `http://${host}`, address = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: address, port, path: route, method,
      headers: { Host: host, Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } }, (res) => {
      let body = ''; res.on('data', (chunk) => body += chunk); res.on('end', () => resolve({ status: res.statusCode, body, cookie: res.headers['set-cookie']?.[0].split(';')[0] }));
    });
    req.on('error', reject); req.end();
  });
}
let nextId = 0;
async function connect(port, cookie, options = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/live`, { headers: { Cookie: cookie, Origin: options.origin ?? `http://127.0.0.1:${port}` } });
  const client = { ws, messages: [], frame: null, scene: null, identity: null, bytes: 0 };
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw); client.messages.push(msg); client.bytes += raw.length;
    if (client.messages.length > 1000) client.messages.shift();
    if (msg.type === 'frame') client.frame = msg;
    if (msg.type === 'scene') client.scene = msg;
    if (msg.type === 'identity') client.identity = msg;
  });
  client.until = async (predicate, timeout = 5000) => {
    const deadline = Date.now() + timeout;
    while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out waiting for LAN state'); await delay(10); }
  };
  client.command = async (msg, id = `request_${++nextId}`) => {
    const start = client.messages.length;
    ws.send(JSON.stringify({ raceId: client.scene.raceId, ...msg, requestId: id }));
    let result;
    await client.until(() => result = client.messages.slice(start).find((m) => m.type === 'result' && m.requestId === id));
    return result;
  };
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  await client.until(() => client.frame && client.scene && client.identity);
  return client;
}

(async () => {
  const app = await createLanServer({ port: 0 });
  const clients = [];
  try {
    const port = app.port;
    const guestSession = await request(port, '/api/session', { method: 'POST' });
    const guest2Session = await request(port, '/api/session', { method: 'POST' });
    const hostSession = await request(port, '/api/host-session', { method: 'POST' });
    assert.equal(hostSession.status, 200);
    assert.deepEqual(JSON.parse(hostSession.body), { type: 'identity', role: 'host' });
    assert.deepEqual(JSON.parse(guestSession.body), { type: 'identity', role: 'viewer' });
    const host = await connect(port, hostSession.cookie), guest = await connect(port, guestSession.cookie), guest2 = await connect(port, guest2Session.cookie);
    clients.push(host, guest, guest2);
    assert.equal((await request(port, '/api/host-session', { method: 'POST', origin: 'https://evil.example' })).status, 403);
    assert.equal((await request(port, '/api/session', { method: 'POST', host: `evil.example:${port}` })).status, 403);
    assert.equal((await request(port, '/api/qr', { cookie: guestSession.cookie })).status, 404);
    assert.equal((await request(port, '/api/qr', { cookie: hostSession.cookie })).status, 404);
    const lan = app.info().addresses.find((a) => !a.url.includes('127.0.0.1'));
    if (lan) {
      const url = new URL(lan.url);
      assert.equal((await request(port, '/api/host-session', { method: 'POST', address: url.hostname, host: url.host })).status, 403,
        'LAN clients cannot bootstrap a host session');
      assert.equal((await request(port, '/api/host-session', { method: 'POST', address: url.hostname })).status, 403,
        'forged localhost Host header cannot grant a LAN client admin access');
      const copiedSession = await request(port, '/api/session', { method: 'POST', address: url.hostname, host: url.host, cookie: hostSession.cookie });
      assert.equal(JSON.parse(copiedSession.body).role, 'viewer', 'host cookie cannot be reused over LAN');
      assert.equal((await request(port, '/api/health', { address: url.hostname, host: url.host })).status, 200);
    }
    await assert.rejects(connect(port, guestSession.cookie, { origin: 'https://evil.example' }));
    assert.deepEqual(guest.scene.settings, { names: '', mapId: DEFAULT_MAP_INDEX, order: 'desc', picks: 2 });
    assert.equal(guest.scene.stage.title, '네온 분기점');
    const settings = { names: '동명이인, 동명이인, 참가자*26', mapId: 4, order: 'desc', picks: 2 };
    for (const command of [{ type: 'configure', settings }, { type: 'start' }, { type: 'pause' }, { type: 'reset' },
      { type: 'claim', code: '0123456789' }, { type: 'release', participantId: 'x' }, { type: 'skill', skill: 'jump' },
      { type: 'focus', ballId: 0 }, { type: 'position', ballId: 0, x: 0, y: 100 },
      { type: 'speed', value: 4 }, { type: 'boost', active: true }])
      assert.equal((await guest.command(command)).ok, false, 'viewers cannot mutate the race through any command');
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, mapId: -1 } })).ok, false);
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, skills: true } })).ok, false, 'removed skill setting is not accepted');
    assert.equal((await host.command({ type: 'configure', settings })).ok, true);
    await guest.until(() => guest.scene.balls.length === 28);
    assert.equal(guest.frame.state, 'ready');
    const [first, second] = guest.scene.balls.filter((b) => b.name === '동명이인');
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.color, second.color, 'same-name marbles remain individually selectable');
    assert.ok(guest.scene.balls.every((b) => b.name && b.color && Object.keys(b).sort().join() === 'color,id,name'),
      'all names and colors are available before the race without ownership or codes');
    assert.equal(host.messages.some((m) => m.type === 'invitations'), false);
    assert.deepEqual(guest.scene.balls, guest2.scene.balls, 'everyone sees the same prepared roster');
    const viewerCookie = guestSession.cookie;
    guest.ws.close();
    await delay(40);
    const resumedSession = await request(port, '/api/session', { method: 'POST', cookie: viewerCookie });
    assert.equal(resumedSession.cookie, viewerCookie);
    const resumed = await connect(port, viewerCookie); clients.push(resumed);
    assert.deepEqual(resumed.identity, { type: 'identity', role: 'viewer' });
    assert.deepEqual(resumed.scene.balls, guest2.scene.balls, 'reconnect restores the full selectable roster');
    assert.equal((await host.command({ type: 'start' })).ok, true);
    assert.equal((await host.command({ type: 'configure', settings })).ok, false, 'cannot reconfigure a live race');
    assert.equal((await resumed.command({ type: 'skill', skill: 'jump' })).ok, false, 'spectators cannot use skills during play');
    assert.equal((await host.command({ type: 'pause' }, 'pause_once')).ok, true);
    const pausedAt = app.race.elapsed;
    await delay(120);
    assert.equal(app.race.elapsed, pausedAt);
    assert.equal((await host.command({ type: 'pause' }, 'pause_once')).ok, true);
    assert.equal(app.race.state, 'paused', 'retrying the same pause request does not resume the race');
    const pausedBalls = resumed.frame.balls;
    for (const command of [{ type: 'pause' }, { type: 'reset' }, { type: 'skill', skill: 'jump' }, { type: 'position', ballId: first.id, y: 100 }])
      assert.equal((await resumed.command(command)).ok, false);
    assert.deepEqual(resumed.frame.balls, pausedBalls, 'spectator requests leave simulation positions untouched');
    assert.equal((await host.command({ type: 'pause' })).ok, true);
    // Advance the real engine clock without wall-clock waiting, then inspect actual socket snapshots.
    while (app.race.state !== 'finished' && app.race.elapsed < 120) app.race.advance();
    assert.equal(app.race.state, 'finished');
    await resumed.until(() => resumed.frame.state === 'finished');
    await guest2.until(() => guest2.frame.state === 'finished');
    assert.deepEqual(resumed.frame.balls, guest2.frame.balls, 'every viewer receives identical final positions and ranks');
    assert.deepEqual(resumed.frame.winners, app.race.arrivals.slice(-2).map((b) => b.id), 'DESC selects last two');
    const oldRaceId = resumed.scene.raceId;
    assert.equal((await host.command({ type: 'reset' })).ok, true);
    await resumed.until(() => resumed.scene.raceId !== oldRaceId);
    assert.equal(resumed.frame.state, 'ready');
    assert.equal(resumed.scene.balls.length, 28);
    assert.equal((await host.command({ type: 'start', raceId: oldRaceId })).ok, false, 'stale round rejected');
    console.log('PASS localhost-only admin, origins, forged LAN host/cookie rejection, read-only spectators, no QR/codes/skills, prepared roster, duplicate names, reconnect, idempotency, pause, finish, DESC 2 and reset');

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
    const paused = app.race.elapsed; await delay(60); assert.equal(app.race.elapsed, paused);
    await host.command({ type: 'reset' });
    await host.command({ type: 'speed', value: 1 });
    const custom = { ...host.scene.stage, title: '편집 맵 검증' };
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, stage: { ...custom, goalY: -1 } } })).ok, false);
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, stage: custom } })).ok, true);
    await guest2.until(() => guest2.scene.stage.title === custom.title);
    assert.equal(app.race.stage.title, custom.title);
    assert.deepEqual(guest2.scene.settings.stage, { ...custom, zoomY: custom.goalY - 5 }, 'editor map uses the same normalization as saved maps');
    assert.equal((await guest2.command({ type: 'configure', settings: { ...settings, stage: custom } })).ok, false);
    assert.equal((await host.command({ type: 'configure', settings: { ...settings, names: '', picks: 0 } })).ok, true);
    assert.equal(host.scene.balls.length, 0);
    assert.equal((await host.command({ type: 'start' })).ok, false);
    console.log('PASS restored host speed/held acceleration/pause, validated editor maps, spectator restrictions and empty roster');

    await host.command({ type: 'reset' });
    await host.command({ type: 'configure', settings: { ...settings, names: '부하테스트*300', mapId: 8 } });
    for (let i = 0; i < 7; i++) {
      const session = await request(port, '/api/session', { method: 'POST' });
      clients.push(await connect(port, session.cookie));
    }
    const watchers = clients.filter((c) => c.ws.readyState === WebSocket.OPEN);
    await host.command({ type: 'start' });
    const firstSeqs = watchers.map((c) => c.frame.seq), firstBytes = watchers.map((c) => c.bytes);
    const wallStart = performance.now(), elapsedStart = app.race.elapsed;
    await delay(5000);
    const wallSeconds = (performance.now() - wallStart) / 1000, simulated = app.race.elapsed - elapsedStart;
    const frameCounts = watchers.map((c, i) => c.frame.seq - firstSeqs[i]);
    assert.ok(watchers.every((c) => c.frame.balls.length === 300));
    assert.ok(Math.min(...frameCounts) >= 50, '10 viewers keep receiving live frames at useful frequency');
    assert.ok(simulated > 3, '300-marble server remains responsive during real-time load');
    console.log(`PASS 300 marbles / ${watchers.length} connections: ${wallSeconds.toFixed(1)}s wall, ${simulated.toFixed(1)}s simulated, ${Math.min(...frameCounts)}+ frames, ~${Math.round((watchers[0].bytes - firstBytes[0]) / wallSeconds / 1024)} KiB/s per viewer`);
    const lateSession = await request(port, '/api/session', { method: 'POST' });
    const late = await connect(port, lateSession.cookie); clients.push(late);
    assert.equal(late.frame.state, 'running');
    assert.equal(late.frame.balls.length, 300);
    assert.ok(late.frame.elapsed >= simulated, 'mid-race arrival receives current snapshot');
    console.log('PASS mid-race join and full state synchronization');
  } finally {
    clients.forEach((c) => c.ws.terminate());
    await app.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
