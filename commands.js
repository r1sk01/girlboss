import fs from 'fs'
import { parse as parseJsonc } from 'jsonc-parser'
import os from 'os'
import {mongoose, prefix, botname, phonenumber, managedaccount, sendresponse, sendmessage, getcontacts, hotreloadable, parsecommand} from './modulecontext.js'

const ic = /[\u00AD\u200B\u200C\u200D\u2060\uFEFF\uFE00-\uFE0F]/gu;

let modules = [];

async function loadmodules() {
    const mods = [];
    let entries = [];
    try {
        entries = fs.readdirSync('./commands', { withFileTypes: true });
    } catch (e) {
        entries = [];
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        let spec = null;
        if (entry.isFile() && entry.name.endsWith('.js')) {
            spec = `./commands/${entry.name}`;
        } else if (entry.isDirectory() && fs.existsSync(`./commands/${entry.name}/index.js`)) {
            spec = `./commands/${entry.name}/index.js`;
        }
        if (!spec) continue;
        try {
            const mod = await hotreloadable(spec);
            const def = mod && mod.default ? mod.default : null;
            if (def && def.section && def.commands) mods.push(def);
        } catch (e) {
            console.log("failed to load " + spec + ": " + e);
        }
    }
    modules = mods;
}

let modulesloaded = false;
async function ensuremodules() {
    if (!modulesloaded) {
        await loadmodules();
        modulesloaded = true;
    }
}

function findmodulecommand(cmd, user=undefined) {
    for (const mod of modules) {
        if (mod && mod.commands && Object.prototype.hasOwnProperty.call(mod.commands, cmd)) {
            return { mod, command: mod.commands[cmd] };
        }
    }
    return null;
}

const guestcommands = {
    "register": {
        description: `Register your Signal account with ${botname}`,
        arguments: null,
        execute: async (envelope, message) => {
            const User = mongoose.model('User');
            try {
                const searchuser = await User.findOne({ userid: envelope.sourceUuid });
                if (searchuser) {
                    await sendresponse(`You are already registered as a ${botname} user $MENTIONUSER.`, envelope, `${prefix}register`, true);
                    return;
                } else {
                    const contact = await getcontacts(phonenumber, envelope.sourceUuid);
                    const profile = contact.profile;
                    let name;
                    if (profile && profile.givenName && profile.familyName) {
                        name = profile.givenName + (profile.familyName ? ` ${profile.familyName}` : '');
                    } else {
                        name = 'Unknown';
                    }
                    const user = new User({
                        userid: envelope.sourceUuid,
                        username: name,
                        accesslevel: 0,
                        properties: {tags: []},
                    });
                    await user.save();
                    await sendresponse(`You are now registered as a ${botname} user $MENTIONUSER!`, envelope, `${prefix}register`);
                    if (!contact) {
                        await sendmessage(`Hiya user!\nIt seems you have registered for a ${botname} account without sending me a DM first.\nThat's okay if so!\nPlease accept this message request so I can get to know you better.`, envelope.sourceUuid, phonenumber);
                        return;
                    }
                    if (profile && profile.givenName != null && profile.givenName !== '') {
                        return;
                    } else {
                        await sendmessage(`Hiya user!\nIt seems you have registered for a ${botname} account without sending me a DM first.\nThat's okay if so!\nPlease accept this message request so I can get to know you better.`, envelope.sourceUuid, phonenumber);
                    }
                }
            } catch (err) {
                await sendresponse('Unable to connect to database, is MongoDB running?', envelope, `${prefix}register`, true);
            }
        }
    }
};

