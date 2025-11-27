import Redis from 'ioredis';
import { parse as parseJsonc } from 'jsonc-parser';
import fs from 'fs';

let config = parseJsonc(fs.readFileSync('config.jsonc', 'utf8'));
const rediscon = config.rediscon || 'redis://localhost:6379';
const phonenumber = config.phonenumber;
config = undefined;

const redis = new Redis(rediscon);
const signalhandler = await import('./signalhandler.js');

redis.on('error', (err) => {
    //console.error('Redis connection error:', err);
});

redis.on('connect', () => {
    //console.log('Connected to Redis/DragonflyDB');
});

export async function initialisewebhookhandler() {
    try {
        redis.subscribe('webhook-messages', (err, count) => {
            if (err) {
                //console.error('Failed to subscribe to webhook messages:', err);
                return;
            }
            //console.log(`Subscribed to ${count} webhook channels`);
        });

        redis.on('message', async (channel, message) => {
            if (channel === 'webhook-messages') {
                try {
                    await processwebhookmessage(JSON.parse(message));
                } catch (error) {
                    //console.error('Error processing webhook message:', error);
                }
            }
        });

        //console.log('Webhook handler initialized');
    } catch (error) {
        //console.error('Failed to initialize webhook handler:', error);
    }
}

async function processwebhookmessage(data) {
    try {
        const { userid, name, content } = data;
        
        if (!userid || !name || !content) {
            console.error('Invalid webhook message data:', data);
            return;
        }

        const formattedmessage = `Message received by your webhook from "${name}":\n${content}`;
        
        await signalhandler.sendmessage(formattedmessage, userid, phonenumber);
        //console.log(`Webhook message delivered to ${userid} from ${name}`);
        
    } catch (error) {
        //console.error('Error processing webhook message:', error);
    }
}