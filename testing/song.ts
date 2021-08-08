import { Lavalink } from "../deps.ts";

export class Song implements Lavalink.TrackInfo {
    /**
     * The base64 lavaplayer track.
     */
    track: string;

    /**
     * The user that requested this song.
     */
    requester: bigint | null;

    /**
     * The length of this track.
     */
    length: number;

    /**
     * The identifier of this track.
     */
    identifier: string;

    /**
     * The author of this track.
     */
    author: string;

    /**
     * Whether this track is a stream.
     */
    isStream: boolean;

    /**
     * The position of this track
     */
    position: number;

    /**
     * The title of this track.
     */
    title: string;

    /**
     * The uri of this track.
     */
    uri: string;
    isSeekable: boolean;
    sourceName: string;

    /**
     * @param track
     * @param requester
     */
    constructor({ track, info }: Lavalink.Track, requester: bigint | null) {
        this.track = track;
        this.requester = requester;

        this.identifier = info.identifier;
        this.author = info.author;
        this.isStream = info.isStream;
        this.length = info.length;
        this.position = info.position;
        this.title = info.title;
        this.uri = info.uri!;
        this.isSeekable = info.isSeekable;
        this.sourceName = info.sourceName;
    }

    get thumbnail(): string {
        return `https://img.youtube.com/vi/${this.identifier}/hqdefault.jpg`;
    }
}
