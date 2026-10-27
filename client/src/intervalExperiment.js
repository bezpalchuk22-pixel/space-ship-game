export function createIntervalLoop(update) {
    const interval = setInterval(() => {
        update(1 / 60);
    }, 1000 / 60);

    return () => {
        clearInterval(interval);
    };
}