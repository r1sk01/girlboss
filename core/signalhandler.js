// noinspection DuplicatedCode

import fs from 'fs'
import net from 'net'
import { parse } from 'jsonc-parser'
import { Axiom } from '@axiomhq/js'
/** @typedef {import('../types/botconfig.types.js').BotConfig} BotConfig */
/** @typedef {import('../types/botenvelope.types.js').Envelope} Envelope */
/** @typedef {import('../types/botsignal.types.js').SignalSendProps} SignalSendProps */
/** @typedef {import('../types/botsignal.types.js').SignalIdentity} SignalIdentity */
/** @typedef {{ account?: string, envelope?: Envelope }} SignalParams */
/** @typedef {{ params?: SignalParams }} SignalPayload */

const mongoosemodule = await import('./mongoose.js')
await mongoosemodule.exportmodels()

/** @type {BotConfig} */
let config = /** @type {BotConfig} */ (parse(fs.readFileSync('config.jsonc', 'utf8')))
const socketpath = config.socketpath
const axiomtoken = config.axiomtoken
const phonenumber = config.phonenumber
const prefix = config.prefix || '-'
const managedaccount = config.managedaccount
let axiom
if (!axiomtoken || axiomtoken === '' || axiomtoken === null || axiomtoken === undefined) {
    axiom = undefined
} else {
    axiom = new Axiom({
        token: axiomtoken,
    })
}
config = undefined

let client = null
let ic = false
let pendingcbs = []

function startconn(client, callback) {
    if (socketpath.includes(':')) {
        const [host, port] = socketpath.split(':')
        client.connect(parseInt(port), host, callback)
    } else {
        client.connect(socketpath, callback)
    }
}

function persistentconn(callback) {
    if (client && !client.destroyed && client.readyState === 'open') {
        callback()
        return
    }
    if (ic) {
        pendingcbs.push(callback)
        return
    }
    ic = true
    pendingcbs.push(callback)
    client = new net.Socket()
    client.setMaxListeners(50)
    client.on('error', (error) => {
        console.error('Handler connection had a major skill issue:', error)
        client.removeAllListeners()
        client = null
        ic = false
        pendingcbs = []
    })
    client.on('close', () => {
        console.log('Handler connection closed')
        if (client) {
            client.removeAllListeners()
        }
        client = null
        ic = false
    })
    startconn(client, () => {
        ic = false
        const callbacks = [...pendingcbs]
        pendingcbs = []
        callbacks.forEach((cb) => cb())
    })
}

async function sendreadreceipt(recipient, timestamp) {
    if (!client || client.destroyed || client.readyState !== 'open') {
        console.error('No handler connection available for read receipt')
        return
    }
    const tid = Math.floor(Math.random() * 1024) + 1
    const id = tid.toString()
    const json = {
        jsonrpc: '2.0',
        id,
        method: 'sendReceipt',
        params: {
            account: phonenumber,
            recipient: `${recipient}`,
            targetTimestamp: timestamp,
        },
    }
    client.write(JSON.stringify(json) + '\n')
}

/**
 * @param {string} recipient
 * @param {boolean} stop
 * @param {string|undefined} sender
 * @param {SignalSendProps} props
 */
async function sendtypingindicator(recipient, stop, sender = undefined, props = {}) {
    persistentconn(() => {
        if (!client || client.destroyed || client.readyState !== 'open') {
            console.error('No handler connection available for typing indicator')
            return
        }
        const tid = Math.floor(Math.random() * 1024) + 1
        const id = tid.toString()
        const json = {
            jsonrpc: '2.0',
            id,
            method: 'sendTyping',
            params: {
                account: sender !== undefined ? sender : phonenumber,
                stop,
            },
        }
        if (props.groupid) {
            json.params.groupId = `${props.groupid}`
        } else {
            json.params.recipient = `${recipient}`
        }
        client.write(JSON.stringify(json) + '\n')
    })
}

