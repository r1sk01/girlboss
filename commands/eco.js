import {mongoose, prefix, phonenumber, sendresponse, sendmessage, parsecommand} from '../modulecontext.js'

export default {
    section: "eco",
    user: true,
    admin: false,
    execute: async (user) => {
        if (!user.properties.eco) {
            user.properties.eco = {};
        }
        if (!user.properties.eco.balance) {
            user.properties.eco.balance = 0;
        }
        user.markModified('properties');
        await user.save();
    },
    delete: async (user) => {
        if (user.properties && user.properties.eco) {
            delete user.properties.eco;
            user.markModified('properties');
            await user.save();
        }
    },
    commands: {
        "wallet": {
            description: "Get your wallet balance",
            arguments: null,
            execute: async (envelope, message) => {
                try {
                    const User = mongoose.model('User');
                    const user = await User.findOne({ userid: envelope.sourceUuid });
                    if (!user.properties || !user.properties.eco) {
                        user.properties.eco = { balance: 0 };
                        user.markModified('properties');
                        await user.save();
                    }
                    let bal = user.properties.eco.balance || 0;
                    if (typeof bal === 'number') {
                        bal = Math.floor(bal);
                        user.properties.eco.balance = bal;
                        user.markModified('properties');
                        await user.save();
                    }
                    await sendresponse(`Your wallet balance is: E${bal}`, envelope, `${prefix}wallet`, false);
                } catch (err) {
                    await sendresponse('Failed to retrieve your wallet balance. Please try again later.', envelope, `${prefix}wallet`, true);
                }
            }
        },
        "daily": {
            description: "Claim your daily reward",
            arguments: null,
            execute: async (envelope, message) => {
                try {
                    const User = mongoose.model('User');
                    const user = await User.findOne({ userid: envelope.sourceUuid });
                    if (!user.properties || !user.properties.eco) {
                        user.properties.eco = { balance: 0, daily: 0 };
                        user.markModified('properties');
                        await user.save();
                    }
                    const ct = Date.now();
                    const cd = 18 * 60 * 60 * 1000;
                    const daily = user.properties.eco.daily || 0;
                    if (ct - daily < cd) {
                        await sendresponse('You can only claim your daily reward once every 18 hours.', envelope, `${prefix}daily`, true);
                        return;
                    }
                    const reward = Math.floor(Math.random() * 400) + 100;
                    user.properties.eco.balance += reward;
                    user.properties.eco.balance = Math.floor(user.properties.eco.balance);
                    user.properties.eco.daily = ct;
                    user.markModified('properties');
                    await user.save();
                    await sendresponse(`You have claimed your daily reward of E${reward}! Your new balance is E${user.properties.eco.balance}.`, envelope, `${prefix}daily`, false);
                } catch (err) {
                    await sendresponse('Failed to claim your daily reward. Please try again later.', envelope, `${prefix}daily`, true);
                }
            }
        },
        "work": {
            description: "Work to earn money",
            arguments: null,
            execute: async (envelope, message) => {
                try {
                    const User = mongoose.model('User');
                    const user = await User.findOne({ userid: envelope.sourceUuid });
                    if (!user.properties || !user.properties.eco) {
                        user.properties = user.properties || {};
                        user.properties.eco = { balance: 0 };
                        user.markModified('properties');
                        await user.save();
                    }
                    const ct = Date.now();
                    const cd = 60 * 60 * 1000;
                    const work = user.properties.eco.work || 0;
                    if (ct - work < cd) {
                        await sendresponse('You can only work once every hour.', envelope, `${prefix}work`, true);
                        return;
                    }
                    const earnings = Math.floor(Math.random() * 200) + 50;
                    user.properties.eco.balance += earnings;
                    user.properties.eco.balance = Math.floor(user.properties.eco.balance);
                    user.properties.eco.work = ct;
                    user.markModified('properties');
                    await user.save();
                    await sendresponse(`You worked hard and earned E${earnings}! Your new balance is E${user.properties.eco.balance}.`, envelope, `${prefix}work`, false);
                } catch (err) {
                    await sendresponse('Failed to work. Please try again later.', envelope, `${prefix}work`, true);
                }
            }
        },
        "give": {
            description: "Give money to another user",
            arguments: ['user', 'amount'],
            execute: async (envelope, message) => {
                try {
                    const User = mongoose.model('User');
                    const match = parsecommand(message)
                    if (!match) {
                        await sendresponse('Invalid arguments. Use "-give [user] [amount]" to give money to another user.', envelope, `${prefix}give`, true);
                        return;
                    }
                    const tui = match[1];
                    const amount = parseInt(match[2]);
                    if (isNaN(amount) || amount <= 0) {
                        await sendresponse('Please specify a valid amount to give.', envelope, `${prefix}give`, true);
                        return;
                    }
                    const user = await User.findOne({ userid: envelope.sourceUuid });
                    if (tui === envelope.sourceUuid) {
                        let msgs = [
                            "Nice try, but you can't give money to yourself!",
                            "Cool story bro, but you still can't give money to yourself!",
                            "Giving money to yourself won't increase your balance!",
                            "You wish you could give money to yourself, but you can't!",
                            "Womp womp, no giving yourself money!",
                            "That's an interesting idea, however, I'm afraid I can't let you do that.",
                        ];
                        const ct = Date.now();
                        const wcd = 60 * 60 * 1000;
                        const dcd = 18 * 60 * 60 * 1000;
                        const work = user.properties.eco.work || 0;
                        const daily = user.properties.eco.daily || 0;
                        if (ct - daily >= dcd) {
                            msgs = ["Claim your daily reward with -daily!",];
                        } else if (ct - work >= wcd) {
                            msgs = ["Get a job with -work!", "Become employed today with -work!"];
                        }
                        await sendresponse(msgs[Math.floor(Math.random() * msgs.length)], envelope, `${prefix}give`, true);
                        return;
                    }
                    if (!user || !user.properties || !user.properties.eco || user.properties.eco.balance < amount) {
                        await sendresponse('You do not have enough balance to give this amount.', envelope, `${prefix}give`, true);
                        return;
                    }
                    let tu = undefined;
                    if (tui.trim() === "￼") {
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
                                await sendresponse('Invalid arguments. Use "-give [user] [amount]" to give money to another user.', envelope, `${prefix}give`, true);
                                return;
                            }
                        }
                        tu = await User.findOne({ userid: mention.uuid });
                    } else {
                        tu = await User.findOne({ userid: tui });
                    }
                    if (!tu) {
                        await sendresponse('User not found.', envelope, `${prefix}give`, true);
                        return;
                    }
                    if (!tu.properties || !tu.properties.eco) {
                        tu.properties = tu.properties || {};
                        tu.properties.eco = { balance: 0 };
                    }
                    user.properties.eco.balance -= amount;
                    tu.properties.eco.balance += amount;
                    user.markModified('properties');
                    tu.markModified('properties');
                    await user.save();
                    await tu.save();
                    await sendmessage(`You have received E${amount} from ${user.userid}. Your new balance is E${tu.properties.eco.balance}.`, tui, phonenumber);
                    await sendresponse(`You have given E${amount} to ${tui}. Your new balance is E${user.properties.eco.balance}.`, envelope, `${prefix}give`, false);
                } catch (err) {
                    await sendresponse('Failed to give money. Please try again later.', envelope, `${prefix}give`, true);
                }
            }
        },
        "leaderboard": {
            description: "View the Estrogen leaderboard!",
            arguments: null,
            execute: async (envelope, message) => {
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
                    await sendresponse('Failed to display leaderboard. Please try again later.', envelope, `${prefix}migration`, true);
                }
            }
        },
        "game": {
            description: "Let's go gambling! (in dev, disabled)",
            arguments: ["subcommand"],
            execute: async (envelope, message) => {
                await sendresponse("Command is locked until development is finished", envelope, `${prefix}game`, true);
                return;
                try {
                    const match = parsecommand(message);
                    const Game = mongoose.model("Game");

                } catch (err) {
                    await sendresponse('Failed to execute command. Please try again later.', envelope, `${prefix}game`, true);
                }
            }
        },
        "island": {
            description: "Mine Estrogen at your island (in dev)",
            arguments: null,
            execute: async (envelope, message) => {
                await sendresponse("meow", envelope, `${prefix}mew`, true);
                return;
                try {
                    const User = mongoose.model("User");

                } catch (err) {
                    await sendresponse('Failed to execute command. Please try again later.', envelope, `${prefix}game`, true);
                }
            }
        }
    }
};