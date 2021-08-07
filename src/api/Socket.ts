import {
  connectWebSocket,
  isWebSocketCloseEvent,
  isWebSocketPingEvent,
  isWebSocketPongEvent,
  WebSocket,
  WebSocketCloseEvent
} from "https://deno.land/std@0.66.0/ws/mod.ts";
import { Buffer } from "https://deno.land/std@0.66.0/node/buffer.ts";

import type { Manager } from "../Manager.ts";

export interface ReconnectOptions {
  /**
   * The total amount of reconnect tries
   */
  maxTries?: number;

  /**
   * Whether or not reconnection's are automatically done.
   */
  auto?: boolean;

  /**
   * The delay between socket reconnection's.
   */
  delay?: number;
}

export enum Status {
  CONNECTED,
  CONNECTING,
  IDLE,
  DISCONNECTED,
  RECONNECTING
}

export class Socket {
  /**
   * The manager instance.
   */
  public readonly manager: Manager;

  /**
   * This lavalink nodes identifier.
   */
  public readonly id: string;

  /**
   * Number of remaining reconnect tries.
   */
  public remainingTries: number;

  /**
   * The status of this lavalink node.
   */
  public status: Status;

  /**
   * Hostname of the lavalink node.
   */
  public host: string;

  /**
   * Port of the lavalink node.
   */
  public port?: number;

  /**
   * Password of the lavalink node.
   */
  public password!: string

  /**
   * The performance stats of this player.
   */
  public stats: NodeStats;

  /**
   * The resume key.
   */
  public resumeKey?: string;

  /**
   * Whether or not this lavalink node uses an ssl.
   */
  public secure: boolean;

  /**
   * The timeout for reconnecting.
   */
  private reconnectTimeout!: number;

  /**
   * WebSocket instance for this socket.
   */
  private ws?: WebSocket;

  /**
   * Queue for outgoing messages.
   */
  private readonly queue: Payload[];

  /**
   * @param manager
   * @param data
   */
  public constructor(manager: Manager, data: SocketData) {
    this.manager = manager;
    this.id = data.id;

    this.host = data.host;
    this.port = data.port;
    this.secure = data.secure ?? false;
    Object.defineProperty(this, "password", { value: data.password ?? "youshallnotpass" });

    this.remainingTries = Number(manager.options.reconnect.maxTries ?? 5);
    this.status = Status.IDLE;
    this.queue = [];
    this.stats = {
      cpu: { cores: 0, lavalinkLoad: 0, systemLoad: 0 },
      frameStats: { deficit: 0, nulled: 0, sent: 0 },
      memory: { allocated: 0, free: 0, reservable: 0, used: 0 },
      players: 0,
      playingPlayers: 0,
      uptime: 0
    };
  }

  /**
   *
   */
  public get reconnection(): ReconnectOptions {
    return this.manager.options.reconnect;
  }

  /**
   * Whether or not this socket is connected.
   */
  public get connected(): boolean {
    return !!this.ws && !this.ws?.isClosed;
  }

  /**
   * The address of this lavalink node.
   */
  public get address(): string {
    return `${this.host}${this.port ? `:${this.port}` : ""}`;
  }

  /**
   * Get the total penalty count for this node.
   */
  public get penalties() {
    const cpu = Math.pow(1.05, 100 * this.stats.cpu.systemLoad) * 10 - 10;

    let deficit = 0, nulled = 0;
    if (this.stats.frameStats?.deficit != -1) {
      deficit = Math.pow(1.03, 500 * ((this.stats.frameStats?.deficit ?? 0) / 3000)) * 600 - 600;
      nulled = (Math.pow(1.03, 500 * ((this.stats.frameStats?.nulled ?? 0) / 3000)) * 600 - 600) * 2;
      nulled *= 2;
    }

    return cpu + deficit + nulled;
  }

  /**
   * Send a message to lavalink.
   * @param data The message data.
   * @param priority If this message should be prioritized.
   * @since 1.0.0
   */
  public send(data: unknown, priority = false): Promise<void> {
    return new Promise((resolve, reject) => {
      data = JSON.stringify(data);
      this.queue[priority ? "unshift" : "push"]({ data: data, reject, resolve });
      if (this.connected) this._processQueue();
    });
  }

  /**
   * Connects to the lavalink node.
   * @since 1.0.0
   */
  public async connect(): Promise<void> {
    if (this.status !== Status.RECONNECTING)
      this.status = Status.CONNECTING;

    if (this.connected) {
      this.ws?.close(1012);
      delete this.ws;
    }

    const headers = new Headers();
    headers.append("authorization", this.password);
    headers.append("num-shards", this.manager.options.shards.toString())
    headers.append("user-id", this.manager.userId!);
    if (this.resumeKey) headers.append("resume-key", this.resumeKey)

    try {
      this.ws = await connectWebSocket(`ws${this.secure ? "s" : ""}://${this.address}`, headers);
      await this._open();
    } catch (e) {
      this.manager.emit("socketError", this, e);
    }
  }

