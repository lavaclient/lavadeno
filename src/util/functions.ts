import type { Snowflake } from "../node.ts";

export function sleep(time: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, time));
}

export function fromSnowflake(snowflake: Snowflake): bigint {
    return typeof snowflake === "string" ? BigInt(snowflake) : snowflake;
}
