import { describe, expect, test } from 'bun:test'
import { listmigrationdefinitions, listmigrationfiles, runmigrations } from '../db/migrations/runner.js'

// Mimics the chainable `find().sort().lean()` surface Mongoose queries expose,
// while still being awaitable on its own.
function queryresult(rows) {
    const promise = /** @type {Promise<any[]> & { sort: () => any, lean: () => any }} */ (Promise.resolve(rows))
    promise.sort = () => promise
    promise.lean = () => promise
    return promise
}

function fakemongoose(seed = []) {
    const store = new Map(seed.map((record) => [record.file, { ...record }]))
    const registry = {
        find(query) {
            const wanted = Array.isArray(query?.$or) ? query.$or.map((clause) => clause.file) : null
            const rows = [...store.values()]
            return queryresult(wanted ? rows.filter((row) => wanted.includes(row.file)) : rows)
        },
        async updateOne(filter, update, options = {}) {
            let record = store.get(filter.file)
            if (!record) {
                if (!options.upsert) return
                record = { file: filter.file }
            }
            Object.assign(record, update.$set || {})
            for (const key of Object.keys(update.$unset || {})) delete record[key]
            store.set(filter.file, record)
        },
    }
    return { store, model: () => registry }
}

function definition(overrides = {}) {
    return {
        timestamp: 1,
        slug: 'example',
        id: '1-example',
        file: '1-example.js',
        up: async () => true,
        ...overrides,
    }
}

describe('listmigrationfiles', () => {
    test('discovers the baseline migration and parses its filename', () => {
        const baseline = listmigrationfiles().find((entry) => entry.slug === 'baseline')
        expect(baseline).toBeDefined()
        expect(baseline.timestamp).toBe(1775865600000)
        expect(baseline.id).toBe('1775865600000-baseline')
    })

    test('returns files sorted by timestamp', () => {
        const timestamps = listmigrationfiles().map((entry) => entry.timestamp)
        expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b))
    })
})

describe('listmigrationdefinitions', () => {
    test('loads an up function for every discovered migration', async () => {
        const definitions = await listmigrationdefinitions()
        expect(definitions.length).toBeGreaterThan(0)
        expect(definitions.every((entry) => typeof entry.up === 'function')).toBe(true)
    })
})

describe('runmigrations', () => {
    test('executes pending migrations and records them as completed', async () => {
        const mongoose = fakemongoose()
        const result = await runmigrations(mongoose, { definitions: [definition()] })
        expect(result).toMatchObject({ total: 1, pending: 1, executed: 1, failed: 0, skipped: 0 })
        expect(mongoose.store.get('1-example.js')).toMatchObject({ status: 'completed', error: '' })
    })

    test('skips migrations that already completed', async () => {
        const mongoose = fakemongoose([{ file: '1-example.js', status: 'completed' }])
        let ran = false
        const result = await runmigrations(mongoose, {
            definitions: [definition({ up: async () => (ran = true) })],
        })
        expect(ran).toBe(false)
        expect(result).toMatchObject({ pending: 0, executed: 0, skipped: 1 })
    })

    test('leaves failed migrations alone unless retryfailed is set', async () => {
        const seed = [{ file: '1-example.js', status: 'failed' }]
        expect(await runmigrations(fakemongoose(seed), { definitions: [definition()] })).toMatchObject({
            pending: 0,
            executed: 0,
        })
        expect(
            await runmigrations(fakemongoose(seed), { definitions: [definition()], retryfailed: true })
        ).toMatchObject({ pending: 1, executed: 1 })
    })

    test('records the failure and keeps going when a migration throws', async () => {
        const mongoose = fakemongoose()
        const result = await runmigrations(mongoose, {
            definitions: [
                definition({
                    up: async () => {
                        throw new Error('boom')
                    },
                }),
                definition({ timestamp: 2, slug: 'later', id: '2-later', file: '2-later.js' }),
            ],
        })
        expect(result).toMatchObject({ executed: 1, failed: 1 })
        expect(result.failures[0]).toMatchObject({ file: '1-example.js' })
        expect(result.failures[0].error).toContain('boom')
        expect(mongoose.store.get('1-example.js').status).toBe('failed')
        expect(mongoose.store.get('2-later.js').status).toBe('completed')
    })

    test('stops at the first failure when continueonerror is false', async () => {
        const mongoose = fakemongoose()
        let ranlater = false
        const result = await runmigrations(mongoose, {
            continueonerror: false,
            definitions: [
                definition({
                    up: async () => {
                        throw new Error('boom')
                    },
                }),
                definition({
                    timestamp: 2,
                    slug: 'later',
                    id: '2-later',
                    file: '2-later.js',
                    up: async () => (ranlater = true),
                }),
            ],
        })
        expect(ranlater).toBe(false)
        expect(result).toMatchObject({ executed: 0, failed: 1 })
    })

    test('filters by file, timestamp, id or slug when only is given', async () => {
        for (const target of ['1-example.js', '1', '1-example', 'example']) {
            const result = await runmigrations(fakemongoose(), {
                only: [target],
                definitions: [
                    definition(),
                    definition({ timestamp: 2, slug: 'other', id: '2-other', file: '2-other.js' }),
                ],
            })
            expect(result).toMatchObject({ total: 1, executed: 1 })
        }
    })

    test('selects nothing when only matches no migration', async () => {
        const result = await runmigrations(fakemongoose(), { only: ['nope'], definitions: [definition()] })
        expect(result).toMatchObject({ total: 0, pending: 0, executed: 0, skipped: 0 })
    })

    test('stamps the appliedby value onto the registry', async () => {
        const mongoose = fakemongoose()
        await runmigrations(mongoose, { definitions: [definition()], appliedby: 'admin:aria' })
        expect(mongoose.store.get('1-example.js').appliedby).toBe('admin:aria')
    })
})
