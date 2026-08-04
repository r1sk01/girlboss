import fs from 'fs'
import subprocess from 'child_process'
import net from 'net'
import { parse } from 'jsonc-parser'
import { exportmodels, buildindexes } from './core/mongoose.js'
import { runmigrations } from './db/migrations/runner.js'

/** @typedef {import('./types/botconfig.types.js').BotConfig} BotConfig */

/** @type {BotConfig} */
let config = /** @type {BotConfig} */ (parse(fs.readFileSync('config.jsonc', 'utf8')))
if (config.phonenumber === '' || config.phonenumber === null || config.phonenumber === undefined) {
    console.error('Phone number not found in config.jsonc!')
    process.exit(1)
}
if (config.socketpath === '' || config.socketpath === null || config.socketpath === undefined) {
    console.error('Socket path not found in config.jsonc!')
    process.exit(1)
}
const socketpath = config.socketpath
const botname = config.botname || 'TritiumBot'
const botversion = config.botversion ?? true
const tagname = config.tagname || 'Development'
const botavatar = config.botavatar
const botabout = config.botabout || 'A simple, fast, and robust bot for Signal, powered by TritiumBot.'
const phonenumber = config.phonenumber
const externalsignal = config.externalsignal ?? true
config = undefined
let daemon
let interpretmessage
let trustfix
let wipeattachments
let initialisewebhookhandler

function startconn(client, callback) {
    if (socketpath.includes(':')) {
        const [host, port] = socketpath.split(':')
        client.connect(parseInt(port), host, callback)
    } else {
        client.connect(socketpath, callback)
    }
}

function gracefulShutdown() {
    console.log(`Shutting down ${botname}...`)
    if (daemon && !externalsignal) {
        daemon.on('exit', () => {
            process.exit(0)
        })
        daemon.kill('SIGTERM')
        setTimeout(() => {
            console.error(`Could not shut down ${botname} gracefully, forcefully shutting down...`)
            daemon.kill('SIGKILL')
            process.exit(1)
        }, 5000)
    } else {
        process.exit(0)
    }
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

function signalclidaemon() {
    if (!externalsignal) {
        const sf = socketpath.includes(':') ? '--tcp' : '--socket'
        return subprocess.exec(
            `signal-cli --config ./config daemon ${sf} ${socketpath} --receive-mode on-connection`,
            (err, stdout, _stderr) => {
                if (err) {
                    console.error(err)
                    return
                }
                console.log(stdout)
            }
        )
    }
    return null
}

function signalclihook() {
    const client = new net.Socket()
    client.setMaxListeners(50)
    startconn(client, () => {
        console.log('Signal CLI hook connected')
        setupbotprofile()
    })
    client.on('data', (data) => {
        const message = data.toString()
        if (message === '' || message === null || message === undefined || message === '\n') {
            return
        }
        // noinspection JSIgnoredPromiseFromCall
        interpretmessage(message)
    })
    client.on('close', () => {
        console.log('Signal CLI hook disconnected')
    })
    client.on('error', (error) => {
        console.error('Error hooking to Signal CLI:', error)
    })
}

function setupbotprofile() {
    const client = new net.Socket()
    startconn(client, () => {
        const tid = Math.floor(Math.random() * 1024) + 1
        const id = tid.toString()
        const json = {
            jsonrpc: '2.0',
            id,
            method: 'updateProfile',
            params: {
                account: phonenumber,
                givenName: botname,
                about: botabout,
            },
        }
        if (botversion === true && tagname) {
            json.params.familyName = `[${process.env.npm_package_version} ${tagname}]`
        } else if (botversion === true) {
            json.params.familyName = `[${process.env.npm_package_version}]`
        } else if (tagname) {
            json.params.familyName = `${tagname}`
        }
        if (botavatar && fs.existsSync(botavatar)) {
            json.params.avatar = botavatar
        }
        client.write(JSON.stringify(json))
        client.end()
    })
    client.on('error', (error) => {
        console.error('Error sending profile data via Signal CLI:', error)
    })
    // noinspection JSIgnoredPromiseFromCall
    trustfix()
    // noinspection JSIgnoredPromiseFromCall
    wipeattachments()
}

async function runbootmigrations() {
    try {
        const mongoose = await exportmodels()
        await mongoose.connection.asPromise()
        await buildindexes(mongoose)
        const result = await runmigrations(mongoose, {
            appliedby: 'system:boot',
            continueonerror: true,
        })
        console.log(
            `[migrations] discovered=${result.total} pending=${result.pending} executed=${result.executed} failed=${result.failed} skipped=${result.skipped}`
        )
    } catch (error) {
        console.error('[migrations] Failed to run startup migrations:', error)
    }
}

async function main() {
    console.log(`${botname} starting...`)
    await runbootmigrations()
    const signalhandler = await import('./core/signalhandler.js')
    interpretmessage = signalhandler.interpretmessage
    trustfix = signalhandler.trustfix
    wipeattachments = signalhandler.wipeattachments
    ;({ initialisewebhookhandler } = await import('./core/webhandler.js'))
    daemon = signalclidaemon()
    initialisewebhookhandler().catch((err) => {
        console.error('Failed to start webhook handler:', err)
    })
    if (socketpath.includes(':')) {
        console.log('Method: TCP')
        const starthook = setInterval(() => {
            const testClient = new net.Socket()
            testClient.setTimeout(1000)
            startconn(testClient, () => {
                testClient.destroy()
                clearInterval(starthook)
                signalclihook()
            })
            testClient.on('error', () => {
                testClient.destroy()
            })
            testClient.on('timeout', () => {
                testClient.destroy()
            })
        }, 2000)
    } else {
        console.log('Method: UNIX Socket')
        const starthook = setInterval(() => {
            if (fs.existsSync(socketpath)) {
                clearInterval(starthook)
                signalclihook()
            }
        }, 100)
    }
}

main().catch((error) => {
    console.error('Fatal startup error:', error)
    process.exit(1)
})
