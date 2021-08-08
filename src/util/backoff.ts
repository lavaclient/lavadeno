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
        this.randomizationFactor = options.randomizationFactor ?? 0
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


/*
export class Backoff {
    static FACTOR = 4.0;
    static SCALING_FACTOR = 1 / 1.4;

    readonly initialDelay: number;
    readonly maxDelay: number;

    delay = 0;
    state = 0;
    last = 0;

    constructor(options: BackoffOptions = {}) {
        this.initialDelay = this.delay = options.initialDelay ?? 100;
        this.maxDelay = options.maxDelay ?? 10000;
    }

    next(): number {
        const t = this.state + Math.random()
        const next = (2 ** t) * Math.tanh(Math.sqrt(Backoff.FACTOR * t));
        const formulaIntrinsicValue = Math.max(0, next - this.last);

        this.state++;
        this.last = next;

        return Math.min(Math.floor(formulaIntrinsicValue * Backoff.SCALING_FACTOR * this.initialDelay), this.maxDelay)
    }
}

export interface BackoffOptions {
    maxDelay?: number;
    initialDelay?: number;
}


*/
