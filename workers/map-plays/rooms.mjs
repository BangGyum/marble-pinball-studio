import { DurableObject } from 'cloudflare:workers';

const roomCode = /^[a-f\d]{32}$/;
const hostKey = /^[a-f\d]{64}$/;
const maximumGuests = 15;
const encoder = new TextEncoder();
const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function routeRoom(request, env, url) {
  if (request.method !== 'GET' || request.headers.get('Origin') !== env.SITE_ORIGIN) return new Response(null, { status: 403 });
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, { status: 426 });
  const code = url.pathname.slice('/rooms/'.length);
  if (!roomCode.test(code)) return new Response(null, { status: 404 });
  const key = url.searchParams.get('host');
  if (key !== null) {
    if (!hostKey.test(key)) return new Response(null, { status: 403 });
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(key)));
    if (toHex(hash.subarray(0, 16)) !== code) return new Response(null, { status: 403 });
  }
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await env.ROOM_RATE.limit({ key: ip })).success) return new Response(null, { status: 429 });
  return env.LAN_ROOMS.getByName(code).fetch(request);
}

export class LanRoom extends DurableObject {
  fetch(request) {
    const hosting = new URL(request.url).searchParams.has('host');
    const host = this.ctx.getWebSockets('host').find((ws) => ws.readyState === WebSocket.OPEN);
    if (hosting && host) return new Response(null, { status: 409 });
    if (!hosting && (!host || this.ctx.getWebSockets('guest').length >= maximumGuests)) {
      return new Response(null, { status: host ? 429 : 404 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    if (hosting) {
      this.ctx.acceptWebSocket(server, ['host']);
      server.send(JSON.stringify({ type: 'ready' }));
    } else {
      const peer = crypto.randomUUID();
      this.ctx.acceptWebSocket(server, ['guest', peer]);
      server.serializeAttachment({ peer, answered: false });
      host.send(JSON.stringify({ type: 'peer', peer }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 25_000) return ws.close(1008, 'Invalid message');
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return ws.close(1008, 'Invalid message');
    }
    if (typeof msg?.sdp !== 'string' || msg.sdp.length > 20_000) return ws.close(1008, 'Invalid description');
    if (this.ctx.getTags(ws).includes('host')) {
      if (msg.type !== 'offer' || typeof msg.peer !== 'string') return ws.close(1008, 'Invalid offer');
      const peer = this.ctx.getWebSockets(msg.peer).find((socket) => socket.readyState === WebSocket.OPEN);
      if (peer) peer.send(JSON.stringify({ type: 'offer', sdp: msg.sdp }));
    } else {
      const state = ws.deserializeAttachment();
      if (msg.type !== 'answer' || !state || state.answered) return ws.close(1008, 'Invalid answer');
      ws.serializeAttachment({ ...state, answered: true });
      const host = this.ctx.getWebSockets('host').find((socket) => socket.readyState === WebSocket.OPEN);
      if (host) host.send(JSON.stringify({ type: 'answer', peer: state.peer, sdp: msg.sdp }));
    }
  }

  webSocketClose(ws) {
    if (this.ctx.getTags(ws).includes('host')) {
      for (const guest of this.ctx.getWebSockets('guest')) guest.close(1000, 'Room closed');
    } else {
      const { peer } = ws.deserializeAttachment();
      const host = this.ctx.getWebSockets('host').find((socket) => socket.readyState === WebSocket.OPEN);
      if (host) host.send(JSON.stringify({ type: 'leave', peer }));
    }
  }

  webSocketError(ws) {
    ws.close(1011, 'Connection error');
  }
}