  /**
   * Reconnect to the lavalink node.
   */
  public reconnect(): void {
    if (this.remainingTries !== 0) {
      this.remainingTries -= 1;
      this.status = Status.RECONNECTING;

      try {
        this.connect();
        clearTimeout(this.reconnectTimeout);
      } catch (e) {
        this.manager.emit("socketError", this, e);
        this.reconnectTimeout = setTimeout(() => {
          this.reconnect();
        }, this.reconnection.delay ?? 15000);
      }
    } else {
      this.status = Status.DISCONNECTED;
      this.manager.emit("socketDisconnect", this, "Ran out of reconnect tries.");
    }
  }

  /**
   * Configures lavalink resuming.
   * @since 1.0.0
   */
  private configureResuming(): Promise<void> {
    if (!this.reconnection) {
      return Promise.resolve()
    }

    this.resumeKey = this.manager.resuming.key ?? Math.random().toString(32);

    return this.send({
      op: "configureResuming",
      timeout: this.manager.resuming.timeout ?? 60000,
      key: this.resumeKey
    }, true);
  }

  /**
   * Handles the opening of the websocket.
   * @private
   */
  private async _open(): Promise<void> {
    await this._processQueue()
      .then(() => this.configureResuming())
      .catch((e) => this.manager.emit("socketError", this, e));

    this.manager.emit("socketReady", this);
    this.status = Status.CONNECTED;

    for await (const data of this.ws!) {
      if (isWebSocketCloseEvent(data)) return this._close(data)
      if (isWebSocketPingEvent(data)) return;
      if (isWebSocketPongEvent(data)) return;
      await this._message(data);
    }
  }

  /**
   * Handles incoming messages from lavalink.
   * @since 1.0.0
   * @private
   */
  private async _message(data: Uint8Array | string): Promise<void> {
    if (data instanceof ArrayBuffer) data = Buffer.from(data);
    else if (Array.isArray(data)) data = Buffer.concat(data);

    let pk: any;
    try {
      pk = JSON.parse(data.toString());
    } catch (e) {
      this.manager.emit("socketError", this, e);
      return;
    }

    const player = this.manager.players.get(pk.guildId as string);
    if (pk.guildId && player) await player.emit(pk.op, pk);
    else if (pk.op === "stats") this.stats = pk;
  }

  /**
   * Handles the close of the websocket.
   * @since 1.0.0
   * @private
   */
  private _close(event: WebSocketCloseEvent): void {
    if (this.remainingTries === this.reconnection.maxTries)
      this.manager.emit("socketClose", event);

    if (event.code !== 1000 && event.reason !== "destroy") {
      if (this.reconnection.auto) this.reconnect();
    }
  }

  /**
   * @private
   */
  private async _processQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    while (this.queue.length > 0) {
      const payload = this.queue.shift();
      if (!payload) return;
      await this._send(payload);
    }
  }

  /**
   * @private
   */
  private _send(payload: Payload): void {
    try {
      this.ws?.send?.(payload.data as string);
      payload.resolve()
    } catch (e) {
      this.manager.emit("socketError", this, e)
      payload.reject(e);
    }
  }
}

/**
 * private async _onOpen() {
    this.manager.emit("opened", this.id);
    this.flush()
      .then(() => this.configureResuming())
      .catch((e) => this.manager.emit("nodeError", e, this.id));

    for await (const packet of this._ws!) {
      try {
        let data: any = packet.toString();

        try {
          data = JSON.parse(data);
        } catch (error) {}

        if (isWebSocketCloseEvent(packet)) {
          const { code, reason } = packet;
          this.manager.emit("nodeClosed", this.id, code, reason);
          return this.reconnect();
        }

        const player = this.manager.players.get(data.guildId);
        if (data.guildId && player) player.emit(data.op, data);
        if (data.op === "stats") this.stats = data;
      } catch (error) {
        this.manager.emit("nodeError", error);
        this.reconnect();
      }
    }
  }
 */

export interface SocketData {
  /**
   * The ID of this lavalink node.
   */
  id: string;

  /**
   * The host of this lavalink node.
   */
  host: string;

  /**
   * Whether or not this node is secured via ssl.
   */
  secure?: boolean;

  /**
   * The port of this lavalink node.
   */
  port?: number;

  /**
   * The password of this lavalink node.
   */
  password?: string
}

export interface Payload {
  resolve: () => unknown;
  reject: (...args: unknown[]) => unknown;
  data: unknown;
}

export interface NodeStats {
  players: number;
  playingPlayers: number;
  uptime: number;
  memory: {
    free: number;
    used: number;
    allocated: number;
    reservable: number;
  };
  cpu: {
    cores: number;
    systemLoad: number;
    lavalinkLoad: number;
  };
  frameStats?: {
    sent?: number;
    nulled?: number;
    deficit?: number;
  };
}
