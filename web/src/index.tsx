import { serve } from 'bun'
import index from './index.html'
import { parse as parseJsonc } from 'jsonc-parser'
import fs from 'fs'
import { exportmodels } from '../../core/mongoose.js'
import Redis from 'ioredis'

let config = parseJsonc(fs.readFileSync('../config.jsonc', 'utf8'))
const mongoosecon = config.mongoosecon
const rediscon = config.rediscon || 'redis://localhost:6379'
config = undefined

const mongoosePromise = exportmodels(mongoosecon)
const redis = new Redis(rediscon)

async function getmongoose() {
    return mongoosePromise
}

redis.on('error', (err) => {
    console.error('Problem initialising ioredis:', err)
})

redis.on('connect', () => {
    console.log('Initialised ioredis')
})

type WebhookBody = {
    name: string
    content: string
}

type LoginBody = {
    authkey?: unknown
}

type SSORequest = {
    providerid: string
    scopes: string[]
}

const ssoScopes = {
    accesslevel: 'Retrieve your user access level',
}

const allowedSSOScopes = Object.keys(ssoScopes)

function formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

function isWebhookBody(body: unknown): body is WebhookBody {
    if (typeof body !== 'object' || body === null) return false
    const candidate = body as Record<string, unknown>
    return typeof candidate.name === 'string' && typeof candidate.content === 'string'
}

function isLoginBody(body: unknown): body is LoginBody {
    return typeof body === 'object' && body !== null && 'authkey' in body
}

function getProviderScopes(provider: { scopes?: unknown }): string[] {
    if (!Array.isArray(provider.scopes)) return []
    return provider.scopes.filter(
        (scope): scope is string => typeof scope === 'string' && allowedSSOScopes.includes(scope)
    )
}

function parseRequestedSSOScopes(req: Request, provider: { scopes?: unknown }): string[] | null {
    const providerScopes = getProviderScopes(provider)
    const url = new URL(req.url)
    const requestedScopes = (url.searchParams.get('scopes') || url.searchParams.get('scope'))
        ?.split(',')
        .map((scope) => scope.trim().toLowerCase())
        .filter(Boolean)

    if (!requestedScopes) return providerScopes
    return requestedScopes.every((scope) => providerScopes.includes(scope)) ? requestedScopes : null
}

function parseSSORequest(value: string): SSORequest {
    try {
        const parsed = JSON.parse(value) as Partial<SSORequest>
        if (typeof parsed.providerid === 'string' && Array.isArray(parsed.scopes)) {
            return {
                providerid: parsed.providerid,
                scopes: parsed.scopes.filter((scope): scope is string => typeof scope === 'string'),
            }
        }
    } catch {
        // Legacy SSO requests stored only the provider ID at sso:<deviceId>.
    }
    return { providerid: value, scopes: [] }
}

async function handleerr0r(err: unknown, module: string) {
    if (process.env.WEBHOOK_ID) {
        try {
            const mongoose = await getmongoose()
            const Webhook = mongoose.model('Webhook')
            const webhook = await Webhook.findById(process.env.WEBHOOK_ID)
            if (webhook) {
                const webhookMessage = {
                    userid: webhook.userid,
                    name: 'GirlbossWeb',
                    content: `Hiya Aria, there's a problem on girlboss.arctic from ${module}:\n${formatError(err).substring(0, 1900)}`,
                    timestamp: Date.now(),
                }
                await redis.publish('webhook-messages', JSON.stringify(webhookMessage))
            }
        } catch (err2) {
            console.error('The set WEBHOOK_ID might be invalid or a fatal internal error occurred:', err2)
            console.error(
                "Here's the original error that was supposed to be sent to the webhook from " + module + ':',
                err
            )
        }
    } else {
        console.error('Error reported by ' + module + ':', err)
    }
}

async function checkauthvalidity(authkey: string) {
    try {
        const mongoose = await getmongoose()
        const User = mongoose.model('User')
        if (!authkey) {
            return { failed: true, message: 'No AuthKey sent?' }
        }
        const cbuf = Buffer.from(authkey, 'base64')
        if (cbuf.length < 164) {
            return { failed: false, attestation: false, message: 'AuthKey is invalid' }
        }
        const akbuf = cbuf.subarray(-128)
        const sidbuf = cbuf.subarray(0, -128)
        const sid = sidbuf.toString('utf8')
        const user = await User.findOne({ userid: sid })
        if (!user || !user.properties?.authkey) {
            return { failed: false, attestation: false, message: 'AuthKey is invalid' }
        }
        if (!user.properties || !user.properties.eco) {
            user.properties = user.properties || {}
            user.properties.eco = { balance: 0 }
            user.markModified('properties')
            await user.save()
        }
        const sakbuf = Buffer.from(user.properties.authkey.key)
        if (!akbuf.equals(sakbuf)) {
            return { failed: false, attestation: false, message: 'AuthKey is invalid' }
        } else {
            return { failed: false, attestation: true, message: 'AuthKey is valid', user }
        }
    } catch (err) {
        await handleerr0r(err, 'checkauthvalidity')
        return { failed: true, message: 'Internal Server Error' }
    }
}

