export class Backoff {
    static FACTOR = 2;

    readonly initialDelay: number;
    readonly maxDelay: number;
    readonly randomizationFactor: number;

    delay = 0;
    nextDelay = 0;

    constructor(options: BackoffOptions = {}) {
        this.initialDelay = this.nextDelay = options.initialDelay ?? 100;
        this.maxDelay = options.maxDelay ?? 10000;
        this.randomizationFactor = options.randomizationFactor ?? 0;
    }

    get next(): number {
        return Math.round(this._next * (1 + Math.random() * this.randomizationFactor));
    }

    get _next(): number {
        this.delay = Math.min(this.nextDelay, this.maxDelay);
        this.nextDelay = this.delay * Backoff.FACTOR;
        return this.delay;
    }
}

export interface BackoffOptions {
    maxDelay?: number;
    initialDelay?: number;
    randomizationFactor?: number;
}
