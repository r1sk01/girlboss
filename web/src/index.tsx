import { serve } from "bun";
import index from "./index.html";
import { parse as parseJsonc } from 'jsonc-parser';
import fs from 'fs';
import { exportmodels } from "../../mongoose.js"
import Redis from 'ioredis';

let config = parseJsonc(fs.readFileSync('../config.jsonc', 'utf8'));
const mongoosecon = config.mongoosecon;
const rediscon = config.rediscon || 'redis://localhost:6379';
config = undefined;

const mongoose = exportmodels(mongoosecon);
const redis = new Redis(rediscon);

const ae2Connections = new Map();

redis.on('error', (err) => {
    console.error('GirlbossWeb Redis connection error:', err);
});

redis.on('connect', () => {
    console.log('GirlbossWeb connected to Redis/DragonflyDB');
});

async function checkauthvalidity(authkey: string) {
    try {
        const User = mongoose.model('User');
        if (!authkey) {
            return { failed: true, message: "No AuthKey sent?" };
        }
        const cbuf = Buffer.from(authkey, 'base64');
        if (cbuf.length < 164) {
            return { failed: false, attestation: false, message: "AuthKey is invalid" };
        }
        const akbuf = cbuf.subarray(-128);
        const sidbuf = cbuf.subarray(0, -128);
        const sid = sidbuf.toString('utf8');
        const user = await User.findOne({ userid: sid });
        if (!user || !user.properties?.authkey) {
            return { failed: false, attestation: false, message: "AuthKey is invalid" };
        }
        if (!user.properties || !user.properties.eco) {
            user.properties = user.properties || {};
            user.properties.eco = { balance: 0 };
            user.markModified('properties');
            await user.save();
        }
        const sakbuf = Buffer.from(user.properties.authkey.key);
        if (!akbuf.equals(sakbuf)) {
            return { failed: false, attestation: false, message: "AuthKey is invalid" };
        } else {
            return { failed: false, attestation: true, message: "AuthKey is valid", user };
        }
    } catch (err) {
        console.error(err);
        return { failed: true, message: "Internal Server Error" };
    }
}

