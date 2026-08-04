import { exportmodels, buildindexes } from '../../core/mongoose.js'
import { listmigrationdefinitions, runmigrations, summarizesmigrationstatus } from './runner.js'

const command = (process.argv[2] || 'run').toLowerCase()
const maybeName = process.argv[3] || null

async function main() {
    if (command === 'list') {
        const definitions = await listmigrationdefinitions()
        if (definitions.length === 0) {
            console.log('No migration files found.')
            return
        }
        for (const migration of definitions) {
            console.log(`- ${migration.timestamp}-${migration.slug} (${migration.file})`)
        }
        return
    }

    const mongoose = await exportmodels()
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connection.asPromise()
    }
    await buildindexes(mongoose)

    if (command === 'status') {
        const summary = await summarizesmigrationstatus(mongoose)
        console.log('Migration status:')
        console.log(`  discovered: ${summary.totals.discovered}`)
        console.log(`  completed: ${summary.totals.completed}`)
        console.log(`  failed: ${summary.totals.failed}`)
        console.log(`  pending: ${summary.totals.pending}`)
        if (summary.lastcompleted) {
            console.log(
                `  last completed: ${summary.lastcompleted.file} at ${new Date(summary.lastcompleted.completedat).toISOString()}`
            )
        }
        return
    }

    if (command === 'run') {
        const result = await runmigrations(mongoose, {
            only: maybeName ? [maybeName] : null,
            appliedby: 'cli',
            continueonerror: false,
            retryfailed: true,
        })
        console.log('Migration execution result:')
        console.log(JSON.stringify(result, null, 2))
        if (result.failed > 0) process.exitCode = 1
        return
    }

    console.error('Unknown command. Use: run | status | list [name]')
    process.exitCode = 1
}

main().catch((error) => {
    console.error('Migration CLI failed:', error)
    process.exitCode = 1
})
