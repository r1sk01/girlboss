import fs from 'fs'
import { parse as parseJsonc } from 'jsonc-parser'
import * as signalhandler from './signalhandler.js'
import Redis from "ioredis";
let config = parseJsonc(fs.readFileSync('config.jsonc','utf8'))
const prefix = config.prefix || '-'
const botname = config.botname || 'TritiumBot'
const phonenumber = config.phonenumber
const managedaccount = config.managedaccount
const rediscon = config.rediscon || 'redis://localhost:6379';
config = undefined
function escapereg(string){
    return string.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
}
function parsecommand(message) {
    if (!message) return null;
    const reg = new RegExp(`^(${escapereg(prefix)}\\S+)\\s*([\\s\\S]*)$`, 'i');
    const match = message.match(reg);
    if (!match) return null;
    const command = match[1].trim();
    const rest = match[2].trim();
    if (!rest) return [command];
    const tokens = [];
    let current = '';
    let inQuote = false;
    let quoteChar = null;
    for (let i = 0; i < rest.length; i++) {
        const c = rest[i];
        if ((c === '"' || c === "'")) {
            if (!inQuote) {
                inQuote = true;
                quoteChar = c;
                continue;
            } else if (c === quoteChar) {
                inQuote = false;
                quoteChar = null;
                continue;
            }
        }
        if (c === '\\' && i + 1 < rest.length) {
            current += rest[++i];
            continue;
        }
        if (c === ' ' && !inQuote) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            continue;
        }
        current += c;
    }
    if (current) tokens.push(current);
    return [command, ...tokens];
}
const { sendresponse, sendmessage, getcontacts } = signalhandler

const mc = new Map();
const gt = () => Date.now();
async function hotreloadable(mod) {
    const timestamp = gt();
    const cm = mc.get(mod);
    const sr = !cm || (timestamp - cm.timestamp > 1000);
    if (sr) {
        try {
            const module = await import(`${mod}?t=${timestamp}`);
            mc.set(mod, { module, timestamp });
            return module;
        } catch (error) {
            const module = await import(mod);
            mc.set(mod, { module, timestamp });
            return module;
        }
    }
    return cm.module;
}
const mongoosemodule = await hotreloadable('./mongoose.js')
const { exportmodels } = mongoosemodule
const mongoose = exportmodels()
const redis = new Redis(rediscon);

export { redis, mongoose, prefix, botname, phonenumber, managedaccount, sendresponse, sendmessage, getcontacts, escapereg, parsecommand, hotreloadable }