import { mapPlayKeys, type MapPlayKey } from './data/map-play-keys';

const endpoint = process.env.MAP_PLAYS_API?.trim().replace(/\/+$/, '');
const totals = new Map<MapPlayKey, number>();
let pendingRead: Promise<void> | undefined;
let nextReadAt = 0;

export function getMapPlayCount(key: MapPlayKey) {
  return totals.get(key);
}

function saveCount(key: MapPlayKey, value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    totals.set(key, Math.max(totals.get(key) ?? 0, value));
  }
}

export async function refreshMapPlays() {
  if (!endpoint || Date.now() < nextReadAt) return;
  if (pendingRead) return pendingRead;
  pendingRead = (async () => {
    try {
      const response = await fetch(endpoint + '/plays', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.counts || typeof data.counts !== 'object' || Array.isArray(data.counts)) return;
      for (const key of Object.values(mapPlayKeys)) saveCount(key, data.counts[key] ?? 0);
    } catch {
      // Keep the most recent confirmed count while the service is unavailable.
    }
  })().finally(() => {
    nextReadAt = Date.now() + 30000;
    pendingRead = undefined;
  });
  return pendingRead;
}

export async function recordMapPlay(key: MapPlayKey | undefined) {
  if (!endpoint || !key || typeof crypto.randomUUID !== 'function') return;
  const query = new URLSearchParams({ mapId: key, playId: crypto.randomUUID() });
  // A retry reuses the same ID even if the first request was recorded before timing out.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(endpoint + '/plays?' + query, {
        method: 'POST',
        keepalive: true,
        signal: AbortSignal.timeout(5000),
      });
      if (response.status >= 500) continue;
      if (response.ok) saveCount(key, (await response.json())?.count);
      return;
    } catch {
      // Start the race regardless of connectivity or quota.
    }
  }
}
