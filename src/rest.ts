import { Lavalink } from "../deps.ts";
import { Node } from "./node.ts";
import { RoutePlanner, routePlanner } from "./routeplanner.ts";

export class REST {
    /**
     * The node this REST manager is in charge of.
     */
    readonly node: Node;

    /**
     * The total number of requests made to this node.
     */
    requests = 0;

    constructor(node: Node) {
        this.node = node;
    }

    /**
     * Base URL of the node
     */
    get url() {
        return `http${this.node.connection.info.secure ? "s" : ""}://${this.node.connection.address}`;
    }

    /**
     * Route planner management.
     */
    get routePlanner(): RoutePlanner {
        return routePlanner(this);
    }

    /**
     * Loads or searches with the supplied identifier.  
     * @param identifier Search identifier.
     * @returns The load result.
     */
    loadTracks(identifier: string): Promise<Lavalink.LoadTracksResponse> {
        return this
            .do(`/loadtracks?identifier=${encodeURIComponent(identifier)}`)
            .then(res => res.json());
    }

    /**
     * Decodes any base 64 lavaplayer tracks into JSON objects.
     * @param tracks Array of base64 encoded lavaplayer tracks to decode.
     * @returns The decode tracks.
     */
    decodeTracks(tracks: string[]): Promise<Lavalink.Track[]> {
        return this
            .do("/decodetracks", { body: JSON.stringify({ tracks }) })
            .then(res => res.json());
    }

    /**
     * Decodes a base 64 encoded lavaplayer track into a JSON object.
     * @param track The track to decode.
     * @returns The decoded track.
     */
    decodeTrack(track: string): Promise<Lavalink.Track> {
        return this
            .do(`/decodetrack?track=${track}`)
            .then(res => res.json());
    }

    /**
     * Makes a request to the specified endpoint.
     * @param endpoint Endpoint to make a request to.
     * @param options Options for this requests
     * @returns The response.
     */
    do<T>(endpoint: string, options: RequestOptions = {}): Promise<Response> {
        endpoint = /^\//.test(endpoint) ? endpoint : `/${endpoint}`;

        const init: RequestInit = {
            ...options,
            headers: {
                Authorization: this.node.connection.info.password
            }
        }

        return fetch(`${this.url}${endpoint}`, init)
            .finally(() => {
                this.requests++;
                this.node.debug("rest", `${options.method?.toUpperCase() ?? "GET"} ${endpoint} | total requests=${this.requests}`);
            });
    }
}

interface RequestOptions {
    body?: BodyInit;
    method?: string;
}
