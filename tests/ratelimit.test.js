import { describe, expect, test } from 'bun:test'
import { consumeratelimit } from '../core/ratelimit.js'

function fakestore({ failon = null } = {}) {
    const counters = new Map()
    const expiries = new Map()
    return {
        counters,
        expiries,
        async incr(key) {
            if (failon === 'incr') throw new Error('store down')
            const next = (counters.get(key) || 0) + 1
            counters.set(key, next)
            return next
        },
        async expire(key, seconds) {
            expiries.set(key, seconds)
        },
        async ttl(key) {
            if (failon === 'ttl') throw new Error('store down')
            return expiries.get(key) ?? -1
        },
    }
}

describe('consumeratelimit', () => {
    test('allows requests up to the limit and reports the remaining quota', async () => {
        const store = fakestore()
        expect(await consumeratelimit(store, 'user', 3, 60)).toMatchObject({ allowed: true, remaining: 2 })
        expect(await consumeratelimit(store, 'user', 3, 60)).toMatchObject({ allowed: true, remaining: 1 })
        expect(await consumeratelimit(store, 'user', 3, 60)).toMatchObject({ allowed: true, remaining: 0 })
    })

    test('rejects once the limit is exceeded', async () => {
        const store = fakestore()
        for (let i = 0; i < 3; i++) await consumeratelimit(store, 'user', 3, 60)
        const quota = await consumeratelimit(store, 'user', 3, 60)
        expect(quota).toMatchObject({ allowed: false, count: 4, remaining: 0, retryafter: 60 })
    })

    test('sets the window expiry exactly once per window', async () => {
        const store = fakestore()
        await consumeratelimit(store, 'user', 5, 42)
        expect(store.expiries.get('ratelimit:user')).toBe(42)
        store.expiries.set('ratelimit:user', 7)
        await consumeratelimit(store, 'user', 5, 42)
        expect(store.expiries.get('ratelimit:user')).toBe(7)
    })

    test('counts each key independently and namespaces them', async () => {
        const store = fakestore()
        await consumeratelimit(store, 'alice', 1, 60)
        expect(await consumeratelimit(store, 'bob', 1, 60)).toMatchObject({ allowed: true })
        expect([...store.counters.keys()]).toEqual(['ratelimit:alice', 'ratelimit:bob'])
    })

    test('fails open when the store is unavailable', async () => {
        const quota = await consumeratelimit(fakestore({ failon: 'incr' }), 'user', 1, 60)
        expect(quota).toMatchObject({ allowed: true, remaining: 1 })
    })

    test('falls back to the full window when the ttl lookup fails', async () => {
        const store = fakestore({ failon: 'ttl' })
        await consumeratelimit(store, 'user', 1, 90)
        expect(await consumeratelimit(store, 'user', 1, 90)).toMatchObject({ allowed: false, retryafter: 90 })
    })
})
