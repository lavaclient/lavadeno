import EventEmitter from "https://deno.land/std@0.51.0/node/events.ts";
import { Manager } from "../Manager.ts";
import { Socket } from "./Socket.ts";
import { PlayerState, PlayerData, Event, PlayerUpdate, PlayOptions, EqualizerBand } from "../types/Player.ts";
import { VoiceServer, VoiceState } from "../types/Voice.ts";

export class Player extends EventEmitter {
  public channel: string;
  public readonly guild: string;
  public readonly manager: Manager;

  public paused = false;
  public state: Partial<PlayerState> = {};
  public track: string | null = "";
  public playing: boolean = false;
  public playingTimestamp: number | null = 0;
  public volume: number = 100;

  private _state?: VoiceState;
  private _server?: VoiceServer;

  public constructor(data: PlayerData, public readonly node: Socket) {
    super();

    this.guild = data.guild;
    this.channel = data.channel;
    this.manager = node.manager;

    this.on("event", async (event: Event) => {
      switch (event.type) {
        case "TrackEndEvent":
          if (event.reason !== "REPLACED") this.playing = false;
          this.track = null;
          this.playingTimestamp = null;
          this.emit("end", event);
          break;
        case "TrackExceptionEvent":
          this.emit("error", event.exception ?? event.error);
          break;
        case "TrackStartEvent":
          this.emit("start", event.track);
          break;
        case "TrackStuckEvent":
          await this.stop();
          this.emit("end", event);
          break;
        case "WebSocketClosedEvent":
          this.emit("closed", event);
          break;
      }
    }).on("playerUpdate", (data: PlayerUpdate) =>
      Object.assign(this.state, data.state)
    );
  }

  public play(track: string, options: PlayOptions = {}): Promise<boolean> {
    this.playing = true;
    this.playingTimestamp = Date.now();
    this.track = track;
    return this.send("play", { ...options, track });
  }

  public stop(): Promise<boolean> {
    this.playing = false;
    this.playingTimestamp = null;
    this.track = null;
    return this.send("stop");
  }

  public pause(pause = true): Promise<boolean> {
    this.paused = pause;
    return this.send("pause", { pause });
  }

  public resume(): Promise<boolean> {
    return this.pause(false);
  }

  public seek(position: number): Promise<boolean> {
    return this.send("seek", { position });
  }

  public setVolume(volume: number): Promise<boolean> {
    this.volume = volume;
    return this.send("volume", { volume });
  }

  public equalizer(bands: EqualizerBand[]): Promise<boolean> {
    return this.send("equalizer", { bands });
  }

  public destroy(): Promise<boolean> {
    return this.send("destroy");
  }

  public send(op: string, body: Record<string, any> = {}): Promise<boolean> {
    const guildId = this.guild;
    return this.node.send({ op, ...body, guildId });
  }

  provide(update: VoiceServer | VoiceState): void {
    if ("token" in update) this._server = update;
    else this._state = update;
  }

  async _connect(): Promise<boolean> {
    if (!this._server || !this._state) return false;
    return this.send("voiceUpdate", {
      sessionId: this._state!.session_id,
      event: this._server!,
    });
  }
}
