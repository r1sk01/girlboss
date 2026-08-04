// noinspection JSUnusedGlobalSymbols
// noinspection JSUnusedLocalSymbols

import {
    mongoose,
    prefix,
    sendresponse,
    parsecommand,
    approveprotedit,
    denyprotedit,
    getprotreq,
    listprotreqs,
    formatreqmessage,
    requestprotedit,
} from '../core/modulecontext.js'

export default {
    section: 'props',
    user: true,
    admin: false,
    alwayson: true,
    execute: null,
    commands: {
        lockbox: {
            description: 'Protected Property Management utility',
            arguments: ['list/view/approve/deny/test', 'token'],
            execute: async (envelope, message) => {
                const match = parsecommand(message)
                const sub = match && match[1] ? match[1].toLowerCase() : null

                if (!sub) {
                    const help = [
                        `Protected Property Management commands:`,
                        `list - List all open requests on your account`,
                        `view <token> - See full details of a request`,
                        `approve <token> - Approve a request`,
                        `deny <token> - Deny a request`,
                        `test - Send a test lockbox request`,
                    ].join('\n')
                    await sendresponse(help, envelope, `${prefix}lockbox`, false)
                    return
                }

                const User = mongoose.model('User')

                if (sub === 'list') {
                    try {
                        const reqs = await listprotreqs(envelope.sourceUuid)
                        if (reqs.length === 0) {
                            await sendresponse(
                                'You have no pending protected property requests.',
                                envelope,
                                `${prefix}lockbox`,
                                false
                            )
                            return
                        }
                        const lines = reqs.map(({ token, meta }) => {
                            const src = meta.source
                                ? `${meta.source.module}/${prefix}${meta.source.command}${meta.source.args ? ' ' + meta.source.args : ''}`
                                : 'unknown'
                            const paths = meta.access.map((e) => `${e.path}(${e.level})`).join(', ')
                            return `- ${token} - ${src}\n  Reason: ${meta.reason}\n  Access: ${paths}`
                        })
                        await sendresponse(
                            `Open auth requests (${reqs.length}):\n\n${lines.join('\n\n')}\n\nUse "${prefix}lockbox view <token>" for full details.`,
                            envelope,
                            `${prefix}lockbox`,
                            false
                        )
                    } catch (err) {
                        console.error(err)
                        await sendresponse(
                            'Failed to list requests. Please try again later.',
                            envelope,
                            `${prefix}lockbox`,
                            true
                        )
                    }
                } else if (sub === 'view') {
                    const token = match[2] ? match[2].toUpperCase() : null
                    if (!token) {
                        await sendresponse(`Usage: ${prefix}lockbox view <token>`, envelope, `${prefix}lockbox`, true)
                        return
                    }
                    try {
                        const meta = await getprotreq(token)
                        if (!meta) {
                            await sendresponse(
                                'No pending request found for that token. It may have expired or already been handled.',
                                envelope,
                                `${prefix}lockbox`,
                                true
                            )
                            return
                        }
                        if (meta.userid !== envelope.sourceUuid) {
                            await sendresponse(
                                'That request does not belong to you.',
                                envelope,
                                `${prefix}lockbox`,
                                true
                            )
                            return
                        }
                        await sendresponse(formatreqmessage(token, meta, prefix), envelope, `${prefix}lockbox`, false)
                    } catch (err) {
                        console.error(err)
                        await sendresponse(
                            'Failed to retrieve request. Please try again later.',
                            envelope,
                            `${prefix}lockbox`,
                            true
                        )
                    }
                } else if (sub === 'approve') {
                    const token = match[2] ? match[2].toUpperCase() : null
                    if (!token) {
                        await sendresponse(
                            `Usage: ${prefix}lockbox approve <token>`,
                            envelope,
                            `${prefix}lockbox`,
                            true
                        )
                        return
                    }
                    try {
                        const user = await User.findOne({ userid: envelope.sourceUuid })
                        if (!user) {
                            await sendresponse('You are not registered.', envelope, `${prefix}lockbox`, true)
                            return
                        }
                        const result = await approveprotedit(token, user)
                        if (!result.ok) {
                            await sendresponse(
                                `Could not approve request: ${result.reason}`,
                                envelope,
                                `${prefix}lockbox`,
                                true
                            )
                            return
                        }
                        await sendresponse('Request approved.', envelope, `${prefix}lockbox`, false)
                    } catch (err) {
                        console.error(err)
                        await sendresponse(
                            'Failed to approve request. Please try again later.',
                            envelope,
                            `${prefix}lockbox`,
                            true
                        )
                    }
                } else if (sub === 'deny') {
                    const token = match[2] ? match[2].toUpperCase() : null
                    if (!token) {
                        await sendresponse(`Usage: ${prefix}lockbox deny <token>`, envelope, `${prefix}lockbox`, true)
                        return
                    }
                    try {
                        const user = await User.findOne({ userid: envelope.sourceUuid })
                        if (!user) {
                            await sendresponse('You are not registered.', envelope, `${prefix}lockbox`, true)
                            return
                        }
                        const result = await denyprotedit(token, user)
                        if (!result.ok) {
                            await sendresponse(
                                `Could not deny request: ${result.reason}`,
                                envelope,
                                `${prefix}lockbox`,
                                true
                            )
                            return
                        }
                        await sendresponse('Request denied.', envelope, `${prefix}lockbox`, false)
                    } catch (err) {
                        console.error(err)
                        await sendresponse(
                            'Failed to deny request. Please try again later.',
                            envelope,
                            `${prefix}lockbox`,
                            true
                        )
                    }
                } else if (sub === 'test') {
                    try {
                        const user = await User.findOne({ userid: envelope.sourceUuid })
                        if (!user) {
                            await sendresponse('You are not registered.', envelope, `${prefix}lockbox`, true)
                            return
                        }
                        const cleantestprops = async () => {
                            const freshuser = await User.findOne({ userid: envelope.sourceUuid })
                            if (freshuser && freshuser.protectedprops && freshuser.protectedprops.test) {
                                delete freshuser.protectedprops.test
                                freshuser.markModified('protectedprops')
                                const { redis } = await import('../core/modulecontext.js')
                                await redis.set(`auth-challenge-ok:${freshuser.userid}`, '1', 'EX', 30)
                                await freshuser.save()
                            }
                        }
                        await requestprotedit(envelope.sourceUuid, {
                            reason: 'test',
                            access: [
                                { path: 'test.readonly', level: 'r' },
                                { path: 'test.readwrite', level: 'rw' },
                            ],
                            source: { module: 'props', command: 'lockbox', args: 'test' },
                            ongranted: async (scopeduser) => {
                                const before = scopeduser.get('test.readwrite')
                                scopeduser.set('test.readwrite', `tested at ${new Date().toISOString()}`)
                                await scopeduser.save()
                                const after = scopeduser.get('test.readwrite')
                                await cleantestprops()
                                await sendresponse(
                                    `Test completed!\nRead test.readwrite before: ${before ?? '(unset)'}\nWrote test.readwrite: "${after}"\nDeleted test.readwrite.`,
                                    envelope,
                                    `${prefix}lockbox`,
                                    false
                                )
                            },
                            onfail: async (reason) => {
                                try {
                                    await cleantestprops()
                                } catch (_) {}
                                await sendresponse(
                                    `Test request was not completed: ${reason}`,
                                    envelope,
                                    `${prefix}lockbox`,
                                    false
                                )
                            },
                        })
                        await sendresponse(
                            `A test lockbox request has been created!\nUse "${prefix}lockbox list" to see it, or "${prefix}lockbox approve <token>" / "${prefix}lockbox deny <token>" to handle it.`,
                            envelope,
                            `${prefix}lockbox`,
                            false
                        )
                    } catch (err) {
                        console.error(err)
                        await sendresponse(
                            'Failed to create test request. Please try again later.',
                            envelope,
                            `${prefix}lockbox`,
                            true
                        )
                    }
                } else {
                    await sendresponse(
                        `Unknown subcommand "${sub}". Run "${prefix}lockbox" for help.`,
                        envelope,
                        `${prefix}lockbox`,
                        true
                    )
                }
            },
        },
    },
}
