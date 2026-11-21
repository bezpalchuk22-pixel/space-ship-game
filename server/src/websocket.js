
import { GameSimulation } from "./game/GameSimulation.js";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { Room } from "./rooms/Room.js";

import {
    decodeInput,
    encodeSnapshot
} from "../../shared/BinaryProtocol.js";

const MAX_MESSAGE_SIZE = 4096;
const MAX_BUFFERED_AMOUNT = 256 * 1024;
const MAX_MESSAGES_PER_SECOND = 60;
const JOIN_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 15000;

export function attachWebSocket(server, rooms, logMessage = () => { }) {
    const wss = new WebSocketServer({
        server,
        path: "/ws",
        maxPayload: MAX_MESSAGE_SIZE
    });

    wss.on("error", error => {
        console.error("[WS] Помилка WebSocket-сервера:", error.message);
    });

    const clients = new Map();
    const simulations = new Map();

    function startRoomSimulation(room) {
        let simulation = simulations.get(room.id);

        if (!simulation) {
            simulation = new GameSimulation(room.id);
            simulations.set(room.id, simulation);

            console.log("[WS] Створено симуляцію:", room.id);
        }

        return simulation;
    }

    function stopRoomSimulation(roomId) {
        const simulation = simulations.get(roomId);

        if (simulation) {
            simulation.stop();
            simulations.delete(roomId);

            console.log("[WS] Симуляцію зупинено:", roomId);
        }
    }

    function send(socket, message) {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) return;

        socket.send(JSON.stringify(message));
    }

    function sendBinary(socket, data) {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) return;

        socket.send(data, { binary: true });
    }

    function broadcastSnapshot(room, snapshot) {
        // Кодуємо snapshot один раз для всіх клієнтів Binary.
        let binarySnapshot = null;

        for (const player of room.players.values()) {
            const client = clients.get(player.socket);

            if (!client) continue;

            if (client.protocolMode === "binary") {
                if (!binarySnapshot) {
                    binarySnapshot = encodeSnapshot(snapshot);
                }

                sendBinary(client.socket, binarySnapshot);
            } else {
                send(client.socket, snapshot);
            }
        }
    }

    function handleInput(client, input) {
        if (!client.roomId) {
            send(client.socket, {
                type: "error",
                message: "Спочатку приєднайся до кімнати."
            });

            return;
        }

        const simulation = simulations.get(client.roomId);

        if (!simulation) return;

        const accepted = simulation.handleInput(client.id, input);

        if (!accepted) {
            send(client.socket, {
                type: "error",
                message: "Некоректна або застаріла ігрова команда."
            });
        }
    }

    function leaveRoom(client) {
        if (!client.roomId) return;

        const roomId = client.roomId;
        const room = rooms.get(roomId);
        const simulation = simulations.get(roomId);

        if (simulation) {
            simulation.removePlayer(client.id);
        }

        if (room) {
            room.removePlayer(client.id);

            console.log(
                "[WS] Гравець вийшов:",
                client.name,
                "| Кімната:",
                roomId,
                "| Залишилося:",
                room.players.size
            );

            if (room.players.size === 0) {
                stopRoomSimulation(roomId);
            }
        }

        client.roomId = null;
    }

    wss.on("connection", socket => {
        console.log("[WS] Нове підключення");

        const client = {
            id: randomUUID(),
            socket,
            name: null,
            roomId: null,
            protocolMode: "json",
            alive: true,
            messageTimes: []
        };

        clients.set(socket, client);

        const joinTimer = setTimeout(() => {
            if (!client.roomId && socket.readyState === WebSocket.OPEN) {
                console.log("[WS] Тайм-аут приєднання:", client.id);
                socket.close(4001, "Join timeout");
            }
        }, JOIN_TIMEOUT_MS);

        socket.on("pong", () => {
            client.alive = true;
        });

        socket.on("message", (raw, isBinary) => {
            try {
                if (raw.length > MAX_MESSAGE_SIZE) {
                    socket.close(1009, "Message too large");
                    return;
                }

                const now = Date.now();

                client.messageTimes = client.messageTimes.filter(
                    time => now - time < 1000
                );

                if (
                    client.messageTimes.length >=
                    MAX_MESSAGES_PER_SECOND
                ) {
                    socket.close(4008, "Rate limit exceeded");
                    return;
                }

                client.messageTimes.push(now);

                // Бінарна команда гравця.
                if (isBinary) {
                    if (client.protocolMode !== "binary") {
                        socket.close(1003, "Binary protocol not enabled");
                        return;
                    }

                    const input = decodeInput(raw);

                    handleInput(client, input);
                    return;
                }

                // Звичайне JSON-повідомлення.
                const message = JSON.parse(raw.toString());

                if (
                    !message ||
                    typeof message !== "object" ||
                    Array.isArray(message)
                ) {
                    socket.close(1007, "Invalid message");
                    return;
                }

                console.log("[WS] Отримано повідомлення:", message.type);
                // Вимірювання RTT клієнта.
                if (message.type === "net-ping") {
                    send(socket, {
                        type: "net-pong",
                        id: message.id,
                        clientTime: message.clientTime,
                        serverTime: Date.now()
                    });

                    return;
                }
                // Приєднання до кімнати.
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

                    const requestedMode =
                        message.protocolMode ?? "json";

                    if (
                        requestedMode !== "json" &&
                        requestedMode !== "binary"
                    ) {
                        send(socket, {
                            type: "error",
                            message: "Невідомий режим мережевого протоколу."
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
                    client.protocolMode = requestedMode;

                    try {
                        room.addPlayer({
                            id: client.id,
                            name: client.name,
                            socket
                        });
                    } catch (error) {
                        console.error(
                            "[WS] Помилка додавання гравця:",
                            error.message
                        );

                        send(socket, {
                            type: "error",
                            message: error.message
                        });

                        return;
                    }

                    client.roomId = room.id;
                    clearTimeout(joinTimer);

                    console.log(
                        "[WS] Гравців у кімнаті:",
                        room.id,
                        room.players.size,
                        "| Протокол:",
                        client.protocolMode
                    );

                    const simulation = startRoomSimulation(room);
                    simulation.addPlayer(client.id);

                    simulation.start(snapshot => {
                        broadcastSnapshot(room, snapshot);
                    });

                    send(socket, {
                        type: "joined",
                        room: room.toJSON(),
                        playerId: client.id,
                        protocolMode: client.protocolMode
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
                        protocolMode: client.protocolMode,
                        timestamp: new Date().toISOString()
                    });

                    return;
                }

                // JSON-команда гравця.
                if (message.type === "input") {
                    if (client.protocolMode === "binary") {
                        send(socket, {
                            type: "error",
                            message: "У цьому режимі потрібна бінарна команда."
                        });

                        return;
                    }

                    handleInput(client, message);
                    return;
                }

                // Чат.
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

                // Вихід із кімнати.
                if (message.type === "leave") {
                    leaveRoom(client);
                    send(socket, { type: "left" });
                    return;
                }

                send(socket, {
                    type: "error",
                    message: "Невідомий тип повідомлення."
                });

            } catch (error) {
                console.error(
                    "[WS] Помилка обробки повідомлення:",
                    error
                );

                socket.close(1007, "Invalid message");
            }
        });

        socket.on("close", (code, reason) => {
            console.log(
                "[WS] З'єднання закрито:",
                code,
                reason.toString()
            );

            clearTimeout(joinTimer);
            leaveRoom(client);
            clients.delete(socket);
        });

        socket.on("error", error => {
            console.error("[WS] Помилка клієнта:", error.message);
        });

        send(socket, {
            type: "connected",
            message: "WebSocket-з'єднання встановлено."
        });
    });

    // Перевірка активності WebSocket-з'єднань.
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

    wss.on("close", () => {
        clearInterval(pingTimer);

        for (const simulation of simulations.values()) {
            simulation.stop();
        }

        simulations.clear();
    });

    const DEFAULT_ROOM_IDS = new Set([
        "room-1",
        "room-2",
        "room-3",
        "room-4",
        "room-5"
    ]);

    for (const room of rooms.values()) {
        if (room instanceof Room) {
            room.on("empty", ({ roomId }) => {
                stopRoomSimulation(roomId);

                if (!DEFAULT_ROOM_IDS.has(roomId)) {
                    rooms.delete(roomId);
                }
            });
        }
    }

    return {
        wss,

        close() {
            clearInterval(pingTimer);

            for (const simulation of simulations.values()) {
                simulation.stop();
            }

            simulations.clear();

            for (const socket of wss.clients) {
                socket.close(1001, "Server shutting down");
            }

            wss.close();
        }
    };
}
