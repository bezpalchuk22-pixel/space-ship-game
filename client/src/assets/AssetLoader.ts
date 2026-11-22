
const MAX_ATTEMPTS = 3;
const BASE_DELAY = 300;

export interface Resource {
    readonly id: string;
    readonly url: string;
    readonly type: "image" | "audio" | "json";
}

export interface AssetManifest {
    readonly images?: readonly Resource[];
    readonly audio?: readonly Resource[];
    readonly json?: readonly Resource[];
}

export interface ProgressInfo {
    readonly completed: number;
    readonly total: number;
    readonly percent: number;
    readonly current: string | null;
    readonly status: "loading" | "complete";
}

export interface LoadAllOptions {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: ProgressInfo) => void;
}

export type LoadedResource = HTMLImageElement | ArrayBuffer | unknown;

export type LoadedResources = Record<string, LoadedResource>;

interface ResourceFailure {
    readonly resource: Resource;
    readonly status: "rejected";
    readonly reason: unknown;
}

interface ResourceSuccess {
    readonly resource: Resource;
    readonly status: "fulfilled";
}

type ResourceResult = ResourceSuccess | ResourceFailure;

interface ResourceLoadError extends Error {
    status?: number;
}

interface AssetLoadError extends Error {
    failures?: readonly ResourceFailure[];
    loaded?: LoadedResources;
}

function createAbortError(signal?: AbortSignal): unknown {
    return signal?.reason ??
        new DOMException("Aborted", "AbortError");
}

function isAbortError(error: unknown): boolean {
    return (
        error instanceof Error &&
        error.name === "AbortError"
    );
}

function getErrorStatus(error: unknown): number | undefined {
    if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
    ) {
        return error.status;
    }

    return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(createAbortError(signal));
            return;
        }

        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);

        function onAbort(): void {
            clearTimeout(timer);
            reject(createAbortError(signal));
        }

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

async function withRetry<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal
): Promise<T> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) {
            throw createAbortError(signal);
        }

        try {
            return await operation();
        } catch (error: unknown) {
            if (isAbortError(error)) {
                throw error;
            }

            const status = getErrorStatus(error);

            if (status !== undefined && status >= 400 && status < 500) {
                throw error;
            }

            if (attempt === MAX_ATTEMPTS) {
                throw error;
            }

            const delay = BASE_DELAY * 2 ** (attempt - 1);
            const jitter = Math.random() * 200;

            await sleep(delay + jitter, signal);
        }
    }

    throw new Error("Р’РёС‡РµСЂРїР°РЅРѕ РєС–Р»СЊРєС–СЃС‚СЊ СЃРїСЂРѕР± Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ.");
}

export async function fetchJson(
    url: string,
    signal?: AbortSignal
): Promise<unknown> {
    return withRetry(async () => {
        const response = await fetch(
            url,
            signal ? { signal } : {}
        );

        if (!response.ok) {
            const error: ResourceLoadError = new Error(
                `HTTP ${response.status}: ${url}`
            );

            error.status = response.status;
            throw error;
        }

        const data: unknown = await response.json();
        return data;
    }, signal);
}

export async function loadImage(
    url: string,
    signal?: AbortSignal
): Promise<HTMLImageElement> {
    return withRetry(
        () => new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();

            const cleanup = (): void => {
                image.onload = null;
                image.onerror = null;
                signal?.removeEventListener("abort", onAbort);
            };

            const onAbort = (): void => {
                cleanup();
                image.src = "";
                reject(createAbortError(signal));
            };

            image.onload = (): void => {
                cleanup();
                resolve(image);
            };

            image.onerror = (): void => {
                cleanup();

                const error: ResourceLoadError = new Error(
                    `РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё Р·РѕР±СЂР°Р¶РµРЅРЅСЏ: ${url}`
                );

                error.status = 404;
                reject(error);
            };

            if (signal?.aborted) {
                onAbort();
                return;
            }

            signal?.addEventListener("abort", onAbort, { once: true });
            image.src = url;
        }),
        signal
    );
}

export async function loadAudio(
    url: string,
    signal?: AbortSignal
): Promise<ArrayBuffer> {
    return withRetry(async () => {
        const response = await fetch(
            url,
            signal ? { signal } : {}
        );

        if (!response.ok) {
            const error: ResourceLoadError = new Error(
                `HTTP ${response.status}: ${url}`
            );

            error.status = response.status;
            throw error;
        }

        return response.arrayBuffer();
    }, signal);
}

async function loadResource(
    resource: Resource,
    signal?: AbortSignal
): Promise<LoadedResource> {
    switch (resource.type) {
        case "image":
            return loadImage(resource.url, signal);

        case "audio":
            return loadAudio(resource.url, signal);

        case "json":
            return fetchJson(resource.url, signal);

        default: {
            const exhaustiveCheck: never = resource.type;
            throw new Error(
                `РќРµРІС–РґРѕРјРёР№ С‚РёРї СЂРµСЃСѓСЂСЃСѓ: ${exhaustiveCheck}`
            );
        }
    }
}

export async function loadAll(
    manifest: AssetManifest,
    {
        signal,
        onProgress = () => { }
    }: LoadAllOptions = {}
): Promise<LoadedResources> {
    const resources: Resource[] = [
        ...(manifest.images ?? []),
        ...(manifest.audio ?? []),
        ...(manifest.json ?? [])
    ];

    const loaded: LoadedResources = {};
    let completed = 0;

    onProgress({
        completed,
        total: resources.length,
        percent: resources.length === 0 ? 100 : 0,
        current: null,
        status: "loading"
    });

    const results: ResourceResult[] = await Promise.all(
        resources.map(async (resource): Promise<ResourceResult> => {
            try {
                const value = await loadResource(resource, signal);

                loaded[resource.id] = value;

                return {
                    resource,
                    status: "fulfilled"
                };
            } catch (error: unknown) {
                return {
                    resource,
                    status: "rejected",
                    reason: error
                };
            } finally {
                completed++;

                onProgress({
                    completed,
                    total: resources.length,
                    percent: resources.length === 0
                        ? 100
                        : Math.round(completed / resources.length * 100),
                    current: resource.url,
                    status: "loading"
                });
            }
        })
    );

    const failures = results.filter(
        (result): result is ResourceFailure =>
            result.status === "rejected"
    );

    if (failures.length > 0) {
        console.error("РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё С‚Р°РєС– СЂРµСЃСѓСЂСЃРё:");

        for (const item of failures) {
            console.error(
                `URL: ${item.resource.url}`,
                "| РўРёРї:",
                item.resource.type,
                "| РџСЂРёС‡РёРЅР°:",
                item.reason
            );
        }

        const error: AssetLoadError = new Error(
            `РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё СЂРµСЃСѓСЂСЃРё: ${failures.map(item => item.resource.url).join(", ")
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

