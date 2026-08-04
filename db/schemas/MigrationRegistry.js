// noinspection JSUnusedGlobalSymbols
export const modelName = 'MigrationRegistry'

export default function createMigrationRegistrySchema(mongoose) {
    const schema = new mongoose.Schema({
        timestamp: {
            type: Number,
            required: true,
        },
        slug: {
            type: String,
            required: true,
        },
        file: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'executing', 'completed', 'failed'],
            default: 'pending',
        },
        startedat: Number,
        completedat: Number,
        failedat: Number,
        error: {
            type: String,
            default: '',
        },
        appliedby: {
            type: String,
            default: 'system',
        },
    })

    schema.index({ file: 1 }, { unique: true })
    schema.index({ timestamp: 1 })
    schema.index({ status: 1, completedat: -1 })
    return schema
}
