
type NetworkDirection = "outgoing" | "incoming";

interface NetworkConditions {
    readonly latency: number;
    readonly jitter: number;
    readonly loss: number;
}

interface NetworkConditionsInput {
    readonly latency?: number;
    readonly jitter?: number;
    readonly loss?: number;
}

interface SocketClientOptions {
    readonly url?: string;
    readonly maxQueueSize?: number;
}

interface SocketErrorDetail {
    readonly message: string;
}

type OutgoingData = string | ArrayBuffer | ArrayBufferView;

type IncomingMessageDetail = unknown;

type SocketClientEventMap = {
    open: Event;
    close: Event;
    message: CustomEvent<IncomingMessageDetail>;
    binaryMessage: CustomEvent<ArrayBuffer>;
    socketError: CustomEvent<SocketErrorDetail>;
    networkConditionsChange: CustomEvent<NetworkConditions>;
};

type SocketClientListenerMap = {
    [K in keyof SocketClientEventMap]: Set<
        (this: SocketClient, event: SocketClientEventMap[K]) => unknown
    >;
};

export class SocketClient {
    readonly url: string;
    readonly maxQueueSize: number;

    private queue: OutgoingData[] = [];
    private socket: WebSocket | null = null;

    private closedManually = false;
    private retryAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    private networkConditions: NetworkConditions = {
        latency: 0,
        jitter: 0,
        loss: 0
    };

    private pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    private outgoingDeliveryAt = 0;
    private incomingDeliveryAt = 0;

    private listeners: SocketClientListenerMap = {
        open: new Set(),
        close: new Set(),
        message: new Set(),
        binaryMessage: new Set(),
        socketError: new Set(),
        networkConditionsChange: new Set()
    };

    constructor({
        url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
        maxQueueSize = 100
    }: SocketClientOptions = {}) {
        this.url = url;
        this.maxQueueSize = maxQueueSize;
    }

    addEventListener<K extends keyof SocketClientEventMap>(
        type: K,
        listener: (
            this: SocketClient,
            event: SocketClientEventMap[K]
        ) => unknown
    ): void {
        this.listeners[type].add(listener);
    }

    removeEventListener<K extends keyof SocketClientEventMap>(
        type: K,
        listener: (
            this: SocketClient,
            event: SocketClientEventMap[K]
        ) => unknown
    ): void {
        this.listeners[type].delete(listener);
    }

    private emit<K extends keyof SocketClientEventMap>(
        type: K,
        event: SocketClientEventMap[K]
    ): void {
        this.listeners[type].forEach(listener => {
            listener.call(this, event);
        });
    }

    setNetworkConditions({
        latency = 0,
        jitter = 0,
        loss = 0
    }: NetworkConditionsInput = {}): void {
        this.networkConditions = {
            latency: Math.max(0, Number(latency) || 0),
            jitter: Math.max(0, Number(jitter) || 0),
            loss: Math.min(100, Math.max(0, Number(loss) || 0))
        };

        this.emit(
            "networkConditionsChange",
            new CustomEvent<NetworkConditions>(
                "networkConditionsChange",
                {
                    detail: { ...this.networkConditions }
                }
            )
        );
    }

    getNetworkConditions(): NetworkConditions {
        return { ...this.networkConditions };
    }

    private shouldDropPacket(): boolean {
        return (
            Math.random() * 100 <
            this.networkConditions.loss
        );
    }

