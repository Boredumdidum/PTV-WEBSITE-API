const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS, 10) || 30000;

const store = new Map();

/** Get cached data for a feed key. Returns null if missing or expired. */
function get(feedKey) {
  const entry = store.get(feedKey);
  if (!entry) return null;
  if (Date.now() - entry.time >= CACHE_TTL_MS) {
    store.delete(feedKey);
    return null;
  }
  return entry.data;
}

/** Store data for a feed key with the current timestamp. */
function set(feedKey, data) {
  store.set(feedKey, { time: Date.now(), data });
}

/** Get status for all cached feeds (age, entity count). */
function getStatus() {
  const status = {};
  for (const [key, entry] of store) {
    status[key] = {
      age: Math.round((Date.now() - entry.time) / 1000) + "s",
      entities: entry.data.entity ? entry.data.entity.length : 0,
    };
  }
  return status;
}

module.exports = { get, set, getStatus };