const server = serve({
    routes: {
        '/': index,

        '/*': (_req) => Response.redirect('/'),

        '/api/login': {
            async POST(req) {
                const body: unknown = await req.json()
                if (!isLoginBody(body) || typeof body.authkey !== 'string') {
                    return Response.json({ error: 'Invalid AuthKey' }, { status: 400 })
                }
                const { authkey } = body
                const validity = await checkauthvalidity(authkey)
                if (validity.failed && validity.message) {
                    return Response.json(
                        {
                            error: validity.message,
                        },
                        { status: 500 }
                    )
                } else if (!validity.failed && validity.attestation) {
                    const response = Response.json(
                        {
                            message: 'Login successful',
                        },
                        { status: 200 }
                    )
                    response.headers.set('Set-Cookie', `authkey=${authkey}; HttpOnly; Secure; SameSite=Strict; Path=/`)
                    return response
                } else {
                    const response = Response.json(
                        {
                            error: 'Invalid AuthKey',
                        },
                        { status: 401 }
                    )
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`)
                    return response
                }
            },
        },

        '/api/authinfo': {
            async GET(req) {
                const authkey = req.headers.get('Cookie')?.match(/authkey=([^;]+)/)?.[1]
                if (!authkey) {
                    return Response.json(
                        {
                            error: 'No AuthKey provided',
                        },
                        { status: 401 }
                    )
                }
                const validity = await checkauthvalidity(authkey)
                if (validity.failed && validity.message) {
                    return Response.json(
                        {
                            error: validity.message,
                        },
                        { status: 500 }
                    )
                } else if (!validity.failed && validity.attestation) {
                    return Response.json(
                        {
                            message: 'AuthKey is valid',
                            user: {
                                userid: validity.user.userid,
                                username: validity.user.username,
                                properties: validity.user.properties,
                            },
                        },
                        { status: 200 }
                    )
                } else {
                    const response = Response.json(
                        {
                            error: 'Invalid AuthKey',
                        },
                        { status: 401 }
                    )
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`)
                    return response
                }
            },
        },

        '/api/eco/:activity': {
            async GET(req) {
                const activity = req.params.activity
                if (!activity) {
                    return Response.json(
                        {
                            error: 'No activity specified',
                        },
                        { status: 400 }
                    )
                }
                const authkey = req.headers.get('Cookie')?.match(/authkey=([^;]+)/)?.[1]
                if (!authkey) {
                    return Response.json(
                        {
                            error: 'No AuthKey provided',
                        },
                        { status: 401 }
                    )
                }
                const validity = await checkauthvalidity(authkey)
                if (validity.failed && validity.message) {
                    return Response.json(
                        {
                            error: validity.message,
                        },
                        { status: 500 }
                    )
                } else if (!validity.failed && validity.attestation) {
                    const mongoose = await getmongoose()
                    const User = mongoose.model('User')
                    const user = await User.findOne({ userid: validity.user.userid })
                    const bc = [
                        {
                            key: 'daily',
                            name: 'Daily',
                            message: 'Successfully claimed your daily reward of ',
                            last: user.properties.eco?.daily,
                            minreward: 10,
                            maxreward: 50,
                            cdmins: 1080,
                        },
                        {
                            key: 'work',
                            name: 'Work',
                            message: 'You worked hard for ',
                            last: user.properties.eco?.work,
                            minreward: 5,
                            maxreward: 25,
                            cdmins: 60,
                        },
                    ]
                    const ai = bc.find((item) => item.key === activity)
                    if (!ai) {
                        return Response.json(
                            {
                                error: 'Invalid activity',
                            },
                            { status: 400 }
                        )
                    }
                    const cdmins = ai.cdmins
                    const cd = cdmins * 60 * 1000
                    const ct = Date.now()
                    const last = bc.find((item) => item.key === activity)?.last || 0
                    if (ct - last < cd) {
                        const remaining = Math.ceil((cd - (ct - last)) / 60000)
                        return Response.json(
                            {
                                error: `You can use this activity again in ${remaining} minutes`,
                            },
                            { status: 429 }
                        )
                    } else {
                        user.properties.eco[activity] = ct
                        const earnings = Math.floor(Math.random() * (ai.maxreward - ai.minreward)) + ai.minreward
                        user.properties.eco.balance += earnings
                        user.properties.eco.balance = Math.floor(user.properties.eco.balance)
                        user.markModified('properties')
                        await user.save()
                        return Response.json(
                            {
                                message: `${ai.message}E${earnings}!`,
                            },
                            { status: 200 }
                        )
                    }
                } else {
                    const response = Response.json(
                        {
                            error: 'Invalid AuthKey',
                        },
                        { status: 401 }
                    )
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`)
                    return response
                }
            },
        },

        '/api/logout': {
            async GET(req) {
                const authkey = req.headers.get('Cookie')?.match(/authkey=([^;]+)/)?.[1]
                if (!authkey) {
                    return Response.json(
                        {
                            error: 'No AuthKey provided',
                        },
                        { status: 401 }
                    )
                }
                const validity = await checkauthvalidity(authkey)
                if (validity.failed && validity.message) {
                    return Response.json(
                        {
                            error: validity.message,
                        },
                        { status: 500 }
                    )
                } else if (!validity.failed && validity.attestation) {
                    const response = Response.json(
                        {
                            message: 'Logout successful',
                        },
                        { status: 200 }
                    )
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`)
                    return response
                } else {
                    const response = Response.json(
                        {
                            error: 'Invalid AuthKey',
                        },
                        { status: 401 }
                    )
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`)
                    return response
                }
            },
        },

        '/api/webhook/:hook': {
            async POST(req) {
                try {
                    const mongoose = await getmongoose()
                    const hook = req.params.hook
                    if (!hook) {
                        return Response.json({ error: 'No webhook ID provided' }, { status: 400 })
                    }
                    const Webhook = mongoose.model('Webhook')
                    const webhook = await Webhook.findById(hook)
                    if (!webhook) {
                        return Response.json({ error: 'Invalid webhook ID' }, { status: 404 })
                    }
                    let body: unknown
                    try {
                        body = await req.json()
                    } catch (err) {
                        return Response.json(
                            {
                                error: 'Invalid payload. Required: { name: string, content: string }',
                            },
                            { status: 400 }
                        )
                    }
                    if (!isWebhookBody(body)) {
                        return Response.json(
                            {
                                error: 'Invalid payload. Required: { name: string, content: string }',
                            },
                            { status: 400 }
                        )
                    }
                    const webhookMessage = {
                        userid: webhook.userid,
                        name: body.name,
                        content: body.content,
                        timestamp: Date.now(),
                    }
                    await redis.publish('webhook-messages', JSON.stringify(webhookMessage))
                    return Response.json({
                        success: true,
                        message: 'Webhook message queued for delivery',
                    })
                } catch (err) {
                    await handleerr0r(err, '/api/webhook/:hook')
                    return Response.json({ error: 'Internal server error' }, { status: 500 })
                }
            },
        },

        '/api/sso/start': {
            async GET(req) {
                try {
                    const mongoose = await getmongoose()
                    const SSOProvider = mongoose.model('SSOProvider')
                    const bearer = req.headers.get('Authorization')
                    if (!bearer) {
                        return new Response('No provider key given (Bearer token)', { status: 403 })
                    }
                    const result = await SSOProvider.findOne({ key: bearer.split(' ')[1] })
                    if (!result) {
                        return new Response(
                            "Your provider key is invalid, please either request one if you don't have one, or request a new one",
                            { status: 403 }
                        )
                    } else {
                        const scopes = parseRequestedSSOScopes(req, result)
                        if (!scopes) {
                            return Response.json(
                                {
                                    error: 'One or more requested scopes are not allowed for this provider',
                                    allowedScopes: getProviderScopes(result),
                                },
                                { status: 403 }
                            )
                        }
                        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
                        const deviceid = Array.from(
                            { length: 8 },
                            (_, _i) => chars[Math.floor(Math.random() * chars.length)]
                        ).reduce((a, c, i) => a + (i === 4 ? '-' : '') + c, '')
                        await redis.set(
                            `sso:${deviceid}`,
                            JSON.stringify({ providerid: result._id.toString(), scopes }),
                            'EXAT',
                            Math.floor(Date.now() / 1000) + 1800
                        )
                        return new Response(`${deviceid}`, { status: 200 })
                    }
                } catch (err) {
                    await handleerr0r(err, '/api/sso/start')
                    return new Response('Server Error', { status: 500 })
                }
            },
        },

        '/api/sso/finish': {
            async POST(req) {
                try {
                    const mongoose = await getmongoose()
                    const SSOProvider = mongoose.model('SSOProvider')
                    const bearer = req.headers.get('Authorization')
                    if (!bearer) {
                        return new Response('No provider key given (Bearer token)', { status: 403 })
                    }
                    const result = await SSOProvider.findOne({ key: bearer.split(' ')[1] })
                    if (!result) {
                        return new Response(
                            "Your provider key is invalid, please either request one if you don't have one, or request a new one",
                            { status: 403 }
                        )
                    } else {
                        if (req.body) {
                            const deviceId = (await req.text()).trim().toUpperCase()
                            const accepted = await redis.get(`sso-${result._id}:${deviceId}`)
                            if (!accepted) {
                                return new Response('Invalid, expired, or unauthorised device ID', { status: 404 })
                            }
                            await redis.del(`sso-${result._id}:${deviceId}`)
                            return Response.json(JSON.parse(accepted) as Record<string, unknown>, { status: 200 })
                        } else {
                            return new Response('No device identifier provided in request body', { status: 400 })
                        }
                    }
                } catch (err) {
                    await handleerr0r(err, '/api/sso/finish')
                    return new Response('Server Error', { status: 500 })
                }
            },
        },
    },
    development: process.env.NODE_ENV !== 'production' && {
        hmr: true,
        console: true,
    },
})

console.log(`Server running at ${server.url}`)