    private scheduleDelivery(
        direction: NetworkDirection,
        callback: () => void
    ): void {
        const { latency, jitter } = this.networkConditions;

        const variation = (Math.random() * 2 - 1) * jitter;
        const delay = Math.max(0, latency + variation);

        const now = performance.now();

        const deliveryAt = Math.max(
            now + delay,
            direction === "outgoing"
                ? this.outgoingDeliveryAt
                : this.incomingDeliveryAt
        );

        if (direction === "outgoing") {
            this.outgoingDeliveryAt = deliveryAt;
        } else {
            this.incomingDeliveryAt = deliveryAt;
        }

        const timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            callback();
        }, Math.max(0, deliveryAt - now));

        this.pendingTimers.add(timer);
    }

    private clearPendingTimers(): void {
        for (const timer of this.pendingTimers) {
            clearTimeout(timer);
        }

        this.pendingTimers.clear();

        this.outgoingDeliveryAt = 0;
        this.incomingDeliveryAt = 0;
    }

    connect(): void {
        if (
            this.socket &&
            (
                this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING
            )
        ) {
            return;
        }

        this.closedManually = false;

        const socket = new WebSocket(this.url);

        socket.binaryType = "arraybuffer";
        this.socket = socket;

        socket.addEventListener("open", () => {
            if (this.socket !== socket) return;

            this.retryAttempt = 0;

            this.emit("open", new Event("open"));
            this.flushQueue();
        });

        socket.addEventListener("message", (event: MessageEvent<unknown>) => {
            if (this.socket !== socket) return;

            if (this.shouldDropPacket()) {
                return;
            }

            this.scheduleDelivery("incoming", () => {
                if (this.socket !== socket) return;

                this.processMessage(event.data);
            });
        });

        socket.addEventListener("error", () => {
            this.emit(
                "socketError",
                new CustomEvent<SocketErrorDetail>("socketError", {
                    detail: {
                        message: "Помилка WebSocket-з'єднання."
                    }
                })
            );
        });

        socket.addEventListener("close", () => {
            if (this.socket !== socket) return;

            this.emit("close", new Event("close"));

            if (!this.closedManually) {
                this.scheduleReconnect();
            }
        });
    }

    private processMessage(data: unknown): void {
        if (typeof data === "string") {
            try {
                const message: unknown = JSON.parse(data);

                this.emit(
                    "message",
                    new CustomEvent<unknown>("message", {
                        detail: message
                    })
                );
            } catch {
                this.emit(
                    "socketError",
                    new CustomEvent<SocketErrorDetail>("socketError", {
                        detail: {
                            message: "Некоректне JSON-повідомлення від сервера."
                        }
                    })
                );
            }

            return;
        }

        if (data instanceof ArrayBuffer) {
            this.emit(
                "binaryMessage",
                new CustomEvent<ArrayBuffer>("binaryMessage", {
                    detail: data
                })
            );

            return;
        }

        this.emit(
            "socketError",
            new CustomEvent<SocketErrorDetail>("socketError", {
                detail: {
                    message: "Отримано непідтримуваний формат повідомлення."
                }
            })
        );
    }

    send(message: unknown): boolean {
        const data: OutgoingData =
            message instanceof ArrayBuffer ||
                ArrayBuffer.isView(message)
                ? message
                : JSON.stringify(message);

        if (
            this.socket?.readyState === WebSocket.OPEN &&
            this.socket.bufferedAmount < 256 * 1024
        ) {
            this.scheduleSend(data, this.socket);
            return true;
        }

        if (this.queue.length >= this.maxQueueSize) {
            this.emit(
                "socketError",
                new CustomEvent<SocketErrorDetail>("socketError", {
                    detail: {
                        message: "Черга повідомлень переповнена."
                    }
                })
            );

            return false;
        }

        this.queue.push(data);
        this.connect();

        return true;
    }

    private scheduleSend(
        data: OutgoingData,
        socket: WebSocket
    ): void {
        if (this.shouldDropPacket()) {
            return;
        }

        this.scheduleDelivery("outgoing", () => {
            if (
                this.socket !== socket ||
                socket.readyState !== WebSocket.OPEN
            ) {
                return;
            }

            this.transmit(socket, data);
        });
    }

    private transmit(
        socket: WebSocket,
        data: OutgoingData
    ): void {
        if (typeof data === "string") {
            socket.send(data);
            return;
        }

        if (data instanceof ArrayBuffer) {
            socket.send(data);
            return;
        }

        const bytes = new Uint8Array(data.byteLength);

        bytes.set(
            new Uint8Array(
                data.buffer,
                data.byteOffset,
                data.byteLength
            )
        );

        socket.send(bytes.buffer);
    }

    private flushQueue(): void {
        const socket = this.socket;

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        while (this.queue.length > 0) {
            const data = this.queue.shift();

            if (data === undefined) {
                break;
            }

            this.scheduleSend(data, socket);
        }
    }

    private scheduleReconnect(): void {
        if (
            this.closedManually ||
            this.reconnectTimer !== null
        ) {
            return;
        }

        const delay = Math.min(
            1000 * 2 ** this.retryAttempt,
            30000
        );

        this.retryAttempt += 1;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;

            if (!this.closedManually) {
                this.connect();
            }
        }, delay);
    }

    close(): void {
        this.closedManually = true;

        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.clearPendingTimers();
        this.queue.length = 0;

        const socket = this.socket;
        this.socket = null;

        if (
            socket &&
            socket.readyState !== WebSocket.CLOSED
        ) {
            socket.close(1000, "Client closed");
        }
    }
}
