import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useRef, type FormEvent } from "react";

export function Auth() {
    const authkeyinput = useRef<HTMLInputElement>(null);
    const error = useRef<HTMLDivElement>(null);
    const login = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ authkey: authkeyinput.current!.value })});
            const data = await res.json();
            if (data.error) {
                throw new Error(data.error);
            }
            error.current!.classList.remove("text-red-500", "bg-red-100");
            error.current!.classList.add("text-green-500", "bg-green-100");
            error.current!.textContent = data.message;
            error.current!.classList.remove("hidden");
            window.location.reload();
        } catch (err) {
            error.current!.classList.remove("text-green-500", "bg-green-100");
            error.current!.classList.add("text-red-500", "bg-red-100");
            error.current!.textContent = String(err);
            error.current!.classList.remove("hidden");
        }
    };

    return (
        <div className="mt-8 mx-auto w-full max-w-2xl text-left flex flex-col gap-4">
            <div
                ref={error}
                className={cn(
                    "text-red-500",
                    "text-sm",
                    "font-mono",
                    "bg-red-100 p-3 rounded-lg",
                    "hidden",
                )}
            >
            </div>

            <form
                onSubmit={login}
                className="flex items-center gap-2 bg-card p-3 rounded-xl font-mono border border-input w-full"
            >
                <Input
                    ref={authkeyinput}
                    placeholder="Input AuthKey here..."
                    className={cn(
                        "w-full min-h-[25px] min-w-[400px] bg-card",
                        "border border-input rounded-xl p-3",
                        "font-mono resize-y",
                        "placeholder:text-muted-foreground",
                    )}
                />

                <Button type="submit" variant="secondary">
                    Login
                </Button>
            </form>
        </div>
    );
}
