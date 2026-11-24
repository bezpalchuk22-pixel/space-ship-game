import { allowMessage } from "./rateLimit.js";
import { GameSimulation } from "./game/GameSimulation.js";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { randomUUID } from "node:crypto";
import { Room } from "./rooms/Room.js";

import {
    decodeInput,
    encodeSnapshot
} from "../../shared/BinaryProtocol.js";

import type { InputPacket } from "../../shared/BinaryProtocol.js";
import type { GameSnapshot, PlayerId } from "../../shared/Types.js";
import {
    toPlayerId,
    toSequenceNumber
} from "../../shared/Types.js";

import { z } from "zod";

const MAX_MESSAGE_SIZE = 4096;
const MAX_BUFFERED_AMOUNT = 256 * 1024;
const MAX_MESSAGES_PER_SECOND = 60;
const JOIN_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 15000;

const clientMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("net-ping"),
        id: z.union([z.string(), z.number()]),
        clientTime: z.number().finite()
    }),
    z.object({
        type: z.literal("join"),
        roomId: z.string().min(1),
        name: z.string().trim().min(1).max(24),
        protocolMode: z.enum(["json", "binary"]).optional()
    }),
    z.object({
        type: z.literal("input"),
        seq: z.number().int().min(0).max(0xFFFFFFFF),
        throttle: z.number().min(-1).max(1),
        turn: z.number().min(-1).max(1),
        shoot: z.boolean()
    }),
    z.object({
        type: z.literal("chat"),
        text: z.string().trim().min(1).max(500)
    }),
    z.object({
        type: z.literal("leave")
    })
]);

type ClientMessage = z.infer<typeof clientMessageSchema>;

export function parseClientMessage(value: unknown): ClientMessage | null {
    const result = clientMessageSchema.safeParse(value);

    if (!result.success) {
        return null;
    }

    return result.data;
}

interface Client {
    readonly id: PlayerId;
    readonly socket: WebSocket;
    name: string | null;
    roomId: string | null;
    protocolMode: "json" | "binary";
    alive: boolean;
    messageTimes: number[];
}

type LogMessage = (entry: Record<string, unknown>) => void;
type RoomsMap = Map<string, Room>;

function rawDataToBuffer(raw: RawData): Buffer {
    if (Buffer.isBuffer(raw)) {
        return raw;
    }

    if (Array.isArray(raw)) {
        return Buffer.concat(raw);
    }

    if (raw instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(raw));
    }

    return Buffer.from(raw);
}