/**
 * @param {string} message
 * @param {string} recipient
 * @param {string|undefined} sender
 * @param {SignalSendProps} props
 */
function sendmessage(message, recipient, sender = undefined, props = {}) {
    if (!props.groupid) {
        // noinspection JSIgnoredPromiseFromCall
        sendtypingindicator(
            props.isselfcommand ? props.selfcommandsendto : recipient,
            false,
            sender !== undefined ? sender : phonenumber,
            props
        )
    }
    persistentconn(() => {
        if (!client || client.destroyed || client.readyState !== 'open') {
            console.error('No handler connection available for sending message')
            return
        }
        const tid = Math.floor(Math.random() * 1024) + 1
        const id = tid.toString()
        const json = {
            jsonrpc: '2.0',
            id,
            method: 'send',
            params: {
                account: sender ? sender : phonenumber,
            },
        }
        if (props.groupid) {
            json.params.groupId = `${props.groupid}`
        } else {
            json.params.recipient = `${props.isselfcommand ? props.selfcommandsendto : recipient}`
        }
        if (message) {
            const mentions = []
            let processedMessage = message
            {
                const regex = /\$MENTION_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi
                let shift = 0
                let match
                while ((match = regex.exec(message)) !== null) {
                    const token = match[0]
                    const uuid = match[1]
                    const startInProcessed = match.index + shift
                    mentions.push(`${startInProcessed}:${uuid.length}:${uuid}`)
                    processedMessage =
                        processedMessage.slice(0, startInProcessed) +
                        uuid +
                        processedMessage.slice(startInProcessed + token.length)
                    shift += uuid.length - token.length
                }
            }
            {
                const token = '$MENTIONUSER'
                let built = ''
                let remaining = processedMessage
                let absolutePos = 0
                while (true) {
                    const idx = remaining.indexOf(token)
                    if (idx === -1) {
                        built += remaining
                        break
                    }
                    built += remaining.slice(0, idx)
                    mentions.push(`${absolutePos + idx}:${recipient.length}:${recipient}`)
                    built += recipient
                    absolutePos += idx + recipient.length
                    remaining = remaining.slice(idx + token.length)
                }
                processedMessage = built
            }
            json.params.message = processedMessage
            if (mentions.length > 0) {
                json.params.mention = mentions
            }
        } else {
            json.params.message = ''
        }
        if (props.image) {
            // This is because jpeg loves being a SPECIAL FUCKING SNOWFLAKE
            json.params.attachments = [`data:${props.mime};filename=image.${props.imageext};base64,${props.image}`]
        }
        if (props.file) {
            json.params.attachments = [`${props.file}`]
        }
        client.write(JSON.stringify(json) + '\n')
        const responsehandler = async (data) => {
            const content = data.toString()
            if (content == null || content === '' || content === undefined || content === '\n') {
                return
            }
            try {
                const pj = JSON.parse(content)
                if (pj.id === id) {
                    client.removeListener('data', responsehandler)
                    if (pj.error) {
                        console.error('Error sending message:', pj.error)
                        if (pj.error.data) {
                            console.error(pj.error.data)
                        }
                        return
                    }
                    const result = pj.result
                    const results = result.results
                    if (results[0].type === 'SUCCESS') {
                        setTimeout(() => {
                            if (!props.groupid) {
                                sendtypingindicator(
                                    props.isselfcommand ? props.selfcommandsendto : recipient,
                                    true,
                                    sender !== null ? sender : phonenumber,
                                    props
                                )
                            }
                        }, 100)
                    }
                }
            } catch (error) {}
        }
        client.on('data', responsehandler)
        responsehandler.timeid = setTimeout(() => {
            client.removeListener('data', responsehandler)
        }, 10000)
    })
}

