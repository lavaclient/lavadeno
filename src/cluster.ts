import { EventEmitter, Lavalink, WebSocketCloseEvent } from "../deps.ts";
import { Node, SendGatewayPayload, Snowflake } from "./node.ts";

import constants from "./util/constants.ts";
import { fromSnowflake } from "./util/functions.ts";

import type { ConnectionInfo } from "./connection.ts";
import type { DiscordVoiceServer, DiscordVoiceState, Player } from "./player.ts";

export class Cluster extends EventEmitter<ClusterEvents> {

    readonly nodes: Map<string, ClusterNode>;

    userId?: bigint;
    sendGatewayPayload: SendGatewayPayload;

    #_players?: Map<bigint, Player<ClusterNode>>;

    constructor(options: ClusterOptions) {
        super(constants.maxEvents);

        this.nodes = Cluster.createNodes(this, options);

        this.userId = options.userId && fromSnowflake(options.userId);
        this.sendGatewayPayload = options.sendGatewayPayload;
    }

    static createNodes(cluster: Cluster, options: ClusterOptions): Map<string, ClusterNode> {
        const nodes = new Map();
        for (const info of options.nodes) {
            const node = new ClusterNode(info.id, cluster, info);
            cluster.forwardEvents(node);
            nodes.set(info.id, node);
        }

        return nodes;
    }

    get players() {
        if (!this.#_players) {
            this.#_players = new Map();
            for (const node of this.nodes.values()) {
                for (const [guild, player] of node.players) {
                    this.#_players.set(guild, player);
                }
            }
        }

        return this.#_players;
    }

    get idealNodes(): ClusterNode[] {
        return [...this.nodes.values()]
            .filter(node => node.connected)
            .sort((a, b) => a.penalties - b.penalties);
    }

    init(userId: Snowflake | undefined = this.userId) {
        if (!userId) {
            throw new Error("No user id provided");
        }

        for (const [, node] of this.nodes) {
            node.connect(userId);
        }
    }

    createPlayer(guildId: Snowflake, nodeId?: string): Player<ClusterNode> {
        const node = nodeId
            ? this.nodes.get(nodeId)
            : this.idealNodes[0];

        if (!node) {
            throw new Error("No available nodes.");
        }

        return node.createPlayer(guildId);
    }

    destroyPlayer(guildId: Snowflake): boolean {
        const removed = this.players.get(fromSnowflake(guildId))
            ?.node
            ?.destroyPlayer(guildId) ?? false;

        if (removed) {
            this.#_players = undefined;
        }

        return removed;
    }

    handleVoiceUpdate(update: DiscordVoiceServer | DiscordVoiceState) {
        const player = this.players.get(fromSnowflake(update.guild_id));
        player?.handleVoiceUpdate(update);
    }

    private forwardEvents(node: ClusterNode) {
        node.on("connected", (...args) => this.emit("nodeConnect", node, ...args))
        node.on("disconnected", (...args) => this.emit("nodeDisconnect", node, ...args))
        node.on("error", (...args) => this.emit("nodeError", node, ...args))
        node.on("raw", (...args) => this.emit("nodeMessage", node, ...args))
        node.on("debug", message => this.emit("nodeDebug", node, message));
    }

}

export class ClusterNode extends Node {
    readonly id: string;
    readonly cluster: Cluster;

    constructor(id: string, cluster: Cluster, options: ConnectionInfo) {
        super({
            connection: options,
            sendGatewayPayload: (id, p) => cluster.sendGatewayPayload(id, p),
        });

        this.id = id;
        this.cluster = cluster;
    }

}

export type ClusterEvents = {
    "nodeConnect": [node: ClusterNode, reconnect: boolean];
    "nodeDisconnect": [node: ClusterNode, event: WebSocketCloseEvent, reconnecting: boolean];
    "nodeError": [node: ClusterNode, error: Error];
    "nodeMessage": [node: ClusterNode, payload: Lavalink.IncomingMessage];
    "nodeDebug": [node: ClusterNode, message: string];
}

export interface ClusterOptions {
    nodes: ClusterNodeOptions[];
    sendGatewayPayload: SendGatewayPayload;
    userId?: Snowflake;
}

export interface ClusterNodeOptions extends ConnectionInfo {
    id: string;
}
