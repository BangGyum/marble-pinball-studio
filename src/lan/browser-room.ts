import { visibleBuiltins } from '../data/maps';
import { MAX_LAN_MESSAGE_BYTES, type Identity, type Info } from './protocol';
import { createRaceRoom, type RoomPeer, type RoomSession } from './room-core';

const endpoint = process.env.MAP_PLAYS_API?.trim().replace(/\/+$/, '');
const hexToken = /^[a-f0-9]{32}$/;
const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const randomHex = (size: number) => toHex(crypto.getRandomValues(new Uint8Array(size)));
const viewerKey = 'marble-pinball.room-viewer';

type Entry = { code: string; hostKey?: string };
type Signal =
  | { type: 'ready' }
  | { type: 'peer'; peer: string }
  | { type: 'leave'; peer: string }
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; peer: string; sdp: string };

const parameters = new URLSearchParams(location.search);
export const browserRoomMode =
  location.protocol === 'https:' ||
  location.pathname.endsWith('/lan.html') ||
  parameters.has('rooms') ||
  parameters.has('room');
export const validRoomName = (name: string) =>
  !!name.trim() && name.length <= 24 && !/[\p{Cc}\u2028-\u202e\u2066-\u2069]/u.test(name);

function storageGet(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

function chooseEntry(): Promise<Entry> {
  const dialog = document.querySelector<HTMLDialogElement>('#room-lobby')!;
  const input = document.querySelector<HTMLInputElement>('#room-code')!;
  const error = document.querySelector('#room-error')!;
  const raw = parameters.get('room') ?? '';
  const available = !!endpoint && !!globalThis.RTCPeerConnection && !!crypto.subtle;
  if (available && hexToken.test(raw)) {
    const hostKey = storageGet('pinball-host-' + raw);
    return Promise.resolve(hostKey ? { code: raw, hostKey } : { code: raw });
  }
  input.value = raw;
  dialog.showModal();
  dialog.oncancel = (event) => event.preventDefault();
  document.querySelector<HTMLButtonElement>('#room-back')!.onclick = () => location.assign('.');
  return new Promise((resolve) => {
    const complete = (entry: Entry) => {
      const url = new URL(location.href);
      url.searchParams.delete('rooms');
      url.searchParams.set('room', entry.code);
      history.replaceState(history.state, '', url);
      dialog.close();
      resolve(entry);
    };
    const create = document.querySelector<HTMLButtonElement>('#room-create')!;
    create.onclick = async () => {
      if (!available) {
        error.textContent = '방 연결 서비스를 사용할 수 없어요.';
        return;
      }
      create.disabled = true;
      try {
        const hostKey = randomHex(32);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(hostKey)));
        const code = toHex(digest.subarray(0, 16));
        storageSet('pinball-host-' + code, hostKey);
        complete({ code, hostKey });
      } catch {
        error.textContent = '방 코드를 만들지 못했어요. 다시 시도해 주세요.';
      } finally {
        create.disabled = false;
      }
    };
    document.querySelector<HTMLFormElement>('#room-join')!.onsubmit = (event) => {
      event.preventDefault();
      if (create.disabled) return;
      if (!available) {
        error.textContent = '방 연결 서비스를 사용할 수 없어요.';
        return;
      }
      const code = input.value.trim().toLowerCase();
      if (!hexToken.test(code)) {
        error.textContent = '방장이 공유한 방 코드를 입력해 주세요.';
        return;
      }
      complete({ code });
    };
  });
}

let entry: Promise<Entry> | undefined;
export function browserRoomEntry() {
  entry ??= chooseEntry();
  return entry;
}

export class BrowserRoomSocket implements RoomPeer {
  readyState: number = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(
    private transmit: (data: string) => void,
    private shutdown: () => void,
    private bufferSize = () => 0
  ) {}

  get bufferedAmount() {
    return this.bufferSize();
  }
  open() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }
  receive(data: string) {
    if (this.readyState === WebSocket.OPEN) this.onmessage?.({ data });
  }
  send(data: string) {
    if (this.readyState === WebSocket.OPEN) this.transmit(data);
  }
  terminate() {
    this.close();
  }
  close() {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.shutdown();
    this.onclose?.();
  }
}