/** @param {string} json */
async function interpretmessage(json) {
    if (json == null || json === '' || json === undefined || json === '\n') {
        return
    }
    try {
        let pj
        try {
            pj = JSON.parse(json)
        } catch (error) {
            return
        }
        const payload = /** @type {SignalPayload} */ (pj || {})
        const params = /** @type {SignalParams} */ (payload.params || {})
        const envelope = /** @type {Envelope} */ (params.envelope || {})
        if (
            params.account === '' ||
            params.account === null ||
            params.account === undefined ||
            (params.account !== phonenumber && params.account !== managedaccount) ||
            !params.envelope
        ) {
            return
        }
        if (envelope.dataMessage) {
            const dataMessage = envelope.dataMessage
            if (params.account === managedaccount) {
                return
            }
            const message = dataMessage.message
            if (message === '' || message === null || message === undefined) {
                return
            }
            if (message.startsWith(prefix)) {
                persistentconn(async () => {
                    await sendreadreceipt(envelope.sourceUuid, dataMessage.timestamp)
                    const cm = await import(`./commands.js?t=${Date.now()}`)
                    const { invokecommand } = cm
                    invokecommand(message, envelope)
                })
            }
        } else if (envelope.syncMessage && envelope.sourceNumber === managedaccount) {
            const syncMessage = envelope.syncMessage
            const sentMessage = syncMessage.sentMessage
            if (sentMessage && sentMessage.message) {
                const message = sentMessage.message
                if (message === '' || message === null || message === undefined) {
                    return
                }
                if (message.startsWith(prefix)) {
                    persistentconn(async () => {
                        if (sentMessage.groupInfo && sentMessage.groupInfo.groupId) {
                            const tid = Math.floor(Math.random() * 1024) + 1
                            const id = tid.toString()
                            const json = {
                                jsonrpc: '2.0',
                                id,
                                method: 'listGroups',
                                params: {
                                    account: phonenumber,
                                },
                            }
                            client.write(JSON.stringify(json) + '\n')
                            let buffer = ''
                            const responsehandler = async (data) => {
                                buffer += data.toString()
                                const lines = buffer.split('\n')
                                buffer = lines.pop()
                                for (const line of lines) {
                                    const content = line.trim()
                                    if (content == null || content === '' || content === undefined) {
                                        continue
                                    }
                                    try {
                                        const pj = JSON.parse(content)
                                        if (pj.id === id) {
                                            client.removeListener('data', responsehandler)
                                            if (pj.error) {
                                                console.error('Error listing groups:', pj.error)
                                                return
                                            }
                                            const result = pj.result
                                            if (result && result.length > 0) {
                                                const g = result.find(
                                                    (group) => group.id === sentMessage.groupInfo.groupId
                                                )
                                                if (g) {
                                                    return
                                                }
                                                envelope.isselfcommand = true
                                                const cm = await import(`./commands.js?t=${Date.now()}`)
                                                const { invokecommand } = cm
                                                invokecommand(message, envelope, true)
                                            }
                                            return
                                        }
                                    } catch (error) {
                                        console.error('Error parsing JSON:', error)
                                    }
                                }
                            }
                            client.on('data', responsehandler)
                            setTimeout(() => {
                                client.removeListener('data', responsehandler)
                            }, 5000)
                        } else if (
                            sentMessage.destinationNumber !== phonenumber &&
                            sentMessage.destinationNumber !== managedaccount &&
                            sentMessage.destinationUuid !== '7dc7c561-7c9b-4ccd-b38d-f6b4ace559ee'
                        ) {
                            envelope.isselfcommand = true
                            const cm = await import(`./commands.js?t=${Date.now()}`)
                            const { invokecommand } = cm
                            invokecommand(message, envelope, true)
                        }
                    })
                }
            }
        }
    } catch (error) {
        console.error('Error parsing message:', error)
    }
}

