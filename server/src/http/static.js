
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = path.resolve(
    fileURLToPath(new URL("../../../client/dist/", import.meta.url))
);

const mimeTypes = {
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

export async function serveStatic(req, res) {
    // Дозволяємо лише GET і HEAD.
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, {
            "Allow": "GET, HEAD",
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Метод не дозволено");
        return;
    }

    // Отримуємо шлях із запиту без параметрів після знака ?.
    const rawPathname = (req.url ?? "/").split("?")[0];

    let decodedRawPathname;

    try {
        decodedRawPathname = decodeURIComponent(rawPathname);
    } catch {
        res.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Некоректний шлях");
        return;
    }

    // Блокуємо спроби переходу до батьківських каталогів.
    const rawSegments = decodedRawPathname.split(/[\\/]/);

    if (rawSegments.some(segment => segment === "..")) {
        res.writeHead(403, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Доступ заборонено");
        return;
    }

    let pathname;

    try {
        pathname = decodeURIComponent(
            new URL(req.url, "http://localhost").pathname
        );
    } catch {
        res.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Некоректний шлях");
        return;
    }

    // Додаткова перевірка декодованого шляху.
    const segments = pathname.split(/[\\/]/);

    if (segments.some(segment => segment === "..")) {
        res.writeHead(403, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Доступ заборонено");
        return;
    }

    // Головна сторінка відповідає файлу index.html.
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(root, relativePath);

    // Не дозволяємо виходити за межі client/dist.
    if (
        filePath !== root &&
        !filePath.startsWith(root + path.sep)
    ) {
        res.writeHead(403, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Доступ заборонено");
        return;
    }

    try {
        const info = await stat(filePath);

        if (!info.isFile()) {
            res.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8"
            });
            res.end("Файл не знайдено");
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

        // Передаємо файл потоково, без завантаження всього вмісту в пам'ять.
        await pipeline(createReadStream(filePath), res);
    } catch (error) {
        if (res.headersSent || res.destroyed) {
            if (!res.destroyed) {
                res.destroy();
            }
            return;
        }

        if (error.code === "ENOENT" || error.code === "ENOTDIR") {
            res.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8"
            });
            res.end("Файл не знайдено");
            return;
        }

        console.error("Помилка роздавання статичного файлу:", error);

        res.writeHead(500, {
            "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Внутрішня помилка сервера");
    }
}
