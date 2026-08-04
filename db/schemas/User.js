// noinspection JSUnusedGlobalSymbols
export const modelName = 'User'

/**
 * @param {typeof import('mongoose')} mongoose
 * @param {{ getredis?: () => { get: (key: string) => Promise<string|null>, del: (key: string) => Promise<number> } }} deps
 */
export default function createUserSchema(mongoose, { getredis } = {}) {
    const schema = new mongoose.Schema({
        userid: String,
        username: String,
        accesslevel: Number,
        properties: Object,
        protectedprops: {
            type: Object,
            default: {},
        },
    })

    schema.pre('save', async function (next) {
        if (!this.isModified('protectedprops')) return next()
        const redis = typeof getredis === 'function' ? getredis() : null
        if (!redis) return next(new Error('PROTECTED_WRITE_DENIED: redis not initialised'))
        const okKey = `auth-challenge-ok:${this.userid}`
        const ok = await redis.get(okKey)
        if (!ok) {
            return next(new Error('PROTECTED_WRITE_DENIED: no valid auth session found for this user.'))
        }
        await redis.del(okKey)
        return next()
    })

    schema.index({ userid: 1 }, { unique: true })
    return schema
}
