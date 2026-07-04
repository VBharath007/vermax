/**
 * ✅ Shared in-memory TTL cache utility
 * Reduces Firestore reads for hot endpoints (projects, attendance, profile).
 * Each key expires independently after its TTL.
 */

const _store = new Map();

/**
 * @param {string} key   Cache key
 * @param {number} ttlMs TTL in milliseconds (default: 30s)
 * @returns {any|null}   Cached value, or null if missing/expired
 */
function get(key) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) {
        _store.delete(key);
        return null;
    }
    return entry.data;
}

/**
 * @param {string} key   Cache key
 * @param {any}    data  Value to cache
 * @param {number} ttlMs How long to keep (ms). Default = 30s
 */
function set(key, data, ttlMs = 30_000) {
    _store.set(key, { data, ts: Date.now(), ttl: ttlMs });
}

/**
 * Invalidate one key or a key prefix ("projects_*" style)
 */
function invalidate(key) {
    _store.delete(key);
}

/**
 * Invalidate all keys that start with prefix
 */
function invalidatePrefix(prefix) {
    for (const k of _store.keys()) {
        if (k.startsWith(prefix)) _store.delete(k);
    }
}

module.exports = { get, set, invalidate, invalidatePrefix };
