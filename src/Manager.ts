import { Socket, SocketData } from "./api/Socket.ts";
import { Player } from "./api/Player.ts";
import { WebSocketCloseEvent, EventEmitter } from "../deps.ts";

import type { LoadTracksResponse } from "./@types/track.d.ts";

const defaults = {
  resuming: { key: Math.random().toString(32), timeout: 60000 },
  reconnect: { auto: true, delay: 15000, maxTries: 5 },
  shards: 1,
} as ManagerOptions


declare global {
  type Dictionary<T = any> = Record<string, T>
}

export class Manager extends EventEmitter {
  /**
   * A map of connected sockets.
   */
  public readonly sockets: Map<string, Socket>;

  /**
   * A map of connected players.
   */
  public readonly players: Map<string, Player>;

  /**
   * The options this manager was created with.
   */
  public options: Required<ManagerOptions>;

  /**
   * The client's user id.
   */
  public userId: string | undefined;

  /**
   * A send method for sending voice state updates to discord.
   */
  public send: Send;

  /**
   * Resume options.
   */
  public resuming: ResumeOptions;

  /**
   * The array of socket data this manager was created with.
   */
  private readonly nodes: SocketData[];

  /**
   * @param nodes An array of sockets to connect to.
   * @param options
   */
  public constructor(nodes: SocketData[], options: ManagerOptions) {
    super();

    options = Object.assign(defaults, options);

    this.sockets = new Map();
    this.players = new Map();
    this.nodes = nodes;

    this.options = options as Required<ManagerOptions>;
    this.userId = options.userId;
    this.send = options.send;
    this.resuming = (typeof options.resuming === "boolean"
      ? !options.resuming ? null : defaults.resuming
      : options.resuming ?? defaults.resuming) as ResumeOptions;

    if (!options.send || typeof options.send !== "function")
      throw new TypeError("Please provide a send function for sending packets to discord.");

    if (this.options.shards! < 1)
      throw new TypeError("Shard count must be 1 or greater.");
  }

  /**
   * Ideal nodes to use.
   */
  public get ideal(): Socket[] {
    return [ ...this.sockets.values() ].sort((a, b) => a.penalties - b.penalties);
  }

  /**
   * Initializes this manager. Connects all provided sockets.
   * @param userId The client user id.
   * @since 1.0.0
   */
  public init(id?: bigint): void;
  public init(id?: string): void;
  public init(userId: string | bigint = this.userId!): void {
    if (!userId) throw new Error("Provide a client id for lavalink to use.");
    else this.userId = String(userId);

    for (const s of this.nodes) {
      if (!this.sockets.has(s.id)) {
        const socket = new Socket(this, s);

        try {
          socket.connect();
          this.sockets.set(s.id, socket);
        } catch (e) {
          this.emit("socketError", socket, e);
        }
      }
    }
  }

  /**
   * Used for providing voice server updates to lavalink.
   * @param update The voice server update sent by Discord.
   * @since 1.0.0
   */
  public async serverUpdate(update: VoiceServer): Promise<void> {
    const player = this.players.get(update.guild_id);
    if (player) {
      player.provide(update);
      await player.voiceUpdate()
    }

    return;
  }

  /**
   * Used for providing voice state updates to lavalink
   * @param update The voice state update sent by Discord.
   * @since 1.0.0
   */
  public async stateUpdate(update: VoiceState): Promise<void> {
    const player = this.players.get(update.guild_id ?? "");
    if (player && update.user_id === this.userId) {
      if (update.channel_id !== player.channel) {
        player.emit("move", update.channel_id);
        player.channel = update.channel_id!;
      }

      player.provide(update);
      await player.voiceUpdate();
    }
  }

