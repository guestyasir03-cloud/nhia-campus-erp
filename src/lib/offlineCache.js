const PREFIX = 'nhia_cache_v1_';
const QUEUE_KEY = 'nhia_offline_queue_v1';

export function readCache(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && 'data' in parsed ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function writeCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Ignore storage quota errors safely
  }
}

export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineOp(op) {
  try {
    const q = getOfflineQueue();
    q.push({ ...op, id: op.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    return q.length;
  } catch {
    return 0;
  }
}

export async function flushOfflineQueue(supabaseClient) {
  if (!supabaseClient || !navigator.onLine) return { synced: 0, remaining: getOfflineQueue().length };
  const q = getOfflineQueue();
  if (q.length === 0) return { synced: 0, remaining: 0 };

  const remaining = [];
  let synced = 0;

  for (const item of q) {
    try {
      let query = supabaseClient.from(item.table);
      if (item.action === 'insert') {
        const { error } = await query.insert(item.payload);
        if (error) throw error;
      } else if (item.action === 'update') {
        const { error } = await query.update(item.payload).eq(item.matchCol || 'id', item.matchVal);
        if (error) throw error;
      } else if (item.action === 'delete') {
        const { error } = await query.delete().eq(item.matchCol || 'id', item.matchVal);
        if (error) throw error;
      }
      synced += 1;
    } catch {
      remaining.push(item);
    }
  }

  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  } catch {}
  return { synced, remaining: remaining.length };
}
