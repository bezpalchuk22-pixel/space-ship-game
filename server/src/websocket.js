
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { Room } from "./rooms/Room.js";

const MAX_MESSAGE_SIZE = 4096;
const MAX_BUFFERED_AMOUNT = 256 * 1024;
const MAX_MESSAGES_PER_SECOND = 20;
const JOIN_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 15000;

export function attachWebSocket(server, rooms, logMessage = () => { }) {
    const wss = new WebSocketServer({
        server,
        path: "/ws",
        maxPayload: MAX_MESSAGE_SIZE
    });
    wss.on("error", error => {
        console.error("Помилка WebSocket-сервера:", error.message);
    });
    const clients = new Map();

    function send(socket, message) {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) return;

        socket.send(JSON.stringify(message));
    }

    function leaveRoom(client) {
        if (!client.roomId) return;

        const room = rooms.get(client.roomId);

        if (room) {
            room.removePlayer(client.id);
        }

        client.roomId = null;
    }

    wss.on("connection", (socket) => {
        const client = {
            id: randomUUID(),
            socket,
            name: null,
            roomId: null,
            alive: true,
            messageTimes: []
        };

        clients.set(socket, client);

        const joinTimer = setTimeout(() => {
            if (!client.roomId && socket.readyState === WebSocket.OPEN) {
                socket.close(4001, "Join timeout");
            }
        }, JOIN_TIMEOUT_MS);

        socket.on("pong", () => {
            client.alive = true;
        });

        socket.on("message", (raw) => {
            try {
                if (raw.length > MAX_MESSAGE_SIZE) {
                    socket.close(1009, "Message too large");
                    return;
                }

                const now = Date.now();

                client.messageTimes = client.messageTimes.filter(
                    time => now - time < 1000
                );

                if (client.messageTimes.length >= MAX_MESSAGES_PER_SECOND) {
                    socket.close(4008, "Rate limit exceeded");
                    return;
                }

                client.messageTimes.push(now);

                const message = JSON.parse(raw.toString());

                if (!message || typeof message !== "object" || Array.isArray(message)) {
                    socket.close(1007, "Invalid message");
                    return;
                }

                if (message.type === "join") {
                    if (client.roomId) {
                        send(socket, {
                            type: "error",
                            message: "Ти вже перебуваєш у кімнаті."
                        });
                        return;
                    }

                    if (
                        typeof message.roomId !== "string" ||
                        typeof message.name !== "string" ||
                        !message.name.trim() ||
                        message.name.length > 24
                    ) {
                        send(socket, {
                            type: "error",
                            message: "Некоректні дані для входу."
                        });
                        return;
                    }

                    const room = rooms.get(message.roomId);

                    if (!room) {
                        send(socket, {
                            type: "error",
                            message: "Кімнату не знайдено."
                        });
                        return;
                    }

                    client.name = message.name.trim();

                    try {
                        room.addPlayer({
                            id: client.id,
                            name: client.name,
                            socket
                        });
                    } catch (error) {
                        send(socket, {
                            type: "error",
                            message: error.message
                        });
                        return;
                    }

                    client.roomId = room.id;
                    clearTimeout(joinTimer);

                    send(socket, {
                        type: "joined",
                        room: room.toJSON(),
                        playerId: client.id
                    });

                    room.broadcast({
                        type: "system",
                        message: `${client.name} приєднався до кімнати.`
                    }, client.id);

                    logMessage({
                        event: "join",
                        roomId: room.id,
                        playerId: client.id,
                        name: client.name,
                        timestamp: new Date().toISOString()
                    });

                    return;
                }

                if (message.type === "chat") {
                    if (!client.roomId) {
                        send(socket, {
                            type: "error",
                            message: "Спочатку приєднайся до кімнати."
                        });
                        return;
                    }

                    if (
                        typeof message.text !== "string" ||
                        !message.text.trim() ||
                        message.text.length > 500
                    ) {
                        send(socket, {
                            type: "error",
                            message: "Повідомлення має містити від 1 до 500 символів."
                        });
                        return;
                    }

                    const room = rooms.get(client.roomId);

                    room?.broadcast({
                        type: "chat",
                        name: client.name,
                        text: message.text.trim(),
                        timestamp: new Date().toISOString()
                    });

                    logMessage({
                        event: "chat",
                        roomId: client.roomId,
                        playerId: client.id,
                        text: message.text.trim(),
                        timestamp: new Date().toISOString()
                    });

                    return;
                }

                if (message.type === "leave") {
                    leaveRoom(client);

                    send(socket, { type: "left" });
                    return;
                }

                send(socket, {
                    type: "error",
                    message: "Невідомий тип повідомлення."
                });
            } catch {
                socket.close(1007, "Invalid message");
            }
        });

        socket.on("close", () => {
            clearTimeout(joinTimer);
            leaveRoom(client);
            clients.delete(socket);
        });

        socket.on("error", (error) => {
            console.error("WebSocket error:", error.message);
        });

        send(socket, {
            type: "connected",
            message: "WebSocket-з'єднання встановлено."
        });
    });

    const pingTimer = setInterval(() => {
        for (const socket of wss.clients) {
            const client = clients.get(socket);

            if (!client) continue;

            if (!client.alive) {
                socket.terminate();
                continue;
            }

            client.alive = false;

            if (socket.readyState === WebSocket.OPEN) {
                socket.ping();
            }
        }
    }, PING_INTERVAL_MS);

    wss.on("close", () => clearInterval(pingTimer));

    for (const room of rooms.values()) {
        if (room instanceof Room) {
            room.on("empty", ({ roomId }) => {
                rooms.delete(roomId);
            });
        }
    }

    return {
        wss,
        close() {
            clearInterval(pingTimer);

            for (const socket of wss.clients) {
                socket.close(1001, "Server shutting down");
            }

            wss.close();
        }
    };
}
