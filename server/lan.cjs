const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, randomUUID } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
// This Box2D build loads local WASM through Node's fs path, not global fetch.
global.fetch = undefined;
const { Race } = require('../.lan-build/race.js');
const { stages } = require('../.lan-build/data/maps.js');
const { parseNames, winningRange, validateStage } = require('../.lan-build/model.js');
const { LAN_PORT } = require('../.lan-build/lan/protocol.js');
const titles = ['네온 믹서', '욕망의 항아리', '네온 분기점', '캐스케이드', '네온 파이프라인', '네온 오비트'];
const loopback = (ip) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
const round = (n) => Math.round(n * 1000) / 1000;
const allowedKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every((key) => keys.includes(key));
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

async function createLanServer({ port = LAN_PORT, host = '0.0.0.0' } = {}) {
  const race = new Race();
  await race.physics.init();
  let settings = { names: '', mapId: 0, order: 'desc', picks: 2 };
  let raceId, revision = 0, scene, seq = 0;
  let accumulator = 0, lastTick = performance.now();
  let speed = 1, boostOwner = null, boostUntil = 0;
  const sessions = new Map(), clients = new Map(), attempts = new Map();
  const publicDir = path.resolve(__dirname, '../.lan-dist');
  const interfaces = Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    entries.filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => ({ name, address: entry.address })));
  interfaces.sort((a, b) => Number(/virtual|vethernet|wsl|vpn/i.test(a.name)) - Number(/virtual|vethernet|wsl|vpn/i.test(b.name)));
  let actualPort = port;
  const allowedHosts = () => new Set(['127.0.0.1', 'localhost', ...interfaces.map((i) => i.address)]
    .map((address) => `${address}:${actualPort}`));
  const validOrigin = (req) => allowedHosts().has(req.headers.host) && req.headers.origin === `http://${req.headers.host}`;
  const info = () => ({
    maps: stages.map((s, id) => ({ id, title: titles[id] ?? s.title })),
    addresses: (interfaces.length ? interfaces : [{ name: '이 PC에서만 접속 가능', address: '127.0.0.1' }])
      .map((i) => ({ name: `${i.name} · ${i.address}`, url: `http://${i.address}:${actualPort}/` })),
  });
  const sessionOf = (req) => {
    const token = /(?:^|;\s*)pinball_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    const session = sessions.get(token);
    if (!session || Date.now() - session.touched > 12 * 3600_000) return null;
    if (session.role === 'host' && !loopback(req.socket.remoteAddress)) return null;
    session.touched = Date.now();
    return session;
  };
  const limited = (ip, kind, maximum, period) => {
    const key = `${ip}:${kind}`, now = Date.now();
    let entry = attempts.get(key);
    if (!entry || now > entry.until) attempts.set(key, entry = { count: 0, until: now + period });
    return ++entry.count > maximum;
  };
  const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  const send = (ws, value) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 1024 * 1024) return ws.terminate();
    ws.send(typeof value === 'string' ? value : JSON.stringify(value));
  };
  const identity = (session) => ({ type: 'identity', role: session.role });
  function makeScene(entities = race.physics.getEntities()) {
    const fixed = new Set((race.stage.entities ?? []).filter((e) => e.type === 'static' && (e.props.life ?? -1) <= 0).map((e) => e.shape));
    scene = { type: 'scene', raceId, revision: ++revision, stage: race.stage, settings: { ...settings },
      entities, fixed: entities.map((e) => fixed.has(e.shape)),
      balls: race.balls.map(({ id, name, color }) => ({ id, name, color })) };
    for (const ws of clients.keys()) send(ws, scene);
  }
  function prepare() {
    raceId = randomUUID();
    accumulator = 0; boostOwner = null;
    race.prepare(settings.stage ?? { ...stages[settings.mapId], title: titles[settings.mapId] ?? stages[settings.mapId].title },
      parseNames(settings.names));
    makeScene();
  }
  function playbackRate() {
    const active = race.balls.filter((b) => !b.rank).sort((a, b) => b.y - a.y);
    const target = active[Math.min(active.length - 1, Math.max(0, race.range[1] - race.arrivals.length - 1))];
    const slow = !race.winners.length && target && target.y > race.stage.goalY - 4 ? .45 : 1;
    return speed * (boostOwner && performance.now() < boostUntil ? 2 : 1) * slow;
  }
  function frame() {
    const entities = race.physics.getEntities();
    if (entities.length !== scene.entities.length) makeScene(entities);
    return { type: 'frame', raceId, revision, seq: ++seq, time: performance.now(), elapsed: race.elapsed,
      state: race.state, connected: clients.size, speed, playbackRate: playbackRate(),
      balls: race.balls.map((b) => [b.id, round(b.x), round(b.y), round(b.angle), b.rank ?? 0]),
      angles: entities.map((e) => round(e.angle)), winners: race.winners.map((b) => b.id) };
  }
  function broadcast() {
    const data = JSON.stringify(frame());
    for (const ws of clients.keys()) if (ws.bufferedAmount < 256 * 1024) send(ws, data);
  }
  function execute(session, msg) {
    requireThat(typeof msg.raceId === 'string' && msg.raceId === raceId, '경기가 바뀌었어요. 최신 화면에서 다시 시도해 주세요.');
    const keys = { configure: ['settings'], start: [], pause: [], reset: [], speed: ['value'], boost: ['active'] };
    requireThat(Object.hasOwn(keys, msg.type) && allowedKeys(msg, ['type', 'requestId', 'raceId', ...keys[msg.type]]), '허용되지 않은 요청입니다.');
    requireThat(session.role === 'host', '관람자는 경기를 조작할 수 없습니다.');
    if (msg.type === 'configure') {
      requireThat(race.state !== 'running' && race.state !== 'paused', '진행 중인 경기는 먼저 다시 준비해 주세요.');
      const s = msg.settings;
      requireThat(allowedKeys(s, ['names', 'mapId', 'order', 'picks', 'stage']) && typeof s.names === 'string'
        && s.names.length <= 15000 && Number.isInteger(s.mapId) && !!stages[s.mapId], '경기 설정이 올바르지 않습니다.');
      const names = parseNames(s.names);
      if (names.length) winningRange(s.order, names.length, s.picks);
      else requireThat(['asc', 'desc'].includes(s.order) && s.picks === 0, '경기 설정이 올바르지 않습니다.');
      settings = { ...s, ...(s.stage !== undefined ? { stage: validateStage(s.stage) } : {}) };
      prepare();
    } else if (msg.type === 'start') {
      requireThat(race.state === 'ready', '다시 준비한 뒤 시작해 주세요.');
      race.startRace(winningRange(settings.order, race.balls.length, settings.picks), settings.order);
      accumulator = 0;
    } else if (msg.type === 'pause') {
      requireThat(race.state === 'running' || race.state === 'paused', '진행 중인 경기가 없습니다.');
      race.pause(); accumulator = 0; boostOwner = null;
    } else if (msg.type === 'reset') {
      prepare();
    } else if (msg.type === 'speed') {
      requireThat([.5, 1, 2, 4].includes(msg.value), '지원하지 않는 배속입니다.');
      speed = msg.value;
    } else if (msg.type === 'boost') {
      requireThat(typeof msg.active === 'boolean', '가속 요청이 올바르지 않습니다.');
      if (msg.active) {
        requireThat(race.state === 'running', '경기 중에만 가속할 수 있습니다.');
        boostOwner = session; boostUntil = performance.now() + 1500;
      } else if (boostOwner === session) boostOwner = null;
    }
  }
  prepare();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (!allowedHosts().has(req.headers.host)) return json(res, 403, { error: '허용되지 않은 접속 주소입니다.' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'POST' && ['/api/session', '/api/host-session'].includes(url.pathname)) {
      if (!validOrigin(req)) return json(res, 403, { error: '접속 출처를 확인할 수 없습니다.' });
      const isHost = url.pathname === '/api/host-session';
      if (isHost && (!loopback(req.socket.remoteAddress) || !['127.0.0.1', 'localhost'].includes(url.hostname)))
        return json(res, 403, { error: '관리자 화면은 서버 PC의 localhost에서만 열 수 있습니다.' });
      if (limited(req.socket.remoteAddress, 'session', 60, 60_000)) return json(res, 429, { error: '잠시 후 다시 접속해 주세요.' });
      let session = sessionOf(req);
      if (!session) {
        for (const [token, old] of sessions) if (Date.now() - old.touched > 12 * 3600_000) sessions.delete(token);
        if (sessions.size >= 2000) return json(res, 503, { error: '접속자가 많습니다.' });
        const token = randomBytes(32).toString('hex');
        session = { token, role: 'viewer', touched: Date.now(), results: new Map() };
        sessions.set(token, session);
      }
      if (isHost) session.role = 'host';
      res.setHeader('Set-Cookie', `pinball_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
      return json(res, 200, identity(session));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '지원하지 않는 요청입니다.' });
    if (url.pathname === '/api/info') return json(res, 200, info());
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, state: race.state, clients: clients.size, count: race.balls.length });
    const file = ['/', '/host'].includes(url.pathname) ? 'lan.html' : url.pathname.slice(1);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(html|js|css|svg|png|ico|txt)$/.test(file))
      return json(res, 404, { error: '페이지를 찾을 수 없습니다.' });
    const target = path.join(publicDir, file);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return json(res, 404, { error: 'LAN 화면을 먼저 빌드해 주세요.' });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] ?? 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const session = sessionOf(req);
    if (req.url !== '/live' || !validOrigin(req) || !session || clients.size >= 128) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    if ([...clients.values()].filter((c) => c.session === session).length >= 4) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = { session, alive: true, count: 0, window: Date.now() };
      clients.set(ws, client);
      ws.on('error', () => ws.terminate());
      ws.on('pong', () => { client.alive = true; session.touched = Date.now(); });
      ws.on('close', () => { clients.delete(ws); if (boostOwner === session) boostOwner = null; });
      ws.on('message', (data, binary) => {
        if (Date.now() - client.window > 1000) { client.window = Date.now(); client.count = 0; }
        if (binary || ++client.count > 30) return ws.close(1008, 'Too many requests');
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return ws.close(1008, 'Invalid JSON'); }
        if (!msg || typeof msg.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(msg.requestId))
          return ws.close(1008, 'Invalid request ID');
        const prior = session.results.get(msg.requestId);
        if (prior) return send(ws, prior);
        let result;
        try { execute(session, msg); result = { type: 'result', requestId: msg.requestId, ok: true }; }
        catch (error) { result = { type: 'result', requestId: msg.requestId, ok: false, error: error.message }; }
        session.results.set(msg.requestId, result);
        if (session.results.size > 64) session.results.delete(session.results.keys().next().value);
        send(ws, result); broadcast();
      });
      send(ws, scene); send(ws, frame()); send(ws, identity(session));
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  actualPort = server.address().port;
  const timer = setInterval(() => {
    const now = performance.now(), delta = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    if (race.state !== 'running') { accumulator = 0; return; }
    const rate = playbackRate();
    accumulator += delta * rate;
    let steps = 0;
    while (accumulator >= 1 / 60 && race.state === 'running' && steps < Math.max(6, Math.ceil(rate * 2)) && performance.now() - now < 12) {
      race.advance(); accumulator -= 1 / 60; steps++;
    }
    // Keep collision steps fixed; shed overdue wall time instead of starving connections.
    if (accumulator >= 1 / 60) accumulator %= 1 / 60;
  }, 8);
  const snapshots = setInterval(broadcast, 50);
  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.alive || ws.bufferedAmount > 1024 * 1024) { ws.terminate(); continue; }
      client.alive = false; ws.ping();
    }
    for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
  }, 10_000);
  return { port: actualPort, race, info,
    async close() {
      clearInterval(timer); clearInterval(snapshots); clearInterval(heartbeat);
      for (const ws of clients.keys()) ws.terminate();
      wss.close();
      await new Promise((resolve) => server.close(resolve));
      race.physics.clearMarbles(); race.physics.clear();
    },
  };
}

module.exports = { createLanServer };
if (require.main === module) {
  createLanServer({ port: Number(process.env.PINBALL_PORT ?? LAN_PORT) }).then((app) => {
    const adminUrl = `http://127.0.0.1:${app.port}/host`;
    console.log(`\n관리자: ${adminUrl}`);
    app.info().addresses.forEach((a) => console.log(`참가자: ${a.url} (${a.name})`));
    console.log('종료: Ctrl+C · 같은 네트워크에서 참가자 주소로 접속하세요.\n');
    if (process.argv.includes('--open')) {
      require('node:child_process').spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${adminUrl}'`],
        { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
    }
    let stopping = false;
    const stop = () => { if (!stopping) { stopping = true; app.close().then(() => process.exit(0)); } };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }).catch((error) => { console.error(error.code === 'EADDRINUSE' ? '이미 LAN 서버가 실행 중입니다. 관리자 주소를 열어 주세요.' : error.message); process.exitCode = 1; });
}
