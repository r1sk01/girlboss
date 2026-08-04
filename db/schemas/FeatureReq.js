export const modelName = 'FeatureReq'

export default function createFeatureReqSchema(mongoose) {
    const schema = new mongoose.Schema({
        reqid: String,
        userid: String,
        feature: String,
    })

    schema.index({ reqid: 1 }, { unique: true })
    return schema
}
