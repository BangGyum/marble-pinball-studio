const assert = require('node:assert/strict'), http = require('node:http'), { WebSocket } = require('ws');
const { createLanServer } = require('../server/lan.cjs');
const { decodeScene } = require('../.lan-build/lan/protocol.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const session = (port, host) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port, path: host ? '/api/host-session' : '/api/session', method: 'POST',
    headers: { Origin: `http://127.0.0.1:${port}` } }, res => {
    res.resume(); res.on('end', () => resolve(res.headers['set-cookie'][0].split(';')[0]));
  }); req.on('error', reject); req.end();
});
async function connect(port, host = false) {
  const cookie = await session(port, host), messages = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/live`, { headers: { Origin: `http://127.0.0.1:${port}`, Cookie: cookie } });
  const client = { ws, messages, scene: null, frame: null };
  ws.on('message', raw => { const msg = JSON.parse(raw); messages.push(msg); if (msg.type === 'scene') client.scene = decodeScene(msg); if (msg.type === 'frame') client.frame = msg; });
  client.until = async predicate => { const deadline = Date.now() + 5000; while (!predicate()) { assert.ok(Date.now() < deadline, 'LAN response timeout'); await wait(10); } };
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  await client.until(() => client.scene && client.frame);
  let seq = 0;
  client.command = async input => {
    const requestId = `dolphin_${++seq}`; ws.send(JSON.stringify({ ...input, requestId, raceId: client.scene.raceId }));
    await client.until(() => messages.some(m => m.type === 'result' && m.requestId === requestId));
    return messages.find(m => m.type === 'result' && m.requestId === requestId);
  };
  return client;
}
(async () => {
  const frozen = performance.now(), app = await createLanServer({ port: 0, simulationNow: () => frozen }), clients = [];
  try {
    const host = await connect(app.port, true), guest = await connect(app.port); clients.push(host, guest);
    const dolphins = { enabled: true, rows: [12, 22, 32], interval: 5, size:150 };
    const settings = { names: 'a,b,c,d', mapId: 0, order: 'asc', picks: 1, dolphins };
    assert.equal((await guest.command({ type: 'configure', settings })).ok, false, 'viewer cannot change dolphin settings');
    assert.equal((await host.command({ type: 'configure', settings })).ok, true);
    await guest.until(() => guest.scene.settings.dolphins?.interval === 5);
    assert.deepEqual(guest.scene.settings.dolphins, dolphins); assert.deepEqual(app.race.dolphins, dolphins);
    const preparedId = host.scene.raceId, preparedBalls = JSON.stringify(app.race.balls);
    dolphins.interval = 9;
    dolphins.size = 200;
    assert.equal((await host.command({ type:'configure', settings })).ok,true);
    assert.equal(host.scene.raceId,preparedId,'changing only dolphin options preserves the prepared race');
    assert.equal(JSON.stringify(app.race.balls),preparedBalls,'dolphin options do not reshuffle the prepared marbles');
    await guest.until(()=>guest.scene.settings.dolphins?.interval===9);
    assert.equal(guest.scene.settings.dolphins.size,200);assert.equal(app.race.dolphins.size,200);
    assert.equal((await host.command({ type:'configure', settings })).ok,true);
    assert.notEqual(host.scene.raceId,preparedId,'explicit reconfigure with identical options still shuffles a new round');
    const raceId = host.scene.raceId;
    for (const invalid of [{ ...dolphins, interval: 4.99 }, { ...dolphins, rows: [12, 12] }, { ...dolphins, rows: [999] },
      { ...dolphins, rows: Array(7).fill(12) }, { ...dolphins, unexpected: true },{...dolphins,size:49},{...dolphins,size:201}]) {
      assert.equal((await host.command({ type: 'configure', settings: { ...settings, dolphins: invalid } })).ok, false);
      assert.equal(host.scene.raceId, raceId, 'invalid settings preserve the prepared race');
    }
    assert.equal((await host.command({ type: 'start' })).ok, true);
    assert.equal((await host.command({ type: 'configure', settings })).ok, false, 'settings are locked during a race');
    for (let i = 0; i < 510 && app.race.state === 'running'; i++) app.race.advance();
    const late = await connect(app.port); clients.push(late);
    assert.deepEqual(late.scene.settings.dolphins, dolphins, 'late join receives row positions and interval');
    assert.ok(late.frame.elapsed > 0, 'late join receives the authoritative effect clock');
    if (app.race.state === 'running') {
      assert.equal((await host.command({ type: 'pause' })).ok, true); const at = app.race.elapsed;
      await wait(100); assert.equal(app.race.elapsed, at, 'pause freezes effect time');
      assert.equal((await host.command({ type: 'configure', settings })).ok, false, 'pause does not unlock settings');
    }
    assert.equal((await host.command({ type: 'reset' })).ok, true); assert.deepEqual(app.race.dolphins, dolphins);
    assert.equal(app.race.elapsed, 0, 'reset restarts the effect clock');
    console.log('PASS LAN dolphin settings, viewer restrictions, invalid input, running/pause locks, late join and reset');
  } finally { for (const c of clients) c.ws.terminate(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
