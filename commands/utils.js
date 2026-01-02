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
                    if (!host) {
                        await sendresponse('You must provide a host to look up.\nUsage: -dig [host] [type]', envelope, `${prefix}dig`, true);
                        return;
                    }
                    const recordtype = match[2]?.toLowerCase();
                    let result;
                    let afr;
                    let responsemsg = `DNS lookup for ${host} (${recordtype?.toUpperCase() || 'A'}):\n\n`;
                    switch (recordtype) {
                        case undefined:
                            result = await dns.resolve4(host);
                            responsemsg += `A Records:\n${result.map(ip => `- ${ip}`).join('\n')}`;
                            break;
                        case 'a':
                            result = await dns.resolve4(host);
                            responsemsg += `A Records:\n${result.map(ip => `- ${ip}`).join('\n')}`;
                            break;
                        case 'aaaa':
                            result = await dns.resolve6(host);
                            responsemsg += `AAAA Records:\n${result.map(ip => `- ${ip}`).join('\n')}`;
                            break;
                        case 'mx':
                            result = await dns.resolveMx(host);
                            responsemsg += `MX Records:\n${result.map(mx => `- ${mx.priority} ${mx.exchange}`).join('\n')}`;
                            break;
                        case 'txt':
                            result = await dns.resolveTxt(host);
                            responsemsg += `TXT Records:\n${result.map(txt => `- "${txt.join('""')}"`).join('\n')}`;
                            break;
                        case 'cname':
                            result = await dns.resolveCname(host);
                            responsemsg += `CNAME Records:\n${result.map(cname => `- ${cname}`).join('\n')}`;
                            break;
                        case 'ns':
                            result = await dns.resolveNs(host);
                            responsemsg += `NS Records:\n${result.map(ns => `- ${ns}`).join('\n')}`;
                            break;
                        case 'ptr':
                            result = await dns.resolvePtr(host);
                            responsemsg += `PTR Records:\n${result.map(ptr => `- ${ptr}`).join('\n')}`;
                            break;
                        case 'soa':
                            result = await dns.resolveSoa(host);
                            responsemsg += `SOA Record:\n- Primary: ${result.nsname}\n- Admin: ${result.hostmaster}\n- Serial: ${result.serial}\n- Refresh: ${result.refresh}\n- Retry: ${result.retry}\n- Expire: ${result.expire}\n- TTL: ${result.minttl}`;
                            break;
                        case 'srv':
                            result = await dns.resolveSrv(host);
                            responsemsg += `SRV Records:\n${result.map(srv => `- ${srv.priority} ${srv.weight} ${srv.port} ${srv.name}`).join('\n')}`;
                            break;
                        case 'any':
                            responsemsg = `DNS lookup for ${host} (ALL):\n\n`;
                            try {
                                const a = await dns.resolve4(host).catch(() => null);
                                afr = true;
                                if (a) responsemsg += `A Records:\n${a.map(ip => `- ${ip}`).join('\n')}\n\n`;
                            } catch (e) {}
                            try {
                                const aaaa = await dns.resolve6(host).catch(() => null);
                                afr = true;
                                if (aaaa) responsemsg += `AAAA Records:\n${aaaa.map(ip => `- ${ip}`).join('\n')}\n\n`;
                            } catch (e) {}
                            try {
                                const mx = await dns.resolveMx(host).catch(() => null);
                                afr = true;
                                if (mx) responsemsg += `MX Records:\n${mx.map(mx => `- ${mx.priority} ${mx.exchange}`).join('\n')}\n\n`;
                            } catch (e) {}
                            try {
                                const txt = await dns.resolveTxt(host).catch(() => null);
                                afr = true;
                                if (txt) responsemsg += `TXT Records:\n${txt.map(txt => `- "${txt.join('""')}"`).join('\n')}\n\n`;
                            } catch (e) {}
                            try {
                                const ns = await dns.resolveNs(host).catch(() => null);
                                afr = true;
                                if (ns) responsemsg += `NS Records:\n${ns.map(ns => `- ${ns}`).join('\n')}\n\n`;
                            } catch (e) {}
                            responsemsg = responsemsg.trim();
                            break;
                        default:
                            await sendresponse(`Unsupported record type: ${recordtype}\nSupported types: A, AAAA, MX, TXT, CNAME, NS, PTR, SOA, SRV, ANY`, envelope, `${prefix}dig`, true);
                            return;
                    }
                    if ((!result || (Array.isArray(result) && result.length === 0)) || (afr && afr === true)) {
                        await sendresponse(`No ${recordtype.toUpperCase()} records found for ${host}`, envelope, `${prefix}dig`, true);
                        return;
                    }
                    await sendresponse(responsemsg, envelope, `${prefix}dig`, false);
                } catch (err) {
                    if (err.code === 'ENOTFOUND') {
                        await sendresponse(`Host not found`, envelope, `${prefix}dig`, true);
                    } else if (err.code === 'ENODATA') {
                        await sendresponse(`None of that record type found for host.`, envelope, `${prefix}dig`, true);
                    } else {
                        console.error('DNS lookup error:', err);
                        await sendresponse('Failed to retrieve DNS information. Please try again later.', envelope, `${prefix}dig`, true);
                    }
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
                        await sendresponse(`To use Single Sign-On, you must provide an ID for a site to sign into.\nA site that supports SSO should provide you with one.\n!!! DO NOT USE AN ID THAT SOMEONE ELSE GIVES YOU !!!\nUsage: ${prefix}sso [id] [confirm]`, envelope, `${prefix}sso`, false);
                    } else if (id) {
                        const result = await redis.get(`sso:${id}`);
                        if (result) {
                            const SSOProvider = await mongoose.model("SSOProvider");
                            const provider = await SSOProvider.findOne({ _id: result });
                            if (!provider) {
                                await sendresponse('It seems you have provided an invalid ID, please double check that the ID you provided is correct and hasn\'t expired (30 minute expiry).', envelope, `${prefix}sso`, true);
                                return;
                            }
                            if (match[2] && match[2].toLowerCase().trim() === "true") {
                                await redis.del(`sso:${id}`);
                                await redis.set(`sso-${provider._id}:${id}`, `${crypto.createHash('sha512').update(`${provider._id}:${envelope.sourceUuid}`).digest('hex')}`, 'EXAT', Math.floor(Date.now() / 1000) + 600);
                                await sendresponse(`Please let the provider know that you have accepted the SSO request to finish logging in!`, envelope, `${prefix}sso`, false)
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
                                await sendresponse(`${provider.name} is requesting authorisation (owned by ${provider.owner}).\nThis will give the provider the ability to:\n✓ Retrieve your Signal ID (hashed with SHA512)\n✓ Log you into your associated account\n✖ ${messages[Math.floor(Math.random() * messages.length)]}\n\nIf these permissions seem all good to you, run '-sso ${id} true' to authorise this app.`, envelope, `${prefix}sso`, false);
                            }
                        } else {
                            await sendresponse('It seems you have provided an invalid ID, please double check that the ID you provided is correct and hasn\'t expired (30 minute expiry).', envelope, `${prefix}sso`, true);
                        }
                    }
                } catch (e) {
                    await sendresponse('Failed to read/write data for this command. Please try again later.', envelope, `${prefix}sso`, true);
                }
            }
        }
    }
}