const usercommands = {
    "unregister": {
        description: `Delete all your data from ${botname}`,
        arguments: null,
        execute: async (envelope, message) => {
            try {
                const User = mongoose.model('User');
                await User.deleteOne({ userid: envelope.sourceUuid });
                await sendresponse(`You are no longer registered as a ${botname} user $MENTIONUSER.`, envelope, `${prefix}unregister`);
            } catch (err) {
                await sendresponse('Unable to connect to database, is MongoDB running?', envelope, `${prefix}unregister`, true);
            }
        }
    },
    "subscribe": {
        description: `Subscribe to ${botname} broadcasts`,
        arguments: ['true / false'],
        execute: async (envelope, message) => {
            try {
                const User = mongoose.model('User');
                const user = await User.findOne({userid: envelope.sourceUuid});
                if (!user.properties) {
                    user.properties = {};
                }
                const match = parsecommand(message);
                if (!match[1] || !match[1].trim()) {
                    await sendresponse(`Invalid argument.\nUse "-subscribe true" or "-subscribe false" to subscribe or unsubscribe from ${botname} broadcasts.`, envelope, `${prefix}subscribe`, true);
                } else if (match[1].trim() === "true") {
                    user.properties.subscribed = true;
                    user.markModified('properties');
                    await user.save();
                    await sendresponse(`You are now subscribed to ${botname} broadcasts $MENTIONUSER!`, envelope, `${prefix}subscribe true`, false);
                } else if (match[1].trim() === "false") {
                    user.properties.subscribed = false;
                    user.markModified('properties');
                    await user.save();
                    await sendresponse(`You are now unsubscribed from ${botname} broadcasts $MENTIONUSER!`, envelope, `${prefix}subscribe false`, false);
                } else {
                    await sendresponse(`Invalid argument.\nUse "-subscribe true" or "-subscribe false" to subscribe or unsubscribe from ${botname} broadcasts.`, envelope, `${prefix}subscribe`, true);
                }
            } catch (err) {
                await sendresponse('Unable to connect to database, is MongoDB running?', envelope, `${prefix}subscribe`, true);
            }
        }
    },
    "getprops": {
        description: "Get your properties from the database",
        arguments: null,
        execute: async (envelope, message) => {
            try {
                const User = mongoose.model('User');
                const user = await User.findOne({ userid: envelope.sourceUuid });
                const properties = user.properties || {};
                let pm = 'Your properties:\n';
                const fv = (value) => {
                    if (Array.isArray(value)) {
                        return value.map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ');
                    } else if (typeof value === 'object' && value !== null) {
                        return JSON.stringify(value);
                    }
                    return String(value);
                };
                for (const prop in properties) {
                    if (prop === 'authkey') {
                        pm += `authkey: [womp womp no key 4 u]\n`;
                    } else {
                        if (Object.prototype.hasOwnProperty.call(properties, prop)) {
                            pm += `${prop}: ${fv(properties[prop])}\n`;
                        }
                    }
                }
                pm = pm.trim();
                await sendresponse(pm, envelope, `${prefix}getprops`, false);
            } catch (err) {
                await sendresponse('Failed to retrieve your properties. Please try again later.', envelope, `${prefix}getprops`, true);
            }
        }
    },
    "nick": {
        description: `Set your nickname for ${botname}`,
        arguments: ['nickname'],
        execute: async (envelope, message) => {
            try {
                const User = mongoose.model('User');
                const user = await User.findOne({ userid: envelope.sourceUuid });
                if (!user.properties) {
                    user.properties = {};
                }
                const match = parsecommand(message);
                if (!match || !match[1] || match[1].trim().length === 0 || match[1].trim().length >= 51) {
                    await sendresponse('Please provide a valid nickname.', envelope, `${prefix}nick`, true);
                    return;
                }
                const nickname = match[1].trim();
                user.properties.nickname = nickname;
                user.markModified('properties');
                await user.save();
                await sendresponse(`Your nickname has been set to "${nickname}" $MENTIONUSER!`, envelope, `${prefix}nick`, false);
            } catch (err) {
                await sendresponse('Failed to set your nickname. Please try again later.', envelope, `${prefix}nick`, true);
            }
        }
    },
    "authkey": {
        description: `Create an AuthKey for ${botname} services`,
        arguments: null,
        execute: async (envelope, message) => {
            try {
                const User = mongoose.model('User');
                const user = await User.findOne({ userid: envelope.sourceUuid });
                if (!user.properties) {
                    user.properties = user.properties || {};
                }
                const kbuf = new Uint8Array(128);
                for (let i = 0; i < 128; i++) {
                    kbuf[i] = Math.floor(Math.random() * 256);
                }
                user.properties.authkey = {
                    key: Array.from(kbuf),
                    createdat: Date.now()
                };
                user.markModified('properties');
                await user.save();
                const sidbuf = Buffer.from(envelope.sourceUuid, 'utf8');
                const akbuf = Buffer.from(user.properties.authkey.key);
                const cbuf = Buffer.concat([sidbuf, akbuf]);
                const token = cbuf.toString('base64');
                const am = `Hiya $MENTIONUSER!\nYour AuthKey is:\n${token}\n\nYou can use this key for sites like https://tritiumweb.zeusteam.dev/ that use ${botname} as an SSO provider`;
                if (envelope.dataMessage) {
                    const dataMessage = envelope.dataMessage;
                    const groupInfo = dataMessage.groupInfo;
                    if (groupInfo && groupInfo.groupId) {
                        await sendresponse(`Please check your DMs $MENTIONUSER for your AuthKey.`, envelope, `${prefix}authkey`, true);
                        await sendmessage(am, envelope.sourceUuid, phonenumber);
                    } else {
                        await sendresponse(am, envelope, `${prefix}authkey`, false);
                    }
                } else if (envelope.syncMessage) {
                    await sendresponse(`Please check your DMs $MENTIONUSER for your AuthKey.`, envelope, `${prefix}authkey`, true);
                    await sendmessage(am, envelope.sourceUuid, phonenumber);
                } else {
                    await sendresponse(am, envelope, `${prefix}authkey`, false);
                }
            } catch (err) {
                await sendresponse('Failed to create AuthKey. Please try again later.', envelope, `${prefix}authkey`, true);
            }
        },
    },
    "featurereq": {
        description: `Request a new feature for ${botname} (and related services)`,
        arguments: ['feature'],
        execute: async (envelope, message) => {
            try {
                const User = mongoose.model('User');
                const user = await User.findOne({ userid: envelope.sourceUuid });
                if (!user.properties) {
                    user.properties = {};
                }
                const match = parsecommand(message);
                if (!match || !match[1] || match[1].trim().length === 0) {
                    await sendresponse('Please provide a valid feature request after the command.', envelope, `${prefix}featurereq`, true);
                    return;
                }
                const feature = match[1].trim();
                const FeatureReq = mongoose.model('FeatureReq');
                const reqid = `req-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                const featurereq = new FeatureReq({
                    reqid: reqid,
                    userid: envelope.sourceUuid,
                    feature: feature,
                });
                await featurereq.save();
                await sendresponse(`Your feature request has been submitted with ID ${reqid}.\nThank you!`, envelope, `${prefix}featurereq`, false);
                const displayname = user.properties && user.properties.nickname ? user.properties.nickname : user.username;
                await sendmessage(`New feature request from ${displayname} (${envelope.sourceUuid}):\nRequest ID: ${reqid}\nFeature: ${feature}`, managedaccount, phonenumber);
            } catch (err) {
                await sendresponse('Failed to submit your feature request. Please try again later.', envelope, `${prefix}featurereq`, true);
            }
        }
    },
    "poll": {
        description: "View and vote on polls",
        arguments: ['pollid/index', 'optionid'],
        execute: async (envelope, message) => {
            try {
                const Poll = mongoose.model('Poll');
                const match = parsecommand(message);
                if (!match || !match[1]) {
                    const polls = await Poll.find({});
                    if (polls.length === 0) {
                        await sendresponse('No polls are currently running.', envelope, `${prefix}poll`, true);
                        return;
                    }
                    let pm = 'Running polls:\n\n';
                    polls.forEach((poll, index) => {
                        const totalvotes = poll.votes ? poll.votes.reduce((sum, count) => sum + count, 0) : 0;
                        const hasvoted = poll.voters && poll.voters.includes(envelope.sourceUuid);
                        pm += `[${index}] ID: ${poll.pollid}\n`;
                        pm += `    Question: ${poll.question}\n`;
                        pm += `    Total votes: ${totalvotes}\n`;
                        pm += `    Has voted?: ${hasvoted ? 'true' : 'false'}\n\n`;
                    });
                    pm += `Use "-poll [index/pollid]" to view details or "-poll [index/pollid] [option]" to vote.\n`;
                    pm += `Example: "-poll 0" for first poll, "-poll 1 2" to vote option 2 on second poll.`;
                    await sendresponse(pm.trim(), envelope, `${prefix}poll`, false);
                    return;
                }
                const pollidoridx = match[1];
                let poll;
                if (/^\d+$/.test(pollidoridx)) {
                    const index = parseInt(pollidoridx);
                    const polls = await Poll.find({});
                    if (index >= 0 && index < polls.length) {
                        poll = polls[index];
                    } else {
                        await sendresponse(`Poll index ${index} not found. Use "-poll" to see available polls.`, envelope, `${prefix}poll`, true);
                        return;
                    }
                } else {
                    poll = await Poll.findOne({ pollid: pollidoridx });
                    if (!poll) {
                        await sendresponse(`Poll with ID ${pollidoridx} not found. Use "-poll" to see available polls.`, envelope, `${prefix}poll`, true);
                        return;
                    }
                }
                if (!match[2]) {
                    const uhv = poll.voters && poll.voters.includes(envelope.sourceUuid);
                    const tv = poll.votes ? poll.votes.reduce((sum, count) => sum + count, 0) : 0;
                    let pollindex = null;
                    if (/^\d+$/.test(pollidoridx)) {
                        pollindex = pollidoridx;
                    } else {
                        const allpolls = await Poll.find({});
                        pollindex = allpolls.findIndex(p => p.pollid === poll.pollid);
                    }
                    let pm = `Poll [${pollindex}] ID: ${poll.pollid}\nQuestion: ${poll.question}\n\nOptions:\n`;
                    if (uhv) {
                        poll.options.forEach((option, index) => {
                            const votecount = poll.votes ? poll.votes[index] || 0 : 0;
                            pm += `${index + 1}. ${option} (${votecount} votes)\n`;
                        });
                    } else {
                        poll.options.forEach((option, index) => {
                            pm += `${index + 1}. ${option}\n`;
                        });
                    }
                    pm += `\nTotal votes: ${tv}`;
                    pm += `\nYou have voted: ${uhv ? 'Yes' : 'No'}`;
                    if (!uhv) {
                        pm += `\n\nUse "-poll ${pollindex} [option number]" to vote (or "-poll ${poll.pollid} [option number]").`;
                    }
                    await sendresponse(pm.trim(), envelope, `${prefix}poll`, false);
                    return;
                }
                const vin = parseInt(match[2]) - 1;
                if (isNaN(vin) || vin < 0 || vin >= poll.options.length) {
                    await sendresponse('Invalid vote. Please provide a valid option number.', envelope, `${prefix}poll`, true);
                    return;
                }
                if (!poll.voters) {
                    poll.voters = [];
                }
                if (poll.voters.includes(envelope.sourceUuid)) {
                    await sendresponse('You have already voted on this poll.', envelope, `${prefix}poll`, true);
                    return;
                }
                if (!poll.votes || !Array.isArray(poll.votes)) {
                    poll.votes = Array(poll.options.length).fill(0);
                }
                poll.votes[vin]++;
                poll.voters.push(envelope.sourceUuid);
                await poll.save();
                await sendresponse(`Your vote for "${poll.options[vin]}" has been recorded.`, envelope, `${prefix}poll`, false);
            } catch (err) {
                await sendresponse('Failed to retrieve or vote on the poll. Please try again later.', envelope, `${prefix}poll`, true);
            }
        }
    },
    "module": {
        description: `Manage your ${botname} modules`,
        arguments: ['module', 'enable/disable'],
        execute: async (envelope, message) => {
            try {
                const match = parsecommand(message);
                if (!match) {
                    await sendresponse('Invalid arguments. Use "-module [module] [enable/disable] [confirm: true/false]" to enable or disable a module.', envelope, `${prefix}module`, true);
                    return;
                }
                const User = mongoose.model('User');
                const user = await User.findOne({ userid: envelope.sourceUuid });
                const avamods = modules.filter(m => m.user && !m.admin);
                const enamods = user && user.properties && user.properties.tags ? user.properties.tags : [];
                if (!match[1]) {
                    if (avamods.length === 0) {
                        await sendresponse('No modules are available.', envelope, `${prefix}module`, true);
                        return;
                    }
                    const avamods2 = avamods.filter(m => !enamods.includes(m.section));
                    let modlist = '';
                    if (enamods.length > 0) {
                        modlist += 'Enabled modules:\n';
                        enamods.forEach(tag => {
                            const module = avamods.find(m => m.section === tag);
                            if (module) {
                                modlist += `- ${tag}\n`;
                            }
                        });
                        if (user.accesslevel === 1) {
                            modlist += '- admin (this is purely cosmetic, this cannot be disabled)\n';
                        }
                    }
                    if (avamods2.length > 0) {
                        modlist += 'Available modules:\n';
                        avamods2.forEach(module => {
                            modlist += `- ${module.section}\n`;
                        });
                    }
                    modlist += `\nUse "${prefix}module [module] [enable/disable]" to enable or disable a module.`;
                    modlist = modlist.trim();
                    await sendresponse(modlist, envelope, `${prefix}module`, false);
                    return;
                }
                if (!match[2]) {
                    const module = match[1].toLowerCase();
                    if (!user.properties) {
                        user.properties = {};
                    }
                    if (!user.properties.tags) {
                        user.properties.tags = [];
                    }
                    if (!avamods.some(m => m.section === module)) {
                        await sendresponse(`Module "${module}" doesn't appear to exist.`, envelope, `${prefix}module`, true);
                        return;
                    }
                    const enabled = user.properties.tags.includes(module);
                    await sendresponse(`Module "${module}" is ${enabled ? 'enabled' : 'disabled'}.`, envelope, `${prefix}module`, false);
                    return;
                }
                const module = match[1].toLowerCase();
                const action = match[2].toLowerCase();
                const confirm = match[3] ? match[3].toLowerCase() : null;
                if (!user.properties) {
                    user.properties = {};
                }
                if (!user.properties.tags) {
                    user.properties.tags = [];
                }
                if (!avamods.some(m => m.section === module)) {
                    await sendresponse(`Module "${module}" doesn't appear to exist.`, envelope, `${prefix}module`, true);
                    return;
                }
                if (action === 'enable' || action === 'on' || action === 'true') {
                    if (user.properties.tags.includes(module)) {
                        await sendresponse(`Module "${module}" is already enabled.`, envelope, `${prefix}module`, true);
                        return;
                    }
                    const mod = modules.find(m => m.section === module);
                    if (mod && mod.execute && (!confirm || confirm !== 'true')) {
                        await sendresponse(`WARNING: Module ${module} has a setup script attached to the module!\nPlease run "-module ${module} enable true" to confirm that you want to enable this module and execute the setup script.\nScript:\n${mod.execute.toString()}`, envelope, `${prefix}module`, true);
                        return;
                    } else if (mod && mod.execute && confirm && confirm === 'true') {
                        await sendresponse(`Executing setup script for module ${module}...`, envelope, `${prefix}module`, false);
                        await mod.execute(user);
                    }
                    user.properties.tags = [...(user.properties.tags || []), `${module}`];
                    await sendresponse(`Module "${module}" has been enabled.`, envelope, `${prefix}module`, false);
                } else if (action === 'disable' || action === 'off' || action === 'false') {
                    if (!user.properties.tags.includes(module)) {
                        await sendresponse(`Module "${module}" is not enabled.`, envelope, `${prefix}module`, true);
                        return;
                    }
                    user.properties.tags = user.properties.tags.filter(tag => tag !== module);
                    await sendresponse(`Module "${module}" has been disabled.`, envelope, `${prefix}module`, false);
                } else {
                    await sendresponse('Invalid action. Use "enable" or "disable".', envelope, `${prefix}module`, true);
                    return;
                }
                user.markModified('properties');
                await user.save();
            } catch (err) {
                console.error(err);
                await sendresponse('Failed to manage modules. Please try again later.', envelope, `${prefix}module`, true);
            }
        }
    },
    "requestmydata": {
        description: `Request all data stored about you by ${botname}`,
        arguments: null,
        execute: async (envelope, message) => {
            try {
                const User = mongoose.model('User');
                const user = await User.findOne({ userid: envelope.sourceUuid });
                if (!user) {
                    await sendresponse(`You are not registered as a ${botname} user $MENTIONUSER.\nUse "-register" to register!`, envelope, `${prefix}requestmydata`, true);
                    return;
                }
                let userObj;
                try {
                    userObj = typeof user.toObject === 'function' ? user.toObject() : JSON.parse(JSON.stringify(user));
                } catch (_) {
                    userObj = JSON.parse(JSON.stringify(user));
                }
                if (userObj && userObj.properties && Object.prototype.hasOwnProperty.call(userObj.properties, 'authkey')) {
                    userObj.properties.authkey = 'Ask r1sk.01 for the way to derive your raw key in the database from the one you receive.';
                }
                const userData = JSON.stringify(userObj, null, 2);
                const am = `Hiya $MENTIONUSER!\nHere is all the data I have stored about you:\n\n${userData}`;
                if (envelope.dataMessage) {
                    const dataMessage = envelope.dataMessage;
                    const groupInfo = dataMessage.groupInfo;
                    if (groupInfo && groupInfo.groupId) {
                        await sendresponse(`Please check your DMs $MENTIONUSER for your data.`, envelope, `${prefix}requestmydata`, true);
                        await sendmessage(am, envelope.sourceUuid, phonenumber);
                    } else {
                        await sendresponse(am, envelope, `${prefix}requestmydata`, false);
                    }
                } else if (envelope.syncMessage) {
                    await sendresponse(`Please check your DMs $MENTIONUSER for your data.`, envelope, `${prefix}requestmydata`, true);
                    await sendmessage(am, envelope.sourceUuid, phonenumber);
                } else {
                    await sendresponse(am, envelope, `${prefix}requestmydata`, false);
                }
            } catch (err) {
                await sendresponse('Failed to retrieve your data. Please contact r1sk.01 if this isn\'t a one-off, else, try again.', envelope, `${prefix}requestmydata`, true);
            }
        }
    }
};

