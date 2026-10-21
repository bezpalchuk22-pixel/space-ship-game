
const MAX_ATTEMPTS = 3;
const BASE_DELAY = 300;

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
            return;
        }

        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);

        function onAbort() {
            clearTimeout(timer);
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        }

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

async function withRetry(operation, signal) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) {
            throw signal.reason ?? new DOMException("Aborted", "AbortError");
        }

        try {
            return await operation();
        } catch (error) {
            // Скасування запиту не повторюємо.
            if (error.name === "AbortError") throw error;

            // HTTP 4xx — помилка клієнта, повтор не допоможе.
            if (error.status >= 400 && error.status < 500) throw error;

            if (attempt === MAX_ATTEMPTS) throw error;

            // Exponential backoff + jitter.
            const delay = BASE_DELAY * 2 ** (attempt - 1);
            const jitter = Math.random() * 200;
            await sleep(delay + jitter, signal);
        }
    }
}

export async function fetchJson(url, signal) {
    return withRetry(async () => {
        const response = await fetch(url, { signal });

        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${url}`);
            error.status = response.status;
            throw error;
        }

        return response.json();
    }, signal);
}

export async function loadImage(url, signal) {
    return withRetry(() => new Promise((resolve, reject) => {
        const image = new Image();

        const cleanup = () => {
            image.onload = null;
            image.onerror = null;
            signal?.removeEventListener("abort", onAbort);
        };

        const onAbort = () => {
            cleanup();
            image.src = "";
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        };

        image.onload = () => {
            cleanup();
            resolve(image);
        };

        image.onerror = () => {
            cleanup();
            const error = new Error(`Не вдалося завантажити зображення: ${url}`);
            error.status = 404;
            reject(error);
        };

        if (signal?.aborted) {
            onAbort();
            return;
        }

        signal?.addEventListener("abort", onAbort, { once: true });
        image.src = url;
    }), signal);
}

export async function loadAudio(url, signal) {
    return withRetry(async () => {
        const response = await fetch(url, { signal });

        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${url}`);
            error.status = response.status;
            throw error;
        }

        return response.arrayBuffer();
    }, signal);
}

async function loadResource(resource, signal) {
    switch (resource.type) {
        case "image":
            return loadImage(resource.url, signal);
        case "audio":
            return loadAudio(resource.url, signal);
        case "json":
            return fetchJson(resource.url, signal);
        default:
            throw new Error(`Невідомий тип ресурсу: ${resource.type}`);
    }
}

export async function loadAll(manifest, {
    signal,
    onProgress = () => { }
} = {}) {
    const resources = [
        ...(manifest.images ?? []),
        ...(manifest.audio ?? []),
        ...(manifest.json ?? [])
    ];

    const loaded = {};
    let completed = 0;

    onProgress({
        completed,
        total: resources.length,
        percent: resources.length === 0 ? 100 : 0,
        current: null,
        status: "loading"
    });

    const results = await Promise.all(
        resources.map(async (resource) => {
            try {
                const value = await loadResource(resource, signal);
                loaded[resource.id] = value;
                return { resource, status: "fulfilled" };
            } catch (error) {
                return { resource, status: "rejected", reason: error };
            } finally {
                completed++;

                onProgress({
                    completed,
                    total: resources.length,
                    percent: Math.round(completed / resources.length * 100),
                    current: resource.url,
                    status: "loading"
                });
            }
        })
    );

    const failures = results.filter(result => result.status === "rejected");

    if (failures.length > 0) {
        const error = new Error(
            `Не вдалося завантажити ресурси: ${failures.map(item => item.resource.url).join(", ")
            }`
        );
        error.failures = failures;
        error.loaded = loaded;
        throw error;
    }

    onProgress({
        completed,
        total: resources.length,
        percent: 100,
        current: null,
        status: "complete"
    });

    return loaded;
}

