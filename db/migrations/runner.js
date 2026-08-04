import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const migrationsDir = path.dirname(fileURLToPath(import.meta.url))
const scriptsDir = path.join(migrationsDir, 'scripts')
const migrationFileRe = /^(\d+)-(.+)\.js$/i

function parsemigrationfilename(filename) {
    const match = filename.match(migrationFileRe)
    if (!match) return null
    const timestamp = Number.parseInt(match[1], 10)
    if (!Number.isFinite(timestamp)) return null
    return {
        timestamp,
        slug: match[2],
        file: filename,
        id: `${timestamp}-${match[2]}`,
    }
}

function normalizeerror(error) {
    if (!error) return 'unknown error'
    if (error instanceof Error && error.stack) return error.stack.slice(0, 4000)
    return String(error).slice(0, 4000)
}

function validate(definition, filename) {
    if (typeof definition?.up !== 'function') {
        throw new Error(`Migration ${filename} must export an async function "up"`)
    }
}

export function listmigrationfiles() {
    if (!fs.existsSync(scriptsDir)) return []
    return fs
        .readdirSync(scriptsDir)
        .filter((entry) => entry.endsWith('.js') && !entry.startsWith('.') && migrationFileRe.test(entry))
        .map((entry) => ({ ...parsemigrationfilename(entry), file: entry, absolute: path.join(scriptsDir, entry) }))
        .filter((entry) => entry.timestamp != null)
        .sort((a, b) => a.timestamp - b.timestamp || a.file.localeCompare(b.file))
}

export async function listmigrationdefinitions() {
    const files = listmigrationfiles()

    const results = []
    for (const file of files) {
        const fileUrl = pathToFileURL(file.absolute).href
        const module = await import(fileUrl)
        validate(module, file.file)
        results.push({
            timestamp: file.timestamp,
            slug: file.slug,
            id: file.id,
            description: '',
            up: module.up,
            file: file.file,
            absolute: file.absolute,
        })
    }
    return results
}

async function runmigrationup(mongoose, migration) {
    let session = null
    try {
        if (typeof mongoose.startSession === 'function') {
            session = await mongoose.startSession()
        }
        if (session) {
            try {
                await session.withTransaction(async () => {
                    await migration.up(mongoose, {
                        session,
                        timestamp: migration.timestamp,
                        slug: migration.slug,
                        file: migration.file,
                    })
                })
                return
            } catch (error) {
                const message = String(error?.message || error)
                const notsupported =
                    message.includes('Transaction numbers are only allowed') ||
                    message.includes('Transaction support is not available')
                if (!notsupported) throw error
            }
        }
    } finally {
        if (session) await session.endSession()
    }

    await migration.up(mongoose, {
        session: null,
        timestamp: migration.timestamp,
        slug: migration.slug,
        file: migration.file,
    })
}

export async function runmigrations(
    mongoose,
    {
        only = null,
        appliedby = 'system:boot',
        continueonerror = true,
        retryfailed = false,
        definitions: provided = null,
    } = {}
) {
    const MigrationRegistry = mongoose.model('MigrationRegistry')
    const definitions = provided ?? (await listmigrationdefinitions())
    const selected =
        Array.isArray(only) && only.length > 0
            ? definitions.filter((item) =>
                  only.some(
                      (target) =>
                          target === item.file ||
                          target === String(item.timestamp) ||
                          target === item.id ||
                          target === item.slug ||
                          target === `${item.timestamp}-${item.slug}`
                  )
              )
            : definitions

    const existing =
        selected.length > 0
            ? await MigrationRegistry.find({
                  $or: selected.map((item) => ({ file: item.file })),
              })
            : []
    const existingbyfile = new Map(existing.map((entry) => [entry.file, entry]))

    const pending = selected.filter((item) => {
        const record = existingbyfile.get(item.file)
        if (!record) return true
        if (record.status === 'failed') return retryfailed
        return false
    })
    const results = {
        total: selected.length,
        pending: pending.length,
        executed: 0,
        failed: 0,
        skipped: selected.length - pending.length,
        failures: [],
    }

    for (const migration of pending) {
        const started = Date.now()
        await MigrationRegistry.updateOne(
            { file: migration.file },
            {
                $set: {
                    file: migration.file,
                    timestamp: migration.timestamp,
                    slug: migration.slug,
                    status: 'executing',
                    startedat: started,
                    appliedby,
                    error: '',
                },
            },
            { upsert: true }
        )

        try {
            await runmigrationup(mongoose, migration)
            const completedat = Date.now()
            await MigrationRegistry.updateOne(
                { file: migration.file },
                {
                    $set: {
                        status: 'completed',
                        completedat,
                        error: '',
                    },
                    $unset: { failedat: '' },
                }
            )
            results.executed += 1
        } catch (error) {
            const failure = normalizeerror(error)
            await MigrationRegistry.updateOne(
                { file: migration.file },
                {
                    $set: {
                        status: 'failed',
                        failedat: Date.now(),
                        error: failure,
                    },
                }
            )
            results.failed += 1
            results.failures.push({
                file: migration.file,
                timestamp: migration.timestamp,
                slug: migration.slug,
                error: failure,
            })
            if (!continueonerror) break
        }
    }

    return results
}

export async function summarizesmigrationstatus(mongoose) {
    const MigrationRegistry = mongoose.model('MigrationRegistry')
    const definitions = await listmigrationdefinitions()
    const records = await MigrationRegistry.find({}).sort({ completedat: -1, startedat: -1 }).lean()

    const completed = records.filter((entry) => entry.status === 'completed')
    const failed = records.filter((entry) => entry.status === 'failed')
    const recordedfiles = new Set(records.map((entry) => entry.file))
    const pending = definitions.filter((item) => !recordedfiles.has(item.file))

    return {
        totals: {
            discovered: definitions.length,
            completed: completed.length,
            failed: failed.length,
            pending: pending.length,
        },
        lastcompleted: completed[0] || null,
        failed: failed.slice(0, 5),
        recent: records.slice(0, 10),
        pending,
    }
}
