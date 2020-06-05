import { connectWebSocket, WebSocket, isWebSocketCloseEvent } from "https://deno.land/std/ws/mod.ts";
import { NodeStats, SocketOptions, SocketData } from "../types/Node.ts";
import { Manager } from "../Manager.ts";

export interface WaitingPayload {
  data: string;
  res: (...args: any[]) => any;
  rej: (...args: any[]) => any;
}

export class Socket {
  public id: string;
  public tries: number;
  public options: SocketOptions;
  public resumeKey?: string;
  public stats?: NodeStats;

  public readonly host: string;
  public readonly port: string | number;
  public readonly password!: string;

  protected _queue: WaitingPayload[] = [];
  protected _ws?: WebSocket | null;

  constructor(data: SocketData, public readonly manager: Manager) {
    this.id = data.id ?? data.host;
    this.tries = 0;
    this.options =
      data.options ??
      Object.assign(
        { retryDelay: 5000, maxTries: 3, resumeTimeout: 60 },
        manager.options.socketDefaults ?? {}
      );

    this.host = data.host;
    this.port = data.port;
    Object.defineProperty(this, "password", { value: data.password });
  }

  public get connected(): boolean {
    return !!this._ws && this._ws.isClosed === false;
  }

  public get addr(): string {
    return `ws://${this.host}:${this.port}/`;
  }

  public send(data: any): Promise<boolean> {
    return new Promise(async (res, rej) => {
      try {
        data = JSON.stringify(data);
      } catch (error) {
        this.manager.emit("nodeError", this.id, error);
        return rej(error);
      }

      if (!this.connected) this._queue.push({ data, res, rej });
      else {
        try {
          await this._ws!.send(data);
          res(true);
        } catch (error) {
          this.manager.emit("nodeError", this.id, error);
          rej(error);
        }
      }
    });
  }

  public async connect() {
    if (this._ws) {
      if (this.connected) this._ws.close();
      this._ws = null;
    }

    const headers = new Headers();
    headers.append("authorization", this.password);
    headers.append("User-Id", this.manager.userId!);
    headers.append("Num-Shards", this.manager.shardCount.toString());

    if (this.resumeKey) headers.append("Resume-Key", this.resumeKey);

    try {
      this._ws = await connectWebSocket(this.addr, headers);
      this._onOpen();
    } catch (error) {
      this.manager.emit("nodeError", this.id, error);
      this.manager.nodes.delete(this.id);
    }
  }

  public configureResuming(
    key: string = this.options.resumeKey!
  ): Promise<boolean> {
    if (!key) key = Math.random().toString(36);

    this.resumeKey = key;
    return this.send({
      op: "configureResuming",
      key,
      timeout: this.options.resumeTimeout,
    });
  }

  protected async flush(): Promise<void> {
    await Promise.all(
      this._queue.map(async ({ data, rej, res }) => {
        try {
          await this._ws!.send(data);
          res(true)
        } catch (error) {
          this.manager.emit("nodeError", this.id, error);
          rej(error);
        }
      })
    );
    this._queue = [];
  }

  private async _onOpen() {
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

  private async reconnect(): Promise<void> {
    if (this.tries !== 0) this.tries = 0;
    if (this.tries < this.options.maxTries!) {
      this.tries++;
      try {
        await this.connect();
      } catch (error) {
        this.manager.emit("nodeError", this.id, error);
        setTimeout(() => this.reconnect(), this.options.retryDelay!);
      }
    } else {
      this.manager.nodes.delete(this.id);
      this.manager.emit("nodeDisconnect", this.id, "Couldn't reconnect.");
    }
  }
}