// noinspection JSUnusedGlobalSymbols
function getcontacts(account = phonenumber, recipient = undefined) {
    return new Promise((resolve, reject) => {
        persistentconn(() => {
            if (!client || client.destroyed || client.readyState !== 'open') {
                console.error('No handler connection available for getting contacts')
                reject(new Error('No handler connection available'))
                return
            }
            const tid = Math.floor(Math.random() * 1024) + 1
            const id = tid.toString()
            const json = {
                jsonrpc: '2.0',
                id,
                method: 'listContacts',
                params: {
                    all: true,
                    account: account,
                },
            }
            if (recipient) {
                json.params.recipient = `${recipient}`
            }
            client.write(JSON.stringify(json) + '\n')
            let buffer = ''
            const responsehandler = (data) => {
                buffer += data.toString()
                const lines = buffer.split('\n')
                buffer = lines.pop()
                for (const line of lines) {
                    const content = line.trim()
                    if (content == null || content === '' || content === undefined) {
                        continue
                    }
                    try {
                        const pj = JSON.parse(content)
                        if (pj.id === id) {
                            client.removeListener('data', responsehandler)
                            if (pj.error) {
                                console.error('Error getting contacts:', pj.error)
                                reject(new Error('Error getting contacts: ' + JSON.stringify(pj.error)))
                                return
                            }
                            const result = pj.result
                            resolve(result)
                            return
                        }
                    } catch (error) {
                        console.error('Error parsing JSON:', error)
                    }
                }
            }

            client.on('data', responsehandler)
            const timeid = setTimeout(() => {
                client.removeListener('data', responsehandler)
                reject(new Error('Timeout waiting for contacts response'))
            }, 5000)
            const or = resolve
            const ore = reject
            resolve = (...args) => {
                clearTimeout(timeid)
                client.removeListener('data', responsehandler)
                or(...args)
            }
            reject = (...args) => {
                clearTimeout(timeid)
                client.removeListener('data', responsehandler)
                ore(...args)
            }
        })
    })
}

// noinspection JSUnusedGlobalSymbols
function getgroups(account = phonenumber) {
    return new Promise((resolve, reject) => {
        persistentconn(() => {
            if (!client || client.destroyed || client.readyState !== 'open') {
                console.error('No handler connection available for getting groups')
                reject(new Error('No handler connection available'))
                return
            }
            const tid = Math.floor(Math.random() * 1024) + 1
            const id = tid.toString()
            const json = {
                jsonrpc: '2.0',
                id,
                method: 'listGroups',
                params: {
                    account: account,
                },
            }
            client.write(JSON.stringify(json) + '\n')
            let buffer = ''
            const responsehandler = (data) => {
                buffer += data.toString()
                const lines = buffer.split('\n')
                buffer = lines.pop()
                for (const line of lines) {
                    const content = line.trim()
                    if (content == null || content === '' || content === undefined) {
                        continue
                    }
                    try {
                        const pj = JSON.parse(content)
                        if (pj.id === id) {
                            client.removeListener('data', responsehandler)
                            if (pj.error) {
                                console.error('Error getting groups:', pj.error)
                                reject(new Error('Error getting groups: ' + JSON.stringify(pj.error)))
                                return
                            }
                            const result = pj.result
                            resolve(result)
                            return
                        }
                    } catch (error) {
                        console.error('Error parsing JSON:', error)
                    }
                }
            }

            client.on('data', responsehandler)
            const timeid = setTimeout(() => {
                client.removeListener('data', responsehandler)
                reject(new Error('Timeout waiting for groups response'))
            }, 5000)
            const or = resolve
            const ore = reject
            resolve = (...args) => {
                clearTimeout(timeid)
                client.removeListener('data', responsehandler)
                or(...args)
            }
            reject = (...args) => {
                clearTimeout(timeid)
                client.removeListener('data', responsehandler)
                ore(...args)
            }
        })
    })
}

// noinspection JSUnusedGlobalSymbols
/**
 * @param {string} message response text to send
 * @param {Envelope} envelope source envelope for routing metadata
 * @param {string|undefined} command command label for logging
 * @param {boolean} failed whether the command failed
 * @param {SignalSendProps} props extra send options
 */
