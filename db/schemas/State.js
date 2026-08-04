export const modelName = 'State'

export default function createStateSchema(mongoose) {
    return new mongoose.Schema({
        _id: String,
        enabled: Boolean,
        updatedat: Number,
    })
}
