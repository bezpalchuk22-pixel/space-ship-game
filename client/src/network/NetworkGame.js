
import { SocketClient } from "./SocketClient.js";
import {
    encodeInput,
    decodeSnapshot
} from "../../../shared/BinaryProtocol.js";

export class NetworkGame extends EventTarget {
    constructor() {
        super();

        this.socket = new SocketClient();

        this.playerId = null;
        this.roomId = null;

        this.seq = 0;
        this.ackSeq = 0;
        this.lastSnapshot = null;
        this.pendingInputs = [];

        this.connected = false;
        this.joined = false;
        this.protocolMode = "binary";

        this.rtt = 0;
        this.snapshotAge = 0;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.inputQueue = 0;
        this.correctionSize = 0;

        this.lastSnapshotAt = 0;
        this.lastStatsAt = performance.now();
        this.lastBytesSent = 0;
        this.lastBytesReceived = 0;
        this.bytesPerSecondSent = 0;
        this.bytesPerSecondReceived = 0;

        this.pingId = 0;
        this.pendingPings = new Map();
        this.pingTimer = null;
        this.statsTimer = null;

        this.socket.addEventListener("open", () => {
            this.connected = true;
            this.startMonitoring();
            this.dispatchEvent(new Event("open"));
        });

        this.socket.addEventListener("close", () => {
            this.connected = false;
            this.joined = false;
            this.stopMonitoring();
            this.dispatchEvent(new Event("close"));
        });

        this.socket.addEventListener("socketError", event => {
            this.dispatchEvent(
                new CustomEvent("networkError", {
                    detail: event.detail
                })
            );
        });

        this.socket.addEventListener("message", event => {
            const message = event.detail;
            this.countReceived(message);

            this.handleMessage(message);
        });

        this.socket.addEventListener("binaryMessage", event => {
            const data = event.detail;
            this.countReceived(data);

            this.handleBinaryMessage(data);
        });
    }

    setProtocolMode(mode) {
        if (mode !== "json" && mode !== "binary") {
            throw new Error("Невідомий режим мережевого протоколу");
        }

        this.protocolMode = mode;
    }

    connect() {
        this.socket.connect();
    }

    join(roomId, playerName) {
        this.roomId = String(roomId);

        this.socket.send({
            type: "join",
            roomId: this.roomId,
            name: playerName,
            protocolMode: this.protocolMode
        });
    }

    startMonitoring() {
        this.stopMonitoring();

        this.pingTimer = setInterval(() => {
            if (!this.connected) return;

            const id = ++this.pingId;
            const clientTime = performance.now();

            this.pendingPings.set(id, clientTime);

            this.socket.send({
                type: "net-ping",
                id,
                clientTime
            });

            // Не зберігаємо застарілі ping.
            if (this.pendingPings.size > 10) {
                const oldestId = this.pendingPings.keys().next().value;
                this.pendingPings.delete(oldestId);
            }
        }, 1000);

        this.statsTimer = setInterval(() => {
            const now = performance.now();
            const elapsed = (now - this.lastStatsAt) / 1000;

            if (elapsed > 0) {
                this.bytesPerSecondSent =
                    (this.bytesSent - this.lastBytesSent) / elapsed;

                this.bytesPerSecondReceived =
                    (this.bytesReceived - this.lastBytesReceived) / elapsed;
            }

            this.lastBytesSent = this.bytesSent;
            this.lastBytesReceived = this.bytesReceived;
            this.lastStatsAt = now;

            this.snapshotAge = this.lastSnapshotAt
                ? now - this.lastSnapshotAt
                : 0;

            this.dispatchStats();
        }, 100);
    }

    stopMonitoring() {
        if (this.pingTimer !== null) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        if (this.statsTimer !== null) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }

        this.pendingPings.clear();
    }

    countSent(data) {
        if (data instanceof ArrayBuffer) {
            this.bytesSent += data.byteLength;
        } else if (ArrayBuffer.isView(data)) {
            this.bytesSent += data.byteLength;
        } else {
            this.bytesSent += new TextEncoder().encode(
                JSON.stringify(data)
            ).byteLength;
        }
    }

    countReceived(data) {
        if (data instanceof ArrayBuffer) {
            this.bytesReceived += data.byteLength;
        } else if (ArrayBuffer.isView(data)) {
            this.bytesReceived += data.byteLength;
        } else {
            this.bytesReceived += new TextEncoder().encode(
                JSON.stringify(data)
            ).byteLength;
        }
    }

    dispatchStats() {
        this.dispatchEvent(
            new CustomEvent("networkStats", {
                detail: {
                    rtt: this.rtt,
                    snapshotAge: this.snapshotAge,
                    bytesSent: this.bytesSent,
                    bytesReceived: this.bytesReceived,
                    bytesPerSecondSent: this.bytesPerSecondSent,
                    bytesPerSecondReceived: this.bytesPerSecondReceived,
                    inputQueue: this.inputQueue,
                    correctionSize: this.correctionSize,
                    ackSeq: this.ackSeq,
                    seq: this.seq
                }
            })
        );
    }

    sendInput(input) {
        if (!this.joined) return false;

        this.seq += 1;

        const command = {
            seq: this.seq,
            throttle: input.throttle,
            turn: input.turn,
            shoot: Boolean(input.shoot)
        };

        let sent;

        if (this.protocolMode === "binary") {
            const packet = encodeInput(command);
            this.countSent(packet);
            sent = this.socket.send(packet);
        } else {
            const packet = {
                type: "input",
                ...command
            };
            this.countSent(packet);
            sent = this.socket.send(packet);
        }
        if (sent) {
            this.pendingInputs.push(command);
        }

        this.inputQueue = this.pendingInputs.length;
        this.dispatchStats();

        return sent;
    }

    handleMessage(message) {
        if (!message || typeof message.type !== "string") {
            return;
        }

        if (message.type === "net-pong") {
            const sentAt = this.pendingPings.get(message.id);

            if (sentAt !== undefined) {
                this.rtt = performance.now() - sentAt;
                this.pendingPings.delete(message.id);
                this.dispatchStats();
            }

            return;
        }

        if (message.type === "joined") {
            this.playerId = message.playerId;
            this.joined = true;

            this.dispatchEvent(
                new CustomEvent("joined", {
                    detail: message
                })
            );

            return;
        }

        if (message.type === "snapshot") {
            this.processSnapshot(message);
            return;
        }

        if (
            message.type === "error" ||
            message.type === "chat" ||
            message.type === "system"
        ) {
            this.dispatchEvent(
                new CustomEvent(message.type, {
                    detail: message
                })
            );
        }
    }

    handleBinaryMessage(data) {
        try {
            const packet = decodeSnapshot(data);
            this.processSnapshot(packet);
        } catch (error) {
            this.dispatchEvent(
                new CustomEvent("networkError", {
                    detail: {
                        message: `Помилка бінарного пакета: ${error.message}`
                    }
                })
            );
        }
    }

    processSnapshot(snapshot) {
        this.lastSnapshot = snapshot;
        this.lastSnapshotAt = performance.now();

        const ownPlayer = snapshot.players?.find(
            player => player.id === this.playerId
        );

        if (ownPlayer && Number.isInteger(ownPlayer.seq)) {
            this.ackSeq = Math.max(this.ackSeq, ownPlayer.seq);

            this.pendingInputs = this.pendingInputs.filter(
                input => input.seq > this.ackSeq
            );

            this.inputQueue = this.pendingInputs.length;
        }

        this.dispatchEvent(
            new CustomEvent("snapshot", {
                detail: snapshot
            })
        );

        this.dispatchStats();
    }

    sendChat(text) {
        const message = {
            type: "chat",
            text
        };

        this.countSent(message);
        return this.socket.send(message);
    }

    leave() {
        if (this.joined) {
            this.socket.send({
                type: "leave"
            });
        }

        this.joined = false;
        this.playerId = null;
        this.roomId = null;
        this.seq = 0;
        this.ackSeq = 0;
        this.inputQueue = 0;
        this.pendingInputs = [];
    }

    close() {
        this.stopMonitoring();
        this.leave();
        this.socket.close();
    }
}