function fromChannel(channel: RTCDataChannel, peer: RTCPeerConnection, stop = () => {}): BrowserRoomSocket {
  let pieces: string[] = [];
  let length = 0;
  // An ordinary LAN scene may exceed the per-message SCTP limit.
  const chunkSize = 12_000;
  const socket = new BrowserRoomSocket(
    (data) => {
      try {
        for (let i = 0; i < data.length; ) {
          let end = Math.min(i + chunkSize, data.length);
          const lastUnit = data.charCodeAt(end - 1);
          if (end < data.length && lastUnit >= 0xd800 && lastUnit <= 0xdbff) end--;
          channel.send((end === data.length ? '1' : '0') + data.slice(i, end));
          i = end;
        }
      } catch {
        socket.close();
      }
    },
    () => {
      channel.close();
      peer.close();
      stop();
    },
    () => channel.bufferedAmount
  );
  channel.onmessage = ({ data }) => {
    if (typeof data !== 'string' || data.length < 2 || data.length > chunkSize + 1 || !/^[01]/.test(data))
      return socket.close();
    const part = data.slice(1);
    length += part.length;
    if (length > 2 * MAX_LAN_MESSAGE_BYTES) return socket.close();
    pieces.push(part);
    if (data[0] === '0') return;
    const message = pieces.join('');
    pieces = [];
    length = 0;
    socket.receive(message);
  };
  channel.onclose = () => socket.close();
  channel.onerror = () => {
    socket.onerror?.();
    socket.close();
  };
  return socket;
}

function signalSocket({ code, hostKey }: Entry) {
  if (!endpoint) throw new Error('방 연결 서비스가 설정되지 않았어요.');
  const url = new URL(endpoint + '/rooms/' + code);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (hostKey) url.searchParams.set('host', hostKey);
  return new WebSocket(url);
}

async function gatheredDescription(peer: RTCPeerConnection, description: RTCSessionDescriptionInit) {
  await peer.setLocalDescription(description);
  if (peer.iceGatheringState !== 'complete') {
    await new Promise<void>((resolve, reject) => {
      const changed = () => {
        if (peer.iceGatheringState !== 'complete') return;
        clearTimeout(timer);
        peer.removeEventListener('icegatheringstatechange', changed);
        resolve();
      };
      const timer = setTimeout(() => {
        peer.removeEventListener('icegatheringstatechange', changed);
        reject(new Error('같은 네트워크의 기기를 연결하지 못했어요.'));
      }, 6000);
      peer.addEventListener('icegatheringstatechange', changed);
      changed();
    });
  }
  return peer.localDescription!.sdp;
}