const builtincommands = {
    "ping": {
        description: "Respond with time-to-execute, used for testing uptime",
        arguments: null,
        execute: async (envelope, message) => {
            try {
                const timestamp = envelope.timestamp;
                const time = new Date().getTime();
                const timetaken = time - timestamp;
                await sendresponse(`It took ${timetaken}ms for ${botname} to execute this command.\nMethod: ${time} - ${timestamp} = ${timetaken}`, envelope, `${prefix}ping`, false);
            } catch (err) {
                console.error(err);
                await sendresponse('Let\'s be real here, how would this even fail?', envelope, `${prefix}ping`, true);
            }
        }
    },
    "help": {
        description: "Display this help message",
        arguments: ['optional: section'],
        execute: async (envelope, message) => {
            try {
                const match = parsecommand(message);
                const section = match && match[1] ? match[1].toLowerCase() : null;
                let helpmessage = "Hiya $MENTIONUSER!\n";
                const user = await mongoose.model('User').findOne({ userid: envelope.sourceUuid });
                if (!section) {
                    helpmessage += "Here are my available commands:\n";
                    helpmessage += "  Built-in commands:\n";
                    for (const cmd in builtincommands) {
                        if (Object.prototype.hasOwnProperty.call(builtincommands, cmd)) {
                            if (builtincommands[cmd].arguments) {
                                helpmessage += `    ${prefix}${cmd} [${builtincommands[cmd].arguments.join('] [')}] : ${builtincommands[cmd].description}\n`;
                            } else {
                                helpmessage += `    ${prefix}${cmd} : ${builtincommands[cmd].description}\n`;
                            }
                        }
                    }
                    const commands = user ? usercommands : guestcommands;
                    helpmessage += "  User commands:\n";
                    for (const cmd in commands) {
                        if (Object.prototype.hasOwnProperty.call(commands, cmd)) {
                            if (commands[cmd].arguments) {
                                helpmessage += `    ${prefix}${cmd} [${commands[cmd].arguments.join('] [')}] : ${commands[cmd].description}\n`;
                            } else {
                                helpmessage += `    ${prefix}${cmd} : ${commands[cmd].description}\n`;
                            }
                        }
                    }
                    const as = modules.filter(s => {
                        if (s.admin && (!user || user.accesslevel !== 1)) return false;
                        if (s.user && !user) return false;
                        return true;
                    });
                    if (as.length > 0) {
                        const sect = as.filter(s => {
                            if (!user.properties || !user.properties.tags) return false;
                            return user.properties.tags.includes(s.section);
                        });
                        if (user.accesslevel === 1) {
                            const adminmod = modules.find(m => m.section === "admin");
                            if (adminmod) {
                                sect.push(adminmod);
                            }
                        }
                        if (sect.length === 0) {
                            helpmessage += `You don't have any modules enabled. Add some with "${prefix}module"!`;
                        } else {
                            helpmessage += `\nYou have the following modules enabled (use "-help <module>" to see the available commands):\n`;
                            for (const s of sect) {
                                helpmessage += `  - ${s.section}\n`;
                            }
                        }
                    }
                } else {
                    const so = modules.find(s => s.section === section);
                    if (!so) {
                        const as = modules.filter(s => {
                            if (s.admin && (!user || user.accesslevel !== 1)) return false;
                            if (s.user && !user) return false;
                            return true;
                        });
                        helpmessage += `Unknown help module "${section}". Available modules: ${as.map(s => s.section).join(', ')}`;
                    } else if (so.admin && (!user || user.accesslevel !== 1)) {
                        const as = modules.filter(s => {
                            if (s.admin && (!user || user.accesslevel !== 1)) return false;
                            if (s.user && !user) return false;
                            return true;
                        });
                        helpmessage += `Unknown help module "${section}". Available modules: ${as.map(s => s.section).join(', ')}`;
                    } else if (so.user && !user) {
                        helpmessage += `You are not registered as a ${botname} user $MENTIONUSER.\nUse "-register" to register!`;
                    } else {
                        helpmessage += `${so.section.charAt(0).toUpperCase() + so.section.slice(1)} commands:\n`;
                        for (const cmd in so.commands) {
                            if (Object.prototype.hasOwnProperty.call(so.commands, cmd)) {
                                if (so.commands[cmd].arguments) {
                                    helpmessage += `    ${prefix}${cmd} [${so.commands[cmd].arguments.join('] [')}] : ${so.commands[cmd].description}\n`;
                                } else {
                                    helpmessage += `    ${prefix}${cmd} : ${so.commands[cmd].description}\n`;
                                }
                            }
                        }
                    }
                }
                helpmessage = helpmessage.trim();
                if (envelope.dataMessage) {
                    const dataMessage = envelope.dataMessage;
                    const groupInfo = dataMessage.groupInfo
                    if (groupInfo && groupInfo.groupId) {
                        await sendresponse(`Please check your DMs $MENTIONUSER for the help message.`, envelope, `${prefix}help`, true);
                        await sendmessage(helpmessage, envelope.sourceUuid, phonenumber);
                    } else {
                        await sendresponse(helpmessage, envelope, `${prefix}help`, false);
                    }
                } else {
                    await sendresponse(helpmessage, envelope, `${prefix}help`, false);
                }
            } catch (err) {
                console.error(err);
            }
        }
    },
    "info": {
        description: 'Display bot information',
        arguments: null,
        execute: async (envelope, message) => {
            try {
                const pkg = await Bun.file("./package.json").json();
                await sendresponse(`${process.env.npm_package_name} (colloquially named "${botname}") v${process.env.npm_package_version} running on ${os.type()} ${os.release()} (${os.arch()})
Licensed with ${pkg.license}, developed by ${pkg.author}.
Source links:
- https://git.zeusteam.dev/aria/girlboss
- https://codeberg.org/r1sk/girlboss
- https://github.com/r1sk01/girlboss

Based on tritiumbotv2 by Aria Arctic (https://git.zeusteam.dev/aria/tritiumbotv2).`, envelope, `${prefix}info`, false);
            } catch (err) {
                console.error(err);
            }
        }
    },
    "myid": {
        description: "Display your Signal ID",
        arguments: null,
        execute: async (envelope, message) => {
            try {
                await sendresponse(`Your Signal ID is: ${envelope.sourceUuid}`, envelope, `${prefix}myid`, false);
            } catch (err) {
                console.error(err);
            }
        }
    },
    "resolveid": {
        description: "Resolve a Signal ID by mentioning a user",
        arguments: ['mention'],
        execute: async (envelope, message) => {
            try {
                const dataMessage = envelope.dataMessage;
                let mention = dataMessage?.mentions?.[0];
                if (!mention) {
                    try {
                        const syncMessage = envelope.syncMessage;
                        const sentMessage = syncMessage.sentMessage;
                        if (sentMessage && sentMessage.mentions && sentMessage.mentions.length > 0) {
                            mention = sentMessage.mentions[0];
                        }
                    } catch (err) {
                        await sendresponse('Invalid arguments.\nUse "-resolveid <@mention>" to resolve a Signal ID.', envelope, `${prefix}resolveid`, true);
                        return;
                    }
                }
                if (!mention && !envelope.syncMessage) {
                    await sendresponse('Invalid arguments.\nUse "-resolveid <@mention>" to resolve a Signal ID.', envelope, `${prefix}resolveid`, true);
                    return;
                } else if (!mention && envelope.syncMessage) {
                    const syncMessage = envelope.syncMessage;
                    const sentMessage = syncMessage.sentMessage;
                    mention = {
                        uuid: sentMessage.destinationUuid,
                    }
                }
                if (!mention.uuid) {
                    await sendresponse('Invalid mention. Please mention a user.', envelope, `${prefix}resolveid`, true);
                    return;
                }
                const User = mongoose.model('User');
                const user = await User.findOne({ userid: mention.uuid });
                envelope.sourceUuid = mention.uuid;
                if (!user) {
                    await sendresponse(`User ID for $MENTIONUSER is ${mention.uuid} (${botname} doesn't know this user).`, envelope, `${prefix}resolveid`, false);
                    return;
                } else {
                    await sendresponse(`User ID for $MENTIONUSER is ${mention.uuid}.`, envelope, `${prefix}resolveid`, false);
                    return;
                }
            } catch (err) {
                console.error(err);
            }
        }
    }
};

