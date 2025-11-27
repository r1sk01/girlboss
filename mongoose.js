import mongoose from 'mongoose';
import { parse as parseJsonc } from 'jsonc-parser';
import fs from 'fs';

let config;
try {
    config = parseJsonc(fs.readFileSync('config.jsonc', 'utf8'));
} catch (error) {
    config = {};
}
const mongoosefcon = config.mongoosecon;
config = undefined;

function exportmodels(mongoosecon=mongoosefcon) {
    if (mongoose.connection.readyState === 0) mongoose.connect(mongoosecon);
    if (mongoose.models.User) delete mongoose.models.User;
    if (mongoose.models.Game) delete mongoose.models.Game;
    if (mongoose.models.Poll) delete mongoose.models.Poll;
    if (mongoose.models.FeatureReq) delete mongoose.models.FeatureReq;
    if (mongoose.models.Webhook) delete mongoose.models.Webhook;
    if (mongoose.models.AE2Token) delete mongoose.models.AE2Token;
    if (mongoose.models.State) delete mongoose.models.State;
    if (mongoose.models.SSOProvider) delete mongoose.models.SSOProvider;
    const userSchema = new mongoose.Schema({
        userid: String,
        username: String,
        accesslevel: Number,
        properties: Object,
    });
    const gameSchema = new mongoose.Schema({
        hostid: String,
        players: [Object],
        status: String,
        properties: Object,
    });
    const pollSchema = new mongoose.Schema({
        pollid: String,
        question: String,
        options: [String],
        votes: [Number],
        voters: [String],
    });
    const featurereqSchema = new mongoose.Schema({
        reqid: String,
        userid: String,
        feature: String,
    });
    const webhookSchema = new mongoose.Schema({
        _id: String,
        userid: String,
    });
    const ae2tokenSchema = new mongoose.Schema({
        _id: String,
        userid: String,
    });
    const stateSchema = new mongoose.Schema({
        _id: String,
        enabled: Boolean,
        updatedat: Number,
    });
    const ssoproviderSchema = new mongoose.Schema({
        _id: String,
        name: String,
        owner: String,
        key: String,
    })
    mongoose.model('User', userSchema);
    mongoose.model('User').createIndexes({ userid: 1 }, { unique: true });
    mongoose.model('Game', gameSchema);
    mongoose.model('Game').createIndexes({ gameid: 1 }, { unique: true });
    mongoose.model('Game').createIndexes({ players: 1 });
    mongoose.model('Poll', pollSchema);
    mongoose.model('Poll').createIndexes({ pollid: 1 }, { unique: true });
    mongoose.model('FeatureReq', featurereqSchema);
    mongoose.model('FeatureReq').createIndexes({ reqid: 1 }, { unique: true });
    mongoose.model('Webhook', webhookSchema);
    mongoose.model('Webhook').createIndexes({ _id: 1 }, { unique: true });
    mongoose.model('Webhook').createIndexes({ userid: 1 }, { unique: true });
    mongoose.model('AE2Token', ae2tokenSchema);
    mongoose.model('AE2Token').createIndexes({ _id: 1 }, { unique: true });
    mongoose.model('AE2Token').createIndexes({ userid: 1 }, { unique: true });
    mongoose.model('State', stateSchema);
    mongoose.model('State').createIndexes({ _id: 1 }, { unique: true });
    mongoose.model('SSOProvider', ssoproviderSchema);
    mongoose.model('SSOProvider').createIndexes({ _id: 1 }, { unique: true });
    mongoose.model('SSOProvider').createIndexes({ key: 1 }, { unique: true });
    return mongoose;
};

export {
    exportmodels,
};
