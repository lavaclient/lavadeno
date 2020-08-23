import { Severity } from "./misc";

export type LoadType = "TRACK_LOADED" | "PLAYLIST_LOADED" | "SEARCH_RESULT" | "NO_MATCHES" | "LOAD_FAILED"

export interface LoadTracksResponse {
  loadType: LoadType;
  playlistInfo?: PlaylistInfo;
  tracks: Track[];
  exception?: LoadTracksException
}

export interface PlaylistInfo {
  name: string;
  selectedTrack: number;
}

export interface LoadTracksException {
  message: string;
  severity: Severity;
}

export interface Track {
  track: string;
  info: TrackInfo;
}

export interface TrackInfo {
  identifier: string;
  isSeekable: boolean;
  author: string;
  length: number;
  isStream: boolean;
  position: number;
  title: string;
  uri: string;
}