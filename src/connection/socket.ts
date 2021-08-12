import { deferred, Deferred } from "https://deno.land/std@0.104.0/async/deferred.ts";
import { BufReader, BufWriter } from "https://deno.land/std@0.104.0/io/bufio.ts";
import { OpCode, readFrame, unmask, WebSocketEvent, WebSocketFrame, WebSocketMessage, WebSocketPingEvent, WebSocketPongEvent, writeFrame, WebSocket, handshake } from "https://deno.land/std@0.104.0/ws/mod.ts";

export const encoder = new TextEncoder();

export function encode(input?: string): Uint8Array {
    return encoder.encode(input);
}

export const decoder = new TextDecoder();

export function decode(input?: Uint8Array): string {
    return decoder.decode(input);
}

/* i wear a mask for hours at a time */
function createMask(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(4));
}

/**
 * Connect to given websocket endpoint url.
 * Endpoint must be acceptable for URL.
 */
export async function connectWebSocket(
    endpoint: string,
    headers: Headers = new Headers(),
): Promise<WebSocket> {
    const url = new URL(endpoint);
    const { hostname } = url;
    
    let conn: Deno.Conn;
    if (url.protocol === "http:" || url.protocol === "ws:") {
        const port = parseInt(url.port || "80");
        conn = await Deno.connect({ hostname, port });
    } else if (url.protocol === "https:" || url.protocol === "wss:") {
        const port = parseInt(url.port || "443");
        conn = await Deno.connectTls({ hostname, port });
    } else {
        throw new Error("ws: unsupported protocol: " + url.protocol);
    }

    const bufWriter = new BufWriter(conn);
    const bufReader = new BufReader(conn);

    try {
        await handshake(url, headers, bufReader, bufWriter);
    } catch (err) {
        conn.close();
        throw err;
    }

    return new WebSocketImpl({
        conn,
        bufWriter,
        bufReader,
        mask: createMask(),
    });
}

export class WebSocketImpl implements WebSocket {
    readonly conn: Deno.Conn;

    private sendQueue: Array<Queued> = [];
    private _isClosed = false;

    private readonly mask?: Uint8Array;
    private readonly bufReader: BufReader;
    private readonly bufWriter: BufWriter;

    constructor({
        conn,
        bufReader,
        bufWriter,
        mask,
    }: {
        conn: Deno.Conn;
        bufReader?: BufReader;
        bufWriter?: BufWriter;
        mask?: Uint8Array;
    }) {
        this.conn = conn;
        this.mask = mask;
        this.bufReader = bufReader || new BufReader(conn);
        this.bufWriter = bufWriter || new BufWriter(conn);
    }

    get isClosed(): boolean {
        return this._isClosed;
    }

    async *[Symbol.asyncIterator](): AsyncIterableIterator<WebSocketEvent> {
        let frames: WebSocketFrame[] = [];
        let payloadsLength = 0;
        while (!this._isClosed) {
            let frame: WebSocketFrame;
            try {
                frame = await readFrame(this.bufReader);
            } catch (_e) {
                this.ensureSocketClosed();
                break;
            }

            unmask(frame.payload, frame.mask);
            switch (frame.opcode) {
                case OpCode.TextFrame:
                case OpCode.BinaryFrame:
                case OpCode.Continue:
                    frames.push(frame);
                    payloadsLength += frame.payload.length;
                    if (frame.isLastFrame) {
                        const concat = new Uint8Array(payloadsLength);
                        let offs = 0;
                        for (const frame of frames) {
                            concat.set(frame.payload, offs);
                            offs += frame.payload.length;
                        }
                        if (frames[0].opcode === OpCode.TextFrame) {
                            // text
                            yield decode(concat);
                        } else {
                            // binary
                            yield concat;
                        }
                        frames = [];
                        payloadsLength = 0;
                    }
                    break;
                case OpCode.Close: {
                    // [0x12, 0x34] -> 0x1234
                    const code = (frame.payload[0] << 8) | frame.payload[1];
                    const reason = decode(
                        frame.payload.subarray(2, frame.payload.length),
                    );
                    await this.close(code, reason);
                    yield { code, reason };
                    return;
                }
                case OpCode.Ping:
                    await this.enqueue({
                        opcode: OpCode.Pong,
                        payload: frame.payload,
                        isLastFrame: true,
                    });
                    yield ["ping", frame.payload] as WebSocketPingEvent;
                    break;
                case OpCode.Pong:
                    yield ["pong", frame.payload] as WebSocketPongEvent;
                    break;
                default:
            }
        }
    }

    send(data: WebSocketMessage): Promise<void> {
        const opcode = typeof data === "string"
            ? OpCode.TextFrame
            : OpCode.BinaryFrame;
        const payload = typeof data === "string" ? encode(data) : data;
        const isLastFrame = true;
        const frame = {
            isLastFrame,
            opcode,
            payload,
            mask: this.mask,
        };
        return this.enqueue(frame);
    }

    ping(data: WebSocketMessage = ""): Promise<void> {
        const payload = typeof data === "string" ? encode(data) : data;
        const frame = {
            isLastFrame: true,
            opcode: OpCode.Ping,
            mask: this.mask,
            payload,
        };
        return this.enqueue(frame);
    }

    async close(code = 1000, reason?: string): Promise<void> {
        try {
            const header = [code >>> 8, code & 0x00ff];

            let payload: Uint8Array;
            if (reason) {
                const reasonBytes = encode(reason);
                payload = new Uint8Array(2 + reasonBytes.byteLength);
                payload.set(header);
                payload.set(reasonBytes, 2);
            } else {
                payload = new Uint8Array(header);
            }

            await this.enqueue({
                isLastFrame: true,
                opcode: OpCode.Close,
                mask: this.mask,
                payload,
            });
        } catch (e) {
            throw e;
        } finally {
            this.ensureSocketClosed();
        }
    }

    closeForce(): void {
        this.ensureSocketClosed();
    }

    private dequeue(): void {
        const [entry] = this.sendQueue;
        if (!entry) return;
        if (this._isClosed) return;

        const { d, frame } = entry;
        writeFrame(frame, this.bufWriter)
            .then(() => d.resolve())
            .catch((e) => d.reject(e))
            .finally(() => {
                this.sendQueue.shift();
                this.dequeue();
            });
    }

    private enqueue(frame: WebSocketFrame): Promise<void> {
        if (this._isClosed) {
            throw new Deno.errors.ConnectionReset("Socket has already been closed");
        }
        const d = deferred<void>();
        this.sendQueue.push({ d, frame });
        if (this.sendQueue.length === 1) {
            this.dequeue();
        }
        return d;
    }

    private ensureSocketClosed(): void {
        if (this.isClosed) {
            return;
        }

        try {
            this.conn.close();
        } catch (e) {
            console.error(e);
        } finally {
            this._isClosed = true;
            const rest = this.sendQueue;
            this.sendQueue = [];
            rest.forEach(e => e.d.reject(new Deno.errors.ConnectionReset("Socket has already been closed")));
        }
    }
}

export interface Queued {
    frame: WebSocketFrame;
    d: Deferred<void>;
}
