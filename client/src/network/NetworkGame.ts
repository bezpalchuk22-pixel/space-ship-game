
import { SocketClient } from "./SocketClient.ts";
import {
    encodeInput,
    decodeSnapshot
} from "../../../shared/BinaryProtocol.ts";
import {
    toSequenceNumber
} from "../../../shared/Types.ts";
import type {
    GameSnapshot,
    SequenceNumber,
    ShipInput
} from "../../../shared/Types.ts";

type ProtocolMode = "json" | "binary";

interface InputCommand {
    readonly seq: SequenceNumber;
    readonly throttle: number;
    readonly turn: number;
    readonly shoot: boolean;
}

interface NetworkStats {
    readonly rtt: number;
    readonly snapshotAge: number;
    readonly bytesSent: number;
    readonly bytesReceived: number;
    readonly bytesPerSecondSent: number;
    readonly bytesPerSecondReceived: number;
    readonly inputQueue: number;
    readonly correctionSize: number;
    readonly ackSeq: number;
    readonly seq: number;
}

interface NetworkMessage {
    readonly type: string;
    readonly [key: string]: unknown;
}

interface JoinedMessage extends NetworkMessage {
    readonly type: "joined";
    readonly playerId: string;
}

interface PongMessage extends NetworkMessage {
    readonly type: "net-pong";
    readonly id: number;
}

interface NetworkGameEventMap {
    open: Event;
    close: Event;
    networkError: CustomEvent<{ readonly message: string }>;
    joined: CustomEvent<JoinedMessage>;
    snapshot: CustomEvent<GameSnapshot>;
    networkStats: CustomEvent<NetworkStats>;
    error: CustomEvent<NetworkMessage>;
    chat: CustomEvent<NetworkMessage>;
    system: CustomEvent<NetworkMessage>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function isNetworkMessage(value: unknown): value is NetworkMessage {
    return (
        isRecord(value) &&
        typeof value.type === "string"
    );
}

function isJoinedMessage(value: NetworkMessage): value is JoinedMessage {
    return (
        value.type === "joined" &&
        typeof value.playerId === "string"
    );
}

function isPongMessage(value: NetworkMessage): value is PongMessage {
    return (
        value.type === "net-pong" &&
        typeof value.id === "number"
    );
}

function isGameSnapshot(value: unknown): value is GameSnapshot {
    if (!isRecord(value)) {
        return false;
    }

    return (
        value.type === "snapshot" &&
        typeof value.tick === "number" &&
        Number.isInteger(value.tick) &&
        typeof value.serverTime === "number" &&
        Array.isArray(value.players) &&
        Array.isArray(value.asteroids) &&
        Array.isArray(value.pickups) &&
        Array.isArray(value.bullets)
    );
}

export class NetworkGame extends EventTarget {
    readonly socket: SocketClient;

    playerId: string | null = null;
    roomId: string | null = null;

    seq = 0;
    ackSeq = 0;

    lastSnapshot: GameSnapshot | null = null;
    pendingInputs: InputCommand[] = [];

    connected = false;
    joined = false;

    protocolMode: ProtocolMode = "binary";

    rtt = 0;
    snapshotAge = 0;
    bytesSent = 0;
    bytesReceived = 0;
    inputQueue = 0;
    correctionSize = 0;

    private lastSnapshotAt = 0;
    private lastStatsAt = performance.now();

    private lastBytesSent = 0;
    private lastBytesReceived = 0;

    bytesPerSecondSent = 0;
    bytesPerSecondReceived = 0;

    private pingId = 0;
    private pendingPings = new Map<number, number>();

    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private statsTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        super();

        this.socket = new SocketClient();

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

    setProtocolMode(mode: ProtocolMode): void {
        if (mode !== "json" && mode !== "binary") {
            throw new Error("Невідомий режим мережевого протоколу");
        }

        this.protocolMode = mode;
    }

    connect(): void {
        this.socket.connect();
    }

    join(roomId: string, playerName: string): void {
        this.roomId = String(roomId);

        this.socket.send({
            type: "join",
            roomId: this.roomId,
            name: playerName,
            protocolMode: this.protocolMode
        });
    }

