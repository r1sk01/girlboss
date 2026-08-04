export const modelName = 'Game'

export default function createGameSchema(mongoose) {
    const schema = new mongoose.Schema({
        gameid: String,
        hostid: String,
        players: [Object],
        status: String,
        properties: Object,
    })

    schema.index({ gameid: 1 }, { unique: true })
    schema.index({ players: 1 })
    return schema
}
