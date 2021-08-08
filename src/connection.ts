import { NodeState } from "./util/nodestate.ts";
import { Backoff, BackoffOptions } from "./util/backoff.ts";
import constants from "./util/constants.ts";
import { sleep } from "./util/functions.ts";

import { WebSocket, connectWebSocket, WebSocketCloseEvent, Lavalink, isWebSocketCloseEvent, isWebSocketPingEvent, isWebSocketPongEvent } from "../deps.ts";

import type { Node } from "./node.ts";

export class Connection<N extends Node = Node> {
    readonly node: N;
    readonly info: ConnectionInfo;

    resumingOptions?: Required<ResumingOptions>;
    reconnectOptions?: ReconnectOptions & { tries: number; };
    queue: QueuedPayload[] = [];
    reconnectAttempt = 0;
    latency: number | null = null;

    #_lastPing?: number
    #_socket?: WebSocket;
    #_backoff?: Backoff
    #_connectedAt!: number;

    constructor(node: N, info: ConnectionInfo) {
        this.node = node;
        this.info = info;

        this.resumingOptions = info.resuming && { timeout: 60000, ...info.resuming };
        this.reconnectOptions = Connection.getReconnectOptions(info.reconnect);
    }

    static getReconnectOptions(options?: ReconnectOptions | ReconnectType): Required<ReconnectOptions> | undefined {
        const exponential: Required<ExponentialReconnect> = { type: "exponential", tries: 3, initialDelay: 100, maxDelay: 10000, randomizationFactor: 0 }
        if (typeof options === "string") {
            return options === "basic"
                ? { type: "basic", delay: 10000, tries: 3 }
                : exponential
        }

        return options && { ...exponential, ...options }
    }

    get address(): string {
        return `${this.info.host}:${this.info.port}`;
    }

    get active(): boolean {
        return !!this.#_socket && !this.#_socket.isClosed;
    }

