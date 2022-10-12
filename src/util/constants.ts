export type Dictionary<V = any, K extends string | number = string> = Record<K, V>;

export default {
    maxEvents: 10,
    clientName: `lavadeno (https://github.com/lavaclient/lavadeno, Deno v${Deno.version.deno})`,
    useFilters: false,
};