async function hostRoom(roomEntry: Entry) {
  const room = await createRaceRoom();
  let signal: WebSocket;
  try {
    signal = signalSocket(roomEntry);
  } catch (error) {
    room.close();
    throw error;
  }
  const peers = new Map<string, { peer: RTCPeerConnection; socket: BrowserRoomSocket }>();
  const sessions = new Map<string, RoomSession>();
  const connected = new Map<string, BrowserRoomSocket>();
  const host: RoomSession = { role: 'host', name: '방장', results: new Map() };
  const panel = new BrowserRoomSocket(
    (data) => setTimeout(() => room.receive(localPeer, data), 0),
    () => {
      signal.close();
      for (const { socket } of peers.values()) socket.close();
      room.disconnect(localPeer);
      room.close();
    }
  );
  const localPeer: RoomPeer = {
    get readyState() {
      return panel.readyState;
    },
    bufferedAmount: 0,
    send: (data) => setTimeout(() => panel.receive(data), 0),
    close: () => panel.close(),
    terminate: () => panel.close(),
  };
  return new Promise<BrowserRoomSocket>((resolve, reject) => {
    const timeout = setTimeout(() => panel.close(), 8000);
    signal.onclose = signal.onerror = () => {
      clearTimeout(timeout);
      panel.close();
      reject(new Error('방을 열지 못했어요. 연결 상태를 확인해 주세요.'));
    };
    signal.onmessage = async ({ data }) => {
      const message: Signal = JSON.parse(data);
      if (message.type === 'ready') {
        clearTimeout(timeout);
        resolve(panel);
        setTimeout(() => {
          if (panel.readyState !== WebSocket.CONNECTING) return;
          panel.open();
          room.connect(localPeer, host);
        }, 0);
      } else if (message.type === 'peer') {
        if (peers.size >= 15) return;
        const peer = new RTCPeerConnection({ iceServers: [] });
        const channel = peer.createDataChannel('pinball', { ordered: true });
        let token: string | undefined;
        const socket = fromChannel(channel, peer, () => {
          clearTimeout(timer);
          peers.delete(message.peer);
          room.disconnect(socket);
          if (token && connected.get(token) === socket) connected.delete(token);
        });
        peers.set(message.peer, { peer, socket });
        const timer = setTimeout(() => socket.close(), 15_000);
        channel.onopen = () => socket.open();
        socket.onmessage = ({ data }) => {
          if (token) {
            if (encoder.encode(data).byteLength > MAX_LAN_MESSAGE_BYTES) return socket.close();
            room.receive(socket, data);
            return;
          }
          try {
            const hello = JSON.parse(data);
            if (
              data.length > 256 ||
              hello.type !== 'hello' ||
              typeof hello.token !== 'string' ||
              !hexToken.test(hello.token) ||
              typeof hello.name !== 'string' ||
              !validRoomName(hello.name)
            )
              return socket.close();
            const existing = sessions.get(hello.token);
            if (!existing && sessions.size >= 128) return socket.close();
            token = hello.token as string;
            const session: RoomSession = existing ?? { role: 'viewer', name: hello.name.trim(), results: new Map() };
            sessions.set(token, session);
            connected.get(token)?.close();
            connected.set(token, socket);
            clearTimeout(timer);
            room.connect(socket, session);
          } catch {
            socket.close();
          }
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'failed') socket.close();
        };
        try {
          const sdp = await gatheredDescription(peer, await peer.createOffer());
          signal.send(JSON.stringify({ type: 'offer', peer: message.peer, sdp }));
        } catch {
          socket.close();
        }
      } else if (message.type === 'answer') {
        const connection = peers.get(message.peer);
        if (connection?.peer.signalingState === 'have-local-offer') {
          try {
            await connection.peer.setRemoteDescription({ type: 'answer', sdp: message.sdp });
          } catch {
            connection.socket.close();
          }
        }
      } else if (message.type === 'leave') {
        peers.get(message.peer)?.socket.close();
      }
    };
  });
}

function joinRoom(roomEntry: Entry, name: string) {
  const signal = signalSocket(roomEntry);
  const peer = new RTCPeerConnection({ iceServers: [] });
  let socket: BrowserRoomSocket | undefined;
  return new Promise<BrowserRoomSocket>((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer);
      signal.close();
      peer.close();
      socket?.close();
      reject(new Error('방에 연결하지 못했어요. 방장 창이 열려 있고 같은 네트워크인지 확인해 주세요.'));
    };
    const timer = setTimeout(fail, 15_000);
    signal.onclose = signal.onerror = fail;
    signal.onmessage = async ({ data }) => {
      const message: Signal = JSON.parse(data);
      if (message.type !== 'offer' || peer.signalingState !== 'stable') return;
      try {
        await peer.setRemoteDescription({ type: 'offer', sdp: message.sdp });
        const sdp = await gatheredDescription(peer, await peer.createAnswer());
        signal.send(JSON.stringify({ type: 'answer', sdp }));
      } catch {
        fail();
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') fail();
    };
    peer.ondatachannel = ({ channel }) => {
      const connection = fromChannel(channel, peer, () => signal.close());
      socket = connection;
      const opened = () => {
        clearTimeout(timer);
        const key = viewerKey + '-' + roomEntry.code;
        const token = storageGet(key) ?? randomHex(16);
        storageSet(key, token);
        resolve(connection);
        setTimeout(() => {
          if (connection.readyState !== WebSocket.CONNECTING) return;
          connection.open();
          connection.send(JSON.stringify({ type: 'hello', token, name }));
        }, 0);
      };
      if (channel.readyState === 'open') opened();
      else channel.onopen = opened;
    };
  });
}

export async function connectBrowserRoom(roomEntry: Entry, name: string) {
  const identity: Identity = { type: 'identity', role: roomEntry.hostKey ? 'host' : 'viewer', name };
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', roomEntry.code);
  const info: Info = {
    maps: visibleBuiltins.map(({ id, stage }) => ({ id, title: stage.title })),
    addresses: [{ name: '참가 링크', url: url.href }],
  };
  const socket = roomEntry.hostKey ? await hostRoom(roomEntry) : await joinRoom(roomEntry, name);
  return { identity, info, socket };
}
