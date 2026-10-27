
import http from "node:http";
import { mkdir } from "node:fs/promises";
import { config } from "./config.js";
import { handleApi, rooms } from "./http/routes.js";
import { attachWebSocket } from "./websocket.js";
import { createMatchLogger } from "./logging.js";
import { serveStatic } from "./http/static.js";

await mkdir(config.logDir, { recursive: true });

const matchLogger = createMatchLogger(config.logDir);

const server = http.createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, "http://localhost").pathname;

        if (pathname === "/health" || pathname.startsWith("/api/")) {
            await handleApi(request, response);
        } else {
            await serveStatic(request, response);
        }
    } catch (error) {
        console.error("HTTP error:", error);

        if (!response.headersSent) {
            response.writeHead(error.statusCode || 500, {
                "Content-Type": "application/json; charset=utf-8"
            });
        }

        if (!response.writableEnded && !response.destroyed) {
            response.end(JSON.stringify({
                error: "Internal server error"
            }));
        }
    }
});

const websocket = attachWebSocket(
    server,
    rooms,
    event => {
        if (!matchLogger.write(event)) {
            console.warn("Буфер журналювання заповнений.");
        }
    }
);

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`Отримано ${signal}. Завершення роботи сервера...`);

    websocket.close();
    server.closeAllConnections();

    server.close(async error => {
        if (error) {
            console.error("Помилка завершення HTTP-сервера:", error);
            process.exitCode = 1;
        }

        try {
            await matchLogger.close();
            console.log("Журнал збережено:", matchLogger.filePath);
        } catch (logError) {
            console.error("Не вдалося зберегти журнал:", logError);
            process.exitCode = 1;
        }

        if (!error) {
            console.log("HTTP-сервер зупинено.");
        }
    });
}

server.on("error", error => {
    console.error("Помилка HTTP-сервера:", error);
    process.exitCode = 1;
});

server.listen(config.port, "0.0.0.0", () => {
    console.log(`HTTP-сервер: http://localhost:${config.port}`);
    console.log(`WebSocket: ws://localhost:${config.port}/ws`);
    console.log(`Файл журналу: ${matchLogger.filePath}`);
});

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
