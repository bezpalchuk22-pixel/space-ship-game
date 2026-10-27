
import { Room } from "../rooms/Room.js";

export const rooms = new Map([
    new Room({
        id: "room-1",
        name: "Космічна битва"
    }),
    new Room({
        id: "room-2",
        name: "Галактична арена"
    }),
    new Room({
        id: "room-3",
        name: "Орбіта перемоги"
    }),
    new Room({
        id: "room-4",
        name: "Зоряний флот"
    }),
    new Room({
        id: "room-5",
        name: "Туманність"
    })
].map(room => [room.id, room]));

let nextRoomId = 6;

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify(data));
}

async function readJson(req) {
    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
        size += chunk.length;

        if (size > 16384) {
            const error = new Error("Request body too large");
            error.statusCode = 413;
            throw error;
        }

        chunks.push(chunk);
    }

    const body = Buffer.concat(chunks).toString("utf8");

    return body ? JSON.parse(body) : {};
}

export async function handleApi(req, res) {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { status: "ok" });
    }

    if (req.method === "GET" && url.pathname === "/api/rooms") {
        return sendJson(res, 200, {
            rooms: Array.from(rooms.values(), room => room.toJSON())
        });
    }

    if (req.method === "POST" && url.pathname === "/api/rooms") {
        try {
            const body = await readJson(req);
            const name = typeof body.name === "string"
                ? body.name.trim()
                : "";

            if (!name || name.length > 40) {
                return sendJson(res, 400, {
                    error: "Назва кімнати має містити від 1 до 40 символів."
                });
            }

            const room = new Room({
                id: `room-${nextRoomId++}`,
                name
            });

            rooms.set(room.id, room);

            return sendJson(res, 201, {
                room: room.toJSON()
            });
        } catch (error) {
            const statusCode = error.statusCode === 413 ? 413 : 400;

            return sendJson(res, statusCode, {
                error: statusCode === 413
                    ? "Тіло запиту завелике."
                    : "Не вдалося обробити запит."
            });
        }
    }

    return sendJson(res, 404, {
        error: "Маршрут не знайдено."
    });
}