export function attachWebSocket(
    server: import("node:http").Server,
    rooms: RoomsMap,
    logMessage: LogMessage = () => { }
) {
    const wss = new WebSocketServer({
        server,
        path: "/ws",
        maxPayload: MAX_MESSAGE_SIZE
    });

    wss.on("error", (error: Error) => {
        console.error("[WS] Помилка WebSocket-сервера:", error.message);
    });

    const clients = new Map<WebSocket, Client>();
    const simulations = new Map<string, GameSimulation>();

    function startRoomSimulation(room: Room): GameSimulation {
        let simulation = simulations.get(room.id);

        if (!simulation) {
            simulation = new GameSimulation(room.id);
            simulations.set(room.id, simulation);

            console.log("[WS] Створено симуляцію:", room.id);
        }

        return simulation;
    }

    function stopRoomSimulation(roomId: string): void {
        const simulation = simulations.get(roomId);

        if (simulation) {
            simulation.stop();
            simulations.delete(roomId);

            console.log("[WS] Симуляцію зупинено:", roomId);
        }
    }

    function send(socket: WebSocket, message: unknown): void {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) return;

        socket.send(JSON.stringify(message));
    }

    function sendBinary(socket: WebSocket, data: ArrayBuffer): void {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) return;

        socket.send(data, { binary: true });
    }

    function broadcastSnapshot(
        room: Room,
        snapshot: GameSnapshot
    ): void {
        let binarySnapshot: ArrayBuffer | null = null;

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

    function handleInput(client: Client, input: InputPacket): void {
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

    function leaveRoom(client: Client): void {
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

    wss.on("connection", (socket: WebSocket) => {
        console.log("[WS] Нове підключення");

        const client: Client = {
            id: toPlayerId(randomUUID()),
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

        socket.on("message", (raw: RawData, isBinary: boolean) => {
            try {
                const payload = rawDataToBuffer(raw);

                if (payload.byteLength > MAX_MESSAGE_SIZE) {
                    socket.close(1009, "Message too large");
                    return;
                }

                const now = Date.now();

                if (!allowMessage(
                    client.messageTimes,
                    now,
                    MAX_MESSAGES_PER_SECOND,
                    1000
                )) {
                    socket.close(4008, "Rate limit exceeded");
                    return;
                }

                if (isBinary) {
                    if (client.protocolMode !== "binary") {
                        socket.close(1003, "Binary protocol not enabled");
                        return;
                    }

                    const input = decodeInput(payload);
                    handleInput(client, input);
                    return;
                }

                const jsonValue: unknown = JSON.parse(
                    payload.toString("utf8")
                );

                const message = parseClientMessage(jsonValue);

                if (!message) {
                    console.error("[WS] Некоректне JSON-повідомлення");
                    socket.close(1007, "Invalid message");
                    return;
                }

                console.log("[WS] Отримано повідомлення:", message.type);

                switch (message.type) {
                    case "net-ping": {
                        send(socket, {
                            type: "net-pong",
                            id: message.id,
                            clientTime: message.clientTime,
                            serverTime: Date.now()
                        });
                        return;
                    }

                    case "join": {
                        if (client.roomId) {
                            send(socket, {
                                type: "error",
                                message: "Ти вже перебуваєш у кімнаті."
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

                        client.name = message.name;
                        client.protocolMode = message.protocolMode ?? "json";

                        try {
                            room.addPlayer({
                                id: client.id,
                                name: client.name,
                                socket
                            });
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error
                                ? error.message
                                : "Невідома помилка додавання гравця.";

                            console.error(
                                "[WS] Помилка додавання гравця:",
                                errorMessage
                            );

                            send(socket, {
                                type: "error",
                                message: errorMessage
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

                        simulation.start((snapshot: GameSnapshot) => {
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

                    case "input": {
                        if (client.protocolMode === "binary") {
                            send(socket, {
                                type: "error",
                                message: "У цьому режимі потрібна бінарна команда."
                            });
                            return;
                        }

                        const input: InputPacket = {
                            seq: toSequenceNumber(message.seq),
                            throttle: message.throttle,
                            turn: message.turn,
                            shoot: message.shoot
                        };

                        handleInput(client, input);
                        return;
                    }

                    case "chat": {
                        if (!client.roomId) {
                            send(socket, {
                                type: "error",
                                message: "Спочатку приєднайся до кімнати."
                            });
                            return;
                        }

                        const room = rooms.get(client.roomId);
                        const text = message.text;

                        room?.broadcast({
                            type: "chat",
                            name: client.name,
                            text,
                            timestamp: new Date().toISOString()
                        });

                        logMessage({
                            event: "chat",
                            roomId: client.roomId,
                            playerId: client.id,
                            text,
                            timestamp: new Date().toISOString()
                        });

                        return;
                    }

                    case "leave": {
                        leaveRoom(client);
                        send(socket, { type: "left" });
                        return;
                    }

                    default: {
                        const exhaustiveCheck: never = message;
                        return exhaustiveCheck;
                    }
                }
            } catch (error: unknown) {
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

        socket.on("error", (error: Error) => {
            console.error("[WS] Помилка клієнта:", error.message);
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

    wss.on("close", () => {
        clearInterval(pingTimer);

        for (const simulation of simulations.values()) {
            simulation.stop();
        }

        simulations.clear();
    });

    const DEFAULT_ROOM_IDS: ReadonlySet<string> = new Set([
        "room-1",
        "room-2",
        "room-3",
        "room-4",
        "room-5"
    ]);

    for (const room of rooms.values()) {
        if (room instanceof Room) {
            room.on("empty", (event: { roomId: string }) => {
                stopRoomSimulation(event.roomId);

                if (!DEFAULT_ROOM_IDS.has(event.roomId)) {
                    rooms.delete(event.roomId);
                }
            });
        }
    }

    return {
        wss,

        close(): void {
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
