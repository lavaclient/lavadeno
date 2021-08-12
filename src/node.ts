// deno-lint-ignore-file camelcase

import { WebSocketCloseEvent } from "https://deno.land/std@0.104.0/ws/mod.ts";
import { EventEmitter, Lavalink } from "../deps.ts";
import { Connection, ConnectionInfo } from "./connection/connection.ts";
import { DiscordVoiceServer, DiscordVoiceState, Player } from "./player.ts";
import { REST } from "./rest.ts";

import constants from "./util/constants.ts";
import { fromSnowflake } from "./util/functions.ts";
import { NodeState } from "./util/nodestate.ts";

export class Node extends EventEmitter<NodeEvents> {
    static DEFAULTS_STATS: Lavalink.StatsData = {
        cpu: {
            cores: 0,
            lavalinkLoad: 0,
            systemLoad: 0,
        },
        frameStats: {
            deficit: 0,
            nulled: 0,
            sent: 0,
        },
        memory: {
            allocated: 0,
            free: 0,
            reservable: 0,
            used: 0,
        },
        players: 0,
        playingPlayers: 0,
        uptime: 0,
    };

    readonly players: Map<bigint, Player<this>>;
    readonly rest: REST;

    sendGatewayPayload: SendGatewayPayload;
    state: NodeState;
    userId?: bigint;
    stats: Lavalink.StatsData = Node.DEFAULTS_STATS;

    #_connection: Connection<this>;

    constructor(options: NodeOptions) {
        super(constants.maxEvents);

        this.#_connection = new Connection(this, options.connection);

        this.players = new Map();
        this.rest = new REST(this);

        this.sendGatewayPayload = options.sendGatewayPayload;
        this.state = NodeState.Idle;
        this.userId = options.userId && fromSnowflake(options.userId);
    }

    get connection(): Connection<this> {
        return this.#_connection;
    }

    get connected(): boolean {
        return this.connection.active;
    }

    get penalties() {
        const cpu = Math.pow(1.05, 100 * this.stats.cpu.systemLoad) * 10 - 10;

        let deficit = 0,
            nulled = 0;
        if (this.stats.frameStats?.deficit !== -1) {
            deficit =
                Math.pow(1.03, 500 * ((this.stats.frameStats?.deficit ?? 0) / 3000)) * 600 - 600;
            nulled =
                (Math.pow(1.03, 500 * ((this.stats.frameStats?.nulled ?? 0) / 3000)) * 600 - 600) * 2;
            nulled *= 2;
        }

        return cpu + deficit + nulled;
    }

    send(payload: Lavalink.OutgoingMessage, prioritize?: boolean): Promise<void> {
        return this.#_connection.send(payload, prioritize);
    }

    connect(userId: Snowflake | undefined = this.userId) {
        if (userId) {
            this.userId ??= fromSnowflake(userId);
        }

        return this.#_connection.connect();
    }

    debug(label: string, message: string, player?: Player<this>) {
        return this.emit(
            "debug",
            `${player ? `player ${player.guildId} | ` : ""}${label}: ${message}`
        );
    }

    createPlayer(guildId: Snowflake): Player<this> {
        const guild = fromSnowflake(guildId);

        let player = this.players.get(guild);
        if (!player) {
            player = new Player(this, guild);
            this.players.set(guild, player);
        }

        return player;
    }

    destroyPlayer(guildId: Snowflake): boolean {
        const player = this.players.get(fromSnowflake(guildId));
        if (player) {
            player.destroy();
            this.players.delete(player.guildId);
        }

        return !!player;
    }

    handleVoiceUpdate(update: DiscordVoiceServer | DiscordVoiceState) {
        const player = this.players.get(fromSnowflake(update.guild_id));
        player?.handleVoiceUpdate(update);
    }
}

export type SendGatewayPayload = (id: bigint, payload: UpdateVoiceStatus) => void;
export type Snowflake = `${bigint}` | bigint;

export interface UpdateVoiceStatus {
    op: 4;
    d: {
        guild_id: `${bigint}`;
        channel_id: `${bigint}` | null;
        self_mute: boolean;
        self_deaf: boolean;
    };
}

export interface NodeOptions {
    connection: ConnectionInfo;
    sendGatewayPayload: SendGatewayPayload;
    userId?: Snowflake;
}

export type NodeEvents = {
    connect: [took: number, reconnect: boolean];
    disconnect: [event: WebSocketCloseEvent, reconnecting: boolean];
    error: [error: Error];
    debug: [message: string];
    raw: [payload: Lavalink.IncomingMessage];
};
