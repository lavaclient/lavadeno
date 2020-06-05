import EventEmitter from "https://deno.land/std@0.51.0/node/events.ts";

import { SendFunction, ManagerOptions } from "./types/Manager.ts";
import { SocketData } from "./types/Node.ts";
import { VoiceServer, VoiceState } from "./types/Voice.ts";
import { PlayerData, ConnectOptions } from "./types/Player.ts";

import { Socket } from "./api/Socket.ts";
import { Player } from "./api/Player.ts";

export class Manager extends EventEmitter {
  #nodes: SocketData[];
  public readonly players: Map<string, Player>;
  public readonly nodes: Map<string, Socket>;

  public send?: SendFunction;
  public userId?: string;
  public shardCount: number;

  constructor(nodes: SocketData[], public readonly options: ManagerOptions) {
    super();

    this.#nodes = nodes;
    this.players = new Map();
    this.nodes = new Map();

    this.userId = options.userId;
    this.shardCount = options.shards ?? 1;

    if (!options.send || typeof options.send !== "function") {
      throw new Error("[Lavaclient] Provide a Send Function.");
    } else this.send = options.send;
  }

  public get ideal(): Socket[] {
    return [...this.nodes.values()]
      .filter((s) => s.connected)
      .sort((a, b) => {
        if (!a.stats || !b.stats) return -1;
        return (
          (a.stats.cpu ? a.stats.cpu.systemLoad / a.stats.cpu.cores : 0) -
          (b.stats.cpu ? b.stats.cpu.systemLoad / b.stats.cpu.cores : 0)
        );
      });
  }

  public async init(userId: string = this.userId!): Promise<void> {
    this.userId = userId;
    if (!userId)
      throw new Error(
        "[Lavaclient] Provide a userId, either pass it in Manager#init or in the manager options."
      );

    await Promise.all(
      this.#nodes
        .filter((n) => !this.nodes.has(n.id ?? n.host))
        .map(async (o) => {
          const socket = new Socket(o, this);
          socket.connect();
          this.nodes.set(o.id ?? o.host, socket);
        })
    );
  }


  public serverUpdate(update: VoiceServer): void {
    const player = this.players.get(update.guild_id);
    if (player) {
      player.provide(update);
      player._connect();
    }
  }

  public stateUpdate(update: VoiceState): void {
    if (update.user_id !== this.userId) return;

    const player = this.players.get(update.guild_id);
    if (update.channel_id && player) {
      if (update.channel_id !== player.channel) {
        player.emit("move", update.channel_id);
        player.channel = update.channel_id;
      }

      player.provide(update);
      player._connect();
    }
  }

  public async leave(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (!player) return;

    await this.send!(guildId, {
      op: 4,
      d: {
        guild_id: guildId,
        channel_id: null,
        self_mute: null,
        self_deaf: null,
      },
    });

    this.players.delete(guildId);
    player.removeAllListeners();
  }

  public async join(
    data: PlayerData,
    options: ConnectOptions = {}
  ): Promise<Player> {
    const existing = this.players.get(data.guild);
    if (existing) return existing;

    const node = data.node ? this.nodes.get(data.node) : this.ideal[0];
    if (!node || !node.connected)
      throw new Error("Manager#join: You didn't provide a valid node.");

    const player = new Player(data, node);
    this.players.set(data.guild, player);

    await this.send!(data.guild, {
      op: 4,
      d: {
        guild_id: data.guild,
        channel_id: data.channel,
        self_mute: options.mute ?? false,
        self_deaf: options.deaf ?? false,
      },
    });

    return player;
  }
}
