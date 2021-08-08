import type { Lavalink } from "../deps.ts";
import type { REST } from "./rest.ts";

export function routePlanner(rest: REST): RoutePlanner {
    return {
        status: () => rest.do("/routeplanner/status").then(res => res.json()),
        freeAllAddresses: () => rest.do("/routeplanner/free/all", { method: "POST" }).then(),
        freeAddresses: async (...addresses: string[]) => {
            for (const address of addresses) {
                await rest.do("/routeplanner/free/address", {
                    method: "POST",
                    body: JSON.stringify({ address }),
                });
            }
        },
    };
}

export interface RoutePlanner {
    status(): Promise<Lavalink.RoutePlanner>;
    freeAddresses(...addresses: string[]): Promise<void>;
    freeAllAddresses(): Promise<void>;
}
