import fs from 'fs'
import { parse as parseJsonc } from 'jsonc-parser'
import * as signalhandler from './signalhandler.js'
import { escapereg, parsecommand as parsecommandwithprefix } from './parser.js'
import Redis from 'ioredis'
/** @typedef {import('../types/botconfig.types.js').BotConfig} BotConfig */

/** @type {BotConfig} */
let config = /** @type {BotConfig} */ (parseJsonc(fs.readFileSync('config.jsonc', 'utf8')))
const prefix = config.prefix || '-'
const botname = config.botname || 'TritiumBot'
const phonenumber = config.phonenumber
const managedaccount = config.managedaccount
const rediscon = config.rediscon || 'redis://localhost:6379'
const commandratelimit = {
    limit: config.commandratelimit?.limit ?? 20,
    windowseconds: config.commandratelimit?.windowseconds ?? 60,
}
config = undefined

// The blacklist is editable while the bot runs, so it is re-read from disk when
// config.jsonc changes rather than being frozen at import time.
let blacklistcache = { mtimems: -1, entries: [] }
function blacklist() {
    try {
        const { mtimeMs } = fs.statSync('config.jsonc')
        if (mtimeMs !== blacklistcache.mtimems) {
            const parsed = parseJsonc(fs.readFileSync('config.jsonc', 'utf8'))
            blacklistcache = {
                mtimems: mtimeMs,
                entries: Array.isArray(parsed?.blacklist) ? parsed.blacklist : [],
            }
        }
    } catch (err) {
        console.error('Failed to read blacklist from config.jsonc:', err?.message || err)
    }
    return blacklistcache.entries
}

/**
 * @param {string} message
 * @returns {string[]|null}
 */
function parsecommand(message) {
    return parsecommandwithprefix(message, prefix)
}
const { sendresponse, sendmessage, getcontacts, getgroups } = signalhandler

const mc = new Map()
const gt = () => Date.now()
async function hotreloadable(mod) {
    const timestamp = gt()
    const cm = mc.get(mod)
    const sr = !cm || timestamp - cm.timestamp > 1000
    if (sr) {
        try {
            const module = await import(`${mod}?t=${timestamp}`)
            mc.set(mod, { module, timestamp })
            return module
        } catch (error) {
            const module = await import(mod)
            mc.set(mod, { module, timestamp })
            return module
        }
    }
    return cm.module
}
const mongoosemodule = await hotreloadable('./mongoose.js')
const {
    exportmodels,
    bootstrapredis,
    bootstrapsendmessage,
    requestprotedit,
    approveprotedit,
    denyprotedit,
    getprotreq,
    listprotreqs,
    formatreqmessage,
} = mongoosemodule
const mongoose = await exportmodels()
const redis = new Redis(rediscon)
bootstrapredis(redis)
bootstrapsendmessage(signalhandler.sendmessage, phonenumber)

export {
    redis,
    mongoose,
    prefix,
    botname,
    phonenumber,
    managedaccount,
    blacklist,
    commandratelimit,
    sendresponse,
    sendmessage,
    getcontacts,
    getgroups,
    escapereg,
    parsecommand,
    hotreloadable,
    requestprotedit,
    approveprotedit,
    denyprotedit,
    getprotreq,
    listprotreqs,
    formatreqmessage,
}
