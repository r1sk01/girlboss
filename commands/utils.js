import dns from 'dns/promises'
import crypto from 'crypto';
import { mongoose, redis, prefix, botname, phonenumber, sendresponse, sendmessage, parsecommand } from '../modulecontext.js'

export default {
    section: "utils",
    user: true,
    admin: false,
    execute: null,
    commands: {
        "webhook": {
            description: "Manage your webhook",
            arguments: ['generate/delete/status'],
            execute: async (envelope, message) => {
                try {
                    const Webhook = mongoose.model('Webhook');
                    const match = parsecommand(message);
                    const action = match && match[1] ? match[1].toLowerCase() : null;
                    if (!action) {
                        const existingwebhook = await Webhook.findOne({ userid: envelope.sourceUuid });
                        let statusmsg = `Webhook Management Commands:\n`;
                        statusmsg += `generate - Create a new webhook (deletes existing one)\n`;
                        statusmsg += `delete - Delete your webhook\n`;
                        statusmsg += `status - Show webhook info\n\n`;
                        
                        if (existingwebhook) {
                            statusmsg += `You have a webhook! Use the status command to see the URL and POST data format to use it!`;
                        } else {
                            statusmsg += `You don't have a webhook yet. Use "${prefix}webhook generate" to create one.`;
                        }
                        
                        await sendresponse(statusmsg, envelope, `${prefix}webhook`, false);
                        return;
                    }
                    if (action === 'generate') {
                        const existingwebhook = await Webhook.findOne({ userid: envelope.sourceUuid });
                        if (existingwebhook) {
                            await existingwebhook.deleteOne();
                        }
                        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                        const webhookid = Array.from({length: 32}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                        const newwebhook = new Webhook({
                            _id: webhookid,
                            userid: envelope.sourceUuid
                        });
                        await newwebhook.save();
                        let responsemsg = `Webhook created successfully!\n\n`;
                        responsemsg += `Your webhook URL:\nhttps://tritiumweb.zeusteam.dev/api/webhook/${webhookid}\n\n`;
                        responsemsg += `POST data format:\n{"name": "app name", "content": "message content"}\n\n`;
                        await sendresponse(responsemsg, envelope, `${prefix}webhook`, false);
                    } else if (action === 'delete') {
                        const existingwebhook = await Webhook.findOne({ userid: envelope.sourceUuid });
                        if (!existingwebhook) {
                            await sendresponse('You don\'t have a webhook to delete.', envelope, `${prefix}webhook`, true);
                            return;
                        }
                        await existingwebhook.deleteOne();
                        await sendresponse('Your webhook has been deleted successfully.', envelope, `${prefix}webhook`, false);
                    } else if (action === 'status') {
                        const existingwebhook = await Webhook.findOne({ userid: envelope.sourceUuid });
                        if (!existingwebhook) {
                            await sendresponse(`You don't have a webhook yet. Use "${prefix}webhook generate" to create one.`, envelope, `${prefix}webhook`, true);
                            return;
                        }
                        let statusmsg = `Your webhook information:\n\n`;
                        statusmsg += `Webhook URL:\nhttps://tritiumweb.zeusteam.dev/api/webhook/${existingwebhook._id}\n\n`;
                        statusmsg += `POST data format:\n{"name": "app name", "content": "message content"}\n\n`;
                        statusmsg += `Sample curl commands:\ncurl https://tritiumweb.zeusteam.dev/api/webhook/${existingwebhook._id} -X POST -H "Content-Type: application/json" -d '{"name":"meow","content":"wow it works!"}'\ncurl https://tritiumweb.zeusteam.dev/api/webhook/${existingwebhook._id} --json '{"name":"meow","content":"wow it works!"}'`
                        await sendresponse(statusmsg, envelope, `${prefix}webhook`, false);
                    } else {
                        await sendresponse(`Invalid action. Available actions: generate, delete, status`, envelope, `${prefix}webhook`, true);
                    }
                    
                } catch (err) {
                    await sendresponse('Failed to read/write data for this command. Please try again later.', envelope, `${prefix}webhook`, true);
                }
            }
        },
        "dig": {
            description: "Get DNS info about a host",
            arguments: ['host', 'type'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-dig [host] [type]" to get DNS info about a host.', envelope, `${prefix}dig`, true);
                        return;
                    }
                    const host = match[1];
                    const recordtype = match[2].toLowerCase();
                    let result;
                    let responsemsg = `DNS lookup for ${host} (${recordtype.toUpperCase()}):\n\n`;
                    switch (recordtype) {
                        case 'a':
                            result = await dns.resolve4(host);
                            responsemsg += `A Records:\n${result.map(ip => `  ${ip}`).join('\n')}`;
                            break;
                        case 'aaaa':
                            result = await dns.resolve6(host);
                            responsemsg += `AAAA Records:\n${result.map(ip => `  ${ip}`).join('\n')}`;
                            break;
                        case 'mx':
                            result = await dns.resolveMx(host);
                            responsemsg += `MX Records:\n${result.map(mx => `  ${mx.priority} ${mx.exchange}`).join('\n')}`;
                            break;
                        case 'txt':
                            result = await dns.resolveTxt(host);
                            responsemsg += `TXT Records:\n${result.map(txt => `  "${txt.join('""')}"`).join('\n')}`;
                            break;
                        case 'cname':
                            result = await dns.resolveCname(host);
                            responsemsg += `CNAME Records:\n${result.map(cname => `  ${cname}`).join('\n')}`;
                            break;
                        case 'ns':
                            result = await dns.resolveNs(host);
                            responsemsg += `NS Records:\n${result.map(ns => `  ${ns}`).join('\n')}`;
                            break;
                        case 'ptr':
                            result = await dns.resolvePtr(host);
                            responsemsg += `PTR Records:\n${result.map(ptr => `  ${ptr}`).join('\n')}`;
                            break;
                        case 'soa':
                            result = await dns.resolveSoa(host);
                            responsemsg += `SOA Record:\n  Primary: ${result.nsname}\n  Admin: ${result.hostmaster}\n  Serial: ${result.serial}\n  Refresh: ${result.refresh}\n  Retry: ${result.retry}\n  Expire: ${result.expire}\n  TTL: ${result.minttl}`;
                            break;
                        case 'srv':
                            result = await dns.resolveSrv(host);
                            responsemsg += `SRV Records:\n${result.map(srv => `  ${srv.priority} ${srv.weight} ${srv.port} ${srv.name}`).join('\n')}`;
                            break;
                        case 'any':
                            responsemsg = `DNS lookup for ${host} (ALL):\n\n`;
                            try {
                                const a = await dns.resolve4(host).catch(() => null);
                                if (a) responsemsg += `A Records:\n${a.map(ip => `  ${ip}`).join('\n')}\n\n`;
                            } catch (e) {}
                            try {
                                const aaaa = await dns.resolve6(host).catch(() => null);
                                if (aaaa) responsemsg += `AAAA Records:\n${aaaa.map(ip => `  ${ip}`).join('\n')}\n\n`;
                            } catch (e) {}
                            try {
                                const mx = await dns.resolveMx(host).catch(() => null);
                                if (mx) responsemsg += `MX Records:\n${mx.map(mx => `  ${mx.priority} ${mx.exchange}`).join('\n')}\n\n`;
                            } catch (e) {}
                            try {
                                const txt = await dns.resolveTxt(host).catch(() => null);
                                if (txt) responsemsg += `TXT Records:\n${txt.map(txt => `  "${txt.join('""')}"`).join('\n')}\n\n`;
                            } catch (e) {}
                            try {
                                const ns = await dns.resolveNs(host).catch(() => null);
                                if (ns) responsemsg += `NS Records:\n${ns.map(ns => `  ${ns}`).join('\n')}\n\n`;
                            } catch (e) {}
                            responsemsg = responsemsg.trim();
                            break;
                        default:
                            await sendresponse(`Unsupported record type: ${recordtype}\nSupported types: A, AAAA, MX, TXT, CNAME, NS, PTR, SOA, SRV, ANY`, envelope, `${prefix}dig`, true);
                            return;
                    }
                    if (!result || (Array.isArray(result) && result.length === 0)) {
                        await sendresponse(`No ${recordtype.toUpperCase()} records found for ${host}`, envelope, `${prefix}dig`, true);
                        return;
                    }
                    await sendresponse(responsemsg, envelope, `${prefix}dig`, false);
                } catch (err) {
                    console.error('DNS lookup error:', err);
                    if (err.code === 'ENOTFOUND') {
                        await sendresponse(`Domain not found: ${match ? match[1] : 'unknown'}`, envelope, `${prefix}dig`, true);
                    } else if (err.code === 'ENODATA') {
                        await sendresponse(`No ${match ? match[2].toUpperCase() : 'DNS'} records found for ${match ? match[1] : 'unknown'}`, envelope, `${prefix}dig`, true);
                    } else {
                        await sendresponse('Failed to retrieve DNS information. Please try again later.', envelope, `${prefix}dig`, true);
                    }
                }
            }
        },
        "ae2": {
            description: "Manage your AE2 ME Storage Network from Signal (in dev, disabled)",
            arguments: ['subcommand', 'args'],
            execute: async (envelope, message) => {
                sendresponse("Command is locked until development is finished", envelope, `${prefix}ae2`, true);
                try {
                    const AE2Token = mongoose.model('AE2Token');
                    const match = parsecommand(message)
                    const action = match && match[1] ? match[1].toLowerCase() : null;
    
                    if (!action) {
                        const existingToken = await AE2Token.findOne({ userid: envelope.sourceUuid });
                        let statusmsg = `AE2 Network Management Commands:\n`;
                        statusmsg += `generate - Create a new AE2 token (deletes existing one)\n`;
                        statusmsg += `delete - Delete your AE2 token\n`;
                        statusmsg += `status - Show AE2 token info\n`;
                        statusmsg += `bios - Get the OpenComputers BIOS script\n\n`;
    
                        if (existingToken) {
                            statusmsg += `You have an AE2 token! Use the status command to see your token and the bios command to get the OpenComputers script!`;
                        } else {
                            statusmsg += `You don't have an AE2 token yet. Use "${prefix}ae2 generate" to create one.`;
                        }
    
                        await sendresponse(statusmsg, envelope, `${prefix}ae2`, false);
                        return;
                    }
    
                    if (action === 'generate') {
                        const existingToken = await AE2Token.findOne({ userid: envelope.sourceUuid });
                        if (existingToken) {
                            await existingToken.deleteOne();
                        }
    
                        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                        const tokenid = Array.from({length: 32}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    
                        const newToken = new AE2Token({
                            _id: tokenid,
                            userid: envelope.sourceUuid
                        });
                        await newToken.save();
    
                        let responsemsg = `AE2 token created successfully!\n\n`;
                        responsemsg += `Your AE2 token: ${tokenid}\n\n`;
                        responsemsg += `Use "${prefix}ae2 bios" to get the OpenComputers BIOS script for your ME network.\n`;
                        responsemsg += `WebSocket URL: ws://tritiumweb.zeusteam.dev/api/ae2/${tokenid}\n\n`;
                        responsemsg += `This token allows you to remotely manage your AE2 ME Storage Network through ${botname}!`;
    
                        await sendresponse(responsemsg, envelope, `${prefix}ae2`, false);
    
                    } else if (action === 'delete') {
                        const existingToken = await AE2Token.findOne({ userid: envelope.sourceUuid });
                        if (!existingToken) {
                            await sendresponse('You don\'t have an AE2 token to delete.', envelope, `${prefix}ae2`, true);
                            return;
                        }
    
                        await existingToken.deleteOne();
                        await sendresponse('Your AE2 token has been deleted successfully.', envelope, `${prefix}ae2`, false);
    
                    } else if (action === 'status') {
                        const existingToken = await AE2Token.findOne({ userid: envelope.sourceUuid });
                        if (!existingToken) {
                            await sendresponse(`You don't have an AE2 token yet. Use "${prefix}ae2 generate" to create one.`, envelope, `${prefix}ae2`, true);
                            return;
                        }
    
                        let statusmsg = `Your AE2 network information:\n\n`;
                        statusmsg += `AE2 Token: ${existingToken._id}\n`;
                        statusmsg += `WebSocket URL: ws://tritiumweb.zeusteam.dev/api/ae2/${existingToken._id}\n\n`;
                        statusmsg += `Use "${prefix}ae2 bios" to get the OpenComputers BIOS script for your ME network.\n\n`;
                        statusmsg += `This token allows you to remotely manage your AE2 ME Storage Network through ${botname}!`;
    
                        await sendresponse(statusmsg, envelope, `${prefix}ae2`, false);
    
                    } else if (action === 'bios') {
                        const existingToken = await AE2Token.findOne({ userid: envelope.sourceUuid });
                        if (!existingToken) {
                            await sendresponse(`You don't have an AE2 token yet. Use "${prefix}ae2 generate" to create one first.`, envelope, `${prefix}ae2`, true);
                            return;
                        }
    
                        const biosScript = `load((function()local c=""for chunk in component.invoke(component.list("internet")(),"request","https://tritiumweb.zeusteam.dev/api/ae2/script.lua").read do c=c..chunk end return c end)())("${existingToken._id}")`;
    
                        let responsemsg = `Here's your OpenComputers BIOS script with your AE2 token:\n\n`;
                        responsemsg += `\`\`\`lua\n${biosScript}\n\`\`\`\n\n`;
                        responsemsg += `Instructions:\n`;
                        responsemsg += `1. Flash this script to your OpenComputers EEPROM\n`;
                        responsemsg += `2. Make sure you have an Internet Card and ME Controller/Interface connected\n`;
                        responsemsg += `3. Boot the computer - it will automatically connect to your AE2 management system\n`;
                        responsemsg += `4. The computer will beep if there are any issues during startup\n\n`;
                        responsemsg += `Once connected, you can manage your ME network remotely through ${botname}!`;
    
                        if (envelope.dataMessage) {
                            const dataMessage = envelope.dataMessage;
                            const groupInfo = dataMessage.groupInfo;
                            if (groupInfo && groupInfo.groupId) {
                                await sendresponse(`Please check your DMs $MENTIONUSER for your AE2 BIOS script.`, envelope, `${prefix}ae2`, true);
                                await sendmessage(responsemsg, envelope.sourceUuid, phonenumber);
                            } else {
                                await sendresponse(responsemsg, envelope, `${prefix}ae2`, false);
                            }
                        } else {
                            await sendresponse(responsemsg, envelope, `${prefix}ae2`, false);
                        }
    
                    } else {
                        await sendresponse(`Invalid action. Available actions: generate, delete, status, bios`, envelope, `${prefix}ae2`, true);
                    }
    
                } catch (err) {
                    console.error('AE2 command error:', err);
                    await sendresponse('Failed to read/write data for this command. Please try again later.', envelope, `${prefix}ae2`, true);
                }
            }
        },
        "sso": {
            description: "Sign in to a site with your Signal account",
            arguments: ["id", "confirm"],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    const id = match && match[1] ? match[1].toUpperCase() : null;
                    if (!id) {
                        sendresponse(`To use Single Sign-On, you must provide an ID for a site to sign into.\nA site that supports SSO should provide you with one.\n!!! DO NOT USE AN ID THAT SOMEONE ELSE GIVES YOU !!!\nUsage: ${prefix}sso [id] [confirm]`, envelope, `${prefix}sso`, false);
                    } else if (id) {
                        const result = await redis.get(`sso:${id}`);
                        if (result) {
                            const SSOProvider = await mongoose.model("SSOProvider");
                            const provider = await SSOProvider.findOne({ _id: result });
                            if (!provider) {
                                sendresponse('It seems you have provided an invalid ID, please double check that the ID you provided is correct and hasn\'t expired (30 minute expiry).', envelope, `${prefix}sso`, true);
                                return;
                            }
                            if (match[2] && match[2].toLowerCase().trim() === "true") {
                                await redis.del(`sso:${id}`);
                                await redis.set(`sso-${provider._id}:${id}`, `${crypto.createHash('sha512').update(`${provider._id}:${envelope.sourceUuid}`).digest('hex')}`, 'EXAT', Math.floor(Date.now() / 1000) + 600);
                                sendresponse(`Please let the provider know that you have accepted the SSO request to finish logging in!`, envelope, `${prefix}sso`, false)
                            } else {
                                const messages = [
                                    "Bake a cake",
                                    "Buy you a nice seafood dinner",
                                    "Have an existential crisis",
                                    "Microbrew some local kombucha",
                                    "Solve a mystery with Scooby and the gang",
                                    "Record a new mixtape",
                                    "Paint a happy little tree",
                                    "Read you a bedtime story",
                                    "Initiate a nuclear strike",
                                    "Unleash a global pandemic",
                                    "Assassinate the current US president",
                                    "Inject you with the opposite of your preferred sex hormone",
                                    "Double the money in your bank account"
                                ];
                                sendresponse(`${provider.name} is requesting authorisation (owned by ${provider.owner}).\nThis will give the provider the ability to:\n✓ Retrieve your Signal ID (hashed with SHA512)\n✓ Log you into your associated account\n✖ ${messages[Math.floor(Math.random() * messages.length)]}\n\nIf these permissions seem all good to you, run '-sso ${id} true' to authorise this app.`, envelope, `${prefix}sso`, false);
                            }
                        } else {
                            sendresponse('It seems you have provided an invalid ID, please double check that the ID you provided is correct and hasn\'t expired (30 minute expiry).', envelope, `${prefix}sso`, true);
                        }
                    }
                } catch (e) {
                    sendresponse('Failed to read/write data for this command. Please try again later.', envelope, `${prefix}sso`, true);
                }
            }
        }
    }
}