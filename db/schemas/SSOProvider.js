export const modelName = 'SSOProvider'

export default function createSSOProviderSchema(mongoose) {
    const schema = new mongoose.Schema({
        _id: String,
        name: String,
        owner: String,
        key: String,
        scopes: {
            type: [String],
            default: [],
        },
    })

    schema.index({ key: 1 }, { unique: true })
    return schema
}
