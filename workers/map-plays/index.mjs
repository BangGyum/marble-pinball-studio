import { DurableObject } from 'cloudflare:workers';
import { mapPlayKeys } from '../../src/data/map-play-keys.ts';
import { routeRoom } from './rooms.mjs';
export { LanRoom } from './rooms.mjs';

const validMaps = new Set(Object.values(mapPlayKeys));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/rooms/')) return routeRoom(request, env, url);
    if (url.pathname !== '/plays') return new Response(null, { status: 404 });

    const origin = request.headers.get('Origin');
    if (origin !== env.SITE_ORIGIN && (origin !== null || request.method !== 'GET')) {
      return new Response(null, { status: 403 });
    }
    const headers = new Headers({ Vary: 'Origin' });
    if (origin !== null) headers.set('Access-Control-Allow-Origin', origin);
    const error = (message, status) => Response.json({ error: message }, { status, headers });

    try {
      if (request.method === 'GET') {
        const counter = env.MAP_PLAYS.getByName('public-map-totals');
        const counts = await counter.counts();
        headers.set('Cache-Control', 'public, max-age=30');
        return Response.json({ counts }, { headers });
      }
      if (request.method !== 'POST') {
        headers.set('Allow', 'GET, POST');
        return error('method_not_allowed', 405);
      }
      const mapId = url.searchParams.get('mapId');
      const playId = url.searchParams.get('playId');
      if (!validMaps.has(mapId) || !UUID.test(playId ?? '')) return error('invalid_play', 400);

      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await env.PLAY_RATE.limit({ key: ip });
      if (!success) return error('rate_limited', 429);
      const counter = env.MAP_PLAYS.getByName('public-map-totals');
      const count = await counter.record(mapId, playId.toLowerCase());
      return Response.json({ count }, { headers });
    } catch {
      return error('temporarily_unavailable', 503);
    }
  },
};

export class MapPlays extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS counts (map_id TEXT PRIMARY KEY, total INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS seen_plays (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS seen_expiry ON seen_plays (expires_at)');
  }

  counts() {
    return Object.fromEntries(this.sql.exec('SELECT map_id, total FROM counts').toArray().map((row) => [row.map_id, row.total]));
  }

  record(mapId, playId) {
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      this.sql.exec('DELETE FROM seen_plays WHERE expires_at <= ?', now);
      const inserted = this.sql.exec(
        'INSERT OR IGNORE INTO seen_plays (id, expires_at) VALUES (?, ?) RETURNING id', playId, now + DAY
      ).toArray();
      if (inserted.length) {
        this.sql.exec(
          'INSERT INTO counts (map_id, total) VALUES (?, 1) ON CONFLICT(map_id) DO UPDATE SET total = total + 1',
          mapId
        );
      }
      return this.sql.exec('SELECT total FROM counts WHERE map_id = ?', mapId).toArray()[0]?.total ?? 0;
    });
  }
}
