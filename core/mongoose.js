// noinspection JSIgnoredPromiseFromCall,JSCheckFunctionSignatures

import mongoose from 'mongoose'
import { parse as parseJsonc } from 'jsonc-parser'
import fs from 'fs'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
/** @typedef {import('../types/botconfig.types.js').BotConfig} BotConfig */

/** @type {Partial<BotConfig>} */
let config
try {
    config = /** @type {Partial<BotConfig>} */ (parseJsonc(fs.readFileSync('config.jsonc', 'utf8')))
} catch (error) {
    config = {}
}
const mongoosefcon = config.mongoosecon
const prefix = config.prefix
config = undefined

let redis = null
// noinspection JSUnusedGlobalSymbols
function bootstrapredis(client) {
    redis = client
}

let _sendmessage = null
let _phonenumber = null
let exportpromise = null
let exported = false

// noinspection JSUnusedGlobalSymbols
function bootstrapsendmessage(fn, phonenumber) {
    _sendmessage = fn
    _phonenumber = phonenumber
}

async function loadschemas(mongoosecon = mongoosefcon) {
    const schemadir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schemas')
    if (!fs.existsSync(schemadir)) return mongoose

    const files = fs
        .readdirSync(schemadir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))

    for (const file of files) {
        const moduleUrl = pathToFileURL(path.join(schemadir, file)).href
        const module = await import(`${moduleUrl}?t=${Date.now()}`)
        const modelName = module.modelName || module.default?.modelName
        const createSchema = module.default || module.createSchema
        if (!modelName || typeof createSchema !== 'function') {
            throw new Error(`Schema file ${file} must export modelName and a default schema factory`)
        }
        if (mongoose.models[modelName]) {
            delete mongoose.models[modelName]
        }
        const schema = await createSchema(mongoose, {
            getredis: () => redis,
            prefix,
            mongoosecon,
        })
        mongoose.model(modelName, schema)
    }

    return mongoose
}

async function buildindexes(mongooseRunner = mongoose) {
    const models = Object.values(mongooseRunner.models)
    for (const model of models) {
        if (typeof model?.createIndexes === 'function') {
            await model.createIndexes()
        }
    }
}

const pendingcallbacks = new Map()

/**
 * @param {string} path dotted property path being accessed
 * @param {'r'|'rw'} requiredlevel
 * @param {{ path: string, level?: 'r'|'rw' }[]} accesslist grants approved by the user
 * @returns {boolean}
 */
export function pathallowed(path, requiredlevel, accesslist) {
    for (const entry of accesslist) {
        const base = entry.path
        const level = entry.level || 'r'
        if (path === base || path.startsWith(base + '.')) {
            if (requiredlevel === 'r') return true
            if (requiredlevel === 'rw' && level === 'rw') return true
        }
    }
    return false
}

export function deepget(obj, path) {
    return path.split('.').reduce((cur, k) => (cur != null ? cur[k] : undefined), obj)
}

export function deepset(obj, path, value) {
    const keys = path.split('.')
    let cur = obj
    for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') {
            cur[keys[i]] = {}
        }
        cur = cur[keys[i]]
    }
    cur[keys[keys.length - 1]] = value
}

function makescopeduser(userdoc, accesslist) {
    const propssnap = JSON.parse(JSON.stringify(userdoc.protectedprops || {}))
    return {
        get(path) {
            if (!pathallowed(path, 'r', accesslist)) {
                throw new Error(`PROTECTED_ACCESS_DENIED: read not granted for path "${path}"`)
            }
            return deepget(propssnap, path)
        },
        set(path, value) {
            if (!pathallowed(path, 'rw', accesslist)) {
                throw new Error(`PROTECTED_ACCESS_DENIED: write not granted for path "${path}"`)
            }
            deepset(propssnap, path, value)
        },
        async save() {
            userdoc.protectedprops = propssnap
            userdoc.markModified('protectedprops')
            await redis.set(`auth-challenge-ok:${userdoc.userid}`, '1', 'EX', 30)
            await userdoc.save()
        },
        get userid() {
            return userdoc.userid
        },
    }
}

async function exportmodels(mongoosecon = mongoosefcon) {
    if (exported) return mongoose
    if (exportpromise) return exportpromise
    exportpromise = (async () => {
        if (mongoose.connection.readyState === 0) {
            mongoose.connect(mongoosecon).catch((err) => {
                console.error('[mongodb] Failed to connect while exporting models:', err?.message || err)
            })
        }
        await loadschemas(mongoosecon)
        exported = true
        return mongoose
    })()
    return exportpromise
}