  /**
   * Create a player.
   * @param guild The guild this player is for.
   * @since 2.1.0
   */
  public create(guild: string | Dictionary): Player {
    const id = typeof guild === "string" ? guild : guild.id;

    const existing = this.players.get(id);
    if (existing) return existing;

    const sock = this.ideal[0];
    if (!sock)
      throw new Error("Manager#create(): No available nodes.");

    const player = new Player(sock, id);
    this.players.set(id, player);

    return player;
  }

  /**
   * Destroys a player and leaves the connected voice channel.
   * @param guild The guild id of the player to destroy.
   * @since 2.1.0
   */
  public async destroy(guild: string | Dictionary): Promise<boolean> {
    const id = typeof guild === "string" ? guild : guild.id;
    const player = this.players.get(id);

    if (player) {
      await player.destroy(true);
      return this.players.delete(id);
    } else return false;
  }

  /**
   * Search lavalink for songs.
   * @param query The search query.
   */
  public async search(query: string): Promise<LoadTracksResponse> {
    const socket = this.ideal[0];
    if (!socket)
      throw new Error("Manager#create(): No available sockets.")

    const resp = await fetch(`http${socket.secure ? "s" : ""}://${socket.address}/loadtracks?identifier=${encodeURIComponent(query ?? '')}`, {
      headers: { Authorization: socket.password ?? 'youshallnotpass' },
      method: 'GET',
    });

    const data = await resp.json();
    return data;
  }
}

export type Send = (guildId: string, payload: Dictionary) => void;

export interface Manager {
  /**
   * Emitted when a lavalink socket is ready.
   */
  on(event: "socketReady", listener: (socket: Socket) => void): this;

  /**
   * Emitted when a lavalink socket has ran into an error.
   */
  on(event: "socketError", listener: (socket: Socket, error: Error) => void): this;

  /**
   * Emitted when a lavalink socket has been closed.
   */
  on(event: "socketClose", listener: (socket: Socket, event: WebSocketCloseEvent) => void): this;

  /**
   * Emitted when a lavalink socket has ran out of reconnect tries.
   */
  on(event: "socketDisconnect", listener: (socket: Socket) => void): this;
}

export interface ManagerOptions {
  /**
   * A method used for sending discord voice updates.
   */
  send: Send;

  /**
   * The number of shards the client has.
   */
  shards?: number;

  /**
   * The user id of the bot (not-recommended, provide it in Manager#init)
   */
  userId?: string;

  /**
   * If you want to enable resuming.
   */
  resuming?: ResumeOptions | boolean;

  /**
   * Options for reconnection.
   */
  reconnect?: ReconnectOptions;
}

interface ReconnectOptions {
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

export interface ResumeOptions {
  /**
   * The resume timeout.
   */
  timeout?: number;

  /**
   * The resume key to use. If omitted a random one will be assigned.
   */
  key?: string;
}

/** @internal https://discord.com/developers/docs/topics/gateway#voice-server-update */
export interface VoiceServer {
  /** Voice connection token */
  token: string;
  /** The guild this voice server update is for */
  guild_id: string;
  /** The voice server host */
  endpoint: string;
}

/** @internal https://discord.com/developers/docs/resources/voice#voice-state-object */
export interface VoiceState {
  /** The guild id this voice state is for */
  guild_id?: string;
  /** The channel id this user is connected to */
  channel_id: string | null;
  /** The user id this voice state is for */
  user_id: string;
  /** The guild member this voice state is for */
  // TODO: add GuildMember payload types
  member?: Dictionary;
  /** The session id for this voice state */
  session_id: string;
  /** Whether this user is deafened by the server */
  deaf: boolean;
  /** Whether this user is muted by the server */
  mute: boolean;
  /** Whether this user is locally deafened */
  self_deaf: boolean;
  /** Whether this user is locally muted */
  self_mute: boolean;
  /** Whether this user is streaming using "Go Live" */
  self_stream?: boolean;
  /** Whether this user's camera is enabled */
  self_video: boolean;
  /** Whether this user is muted by the current user */
  suppress: boolean;
}
