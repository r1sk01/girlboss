import { mongoose, prefix, botname, phonenumber, managedaccount, sendresponse, sendmessage, getcontacts, getgroups, parsecommand } from '../modulecontext.js'

export default {
    section: "admin",
    user: true,
    admin: true,
    execute: null,
    commands: {
        "maintenance": {
            description: "Enable or disable maintenance mode",
            arguments: ['true/false'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message)
                    if (!match || !match[1] || (match[1] !== 'true' && match[1] !== 'false')) {
                        await sendresponse('Invalid arguments.\\nUse "-maintenance true" to enable or "-maintenance false" to disable.', envelope, `${prefix}maintenance`, true);
                        return;
                    }
                    const enable = match[1].toLowerCase() === 'true';
                    const State = mongoose.model('State');
                    await State.updateOne({ _id: 'maintenance' }, { enabled: enable, updatedat: Date.now() }, { upsert: true });
                    if (enable) {
                        await sendresponse('Maintenance mode has been ENABLED. Only admins can run commands.', envelope, `${prefix}maintenance`, false);
                    } else {
                        await sendresponse('Maintenance mode has been DISABLED. All users can run commands.', envelope, `${prefix}maintenance`, false);
                    }
                } catch (err) {
                    await sendresponse('Failed to toggle maintenance mode. Please try again later.', envelope, `${prefix}maintenance`, true);
                }
            }
        },
        "proxymsg": {
            description: "Proxy a message to another user",
            arguments: ['signalid', 'bot', 'message'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-proxymsg [signalid] [bot] [message]" to proxy a message to another user.', envelope, `${prefix}proxymsg`, true);
                        return;
                    }
                    const tui = match[1];
                    const bot = match[2];
                    const proxmsg = match[3];
                    if (!tui || !proxmsg) {
                        await sendresponse('Invalid arguments.\nUse "-proxymsg [signalid] [bot] [message]" to proxy a message to another user.', envelope, `${prefix}proxymsg`, true);
                        return;
                    }
                    await sendmessage(proxmsg, tui, (bot === 'true') ? phonenumber : managedaccount);
                    await sendresponse(`Message successfully proxied to ${tui}.\nMessage: ${proxmsg}`, envelope, `${prefix}proxymsg`, false);
                } catch (err) {
                    await sendresponse('Somehow this command failed. Please try again later.', envelope, `${prefix}proxymsg`, true);
                }
            }
        },
        "changetags": {
            description: "Change the tags of a user by their userid",
            arguments: ['userid', 'tags'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-changetags [userid] "[tags]"" to set tags for a user.', envelope, `${prefix}changetags`, true);
                        return;
                    }
                    const tui = match[1];
                    const nt = match[2].split(/\s+/).filter(Boolean);
                    const User = mongoose.model('User');
                    let userobject = await User.findOne({ userid: tui });
                    if (!userobject) {
                        const nu = new User({
                            userid: tui,
                            accesslevel: 0,
                            properties: { tags: [] },
                        });
                        await nu.save();
                        const cu = await User.findOne({ userid: tui });
                        userobject = cu;
                    }
                    if (!userobject.properties) userobject.properties = {};
                    userobject.properties.tags = nt;
                    userobject.markModified('properties');
                    await userobject.save();
                    await sendresponse(`Tags for user ${tui} have been updated to: ${nt.join(', ')}`, envelope, `${prefix}changetags`, false);
                } catch (err) {
                    await sendresponse('Failed to change tags. Please try again later.', envelope, `${prefix}changetags`, true);
                }
            }
        },
        "getusers": {
            description: "Get a list of users from the database",
            arguments: null,
            execute: async (envelope, message) => {
                try {
                    const User = mongoose.model('User');
                    const users = await User.find({});
                    if (users.length === 0) {
                        await sendresponse('No users found in the database.', envelope, `${prefix}getusers`, true);
                        return;
                    }
                    let contacts;
                    try {
                        contacts = await getcontacts();
                    } catch (err) {
                        console.error('Failed to retrieve contacts:', err);
                        await sendresponse('Failed to retrieve contacts. Please check the logs for more information.', envelope, `${prefix}getusers`, true);
                        return;
                    }
                    if (!Array.isArray(contacts)) {
                        console.error('Contacts is not an array:', typeof contacts, contacts);
                        await sendresponse('Invalid contacts data received. Please check the logs for more information.', envelope, `${prefix}getusers`, true);
                        return;
                    }
                    const ulm = users.map(user => {
                        let contact;
                        if (Array.isArray(contacts)) {
                            contact = contacts.find(c => c.uuid === user.userid);
                        }
                        const profile = contact ? contact.profile : {};
                        const name = profile.givenName + (profile.familyName ? ` ${profile.familyName}` : '');
                        if (profile.givenName && (!user.username || user.username !== profile.givenName)) {
                            user.username = profile.givenName + (profile.familyName ? ` ${profile.familyName}` : '');
                            user.save().catch(err => console.error('Failed to save username:', err));
                        }
                        return {
                            userid: user.userid,
                            accesslevel: user.accesslevel,
                            tags: user.properties ? user.properties.tags : [], 
                            name: name ? name : 'Unknown'
                        };
                    });
                    let ul = 'Users:\n';
                    ulm.forEach(user => {
                        ul += `- ${user.userid} (${user.name})${user.accesslevel === 1 ? ' (Admin)' : ''}${user.tags.length > 0 ? ` (Tags: ${user.tags.join(', ')})` : ''}\n`;
                    });
                    await sendresponse(ul.trim(), envelope, `${prefix}getusers`, false);
                } catch (err) {
                    await sendresponse('Failed to retrieve users. Please try again later.', envelope, `${prefix}getusers`, true);
                }
            }
        },
        "getgroups": {
            description: "Get all groups from signal-cli",
            arguments: null,
            execute: async (envelope, message) => {
                try {
                    const User = mongoose.model('User');
                    const users = await User.find({});
                    if (users.length === 0) {
                        await sendresponse('No users found in the database.', envelope, `${prefix}getusers`, true);
                        return;
                    }
                    let groups;
                    try {
                        groups = await getgroups();
                    } catch (err) {
                        console.error('Failed to retrieve groups:', err);
                        await sendresponse('Failed to retrieve groups. Please check the logs for more information.', envelope, `${prefix}getusers`, true);
                        return;
                    }
                    if (!Array.isArray(groups)) {
                        console.error('groups is not an array:', typeof groups, groups);
                        await sendresponse('Invalid groups data received. Please check the logs for more information.', envelope, `${prefix}getusers`, true);
                        return;
                    }
                    for (const group of groups) {
                        console.log(`Group: ${group}`);
                    }
                    return;
                    const ulm = users.map(user => {
                        let contact;
                        if (Array.isArray(contacts)) {
                            contact = contacts.find(c => c.uuid === user.userid);
                        }
                        const profile = contact ? contact.profile : {};
                        const name = profile.givenName + (profile.familyName ? ` ${profile.familyName}` : '');
                        if (profile.givenName && (!user.username || user.username !== profile.givenName)) {
                            user.username = profile.givenName + (profile.familyName ? ` ${profile.familyName}` : '');
                            user.save().catch(err => console.error('Failed to save username:', err));
                        }
                        return {
                            userid: user.userid,
                            accesslevel: user.accesslevel,
                            tags: user.properties ? user.properties.tags : [],
                            name: name ? name : 'Unknown'
                        };
                    });
                    let ul = 'Users:\n';
                    ulm.forEach(user => {
                        ul += `- ${user.userid} (${user.name})${user.accesslevel === 1 ? ' (Admin)' : ''}${user.tags.length > 0 ? ` (Tags: ${user.tags.join(', ')})` : ''}\n`;
                    });
                    await sendresponse(ul.trim(), envelope, `${prefix}getgroups`, false);
                } catch (err) {
                    await sendresponse('Failed to retrieve users. Please try again later.', envelope, `${prefix}getgroups`, true);
                }
            }
        },
        "broadcast": {
            description: "Send a message to all users",
            arguments: ['onlysubscribed', 'message'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-broadcast [onlysubscribed] [message]" to send a message to all users.', envelope, `${prefix}broadcast`, true);
                        return;
                    }
                    const onlysubscribed = match[1];
                    const bm = match[2];
                    if (!bm) {
                        await sendresponse('Invalid arguments.\nUse "-broadcast [onlysubscribed] [message]" to send a message to all users.', envelope, `${prefix}broadcast`, true);
                        return;
                    }
                    if (onlysubscribed !== 'true' && onlysubscribed !== 'false') {
                        await sendresponse('Invalid value for onlysubscribed. Use "true" or "false".', envelope, `${prefix}broadcast`, true);
                        return;
                    }
                    const User = mongoose.model('User');
                    const users = await User.find({});
                    if (users.length === 0) {
                        await sendresponse('No users found in the database.', envelope, `${prefix}broadcast`, true);
                        return;
                    }
                    let sc = 0;
                    for (const user of users) {
                        if (onlysubscribed === 'true' && (!user.properties || !user.properties.subscribed)) {
                            continue;
                        }
                        try {
                            await sendmessage(bm, user.userid, phonenumber);
                            await new Promise(resolve => setTimeout(resolve, 100));
                            sc++;
                        } catch (err) {
                            console.error(`Failed to send message to user ${user.userid}:`, err);
                        }
                    }
                    await sendresponse(`Broadcast message sent to ${sc} users.`, envelope, `${prefix}broadcast`, false);
                } catch (err) {
                    console.log('Failed to execute broadcast command:', err);
                    await sendresponse('Somehow this command failed. Please try again later.', envelope, `${prefix}broadcast`, true);
                }
            }
        },
        "delprop": {
            description: "Delete a property from a user",
            arguments: ['userid', 'property'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-delprop [userid] [property]" to delete a property from a user.', envelope, `${prefix}delprop`, true);
                        return;
                    }
                    const tui = match[1];
                    const property = match[2];
                    const User = mongoose.model('User');
                    let userobject = await User.findOne({ userid: tui });
                    if (!userobject) {
                        await sendresponse(`User ${tui} not found.`, envelope, `${prefix}delprop`, true);
                        return;
                    }
                    if (!userobject.properties || !userobject.properties.hasOwnProperty(property)) {
                        await sendresponse(`Property "${property}" not found for user ${tui}.`, envelope, `${prefix}delprop`, true);
                        return;
                    }
                    delete userobject.properties[property];
                    userobject.markModified('properties');
                    await userobject.save();
                    await sendresponse(`Property "${property}" deleted for user ${tui}.`, envelope, `${prefix}delprop`, false);
                } catch (err) {
                    await sendresponse('Failed to delete property. Please try again later.', envelope, `${prefix}delprop`, true);
                }
            }
        },
        "nukeprop": {
            description: "Delete property from all users",
            arguments: ['property'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-nukeprop [property]" to delete a property from all users.', envelope, `${prefix}nukeprop`, true);
                        return;
                    }
                    const property = match[1];
                    const User = mongoose.model('User');
                    const users = await User.find({});
                    if (users.length === 0) {
                        await sendresponse('No users found in the database.', envelope, `${prefix}nukeprop`, true);
                        return;
                    }
                    let dc = 0;
                    for (const user of users) {
                        if (user.properties && user.properties.hasOwnProperty(property)) {
                            delete user.properties[property];
                            user.markModified('properties');
                            await user.save();
                            dc++;
                        }
                    }
                    await sendresponse(`Property "${property}" deleted from ${dc} users.`, envelope, `${prefix}nukeprop`, false);
                } catch (err) {
                    await sendresponse('Failed to delete property from all users. Please try again later.', envelope, `${prefix}nukeprop`, true);
                }
            }
        },
        "peerprops": {
            description: "Get properties of a user by their Signal ID",
            arguments: ['userid'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-peerprops [userid]" to get properties of a user.', envelope, `${prefix}peerprops`, true);
                        return;
                    }
                    const tui = match[1];
                    const User = mongoose.model('User');
                    let userobject = await User.findOne({ userid: tui });
                    if (!userobject) {
                        await sendresponse(`User ${tui} not found.`, envelope, `${prefix}peerprops`, true);
                        return;
                    }
                    if (!userobject.properties) {
                        await sendresponse(`No properties found for user ${tui}.`, envelope, `${prefix}peerprops`, true);
                        return;
                    }
                    let props = '';
                    for (const prop in userobject.properties) {
                        if (Object.prototype.hasOwnProperty.call(userobject.properties, prop)) {
                            props += `${prop}: ${JSON.stringify(userobject.properties[prop])}\n`;
                        }
                    }
                    if (props === '') {
                        await sendresponse(`No properties found for user ${tui}.`, envelope, `${prefix}peerprops`, true);
                        return;
                    }
                    await sendresponse(`Properties for user ${tui}:\n${props.trim()}`, envelope, `${prefix}peerprops`, false);
                } catch (err) {
                    await sendresponse('Failed to retrieve properties. Please try again later.', envelope, `${prefix}peerprops`, true);
                }
            }
        },
        "jitsi": {
            description: "Generate a CTC Jitsi link",
            arguments: null,
            execute: async (envelope, message) => {
                try {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                    const code = Array.from({length: 128}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                    const l = `https://m.ctc.bz/${code}`;
                    await sendresponse(`${l}`, envelope, `${prefix}jitsi`, false);
                } catch (err) {
                    console.error(err);
                    await sendresponse('Failed to generate Jitsi link. Please try again later.', envelope, `${prefix}jitsi`, true);
                }
            }
        },
        "listfrs": {
            description: "List all feature requests",
            arguments: null,
            execute: async (envelope, message) => {
                try {
                    const FeatureReq = mongoose.model('FeatureReq');
                    const frs = await FeatureReq.find({});
                    if (frs.length === 0) {
                        await sendresponse('No feature requests found.', envelope, `${prefix}listfrs`, true);
                        return;
                    }
                    let frl = 'Feature Requests:\n';
                    frs.forEach(req => {
                        frl += `- ID: ${req.reqid}\n  User: ${req.userid}\n  Feature: ${req.feature}\n`;
                    });
                    await sendresponse(frl.trim(), envelope, `${prefix}listfrs`, false);
                } catch (err) {
                    console.error(err);
                    await sendresponse('Failed to retrieve feature requests. Please try again later.', envelope, `${prefix}listfrs`, true);
                }
            }
        },
        "delfr": {
            description: "Delete a feature request by its ID",
            arguments: ['reqid', 'reason'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-delfr [reqid]" to delete a feature request by its ID.', envelope, `${prefix}delfr`, true);
                        return;
                    }
                    const reqid = match[1];
                    const reason = match[2] || 'No reason provided';
                    const FeatureReq = mongoose.model('FeatureReq');
                    const featurereq = await FeatureReq.findOne({ reqid: reqid });
                    if (!featurereq) {
                        await sendresponse(`Feature request with ID ${reqid} not found.`, envelope, `${prefix}delfr`, true);
                        return;
                    }
                    await sendmessage(`Your feature request with ID ${reqid} has been closed.\nReason: ${reason}`, featurereq.userid, phonenumber);
                    await featurereq.deleteOne();
                    await sendresponse(`Feature request with ID ${reqid} has been deleted.`, envelope, `${prefix}delfr`, false);
                } catch (err) {
                    console.error(err);
                    await sendresponse('Failed to delete feature request. Please try again later.', envelope, `${prefix}delfr`, true);
                }
            }
        },
        "mkpoll": {
            description: "Create a poll",
            arguments: ['"question"', '"option1"', '"option2"', '...'],
            execute: async (envelope, message) => {
                try {
                    const matches = [...message.matchAll(/"([^"]*)"/g)];
                    if (matches.length < 3) {
                        await sendresponse('Invalid arguments.\nUse "-mkpoll "question" "option1" "option2" ..." to create a poll.', envelope, `${prefix}mkpoll`, true);
                        return;
                    }
                    const question = matches[0][1];
                    const options = matches.slice(1).map(match => match[1]);
                    if (options.length < 2) {
                        await sendresponse('Please provide at least two options for the poll.', envelope, `${prefix}mkpoll`, true);
                        return;
                    }
                    const Poll = mongoose.model('Poll');
                    const pollid = `poll-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                    const votes = new Array(options.length).fill(0);
                    const poll = new Poll({
                        pollid: pollid,
                        question: question,
                        options: options,
                        votes: votes
                    });
                    await poll.save();
                    const pm = `Poll created with ID: ${pollid}\nQuestion: ${question}\nOptions:\n${options.map((opt, idx) => `${idx+1}. ${opt}`).join('\n')}`;
                    await sendresponse(pm, envelope, `${prefix}mkpoll`, false);
                    const User = mongoose.model('User');
                    const users = await User.find({});
                    if (users.length === 0) {
                        await sendresponse('No users found in the database.', envelope, `${prefix}broadcast`, true);
                        return;
                    }
                    for (const user of users) {
                        try {
                            await sendmessage(`New poll created: ${pollid}\nQuestion: ${question}\n\nView the options with "-poll ${pollid}"\nVote an option with "-poll ${pollid} [optionid]"`, user.userid, phonenumber);
                            await new Promise(resolve => setTimeout(resolve, 100));
                        } catch (err) {
                            console.error(`Failed to send message to user ${user.userid}:`, err);
                        }
                    }
                } catch (err) {
                    console.error(err);
                    await sendresponse('Failed to create poll. Please try again later.', envelope, `${prefix}mkpoll`, true);
                }
            }
        },
        "closepoll": {
            description: "Close a poll by its ID",
            arguments: ['pollid'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-closepoll [pollid]" to close a poll by its ID.', envelope, `${prefix}closepoll`, true);
                        return;
                    }
                    const pollid = match[1];
                    const Poll = mongoose.model('Poll');
                    const poll = await Poll.findOne({ pollid: pollid });
                    if (!poll) {
                        await sendresponse(`Poll with ID ${pollid} not found.`, envelope, `${prefix}closepoll`, true);
                        return;
                    }
                    let rm = `Poll Results for "${poll.question}":\n\n`;
                    const tv = poll.votes.reduce((sum, count) => sum + count, 0);
                    poll.options.forEach((option, index) => {
                        const vc = poll.votes[index];
                        const per = tv > 0 ? Math.round((vc / tv) * 100) : 0;
                        rm += `${index + 1}. ${option}: ${vc} votes (${per}%)\n`;
                    });
                    if (tv === 0) {
                        rm += "\nNo votes were cast in this poll.";
                    } else {
                        rm += `\nTotal votes: ${tv}`;
                    }
                    const User = mongoose.model('User');
                    const users = await User.find({});
                    for (const user of users) {
                        try {
                            await sendmessage(`Poll "${pollid}" has been closed.\n\n${rm}`, user.userid, phonenumber);
                            await new Promise(resolve => setTimeout(resolve, 100));
                        } catch (err) {
                            console.error(`Failed to send poll results to user ${user.userid}:`, err);
                        }
                    }
                    await poll.deleteOne();
                    await sendresponse(`Poll with ID ${pollid} has been closed and deleted.\n\n${rm}`, envelope, `${prefix}closepoll`, false);
                } catch (err) {
                    console.error(err);
                    await sendresponse('Failed to close poll. Please try again later.', envelope, `${prefix}closepoll`, true);
                }
            }
        },
        "killuser": {
            description: "Forcefully unregisters a user",
            arguments: ['userid'],
            execute: async (envelope, message) => {
                try {
                    const match = parsecommand(message);
                    if (!match) {
                        await sendresponse('Invalid arguments.\nUse "-killuser [userid]" to unregister a user.', envelope, `${prefix}killuser`, true);
                        return;
                    }
                    const tui = match[1];
                    const User = mongoose.model('User');
                    const userobject = await User.findOne({ userid: tui });
                    if (!userobject) {
                        await sendresponse(`User ${tui} not found.`, envelope, `${prefix}killuser`, true);
                        return;
                    }
                    await userobject.deleteOne();
                    await sendresponse(`User ${tui} has been forcefully unregistered.`, envelope, `${prefix}killuser`, false);
                } catch (err) {
                    console.error(err);
                    await sendresponse('Failed to unregister user. Please try again later.', envelope, `${prefix}killuser`, true);
                }
            }
        },
        "migration": {
            description: "Perform a database migration (set up the migration in this commands execute section first)",
            arguments: null,
            execute: async (envelope, message) => {
                //sendresponse('A migration isn't set up yet, please set one up in this commands execute section.', envelope, `${prefix}migration`, true); return;
                try {
                    const User = mongoose.model('User');
                    const users = await User.find({});
                    if (users.length === 0) {
                        await sendresponse('No users found in the database.', envelope, `${prefix}migration`, true);
                        return;
                    }

                    let totalBalance = 0;
                    const entries = [];
                    for (const user of users) {
                        const balance = user?.properties?.eco?.balance;
                        if (typeof balance === 'number' && Number.isFinite(balance)) {
                            totalBalance += balance;
                            entries.push({ userid: user.userid, balance });
                        }
                    }

                    entries.sort((a, b) => b.balance - a.balance);
                    const lines = entries.map((e, i) => `${i + 1}: E${e.balance}`);

                    await sendresponse(
                        `There is a total of E${totalBalance} in the economy.\nUsers:\n${lines.join('\n') || 'None'}`,
                        envelope,
                        `${prefix}migration`,
                        false
                    );
                } catch (err) {
                    console.error(err);
                    await sendresponse('Failed to perform migration. Please try again later.', envelope, `${prefix}migration`, true);
                }
            }
        },
        "mksso": {
            description: "Creates an SSO provider",
            arguments: ["name", "owner"],
            execute: async (envelope, message) => {
                try {
                    const matches = [...message.matchAll(/"([^"]*)"/g)];
                    const SSOProvider = mongoose.model("SSOProvider");
                    if (!matches[0]?.[1] || !matches[1]?.[1]) {
                        sendresponse('Invalid arguments.\nYou need to specify a name and owner of the provider:\n-mksso "name" "owner"', envelope, `${prefix}mksso`, true);
                        return;
                    }
                    const buf = crypto.getRandomValues(new Uint8Array(128));
                    const key = Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
                    const idx = crypto.getRandomValues(new Uint8Array(256));
                    const id = Array.from(idx, b => b.toString(16).padStart(2, "0")).join("");
                    const provider = new SSOProvider({
                        _id: id,
                        name: matches[0][1],
                        owner: matches[1][1],
                        key
                    });
                    await provider.save();
                    sendresponse(`SSO Provider "${matches[0][1]}" created successfully (with an owner of ${matches[1][1]}).\nSSO Key: ${key}`, envelope, `${prefix}mksso`, false);
                } catch (e) {
                    console.error(e);
                    await sendresponse('Failed to create SSO provider.', envelope, `${prefix}ping`, true);
                }
            }
        }
    }
};