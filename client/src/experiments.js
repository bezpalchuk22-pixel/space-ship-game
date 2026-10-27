export function blockingExperiment(duration = 200) {
    const start = performance.now();

    while (performance.now() - start < duration) {
        // Навмисне блокування головного потоку.
    }
}