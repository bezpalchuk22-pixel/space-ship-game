import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";

const root = path.resolve(
    fileURLToPath(new URL("../../../client/dist/", import.meta.url))
);

const mimeTypes: Readonly<Record<string, string>> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg"
};

function sendText(
    res: ServerResponse,
    statusCode: number,
    message: string
): void {
    res.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8"
    });
    res.end(message);
}

function getErrorCode(error: unknown): string | undefined {
    if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
    ) {
        return error.code;
    }

    return undefined;
}

export async function serveStatic(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, {
            "Allow": "GET, HEAD",
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Метод не дозволено");
        return;
    }

    const rawPathname = (req.url ?? "/").split("?")[0] ?? "/";

    let decodedRawPathname: string;

    try {
        decodedRawPathname = decodeURIComponent(rawPathname);
    } catch {
        sendText(res, 400, "Некоректний шлях");
        return;
    }

    const rawSegments = decodedRawPathname.split(/[\\/]/);

    if (rawSegments.some(segment => segment === "..")) {
        sendText(res, 403, "Доступ заборонено");
        return;
    }

    let pathname: string;

    try {
        pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        pathname = decodeURIComponent(pathname);
    } catch {
        sendText(res, 400, "Некоректний шлях");
        return;
    }

    const segments = pathname.split(/[\\/]/);

    if (segments.some(segment => segment === "..")) {
        sendText(res, 403, "Доступ заборонено");
        return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(root, relativePath);

    if (
        filePath !== root &&
        !filePath.startsWith(root + path.sep)
    ) {
        sendText(res, 403, "Доступ заборонено");
        return;
    }

    try {
        const info = await stat(filePath);

        if (!info.isFile()) {
            sendText(res, 404, "Файл не знайдено");
            return;
        }

        res.writeHead(200, {
            "Content-Type":
                mimeTypes[path.extname(filePath).toLowerCase()] ??
                "application/octet-stream",
            "Content-Length": info.size,
            "X-Content-Type-Options": "nosniff"
        });

        if (req.method === "HEAD") {
            res.end();
            return;
        }

        await pipeline(createReadStream(filePath), res);
    } catch (error: unknown) {
        if (res.headersSent || res.destroyed) {
            if (!res.destroyed) {
                res.destroy();
            }
            return;
        }

        const errorCode = getErrorCode(error);

        if (errorCode === "ENOENT" || errorCode === "ENOTDIR") {
            sendText(res, 404, "Файл не знайдено");
            return;
        }

        console.error("Помилка роздавання статичного файлу:", error);
        sendText(res, 500, "Внутрішня помилка сервера");
    }
}
