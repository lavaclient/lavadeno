const FACTOR = 2;

export function backoff(options: BackoffOptions): Backoff {
    const initialDelay = options.initialDelay ?? 100
        , randomizationFactor = options.randomizationFactor ?? 0
        , maxDelay = options.maxDelay ?? 10000;

    let delay = 0, nextDelay = initialDelay;
    function next() {
        delay = Math.min(nextDelay, maxDelay);
        nextDelay = delay * FACTOR;
        return delay;
    }

    return () => Math.round(next() * (1 + Math.random() * randomizationFactor));
}

export type Backoff = () => number;
export interface BackoffOptions {
    maxDelay?: number;
    initialDelay?: number;
    randomizationFactor?: number;
}
