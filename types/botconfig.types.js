// noinspection JSUnusedGlobalSymbols
/**
 * Shared config shape for values loaded from `config.jsonc`.
 *
 * @typedef {Object} RateLimitConfig
 * @property {number=} limit
 * @property {number=} windowseconds
 *
 * @typedef {Object} BotConfig
 * @property {string} phonenumber
 * @property {string} socketpath
 * @property {string=} prefix
 * @property {string=} botname
 * @property {boolean=} botversion
 * @property {string=} tagname
 * @property {string=} botavatar
 * @property {string=} botabout
 * @property {boolean=} externalsignal
 * @property {string=} managedaccount
 * @property {string=} rediscon
 * @property {string=} mongoosecon
 * @property {string=} axiomtoken
 * @property {string[]=} blacklist
 * @property {number=} authkeyttldays
 * @property {RateLimitConfig=} commandratelimit
 * @property {RateLimitConfig=} loginratelimit
 * @property {RateLimitConfig=} webhookratelimit
 */

// Keep this file as a module so JSDoc import() type references resolve reliably.
export const __botConfigTypes = true
