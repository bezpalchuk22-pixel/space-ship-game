
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

export interface RoomPlayer {
    readonly id: string;
    readonly name: string;
    readonly socket: WebSocket;
}

export interface RoomOptions {
    readonly id?: string;
    readonly name: string;
    readonly maxPlayers?: number;
}

export interface AddPlayerOptions {
    readonly id?: string;
    readonly name: string;
    readonly socket: WebSocket;
}

export interface RoomPlayerEvent {
    readonly roomId: string;
    readonly player: {
        readonly id: string;
        readonly name: string;
    };
}

export interface RoomEmptyEvent {
    readonly roomId: string;
}

export interface RoomInfo {
    readonly id: string;
    readonly name: string;
    readonly players: number;
    readonly maxPlayers: number;
}

export class Room extends EventEmitter {
    readonly id: string;
    readonly name: string;
    readonly maxPlayers: number;

    readonly players = new Map<string, RoomPlayer>();

    constructor({
        id = randomUUID(),
        name,
        maxPlayers = 4
    }: RoomOptions) {
        super();

        if (typeof name !== "string" || !name.trim()) {
            throw new Error("Потрібно вказати назву кімнати");
        }

        this.id = String(id);
        this.name = name.trim();
        this.maxPlayers = maxPlayers;
    }

    addPlayer({
        id = randomUUID(),
        name,
        socket
    }: AddPlayerOptions): RoomPlayer {
        if (typeof name !== "string" || !name.trim()) {
            throw new Error("Потрібно вказати ім'я гравця");
        }

        if (this.players.has(id)) {
            throw new Error("Гравець уже перебуває в кімнаті");
        }

        if (this.players.size >= this.maxPlayers) {
            throw new Error("Кімната заповнена");
        }

        const player: RoomPlayer = {
            id,
            name: name.trim().slice(0, 24),
            socket
        };

        this.players.set(id, player);

        const event: RoomPlayerEvent = {
            roomId: this.id,
            player: {
                id: player.id,
                name: player.name
            }
        };

        this.emit("playerJoined", event);

        return player;
    }

    removePlayer(id: string): boolean {
        const player = this.players.get(id);

        if (!player) return false;

        this.players.delete(id);

        const event: RoomPlayerEvent = {
            roomId: this.id,
            player: {
                id: player.id,
                name: player.name
            }
        };

        this.emit("playerLeft", event);

        if (this.players.size === 0) {
            const emptyEvent: RoomEmptyEvent = {
                roomId: this.id
            };

            this.emit("empty", emptyEvent);
        }

        return true;
    }

    broadcast(
        message: unknown,
        exceptId: string | null = null
    ): void {
        const data = JSON.stringify(message);

        for (const [id, player] of this.players) {
            if (id === exceptId) continue;

            const socket = player.socket;

            if (socket.readyState !== 1) continue;
            if (socket.bufferedAmount > 256 * 1024) continue;

            socket.send(data);
        }
    }

    toJSON(): RoomInfo {
        return {
            id: this.id,
            name: this.name,
            players: this.players.size,
            maxPlayers: this.maxPlayers
        };
    }
}
