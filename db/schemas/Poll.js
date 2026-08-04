export const modelName = 'Poll'

export default function createPollSchema(mongoose) {
    const schema = new mongoose.Schema({
        pollid: String,
        question: String,
        options: [String],
        votes: [Number],
        voters: [String],
    })

    schema.index({ pollid: 1 }, { unique: true })
    return schema
}
