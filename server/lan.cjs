const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, randomUUID } = require('node:crypto');
const { WebSocketServer } = require('ws');
// This Box2D build loads local WASM through Node's fs path, not global fetch.
Reflect.deleteProperty(globalThis, 'fetch');
const { visibleBuiltins } = require('../.lan-build/data/maps.js');
const { LAN_PORT, MAX_LAN_MESSAGE_BYTES } = require('../.lan-build/lan/protocol.js');
const { createRaceRoom } = require('../.lan-build/lan/room-core.js');
const MAX_LAN_BUFFERED_BYTES = 2 * MAX_LAN_MESSAGE_BYTES;
/** @typedef {import('../src/lan/room-core').RoomSession & { token: string; touched: number }} Session */
const loopback = (ip) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
function readParticipantName(value) {
  if (typeof value !== 'string') return '';
  try {
    const name = decodeURIComponent(value).trim();
    if (name.length <= 24 && !/[\p{Cc}\u2028-\u202e\u2066-\u2069]/u.test(name)) return name;
  } catch {}
  return '';
}

async function createLanServer({ port = LAN_PORT, host = '0.0.0.0', simulationNow = () => performance.now() } = {}) {
  const room = await createRaceRoom(
    simulationNow,
    (task) => {
      const immediate = setImmediate(task);
      return () => clearImmediate(immediate);
    },
    randomUUID
  );
  const { race, advance } = room;
  /** @type {Map<string, Session>} */
  const sessions = new Map();
  /** @type {Map<import('ws').WebSocket, { session: Session; alive: boolean }>} */
  const clients = new Map();
  const attempts = new Map();
  const publicDir = path.resolve(__dirname, '../.lan-dist');
  const interfaces = Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => ({ name, address: entry.address }))
  );
  interfaces.sort(
    (a, b) => Number(/virtual|vethernet|wsl|vpn/i.test(a.name)) - Number(/virtual|vethernet|wsl|vpn/i.test(b.name))
  );
  let actualPort = port;
  const allowedHosts = () =>
    new Set(
      ['127.0.0.1', 'localhost', ...interfaces.map((i) => i.address)].map((address) => `${address}:${actualPort}`)
    );
  const validOrigin = (req) =>
    allowedHosts().has(req.headers.host) && req.headers.origin === `http://${req.headers.host}`;
  /** @returns {import('../src/lan/protocol').Info} */
  const info = () => ({
    maps: visibleBuiltins.map(({ id, stage }) => ({ id, title: stage.title })),
    addresses: (interfaces.length ? interfaces : [{ name: '이 PC에서만 접속 가능', address: '127.0.0.1' }]).map(
      (i) => ({ name: `${i.name} · ${i.address}`, url: `http://${i.address}:${actualPort}/` })
    ),
  });
  const sessionOf = (req) => {
    const token = /(?:^|;\s*)pinball_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    if (!token) return null;
    const session = sessions.get(token);
    if (!session || Date.now() - session.touched > 12 * 3600_000) return null;
    if (session.role === 'host' && !loopback(req.socket.remoteAddress)) return null;
    session.touched = Date.now();
    return session;
  };
  const limited = (ip, kind, maximum, period) => {
    const key = `${ip}:${kind}`,
      now = Date.now();
    let entry = attempts.get(key);
    if (!entry || now > entry.until) {
      entry = { count: 0, until: now + period };
      attempts.set(key, entry);
    }
    return ++entry.count > maximum;
  };
  const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  /** @param {Session} session @returns {import('../src/lan/protocol').Identity} */
  const identity = (session) => ({ type: 'identity', role: session.role, name: session.name });
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
    );
    if (!allowedHosts().has(req.headers.host ?? '')) return json(res, 403, { error: '허용되지 않은 접속 주소입니다.' });
    let url;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    } catch {
      return json(res, 400, { error: '요청 주소가 올바르지 않습니다.' });
    }
    if (req.method === 'POST' && ['/api/session', '/api/host-session'].includes(url.pathname)) {
      if (!validOrigin(req)) return json(res, 403, { error: '접속 출처를 확인할 수 없습니다.' });
      const isHost = url.pathname === '/api/host-session';
      if (isHost && (!loopback(req.socket.remoteAddress) || !['127.0.0.1', 'localhost'].includes(url.hostname)))
        return json(res, 403, { error: '관리자 화면은 서버 PC의 localhost에서만 열 수 있습니다.' });
      if (limited(req.socket.remoteAddress, 'session', 60, 60_000))
        return json(res, 429, { error: '잠시 후 다시 접속해 주세요.' });
      let session = sessionOf(req);
      const suppliedName = req.headers['x-participant-name'],
        name = readParticipantName(suppliedName);
      if (!isHost && suppliedName !== undefined && !name)
        return json(res, 400, { error: '이름을 1~24자로 입력해 주세요.' });
      if (!isHost && session && name && session.name !== name)
        return json(res, 409, { error: '입장할 때 등록한 이름은 바꿀 수 없어요.' });
      if (!session) {
        if (!isHost && !name) return json(res, 428, { error: '입장할 이름을 입력해 주세요.' });
        for (const [token, old] of sessions) if (Date.now() - old.touched > 12 * 3600_000) sessions.delete(token);
        if (sessions.size >= 2000) return json(res, 503, { error: '접속자가 많습니다.' });
        const token = randomBytes(32).toString('hex');
        session = { token, role: 'viewer', name: isHost ? '방장' : name, touched: Date.now(), results: new Map() };
        sessions.set(token, session);
      }
      if (isHost) session.role = 'host';
      res.setHeader('Set-Cookie', `pinball_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
      return json(res, 200, identity(session));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '지원하지 않는 요청입니다.' });
    if (url.pathname === '/api/info') return json(res, 200, info());
    if (url.pathname === '/api/health')
      return json(res, 200, { ok: true, state: race.state, clients: clients.size, count: race.balls.length });
    const file = ['/', '/host'].includes(url.pathname) ? 'lan.html' : url.pathname.slice(1);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(html|js|css|svg|png|webp|ico|txt)$/.test(file))
      return json(res, 404, { error: '페이지를 찾을 수 없습니다.' });
    const target = path.join(publicDir, file);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile())
      return json(res, 404, { error: 'LAN 화면을 먼저 빌드해 주세요.' });
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, {
      'Content-Type': (types[path.extname(file)] ?? 'text/plain') + '; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target)
      .on('error', () => res.destroy())
      .pipe(res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_LAN_MESSAGE_BYTES, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const session = sessionOf(req);
    if (req.url !== '/live' || !validOrigin(req) || !session || clients.size >= 128) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    if ([...clients.values()].filter((c) => c.session === session).length >= 4) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = { session, alive: true };
      clients.set(ws, client);
      ws.on('error', () => ws.terminate());
      ws.on('pong', () => {
        client.alive = true;
        session.touched = Date.now();
      });
      ws.on('close', () => {
        clients.delete(ws);
        room.disconnect(ws);
      });
      ws.on('message', (data, binary) => {
        if (binary) return ws.close(1008, 'Too many requests');
        room.receive(ws, data.toString());
      });
      room.connect(ws, session);
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve(undefined));
    });
  } catch (error) {
    room.close();
    wss.close();
    throw error;
  }
  actualPort = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.alive || ws.bufferedAmount > MAX_LAN_BUFFERED_BYTES) {
        ws.terminate();
        continue;
      }
      client.alive = false;
      ws.ping();
    }
    for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
  }, 10_000);
  return {
    port: actualPort,
    race,
    advance,
    info,
    async close() {
      clearInterval(heartbeat);
      room.close();
      wss.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { createLanServer };
if (require.main === module) {
  createLanServer({ port: Number(process.env.PINBALL_PORT ?? LAN_PORT) })
    .then((app) => {
      const adminUrl = `http://127.0.0.1:${app.port}/host`;
      console.log(`\n관리자: ${adminUrl}`);
      app.info().addresses.forEach((a) => {
        console.log(`참가자: ${a.url} (${a.name})`);
      });
      console.log('종료: Ctrl+C · 같은 네트워크에서 참가자 주소로 접속하세요.\n');
      if (process.argv.includes('--open')) {
        require('node:child_process')
          .spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${adminUrl}'`], {
            windowsHide: true,
            stdio: 'ignore',
          })
          .on('error', () => {});
      }
      let stopping = false;
      const stop = () => {
        if (!stopping) {
          stopping = true;
          app.close().then(() => process.exit(0));
        }
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    })
    .catch((error) => {
      console.error(
        error.code === 'EADDRINUSE' ? '이미 LAN 서버가 실행 중입니다. 관리자 주소를 열어 주세요.' : error.message
      );
      process.exitCode = 1;
    });
}