    startMonitoring(): void {
        this.stopMonitoring();

        this.pingTimer = setInterval(() => {
            if (!this.connected) {
                return;
            }

            const id = ++this.pingId;
            const clientTime = performance.now();

            this.pendingPings.set(id, clientTime);

            this.socket.send({
                type: "net-ping",
                id,
                clientTime
            });

            if (this.pendingPings.size > 10) {
                const oldestId = this.pendingPings.keys().next().value;

                if (oldestId !== undefined) {
                    this.pendingPings.delete(oldestId);
                }
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

    stopMonitoring(): void {
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

    private countSent(data: unknown): void {
        this.bytesSent += this.getByteLength(data);
    }

    private countReceived(data: unknown): void {
        this.bytesReceived += this.getByteLength(data);
    }

    private getByteLength(data: unknown): number {
        if (data instanceof ArrayBuffer) {
            return data.byteLength;
        }

        if (ArrayBuffer.isView(data)) {
            return data.byteLength;
        }

        const serialized = JSON.stringify(data);

        return new TextEncoder().encode(serialized ?? "").byteLength;
    }

    private dispatchStats(): void {
        const detail: NetworkStats = {
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
        };

        this.dispatchEvent(
            new CustomEvent<NetworkStats>("networkStats", {
                detail
            })
        );
    }

    sendInput(input: ShipInput): boolean {
        if (!this.joined) {
            return false;
        }

        this.seq += 1;

        const command: InputCommand = {
            seq: toSequenceNumber(this.seq),
            throttle: input.throttle,
            turn: input.turn,
            shoot: Boolean(input.shoot)
        };

        let sent: boolean;

        if (this.protocolMode === "binary") {
            const packet = encodeInput(command);

            this.countSent(packet);
            sent = this.socket.send(packet);
        } else {
            const packet = {
                type: "input",
                seq: command.seq,
                throttle: command.throttle,
                turn: command.turn,
                shoot: command.shoot
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

    private handleMessage(message: unknown): void {
        if (!isNetworkMessage(message)) {
            return;
        }

        if (isPongMessage(message)) {
            const sentAt = this.pendingPings.get(message.id);

            if (sentAt !== undefined) {
                this.rtt = performance.now() - sentAt;
                this.pendingPings.delete(message.id);
                this.dispatchStats();
            }

            return;
        }

        if (isJoinedMessage(message)) {
            this.playerId = message.playerId;
            this.joined = true;

            this.dispatchEvent(
                new CustomEvent<JoinedMessage>("joined", {
                    detail: message
                })
            );

            return;
        }

        if (message.type === "snapshot") {
            if (isGameSnapshot(message)) {
                this.processSnapshot(message);
            }

            return;
        }

        if (
            message.type === "error" ||
            message.type === "chat" ||
            message.type === "system"
        ) {
            this.dispatchEvent(
                new CustomEvent<NetworkMessage>(message.type, {
                    detail: message
                })
            );
        }
    }

    private handleBinaryMessage(data: ArrayBuffer): void {
        try {
            const packet = decodeSnapshot(data);
            this.processSnapshot(packet);
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : String(error);

            this.dispatchEvent(
                new CustomEvent("networkError", {
                    detail: {
                        message: `Помилка бінарного пакета: ${message}`
                    }
                })
            );
        }
    }

    private processSnapshot(snapshot: GameSnapshot): void {
        this.lastSnapshot = snapshot;
        this.lastSnapshotAt = performance.now();

        const ownPlayer = snapshot.players.find(
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
            new CustomEvent<GameSnapshot>("snapshot", {
                detail: snapshot
            })
        );

        this.dispatchStats();
    }

    sendChat(text: string): boolean {
        const message = {
            type: "chat",
            text
        };

        this.countSent(message);

        return this.socket.send(message);
    }

    leave(): void {
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
        this.lastSnapshot = null;
    }

    close(): void {
        this.stopMonitoring();
        this.leave();
        this.socket.close();
    }
}