    private get reconnectDelay(): number | null {
        if (!this.reconnectOptions) {
            return null;
        }

        return this.reconnectOptions.type === "basic"
            ? this.reconnectOptions.delay
            : (this.#_backoff ??= new Backoff(this.reconnectOptions)).next;
    }

    async ping(): Promise<boolean> {
        if (this.active) {
            await this.#_socket!.ping();
            this.#_lastPing = Date.now();
        }

        return this.active;
    }

    send(payload: Lavalink.OutgoingMessage, prioritize = false): Promise<void> {
        if (this.active) {
            return this._send(payload);
        }

        return new Promise((resolve, reject) => {
            this.queue[prioritize ? "unshift" : "push"]({ payload, resolve, reject });
        });
    }

    async connect() {
        if (!this.node.userId) {
            throw new Error("No user-id provided, cannot connect.");
        }

        /* try to disconnect */
        this.disconnect();

        /* get the headers */
        const headers = new Headers();
        headers.append("User-Id", `${this.node.userId}`);
        headers.append("Client-Name", constants.clientName);
        headers.append("Authorization", this.info.password);
        headers.append("User-Agent", `lavadeno (https://github.com/lavaclient/lavadeno, Deno v${Deno.version.deno})`);

        /* attempt to assign the resume-key header. */
        if (this.resumingOptions) {
            headers.append("Resume-Key", this.resumingOptions.key);
        }

        /* connect to the node. */
        if (this.node.state !== NodeState.Reconnecting) {
            this.node.state = NodeState.Connecting;
            this.node.debug("connection", "creating websocket...");
        }

        try {
            this.#_connectedAt = Date.now();
            this.#_socket = await connectWebSocket(`ws${this.info.secure ? "s" : ""}://${this.address}`, headers);
        } catch (e) {
            this.node.emit("error", e);
            if (this.node.state === NodeState.Reconnecting) {
                throw e;
            } else {
                return this._onclose({ code: -1, reason: e.message });
            }
        }

        this._onopen();
    }

    disconnect(code = 1000, reason = "disconnecting...") {
        if (!this.active) {
            return;
        }

        this.node.state = NodeState.Disconnecting;
        this.node.debug("connection", `disconnecting... code=${code}, reason=${reason}`);
        this.#_socket?.close();
    }

    async flushQueue() {
        if (!this.active) {
            return;
        }

        for (const { payload, resolve, reject } of this.queue) {
            await this._send(payload)
                .then(resolve)
                .catch(reject);
        }
    }

    async configureResuming() {
        if (!this.resumingOptions) {
            return;
        }

        const payload: Lavalink.ConfigureResuming = {
            op: "configureResuming",
            ...this.resumingOptions
        }

        await this.send(payload, true);
    }

    async reconnect(): Promise<boolean> {
        this.node.state = NodeState.Reconnecting;

        try {
            await this.connect();
        } catch (e) {
            this.node.emit("error", e);
            return false;
        }

        return true;
    }

    private async _onopen() {
        /* attempt to flush out the queue. */
        await this.flushQueue();

        /* attempt to configure resuming. */
        await this.configureResuming();

        /* emit the ready event. */
        const took = Date.now() - this.#_connectedAt;
        this.node.emit("connect", took, this.node.state === NodeState.Reconnecting);
        this.node.debug("connection", `connected in ${took}ms`);
        this.node.state = NodeState.Connected;

        /* handle incoming events. */
        for await (const event of this.#_socket!) {
            if (isWebSocketCloseEvent(event)) {
                return this._onclose(event);
            }

            if (isWebSocketPingEvent(event)) {
                return this.node.debug("connection", "received ping event.");
            }

            if (isWebSocketPongEvent(event)) {
                this.latency = this.#_lastPing
                    ? Date.now() - this.#_lastPing
                    : null;

                return this.node.debug("connection", `received pong event${this.latency ? `, latency=${this.latency}ms` : "."}`);
            }

            await this._onmessage(event);
        }
    }

    private _onmessage(data: string | Uint8Array) {
        if (typeof data !== "string") {
            return this.node.debug("connection", "received binary message??? are we even connected to a lavalink instance?");
        }

        let payload: Lavalink.IncomingMessage;
        try {
            payload = JSON.parse(data);
        } catch (e) {
            this.node.emit("error", e);
            return;
        }

        switch (payload.op) {
            case "stats":
                this.node.stats = payload;
                break;
            default: {
                const player = this.node.players.get(BigInt(payload.guildId));
                if (player) {
                    if (payload.op === "playerUpdate") {
                        player.position = payload.state.position ?? null;
                        player.connected = payload.state.connected ?? player.connected;
                    } else {
                        player.handleEvent(payload);
                    }
                }
            }
        }

        this.node.debug("connection", `${constants.clientName} <<< ${payload.op} | ${data}`);
        this.node.emit("raw", payload);
    }

    private async _onclose(event: WebSocketCloseEvent) {
        if (this.node.state === NodeState.Reconnecting) {
            return;
        }

        const reconnecting = !!this.reconnectOptions && (this.reconnectOptions.tries === -1 ? true : this.reconnectAttempt < this.reconnectOptions.tries);

        /* emit the disconnected event. */
        this.node.emit("disconnect", event, reconnecting);
        if (!reconnecting) {
            this.node.state = NodeState.Disconnected;
            return;
        }

        /* attempt to reconnect. */
        while (true) {
            const delay = this.reconnectDelay!;
            this.reconnectAttempt++;
            this.node.debug("connection", `attempting to reconnect in ${delay}ms, try=${this.reconnectAttempt}`);

            await sleep(delay);
            if (await this.reconnect()) {
                break;
            }
        }
    }

    private _send(payload: Lavalink.OutgoingMessage): Promise<void> {
        const json = JSON.stringify(payload);
        this.node.debug("connection", `${constants.clientName} >>> ${payload.op} | ${json}`);

        return this.#_socket?.send(json) ?? Promise.resolve();
    }
}

export interface ConnectionInfo {
    host: string;
    port: number;
    password: string;
    secure?: boolean;
    resuming?: ResumingOptions;
    reconnect?: ReconnectOptions | ReconnectType;
}

export interface ResumingOptions {
    key: string;
    timeout?: number;
}

export interface QueuedPayload {
    payload: Lavalink.OutgoingMessage;
    reject: () => void;
    resolve: () => void;
}

export type ReconnectOptions = ExponentialReconnect | BasicReconnect;
export type ReconnectType = "basic" | "exponential"

interface BasicReconnect {
    type: "basic";
    delay: number;
    tries?: number;
}

interface ExponentialReconnect extends BackoffOptions {
    type: "exponential"
    tries?: number;
}