async function sendresponse(message, envelope, command, failed = false, props = {}) {
    const recipient = envelope.sourceUuid
    const dataMessage = envelope.dataMessage
    const syncMessage = envelope.syncMessage
    const sentMessage = syncMessage ? syncMessage.sentMessage : null
    if (dataMessage && dataMessage.groupInfo) {
        const groupInfo = dataMessage.groupInfo
        props.groupid = groupInfo.groupId
    } else if (syncMessage && sentMessage.groupInfo) {
        const groupInfo = sentMessage.groupInfo
        props.groupid = groupInfo.groupId
    }
    let sender
    if (envelope.isselfcommand) {
        sender = managedaccount
        props.selfcommandsendto = sentMessage.destinationUuid
        props.isselfcommand = true
    } else {
        sender = phonenumber
    }
    sendmessage(message, recipient, sender, props)
    if (axiom !== undefined && command !== undefined) {
        axiom.ingest('botlogs', [{ timestamp: Date.now(), command, executor: recipient, failed }])
    }
}

async function trustfix() {
    const executefix = async () => {
        persistentconn(() => {
            if (!client || client.destroyed || client.readyState !== 'open') {
                console.error('No handler connection available for trust fix')
                return
            }
            const tid = Math.floor(Math.random() * 1024) + 1
            const id = tid.toString()
            const json = {
                jsonrpc: '2.0',
                id,
                method: 'listIdentities',
                params: {
                    account: phonenumber,
                },
            }
            client.write(JSON.stringify(json) + '\n')
            let buffer = ''
            const responsehandler = async (data) => {
                buffer += data.toString()
                const lines = buffer.split('\n')
                buffer = lines.pop()
                for (const line of lines) {
                    const content = line.trim()
                    if (content == null || content === '' || content === undefined) {
                        continue
                    }
                    try {
                        const pj = JSON.parse(content)
                        if (pj.id === id) {
                            client.removeListener('data', responsehandler)
                            if (pj.error) {
                                console.error('Error listing identities for trust fix:', pj.error)
                                return
                            }
                            const result = /** @type {SignalIdentity[]} */ (Array.isArray(pj.result) ? pj.result : [])
                            for (const identity of result) {
                                if (identity.trustLevel !== 'TRUSTED_VERIFIED') {
                                    const tid2 = Math.floor(Math.random() * 1024) + 1
                                    const id2 = tid2.toString()
                                    const json2 = {
                                        jsonrpc: '2.0',
                                        id: id2,
                                        method: 'trust',
                                        params: {
                                            account: phonenumber,
                                            recipient: identity.uuid,
                                            verifiedSafetyNumber: identity.safetyNumber,
                                        },
                                    }
                                    client.write(JSON.stringify(json2) + '\n')
                                }
                            }
                            return
                        }
                    } catch (error) {
                        console.error('Error parsing JSON for trust fix:', error)
                    }
                }
            }
            client.on('data', responsehandler)
            setTimeout(() => {
                client.removeListener('data', responsehandler)
            }, 10000)
        })
    }
    await executefix()
    setInterval(
        async () => {
            await executefix()
        },
        5 * 60 * 1000
    )
}

async function wipeattachments() {
    const { default: fs } = await import('fs/promises')
    const path = await import('path')
    const attachmentsDir = path.resolve('./config/attachments')
    const executewipe = async () => {
        try {
            const entries = await fs.readdir(attachmentsDir, { withFileTypes: true })
            await Promise.all(
                entries.map((entry) => {
                    const fullPath = path.join(attachmentsDir, entry.name)
                    return fs.rm(fullPath, {
                        recursive: true,
                        force: true,
                    })
                })
            )
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error('wipeattachments error:', err)
            }
        }
    }
    await executewipe()
    setInterval(
        () => {
            executewipe().catch(console.error)
        },
        5 * 60 * 1000
    )
}

export {
    interpretmessage,
    sendmessage,
    sendresponse,
    sendtypingindicator,
    getcontacts,
    getgroups,
    trustfix,
    wipeattachments,
}
