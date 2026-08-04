export const modelName = 'Webhook'

export default function createWebhookSchema(mongoose) {
    const schema = new mongoose.Schema({
        _id: String,
        userid: String,
    })

    schema.index({ userid: 1 }, { unique: true })
    return schema
}
