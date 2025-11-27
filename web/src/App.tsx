import { Card, CardContent } from "@/components/ui/card";
import { Auth } from "./Auth";
import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { cn } from "./lib/utils";
import Failed from "./components/error";
import Loading from "./components/loading";
import logo from "./logo.png";
import "./index.css";

export function App() {
    const [isLoading, setIsLoading] = useState(true);
    const [isFailed, setIsFailed] = useState({ status: false, message: "" });
    const [authInfo, setauthInfo] = useState<{ userid?: String, username: String, properties: any }>({ userid: undefined, username: "", properties: {} });
    const [buttonStates, setButtonStates] = useState<Record<string, { disabled: boolean, text: string }>>({
        daily: { disabled: false, text: "Daily" },
        work: { disabled: false, text: "Work" }
    });
    const titleref = useRef<HTMLHeadingElement>(null);
    const cardref = useRef<HTMLDivElement>(null);
    const error = useRef<HTMLButtonElement>(null);

    const fetchinfo = async () => {
        try {
            const res = await fetch("/api/authinfo");
            const data = await res.json();
            setIsLoading(false);
            if (data.error && res.status === 500) {
                console.error("Server fail!:", data.error);
                setIsFailed({ status: true, message: data.error });
                return;
            } else if (data.error && res.status === 401) {
                setIsLoading(false);
                return;
            } else {
                setauthInfo(data.user);
            }
        } catch (err) {
            setIsFailed({ status: true, message: err.toString() });
            setIsLoading(false);
        }
    }

    async function displaymessage(message: string, iserror: boolean) {
        if (iserror) {
            error.current!.classList.remove("text-green-500", "bg-green-100");
            error.current!.classList.add("text-red-500", "bg-red-100");
            error.current!.textContent = message;
            error.current!.classList.remove("hidden");
        } else {
            error.current!.classList.remove("text-red-500", "bg-red-100");
            error.current!.classList.add("text-green-500", "bg-green-100");
            error.current!.textContent = message;
            error.current!.classList.remove("hidden");
        }
    }

    async function doactivity(activity: string) {
        if (!authInfo.userid) {
            displaymessage("You are not logged in!", true);
            return;
        }
        try {
            const res = await fetch(`/api/eco/${activity}`, { method: "GET" });
            const data = await res.json();
            if (data.error) {
                displaymessage(data.error, true);
            } else {
                displaymessage(data.message, false);
                fetchinfo();
            }
        } catch (err) {
            displaymessage(err.toString(), true);
        }
    }
    async function logout() {
        try {
            const res = await fetch("/api/logout", { method: "GET" });
            const data = await res.json();
            if (data.error) {
                displaymessage(data.error, true);
            } else {
                displaymessage(data.message, false);
                setauthInfo({ userid: "", username: "", properties: {} });
                window.location.reload();
            }
        } catch (err) {
            displaymessage(err.toString(), true);
        }
    }

    useEffect(() => {
        fetchinfo();
        if (authInfo.userid !== "") {
            setInterval(() => {
                fetchinfo();
            }, 5000);
        }
    }, []);

    useEffect(() => {
        const updatebuttons = () => {
            const bc = [
                {
                    key: 'daily',
                    name: 'Daily',
                    message: 'Successfully claimed your daily reward of ',
                    last: authInfo.properties.eco?.daily,
                    minreward: 100,
                    maxreward: 500,
                    cdmins: 1080
                },
                {
                    key: 'work',
                    name: 'Work',
                    message: 'You worked hard for ',
                    last: authInfo.properties.eco?.work,
                    minreward: 50,
                    maxreward: 250,
                    cdmins: 60
                }
            ];
            const nbs: Record<string, { disabled: boolean, text: string }> = {};
            bc.forEach(config => {
                const last = config.last ? new Date(config.last) : null;
                if (last) {
                    const now = new Date();
                    const em = (now.getTime() - last.getTime()) / (1000 * 60);
                    if (em < config.cdmins) {
                        const rem = config.cdmins - em;
                        const rh = Math.floor(rem / 60);
                        const rm = Math.floor(rem % 60);
                        const rs = Math.floor((rem % 1) * 60);
                        
                        nbs[config.key] = {
                            disabled: true,
                            text: `${config.name} (cooldown: ${rh.toString().padStart(2, '0')}:${rm.toString().padStart(2, '0')}:${rs.toString().padStart(2, '0')})`
                        };
                    } else {
                        nbs[config.key] = {
                            disabled: false,
                            text: config.name
                        };
                    }
                } else {
                    nbs[config.key] = {
                        disabled: false,
                        text: config.name
                    };
                }
            });
            setButtonStates(nbs);
        };
        updatebuttons();
        let interval: NodeJS.Timeout | null = null;
        if (authInfo.userid) {
            interval = setInterval(updatebuttons, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [authInfo.properties.eco?.daily, authInfo.properties.eco?.work, authInfo.userid]);

    if (isFailed.status) {
        return (
            <div className="container mx-auto p-8 text-center relative z-10">
                <div className="flex justify-center items-center gap-8 mb-8">
                    <img
                        src={logo}
                        alt="Girlboss Logo (as a circle)"
                        className="h-36 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#8200ff] scale-200"
                        style={{ imageRendering: "pixelated" }}
                    />
                </div>

                <Card className="bg-card/40 backdrop-blur-sm border-muted">
                    <CardContent ref={cardref} className="pt-6">
                        <Failed page="GirlbossWeb" error={isFailed.message || "Unspecified error"} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="container mx-auto p-8 text-center relative z-10">
                <div className="flex justify-center items-center gap-8 mb-8">
                    <img
                        src={logo}
                        alt="Girlboss Logo (as a circle)"
                        className="h-36 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#8200ff] scale-200"
                        style={{ imageRendering: "pixelated" }}
                    />
                </div>

                <Card className="bg-card/40 backdrop-blur-sm border-muted">
                    <CardContent ref={cardref} className="pt-6">
                        <Loading page="GirlbossWeb" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isLoading && !authInfo.userid) {
        return (
            <div className="container mx-auto p-8 text-center relative z-10">
                <div className="flex justify-center items-center gap-8 mb-8">
                    <img
                        src={logo}
                        alt="Girlboss Logo (as a circle)"
                        className="h-36 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#8200ff] scale-200"
                        style={{ imageRendering: "pixelated" }}
                    />
                </div>

                <Card className="bg-card/40 backdrop-blur-sm border-muted">
                    <CardContent ref={cardref} className="pt-6">
                        <h1 ref={titleref} className="text-5xl font-bold my-4 leading-tight" style={{ fontFamily: "'JetBrainsMono NF', 'JetBrainsMono', monospace" }}>GirlbossWeb</h1>
                        <p>
                            Use{" "} <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">Girlboss</code> outside of Signal!
                        </p>
                        <Auth />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-8 text-center relative z-10">
            <div className="flex justify-center items-center gap-8 mb-8">
                <img
                    src={logo}
                    alt="Girlboss Logo (as a circle)"
                    className="h-36 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#8200ff] scale-200"
                    style={{ imageRendering: "pixelated" }}
                />
            </div>

            <Card className="bg-card/40 backdrop-blur-sm border-muted">
                <CardContent ref={cardref} className="pt-6">
                    <h1 ref={titleref} className="text-4xl font-bold my-4 leading-tight" style={{ fontFamily: "'JetBrainsMono NF', 'JetBrainsMono', monospace" }}>Welcome, {authInfo.properties.nickname ? authInfo.properties.nickname : authInfo.username}!</h1>
                    <p>
                        View and manage your Girlboss eco account here :3
                    </p>
                    <Separator className="my-3 bg-neutral-400" orientation="horizontal" />
                    <p style={{ marginBottom: "8px" }}>Estrogen: E{authInfo.properties.eco ? authInfo.properties.eco.balance : "0"}</p>
                    <Button
                        ref={error}
                        variant="secondary"
                        className={cn(
                            "text-red-500",
                            "text-sm",
                            "font-mono",
                            "bg-red-100 p-3 rounded-lg",
                            "hidden",
                            "pointer-events-none",
                            "cursor-default",
                            "hover:bg-red-100",
                            "focus:ring-0",
                            "active:scale-100",
                            "w-full"
                        )}
                        size="hz"
                        tabIndex={-1}
                        aria-hidden="true"
                    >
                    </Button>
                    <Separator className="my-3 bg-neutral-400" orientation="horizontal" />
                    <div className="flex flex-col space-y-2">
                        <Button 
                            variant="secondary" 
                            size="hz" 
                            disabled={buttonStates.daily?.disabled}
                            className="w-full"
                            onClick={() => doactivity("daily")}
                        >
                            {buttonStates.daily?.text}
                        </Button>
                        <Button 
                            variant="secondary" 
                            size="hz" 
                            disabled={buttonStates.work?.disabled}
                            className="w-full"
                            onClick={() => doactivity("work")}
                        >
                            {buttonStates.work?.text}
                        </Button>
                        <Button
                            variant="secondary"
                            size="hz"
                            className="w-full"
                            onClick={() => logout()}
                        >
                            Log Out
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default App;
