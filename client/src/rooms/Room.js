
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export class Room extends EventEmitter {
    constructor({ id = randomUUID(), name, maxPlayers = 4 }) {
        super();

        this.id = String(id);
        this.name = name.trim();
        this.maxPlayers = maxPlayers;
        this.players = new Map();
    }

    addPlayer({ id = randomUUID(), name, socket }) {
        if (!name?.trim()) {
            throw new Error("Потрібно вказати ім'я гравця");
        }

        if (this.players.has(id)) {
            throw new Error("Гравець уже перебуває в кімнаті");
        }

        if (this.players.size >= this.maxPlayers) {
            throw new Error("Кімната заповнена");
        }

        const player = {
            id,
            name: name.trim().slice(0, 24),
            socket
        };

        this.players.set(id, player);

        this.emit("playerJoined", {
            roomId: this.id,
            player: { id: player.id, name: player.name }
        });

        return player;
    }

    removePlayer(id) {
        const player = this.players.get(id);

        if (!player) return false;

        this.players.delete(id);

        this.emit("playerLeft", {
            roomId: this.id,
            player: { id: player.id, name: player.name }
        });

        if (this.players.size === 0) {
            this.emit("empty", { roomId: this.id });
        }

        return true;
    }

    broadcast(message, exceptId = null) {
        const data = JSON.stringify(message);

        for (const [id, player] of this.players) {
            if (id === exceptId) continue;

            const socket = player.socket;

            if (socket.readyState !== 1) continue;
            if (socket.bufferedAmount > 256 * 1024) continue;

            socket.send(data);
        }
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            players: this.players.size,
            maxPlayers: this.maxPlayers
        };
    }
}
