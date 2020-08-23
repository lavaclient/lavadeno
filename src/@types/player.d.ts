export interface PlayerRequest<OP> {
  op: OP;
  guildId: string;
}

export interface PlayTrack extends PlayerRequest<"play"> {
  track: string;
  startTime: number;
  endTime: number;
  noReplace: boolean;
}

export enum Severity {
  COMMON,
  SUSPICIOUS,
  FAULT,
}

export interface EqualizerBand {
  band: number;
  gain: number;
}

export interface PlayerUpdate {
  op: "playerUpdate";
  guildId: string;
  state: PlayerState;
}

export interface PlayerState {
  time: number;
  position: number;
}

export type PlayerEventType =
  | "TrackStartEvent"
  | "TrackEndEvent"
  | "TrackExceptionEvent"
  | "TrackStuckEvent"
  | "WebSocketClosedEvent";
export type TrackEndReason =
  | "FINISHED"
  | "LOAD_FAILED"
  | "STOPPED"
  | "REPLACED"
  | "CLEANUP";
export type Event =
  | TrackStartEvent
  | TrackEndEvent
  | TrackExceptionEvent
  | TrackStuckEvent
  | WebSocketClosedEvent;

export interface PlayerEvent {
  op: "event";
  type: PlayerEventType;
}

export interface TrackStartEvent extends PlayerEvent {
  type: "TrackStartEvent";
  track: string;
}

export interface TrackEndEvent extends PlayerEvent {
  type: "TrackEndEvent";
  reason: TrackEndReason;
  track: string;
}

export interface Exception {
  severity: Severity;
  message: string;
  cause: string;
}

export interface TrackExceptionEvent extends PlayerEvent {
  type: "TrackExceptionEvent";
  exception?: Exception;
  error: string;
}

export interface TrackStuckEvent extends PlayerEvent {
  type: "TrackStuckEvent";
  thresholdMs: number;
}

export interface WebSocketClosedEvent extends PlayerEvent {
  type: "WebSocketClosedEvent";
  code: number;
  byRemote: boolean;
  reason: string;
}