async function invokecommand(command, envelope, self = false) {
    if (!self) {
        const blacklist = parseJsonc(fs.readFileSync('config.jsonc', 'utf8')).blacklist;
        if (blacklist.includes(envelope.sourceUuid)) {
            await sendresponse(
                `Hi $MENTIONUSER.\nYou are blacklisted from using ${botname}.\nPlease contact @r1sk.01 for more information.`,
                envelope,
                `${prefix}${command}`,
                true
            );
            return;
        }
    }
    await ensuremodules();
    try {
        const State = mongoose.model('State');
        const st = await State.findOne({ _id: 'maintenance' });
        if (st && st.enabled === true) {
            const User = mongoose.model('User');
            const u = await User.findOne({ userid: envelope.sourceUuid });
            const isadmin = u && u.accesslevel === 1;
            if (!isadmin) {
                const cmdname = (command.startsWith(prefix) ? command.slice(prefix.length) : command).split(' ')[0].replace(/^./, c => c.toLowerCase());
                await sendresponse('The bot is currently in maintenance mode. Please try again later.', envelope, `${prefix}${cmdname}`, true);
                return;
            }
        }
    } catch (e) {}
    const dataMessage = envelope.dataMessage;
    let message;
    if (dataMessage && dataMessage.message) {
        message = dataMessage.message.trim();
    } else {
        const syncMessage = envelope.syncMessage;
        if (syncMessage && syncMessage.sentMessage && syncMessage.sentMessage.message) {
            message = syncMessage.sentMessage.message.trim();
        } else {
            message = '';
        }
    }
    message = message.trim().replace(ic, '');
    const propercommand = (command.startsWith(prefix) ? command.slice(prefix.length) : command).split(' ')[0].replace(/^./, c => c.toLowerCase());
    const User = mongoose.model('User');
    const user = await User.findOne({ userid: envelope.sourceUuid });
    if (!self && user && envelope.sourceName && envelope.sourceName !== user.username) {
        user.username = envelope.sourceName;
        user.markModified('username');
        await user.save().catch(err =>
            console.error('Failed to save username:', err)
        );
    }
    if (!self && propercommand === '') {
        if (envelope.dataMessage && !envelope.dataMessage.groupInfo) {
            await sendresponse('No command specified.\nUse "-help" for the full command list!', envelope, command, true);
        }
        return;
    }
    if (builtincommands[propercommand]) {
        await builtincommands[propercommand].execute(envelope, message);
        return;
    }
    if (!self && guestcommands[propercommand]) {
        if (!user) {
            await guestcommands[propercommand].execute(envelope, message);
        } else {
            await sendresponse(`You are already registered as a ${botname} user $MENTIONUSER.`, envelope, command, true);
        }
        return;
    }
    if (usercommands[propercommand]) {
        if (!self && !user) {
            await sendresponse(`You are not registered as a ${botname} user $MENTIONUSER.\nUse "-register" to register!`, envelope, command, true);
        } else {
            await usercommands[propercommand].execute(envelope, message);
        }
        return;
    }
    const located = findmodulecommand(propercommand);
    if (located) {
        const { mod, command: cmdobj } = located;
        if (!self && mod.user && !user) {
            await sendresponse(`You are not registered as a ${botname} user $MENTIONUSER.\nUse "-register" to register!`, envelope, command, true);
            return;
        }
        if (mod.admin && (!user || user.accesslevel !== 1)) {
            await sendresponse(`Unknown command: ${command}`, envelope, command, true);
            return;
        }
        await cmdobj.execute(envelope, message);
        return;
    }
    await sendresponse(`Unknown command: ${command}`, envelope, command, true);
};

export {invokecommand};

