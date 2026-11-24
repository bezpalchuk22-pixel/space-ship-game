
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { Room } from "../rooms/Room.js";
import { config } from "../config.js";

export const rooms = new Map([
    new Room({
        id: "room-1",
        name: "Космічна битва",
        maxPlayers: config.maxPlayersPerRoom
    }),
    new Room({
        id: "room-2",
        name: "Галактична арена",
        maxPlayers: config.maxPlayersPerRoom
    }),
    new Room({
        id: "room-3",
        name: "Орбіта перемоги",
        maxPlayers: config.maxPlayersPerRoom
    }),
    new Room({
        id: "room-4",
        name: "Зоряний флот",
        maxPlayers: config.maxPlayersPerRoom
    }),
    new Room({
        id: "room-5",
        name: "Туманність",
        maxPlayers: config.maxPlayersPerRoom
    })
].map(room => [room.id, room]));

let nextRoomId = 6;

const createRoomSchema = z.object({
    name: z.string().trim().min(1).max(40)
});

function sendJson(
    res: ServerResponse,
    statusCode: number,
    data: unknown
): void {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify(data));
}

class RequestBodyError extends Error {
    constructor(
        message: string,
        readonly statusCode: number
    ) {
        super(message);
        this.name = "RequestBodyError";
    }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);

        size += buffer.length;

        if (size > 16384) {
            throw new RequestBodyError("Request body too large", 413);
        }

        chunks.push(buffer);
    }

    const body = Buffer.concat(chunks).toString("utf8");

    if (!body) {
        return {};
    }

    try {
        const parsed: unknown = JSON.parse(body);
        return parsed;
    } catch {
        throw new RequestBodyError("Invalid JSON", 400);
    }
}

export interface ServerMetrics {
    players: number;
    rooms: number;
    messagesPerSecond: number;
    bytesPerSecond: number;
    tickDurationMs: number;
    eventLoopUtilization: number;
    memoryUsageBytes: number;
    uptimeSeconds: number;
}

export async function handleApi(
    req: IncomingMessage,
    res: ServerResponse,
    isReady = true,
    getMetrics?: () => ServerMetrics
): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/ready") {
        sendJson(res, isReady ? 200 : 503, {
            status: isReady ? "ready" : "not_ready"
        });
        return;
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
        if (!getMetrics) {
            sendJson(res, 503, { error: "Metrics unavailable" });
            return;
        }

        sendJson(res, 200, getMetrics());
        return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { status: "ok" });
        return;
    }

    if (req.method === "GET" && url.pathname === "/api/rooms") {
        sendJson(res, 200, {
            rooms: Array.from(rooms.values(), room => room.toJSON())
        });
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/rooms") {
        try {
            const body = await readJson(req);
            const result = createRoomSchema.safeParse(body);

            if (!result.success) {
                sendJson(res, 400, {
                    error: "Назва кімнати має містити від 1 до 40 символів."
                });
                return;
            }

            if (rooms.size >= config.maxRooms) {
                sendJson(res, 503, {
                    error: "Досягнуто максимальної кількості кімнат."
                });
                return;
            }

            const room = new Room({
                id: `room-${nextRoomId++}`,
                name: result.data.name,
                maxPlayers: config.maxPlayersPerRoom
            });

            rooms.set(room.id, room);

            sendJson(res, 201, {
                room: room.toJSON()
            });
            return;
        } catch (error: unknown) {
            const statusCode = error instanceof RequestBodyError
                ? error.statusCode
                : 400;

            sendJson(res, statusCode, {
                error: statusCode === 413
                    ? "Тіло запиту завелике."
                    : "Не вдалося обробити запит."
            });
            return;
        }
    }

    sendJson(res, 404, {
        error: "Маршрут не знайдено."
    });
}
