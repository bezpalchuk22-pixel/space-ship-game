
export interface GameLoopStats {
    readonly stepsPerSecond: number;
    readonly framesPerSecond: number;
    readonly frameTime: number;
}

export interface GameLoopOptions {
    readonly update: (fixedDt: number) => void;
    readonly render: (alpha: number) => void;
    readonly fixedDt?: number;
}

export interface GameLoop {
    start: () => void;
    stop: () => void;
    getStats: () => GameLoopStats;
}

export function createLoop({
    update,
    render,
    fixedDt = 1 / 60,
}: GameLoopOptions): GameLoop {
    if (!Number.isFinite(fixedDt) || fixedDt <= 0) {
        throw new Error("fixedDt має бути додатним числом.");
    }

    let running = false;

    let previousTime = 0;
    let accumulator = 0;

    let steps = 0;
    let frames = 0;

    let lastStatsTime = performance.now();

    let stepsPerSecond = 0;
    let framesPerSecond = 0;
    let frameTime = 0;

    function loop(currentTime: number): void {
        if (!running) {
            return;
        }

        frameTime = currentTime - previousTime;

        if (previousTime === 0) {
            frameTime = 0;
        }

        previousTime = currentTime;

        const maxFrameTime = 0.25;

        const deltaSeconds = Math.min(
            frameTime / 1000,
            maxFrameTime
        );

        accumulator += deltaSeconds;

        while (accumulator >= fixedDt) {
            update(fixedDt);

            accumulator -= fixedDt;
            steps += 1;
        }

        const alpha = accumulator / fixedDt;

        render(alpha);

        frames += 1;

        if (currentTime - lastStatsTime >= 1000) {
            stepsPerSecond = steps;
            framesPerSecond = frames;

            steps = 0;
            frames = 0;

            lastStatsTime = currentTime;
        }

        requestAnimationFrame(loop);
    }

    function start(): void {
        if (running) {
            return;
        }

        running = true;
        previousTime = 0;
        accumulator = 0;
        lastStatsTime = performance.now();

        requestAnimationFrame(loop);
    }

    function stop(): void {
        running = false;
    }

    function getStats(): GameLoopStats {
        return {
            stepsPerSecond,
            framesPerSecond,
            frameTime,
        };
    }

    return {
        start,
        stop,
        getStats,
    };
}
