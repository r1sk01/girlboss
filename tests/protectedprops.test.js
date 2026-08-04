import { describe, expect, test } from 'bun:test'
import { deepget, deepset, pathallowed } from '../core/mongoose.js'

describe('pathallowed', () => {
    /** @type {{ path: string, level?: 'r'|'rw' }[]} */
    const grants = [
        { path: 'profile', level: 'r' },
        { path: 'billing.card', level: 'rw' },
    ]

    test('grants reads on an exactly matching path', () => {
        expect(pathallowed('profile', 'r', grants)).toBe(true)
    })

    test('grants reads on descendants of a granted path', () => {
        expect(pathallowed('profile.name.first', 'r', grants)).toBe(true)
    })

    test('denies writes where only reads were granted', () => {
        expect(pathallowed('profile', 'rw', grants)).toBe(false)
    })

    test('grants writes where rw was granted', () => {
        expect(pathallowed('billing.card.number', 'rw', grants)).toBe(true)
    })

    test('denies paths that merely share a prefix string', () => {
        expect(pathallowed('profiles', 'r', grants)).toBe(false)
        expect(pathallowed('profilexname', 'r', grants)).toBe(false)
    })

    test('denies ancestors of a granted path', () => {
        expect(pathallowed('billing', 'r', grants)).toBe(false)
    })

    test('defaults a grant with no level to read only', () => {
        expect(pathallowed('a', 'r', [{ path: 'a' }])).toBe(true)
        expect(pathallowed('a', 'rw', [{ path: 'a' }])).toBe(false)
    })

    test('denies everything when nothing was granted', () => {
        expect(pathallowed('anything', 'r', [])).toBe(false)
    })
})

describe('deepget', () => {
    const obj = { a: { b: { c: 1 } }, nulled: null }

    test('reads a nested value', () => {
        expect(deepget(obj, 'a.b.c')).toBe(1)
    })

    test('returns undefined for a missing path instead of throwing', () => {
        expect(deepget(obj, 'a.x.y')).toBeUndefined()
        expect(deepget(obj, 'nulled.deeper')).toBeUndefined()
    })

    test('reads a top level value', () => {
        expect(deepget(obj, 'a')).toEqual({ b: { c: 1 } })
    })
})

describe('deepset', () => {
    test('sets a top level value', () => {
        const obj = {}
        deepset(obj, 'a', 1)
        expect(obj).toEqual({ a: 1 })
    })

    test('creates intermediate objects as needed', () => {
        const obj = {}
        deepset(obj, 'a.b.c', 'x')
        expect(obj).toEqual({ a: { b: { c: 'x' } } })
    })

    test('replaces non-object intermediates', () => {
        const obj = /** @type {Record<string, unknown>} */ ({ a: 'scalar' })
        deepset(obj, 'a.b', 1)
        expect(obj).toEqual({ a: { b: 1 } })
    })

    test('preserves sibling keys', () => {
        const obj = { a: { keep: true } }
        deepset(obj, 'a.added', 1)
        expect(obj).toEqual({ a: { keep: true, added: 1 } })
    })
})
