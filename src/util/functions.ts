import type { Snowflake } from "../node.ts";

export function delay(length: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, length));
}

export function snowflakeToBigint(snowflake: Snowflake): bigint {
    return typeof snowflake === "string" ? BigInt(snowflake) : snowflake;
}