const server = serve({
    routes: {
        "/": index,

        "/*": (req) => Response.redirect("/"),

        "/api/login": {
            async POST(req) {
                const body = await req.json();
                const { authkey } = body;
                const validity = await checkauthvalidity(authkey);
                if (validity.failed && validity.message) {
                    return Response.json({
                        error: validity.message
                    }, { status: 500 });
                } else if (!validity.failed && validity.attestation) {
                    const response = Response.json({
                        message: "Login successful"
                    }, { status: 200 });
                    response.headers.set('Set-Cookie', `authkey=${authkey}; HttpOnly; Secure; SameSite=Strict; Path=/`);
                    return response;
                } else if (!validity.failed && !validity.attestation) {
                    const response = Response.json({
                        error: "Invalid AuthKey"
                    }, { status: 401 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                } else {
                    const response = Response.json({
                        error: "Invalid AuthKey"
                    }, { status: 401 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                }
            },
        },

        "/api/authinfo": {
            async GET(req) {
                const authkey = req.headers.get('Cookie')?.match(/authkey=([^;]+)/)?.[1];
                if (!authkey) {
                    return Response.json({
                        error: "No AuthKey provided"
                    }, { status: 401 });
                }
                const validity = await checkauthvalidity(authkey);
                if (validity.failed && validity.message) {
                    return Response.json({
                        error: validity.message
                    }, { status: 500 });
                } else if (!validity.failed && validity.attestation) {
                    return Response.json({
                        message: "AuthKey is valid",
                        user: {
                            userid: validity.user.userid,
                            username: validity.user.username,
                            properties: validity.user.properties
                        }
                    }, { status: 200 });
                } else if (!validity.failed && !validity.attestation) {
                    const response = Response.json({
                        error: "Invalid AuthKey"
                    }, { status: 401 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                } else {
                    const response = Response.json({
                        error: "Invalid AuthKey"
                    }, { status: 401 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                }
            }
        },

        "/api/eco/:activity": {
            async GET(req) {
                const activity = req.params.activity;
                if (!activity) {
                    return Response.json({
                        error: "No activity specified"
                    }, { status: 400 });
                }
                const authkey = req.headers.get('Cookie')?.match(/authkey=([^;]+)/)?.[1];
                if (!authkey) {
                    return Response.json({
                        error: "No AuthKey provided"
                    }, { status: 401 });
                }
                const validity = await checkauthvalidity(authkey);
                if (validity.failed && validity.message) {
                    return Response.json({
                        error: validity.message
                    }, { status: 500 });
                } else if (!validity.failed && validity.attestation) {
                    const User = mongoose.model('User');
                    const user = await User.findOne({ userid: validity.user.userid });
                    const bc = [
                        {
                            key: 'daily',
                            name: 'Daily',
                            message: 'Successfully claimed your daily reward of ',
                            last: user.properties.eco?.daily,
                            minreward: 100,
                            maxreward: 500,
                            cdmins: 1080
                        },
                        {
                            key: 'work',
                            name: 'Work',
                            message: 'You worked hard for ',
                            last: user.properties.eco?.work,
                            minreward: 50,
                            maxreward: 250,
                            cdmins: 60
                        }
                    ];
                    const ai = bc.find(item => item.key === activity);
                    if (!ai) {
                        return Response.json({
                            error: "Invalid activity"
                        }, { status: 400 });
                    }
                    const cdmins = ai.cdmins;
                    const cd = cdmins * 60 * 1000;
                    const ct = Date.now();
                    const last = bc.find(item => item.key === activity)?.last || 0;
                    if (ct - last < cd) {
                        const remaining = Math.ceil((cd - (ct - last)) / 60000);
                        return Response.json({
                            error: `You can use this activity again in ${remaining} minutes`
                        }, { status: 429 });
                    } else {
                        user.properties.eco[activity] = ct;
                        const earnings = Math.floor(Math.random() * (ai.maxreward - ai.minreward)) + ai.minreward;
                        user.properties.eco.balance += earnings;
                        user.properties.eco.balance = Math.floor(user.properties.eco.balance);
                        user.markModified('properties');
                        await user.save();
                        return Response.json({
                            message: `${ai.message}E${earnings}!`
                        }, { status: 200 });
                    }
                } else if (!validity.failed && !validity.attestation) {
                    const response = Response.json({
                        error: "Invalid AuthKey"
                    }, { status: 401 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                } else {
                    const response = Response.json({
                        error: "Invalid AuthKey"
                    }, { status: 401 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                }
            }
        },

        "/api/logout": {
            async GET(req) {
                const authkey = req.headers.get('Cookie')?.match(/authkey=([^;]+)/)?.[1];
                if (!authkey) {
                    return Response.json({
                        error: "No AuthKey provided"
                    }, { status: 401 });
                }
                const validity = await checkauthvalidity(authkey);
                if (validity.failed && validity.message) {
                    return Response.json({
                        error: validity.message
                    }, { status: 500 });
                } else if (!validity.failed && validity.attestation) {
                    const response = Response.json({
                        message: "Logout successful"
                    }, { status: 200 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                } else if (!validity.failed && !validity.attestation) {
                    const response = Response.json({
                        error: "Invalid AuthKey"
                    }, { status: 401 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                } else {
                    const response = Response.json({
                        error: "Invalid AuthKey"
                    }, { status: 401 });
                    response.headers.set('Set-Cookie', `authkey=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
                    return response;
                }
            }
        },

        "/api/webhook/:hook": {
            async POST(req) {
                try {
                    const hook = req.params.hook;
                    if (!hook) {
                        return Response.json({ error: "No webhook ID provided" }, { status: 400 });
                    }
                    const Webhook = mongoose.model('Webhook');
                    const webhook = await Webhook.findById(hook);
                    if (!webhook) {
                        return Response.json({ error: "Invalid webhook ID" }, { status: 404 });
                    }
                    let body = { name: "", content: "" };
                    try {
                        body = await req.json();
                    } catch (err) {
                        return Response.json({
                            error: "Invalid payload. Required: { name: string, content: string }"
                        }, { status: 400 });
                    }
                    if (!body.name || !body.content) {
                        return Response.json({
                            error: "Invalid payload. Required: { name: string, content: string }"
                        }, { status: 400 });
                    }
                    const webhookMessage = {
                        userid: webhook.userid,
                        name: body.name,
                        content: body.content,
                        timestamp: Date.now()
                    };
                    await redis.publish('webhook-messages', JSON.stringify(webhookMessage));
                    return Response.json({
                        success: true,
                        message: "Webhook message queued for delivery"
                    });
                } catch (error) {
                    console.error('Webhook error:', error);
                    return Response.json({ error: "Internal server error" }, { status: 500 });
                }
            }
        },

        "/api/ae2/:token": {
            async GET(req) {
                const token = req.params.token;
                if (!token) {
                    return new Response("Token required", { status: 400 });
                }

                try {
                    const AE2Token = mongoose.model('AE2Token');
                    const ae2Token = await AE2Token.findById(token);
                    
                    if (!ae2Token) {
                        return new Response("Invalid AE2 token", { status: 404 });
                    }

                    const upgraded = req.upgrade({
                        data: {
                            token: token,
                            userid: ae2Token.userid,
                            connectedAt: Date.now(),
                            authenticated: false
                        }
                    });

                    if (!upgraded) {
                        return new Response("WebSocket upgrade failed", { status: 400 });
                    }

                    return undefined;
                } catch (error) {
                    console.error('AE2 WebSocket connection error:', error);
                    return new Response("Internal server error", { status: 500 });
                }
            }
        },

        "/api/ae2/script.lua": {
            async GET(req) {
                try {
                    const scriptContent = await Bun.file("/root/dev.nova.tritiumbotv2/web/lua/ae2_main.lua").text();
                    return new Response(scriptContent, {
                        headers: {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-cache'
                        }
                    });
                } catch (error) {
                    console.error('Error serving Lua script:', error);
                    return new Response("Script not found", { status: 404 });
                }
            }
        },

        "/api/sso/start": {
            async GET(req) {
                try {
                    const SSOProvider = mongoose.model("SSOProvider");
                    const bearer = req.headers.get("Authorization");
                    if (!bearer) {
                        return new Response("No provider key given (Bearer token)", { status: 403 });
                    }
                    const result = await SSOProvider.findOne({ key: bearer.split(" ")[1] });
                    if (!result) {
                        return new Response("Your provider key is invalid, please either request one if you don't have one, or request a new one", { status: 403 });
                    } else {
                        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                        const deviceid = Array.from({ length: 8 }, (_, i) => chars[Math.floor(Math.random() * chars.length)]).reduce((a, c, i) => a + (i === 4 ? "-" : "") + c, "");
                        await redis.set(`sso:${deviceid}`, result._id, 'EXAT', Math.floor(Date.now() / 1000) + 1800);
                        return new Response(`${deviceid}`, { status: 200 });
                    }
                } catch (e) {
                    console.error('Error starting an SSO session:', e);
                    return new Response("Server Error", { status: 500 });
                }
            }
        },

        "/api/sso/finish": {
            async POST(req) {
                try {
                    const SSOProvider = mongoose.model("SSOProvider");
                    const bearer = req.headers.get("Authorization");
                    if (!bearer) {
                        return new Response("No provider key given (Bearer token)", { status: 403 });
                    }
                    const result = await SSOProvider.findOne({ key: bearer.split(" ")[1] });
                    if (!result) {
                        return new Response("Your provider key is invalid, please either request one if you don't have one, or request a new one", { status: 403 });
                    } else {
                        if (req.body) {
                            const deviceId = await req.text();
                            const userid = await redis.get(`sso-${result._id}:${deviceId}`);
                            if (!userid) {
                                return new Response("Invalid or expired device ID", { status: 404 });
                            } else {
                                await redis.del(`sso-${result._id}:${req.body}`);
                                return new Response(userid, { status: 200 });
                            }
                        } else {
                            return new Response("No device identifier provided in request body", { status: 400 });
                        }
                    }
                } catch (e) {
                    console.error('Error finishing SSO session:', e);
                    return new Response("Server Error", { status: 500 });
                }
            }
        }
    },

    websocket: {
        message(ws, message) {
            try {
                const data = JSON.parse(message.toString());
                const { token, userid } = ws.data;

                console.log(`AE2 WebSocket message from ${token}:`, data);

                switch (data.type) {
                    case 'auth':
                        handleAE2Auth(ws, data);
                        break;
                    case 'status':
                        handleAE2Status(ws, data);
                        break;
                    case 'craft_request':
                        handleAE2CraftRequest(ws, data);
                        break;
                    case 'inventory_update':
                        handleAE2InventoryUpdate(ws, data);
                        break;
                    case 'error':
                        handleAE2Error(ws, data);
                        break;
                    case 'pong':
                        break;
                    default:
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Unknown message type',
                            timestamp: Date.now()
                        }));
                }
            } catch (error) {
                console.error('AE2 WebSocket message parsing error:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid JSON message',
                    timestamp: Date.now()
                }));
            }
        },

        open(ws) {
            const { token, userid } = ws.data;
            console.log(`AE2 WebSocket connected: ${token} for user ${userid}`);
            ae2Connections.set(token, ws);
            ws.send(JSON.stringify({
                type: 'handshake',
                message: 'AE2 WebSocket connected',
                token: token,
                timestamp: Date.now()
            }));

            redis.publish('ae2-events', JSON.stringify({
                type: 'connection',
                userid: userid,
                token: token,
                message: 'AE2 system connected',
                timestamp: Date.now()
            }));
        },

        close(ws) {
            const { token, userid } = ws.data;
            console.log(`AE2 WebSocket disconnected: ${token}`);
            ae2Connections.delete(token);
            redis.publish('ae2-events', JSON.stringify({
                type: 'disconnection',
                userid: userid,
                token: token,
                message: 'AE2 system disconnected',
                timestamp: Date.now()
            }));
        },

        error(ws, error) {
            const { token, userid } = ws.data;
            console.error(`AE2 WebSocket error for ${token}:`, error);
            redis.publish('ae2-events', JSON.stringify({
                type: 'error',
                userid: userid,
                token: token,
                message: `AE2 system error: ${error.message}`,
                timestamp: Date.now()
            }));
        }
    },

    development: process.env.NODE_ENV !== "production" && {
        hmr: true,
        console: true,
    },
});

console.log(`Server running at ${server.url}`);

function handleAE2Auth(ws, data) {
    const { token } = ws.data;
    if (data.computerInfo && data.ae2Info) {
        ws.data.authenticated = true;
        ws.data.computerInfo = data.computerInfo;
        ws.data.ae2Info = data.ae2Info;
        ws.send(JSON.stringify({
            type: 'auth_success',
            message: 'Authentication successful',
            timestamp: Date.now()
        }));
        redis.publish('ae2-events', JSON.stringify({
            type: 'authenticated',
            userid: ws.data.userid,
            token: token,
            computerInfo: data.computerInfo,
            ae2Info: data.ae2Info,
            timestamp: Date.now()
        }));
    } else {
        ws.send(JSON.stringify({
            type: 'auth_error',
            message: 'Missing computer or AE2 information',
            timestamp: Date.now()
        }));
    }
}

function handleAE2Status(ws, data) {
    const { token, userid } = ws.data;
    redis.publish('ae2-events', JSON.stringify({
        type: 'status',
        userid: userid,
        token: token,
        status: data.status,
        timestamp: Date.now()
    }));
}

function handleAE2CraftRequest(ws, data) {
    const { token, userid } = ws.data;
    redis.publish('ae2-events', JSON.stringify({
        type: 'craft_complete',
        userid: userid,
        token: token,
        craftResult: data.result,
        timestamp: Date.now()
    }));
}

function handleAE2InventoryUpdate(ws, data) {
    const { token, userid } = ws.data;
    redis.publish('ae2-events', JSON.stringify({
        type: 'inventory_update',
        userid: userid,
        token: token,
        inventory: data.inventory,
        timestamp: Date.now()
    }));
}

function handleAE2Error(ws, data) {
    const { token, userid } = ws.data;
    redis.publish('ae2-events', JSON.stringify({
        type: 'ae2_error',
        userid: userid,
        token: token,
        error: data.error,
        timestamp: Date.now()
    }));
}

export function sendAE2Command(token, command) {
    const ws = ae2Connections.get(token);
    if (ws && ws.data.authenticated) {
        ws.send(JSON.stringify({
            type: 'command',
            command: command,
            timestamp: Date.now()
        }));
        return true;
    }
    return false;
}

export function getConnectedAE2Systems() {
    const systems = [];
    for (const [token, ws] of ae2Connections) {
        if (ws.data.authenticated) {
            systems.push({
                token: token,
                userid: ws.data.userid,
                computerInfo: ws.data.computerInfo,
                ae2Info: ws.data.ae2Info,
                connectedAt: ws.data.connectedAt
            });
        }
    }
    return systems;
}
