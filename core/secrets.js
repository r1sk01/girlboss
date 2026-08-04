import crypto from 'crypto'

export const authkeybytes = 128

/**
 * Generates a cryptographically secure identifier from an explicit alphabet.
 * Bytes outside the largest whole multiple of the alphabet length are rejected
 * so every character is uniformly distributed.
 *
 * @param {number} length
 * @param {string} alphabet
 * @returns {string}
 */
export function randomid(length, alphabet) {
    const ceiling = 256 - (256 % alphabet.length)
    let out = ''
    while (out.length < length) {
        for (const byte of crypto.randomBytes(length - out.length)) {
            if (byte >= ceiling) continue
            out += alphabet[byte % alphabet.length]
            if (out.length === length) break
        }
    }
    return out
}

/** @returns {Buffer} */
export function generateauthkey() {
    return crypto.randomBytes(authkeybytes)
}

/**
 * @param {Buffer|Uint8Array|number[]} key
 * @returns {string}
 */
export function hashauthkey(key) {
    return crypto.createHash('sha256').update(Buffer.from(key)).digest('hex')
}

/**
 * @typedef {{ hash?: string, key?: number[], createdat?: number }} StoredAuthKey
 */

/**
 * Compares a presented key against the stored record in constant time.
 * `needsupgrade` is set when the record still holds a plaintext key, so the
 * caller can rewrite it as a hash after a successful comparison.
 *
 * @param {Buffer|Uint8Array} candidate
 * @param {StoredAuthKey|null|undefined} stored
 * @returns {{ valid: boolean, needsupgrade: boolean }}
 */
export function verifyauthkey(candidate, stored) {
    const presented = Buffer.from(candidate)
    if (!stored) return { valid: false, needsupgrade: false }
    if (typeof stored.hash === 'string' && stored.hash.length > 0) {
        const expected = Buffer.from(stored.hash, 'hex')
        const actual = Buffer.from(hashauthkey(presented), 'hex')
        if (expected.length !== actual.length) return { valid: false, needsupgrade: false }
        return { valid: crypto.timingSafeEqual(actual, expected), needsupgrade: false }
    }
    if (Array.isArray(stored.key)) {
        const expected = Buffer.from(stored.key)
        if (expected.length !== presented.length) return { valid: false, needsupgrade: false }
        const valid = crypto.timingSafeEqual(presented, expected)
        return { valid, needsupgrade: valid }
    }
    return { valid: false, needsupgrade: false }
}

/**
 * @param {StoredAuthKey|null|undefined} stored
 * @param {number|undefined} ttldays zero or negative disables expiry
 * @returns {boolean}
 */
export function authkeyexpired(stored, ttldays) {
    if (!ttldays || ttldays <= 0) return false
    if (!stored || typeof stored.createdat !== 'number') return false
    return Date.now() - stored.createdat > ttldays * 24 * 60 * 60 * 1000
}
