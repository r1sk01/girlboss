/**
 * Fixed-window counter backed by Redis/Dragonfly.
 *
 * @typedef {{ incr: Function, expire: Function, ttl: Function }} RateLimitStore
 *
 * @param {RateLimitStore} store
 * @param {string} key identifies the caller, e.g. `login:1.2.3.4`
 * @param {number} limit requests permitted per window
 * @param {number} windowseconds
 * @returns {Promise<{ allowed: boolean, count: number, remaining: number, retryafter: number }>}
 */
export async function consumeratelimit(store, key, limit, windowseconds) {
    const bucket = `ratelimit:${key}`
    let count
    try {
        count = await store.incr(bucket)
        if (count === 1) await store.expire(bucket, windowseconds)
    } catch (err) {
        console.error('[ratelimit] store unavailable, allowing request:', err?.message || err)
        return { allowed: true, count: 0, remaining: limit, retryafter: 0 }
    }
    if (count <= limit) {
        return { allowed: true, count, remaining: limit - count, retryafter: 0 }
    }
    let retryafter = windowseconds
    try {
        const ttl = await store.ttl(bucket)
        if (typeof ttl === 'number' && ttl > 0) retryafter = ttl
    } catch (_) {
        // Fall back to the full window length.
    }
    return { allowed: false, count, remaining: 0, retryafter }
}
