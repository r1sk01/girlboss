import { describe, expect, test } from 'bun:test'
import { authkeybytes, authkeyexpired, generateauthkey, hashauthkey, randomid, verifyauthkey } from '../core/secrets.js'

describe('randomid', () => {
    test('produces ids of the requested length using only the given alphabet', () => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        for (let i = 0; i < 50; i++) {
            const id = randomid(8, alphabet)
            expect(id).toHaveLength(8)
            expect([...id].every((char) => alphabet.includes(char))).toBe(true)
        }
    })

    test('does not repeat itself across calls', () => {
        const ids = new Set(Array.from({ length: 200 }, () => randomid(16, 'abcdef0123456789')))
        expect(ids.size).toBe(200)
    })

    test('covers the whole alphabet given enough samples', () => {
        const alphabet = 'abcdef'
        const seen = new Set(randomid(2000, alphabet))
        expect(seen.size).toBe(alphabet.length)
    })
})

describe('generateauthkey', () => {
    test('returns the expected number of bytes', () => {
        expect(generateauthkey()).toHaveLength(authkeybytes)
    })

    test('returns a different key every time', () => {
        const keys = new Set(Array.from({ length: 20 }, () => generateauthkey().toString('hex')))
        expect(keys.size).toBe(20)
    })
})

describe('verifyauthkey', () => {
    test('accepts a matching key against a stored hash', () => {
        const key = generateauthkey()
        const stored = { hash: hashauthkey(key), createdat: Date.now() }
        expect(verifyauthkey(key, stored)).toEqual({ valid: true, needsupgrade: false })
    })

    test('rejects a non-matching key', () => {
        const stored = { hash: hashauthkey(generateauthkey()), createdat: Date.now() }
        expect(verifyauthkey(generateauthkey(), stored).valid).toBe(false)
    })

    test('accepts a legacy plaintext key and flags it for upgrade', () => {
        const key = generateauthkey()
        const stored = { key: Array.from(key), createdat: Date.now() }
        expect(verifyauthkey(key, stored)).toEqual({ valid: true, needsupgrade: true })
    })

    test('rejects a non-matching legacy key without flagging an upgrade', () => {
        const stored = { key: Array.from(generateauthkey()) }
        expect(verifyauthkey(generateauthkey(), stored)).toEqual({ valid: false, needsupgrade: false })
    })

    test('rejects keys of the wrong length rather than throwing', () => {
        const key = generateauthkey()
        expect(verifyauthkey(key.subarray(0, 64), { key: Array.from(key) }).valid).toBe(false)
        expect(verifyauthkey(key, { hash: 'deadbeef' }).valid).toBe(false)
    })

    test('rejects empty and malformed records', () => {
        const key = generateauthkey()
        expect(verifyauthkey(key, null).valid).toBe(false)
        expect(verifyauthkey(key, {}).valid).toBe(false)
        expect(verifyauthkey(key, { hash: '' }).valid).toBe(false)
    })
})

describe('authkeyexpired', () => {
    const day = 24 * 60 * 60 * 1000

    test('treats a ttl of zero or less as no expiry', () => {
        const stored = { createdat: Date.now() - 1000 * day }
        expect(authkeyexpired(stored, 0)).toBe(false)
        expect(authkeyexpired(stored, undefined)).toBe(false)
    })

    test('expires keys older than the ttl', () => {
        expect(authkeyexpired({ createdat: Date.now() - 91 * day }, 90)).toBe(true)
        expect(authkeyexpired({ createdat: Date.now() - 89 * day }, 90)).toBe(false)
    })

    test('does not expire records with no creation timestamp', () => {
        expect(authkeyexpired({ hash: 'abc' }, 90)).toBe(false)
    })
})