function formatreqmessage(token, meta, prefix) {
    const accesslines = meta.access
        .map((e) => `  - ${e.path} (${e.level === 'rw' ? 'read + write' : 'read only'})`)
        .join('\n')
    const sourceline = meta.source
        ? `Requested by: ${meta.source.module} module, command: ${prefix}${meta.source.command}${meta.source.args ? ' ' + meta.source.args : ''}`
        : 'Requested by: unknown'
    return `A command has requested access to your protected properties.\nToken: ${token}\n\n${sourceline}\nReason: ${meta.reason}\n\nAccess requested:\n${accesslines}\n\nThis request expires in 10 minutes.\nRun "${prefix}lockbox approve ${token}" to allow or "${prefix}lockbox deny ${token}" to reject.`
}

// noinspection JSUnusedGlobalSymbols
async function requestprotedit(userid, { reason, access, source, ongranted, onfail }) {
    if (!redis) throw new Error('redis not initialised')
    if (!reason || !access || !Array.isArray(access) || access.length === 0) {
        throw new Error('requestprotedit: reason and access array are required')
    }
    if (typeof ongranted !== 'function') {
        throw new Error('requestprotedit: ongranted callback is required')
    }

    const token = crypto.randomBytes(4).toString('hex').toUpperCase()
    const ttl = 10 * 60 // 10 minutes

    const meta = { userid, reason, access, source: source || null }
    await redis.set(`auth-req:${token}`, JSON.stringify(meta), 'EX', ttl)

    pendingcallbacks.set(token, { ongranted, onfail })

    if (_sendmessage && _phonenumber) {
        try {
            await _sendmessage(formatreqmessage(token, meta, prefix), userid, _phonenumber)
        } catch (e) {
            console.error('requestprotedit: failed to DM user:', e)
        }
    }

    if (typeof onfail === 'function') {
        setTimeout(async () => {
            const still = await redis.get(`auth-req:${token}`)
            if (still) {
                await redis.del(`auth-req:${token}`)
                pendingcallbacks.delete(token)
                try {
                    onfail('timeout')
                } catch (e) {
                    console.error('onfail(timeout) error:', e)
                }
            }
        }, ttl * 1000)
    }

    return token
}

// noinspection JSUnusedGlobalSymbols
async function approveprotedit(token, userdoc) {
    const raw = await redis.get(`auth-req:${token}`)
    if (!raw) return { ok: false, reason: 'expired or invalid token' }

    const meta = JSON.parse(raw)
    if (meta.userid !== userdoc.userid) return { ok: false, reason: 'token does not belong to you' }

    const cbs = pendingcallbacks.get(token)
    if (!cbs) return { ok: false, reason: 'callback expired (bot may have restarted)' }

    await redis.del(`auth-req:${token}`)
    pendingcallbacks.delete(token)

    const scopeduser = makescopeduser(userdoc, meta.access)
    try {
        await cbs.ongranted(scopeduser)
    } catch (e) {
        console.error('ongranted error:', e)
    }
    return { ok: true }
}

// noinspection JSUnusedGlobalSymbols
async function denyprotedit(token, userdoc) {
    const raw = await redis.get(`auth-req:${token}`)
    if (!raw) return { ok: false, reason: 'expired or invalid token' }

    const meta = JSON.parse(raw)
    if (meta.userid !== userdoc.userid) return { ok: false, reason: 'token does not belong to you' }

    const cbs = pendingcallbacks.get(token)

    await redis.del(`auth-req:${token}`)
    pendingcallbacks.delete(token)

    if (cbs && typeof cbs.onfail === 'function') {
        try {
            cbs.onfail('denied')
        } catch (e) {
            console.error('onfail(denied) error:', e)
        }
    }
    return { ok: true }
}

// noinspection JSUnusedGlobalSymbols
async function getprotreq(token) {
    const raw = await redis.get(`auth-req:${token}`)
    if (!raw) return null
    return JSON.parse(raw)
}

// noinspection JSUnusedGlobalSymbols
async function listprotreqs(userid) {
    const keys = await redis.keys('auth-req:*')
    const results = []
    for (const key of keys) {
        const raw = await redis.get(key)
        if (!raw) continue
        try {
            const meta = JSON.parse(raw)
            if (meta.userid === userid) {
                const token = key.slice('auth-req:'.length)
                results.push({ token, meta })
            }
        } catch (_) {}
    }
    return results
}

export {
    exportmodels,
    buildindexes,
    bootstrapredis,
    bootstrapsendmessage,
    requestprotedit,
    approveprotedit,
    denyprotedit,
    getprotreq,
    listprotreqs,
    formatreqmessage,
}
