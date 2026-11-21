
export class SocketClient extends EventTarget {
    constructor({
        url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
        maxQueueSize = 100
    } = {}) {
        super();

        this.url = url;
        this.maxQueueSize = maxQueueSize;
        this.queue = [];
        this.socket = null;
        this.closedManually = false;
        this.retryAttempt = 0;
        this.reconnectTimer = null;

        // Параметри емулятора мережі.
        this.networkConditions = {
            latency: 0,
            jitter: 0,
            loss: 0
        };

        this.pendingTimers = new Set();

        // Час доставки для збереження порядку пакетів.
        this.outgoingDeliveryAt = 0;
        this.incomingDeliveryAt = 0;
    }

    setNetworkConditions({
        latency = 0,
        jitter = 0,
        loss = 0
    } = {}) {
        this.networkConditions = {
            latency: Math.max(0, Number(latency) || 0),
            jitter: Math.max(0, Number(jitter) || 0),
            loss: Math.min(100, Math.max(0, Number(loss) || 0))
        };

        this.dispatchEvent(
            new CustomEvent("networkConditionsChange", {
                detail: { ...this.networkConditions }
            })
        );
    }

    getNetworkConditions() {
        return { ...this.networkConditions };
    }

    shouldDropPacket() {
        return Math.random() * 100 < this.networkConditions.loss;
    }

    scheduleDelivery(direction, callback) {
        const { latency, jitter } = this.networkConditions;

        const variation = (Math.random() * 2 - 1) * jitter;
        const delay = Math.max(0, latency + variation);

        const now = performance.now();

        const property = direction === "outgoing"
            ? "outgoingDeliveryAt"
            : "incomingDeliveryAt";

        const deliveryAt = Math.max(
            now + delay,
            this[property]
        );

        this[property] = deliveryAt;

        const timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            callback();
        }, Math.max(0, deliveryAt - now));

        this.pendingTimers.add(timer);
    }

    clearPendingTimers() {
        for (const timer of this.pendingTimers) {
            clearTimeout(timer);
        }

        this.pendingTimers.clear();

        this.outgoingDeliveryAt = 0;
        this.incomingDeliveryAt = 0;
    }

    connect() {
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
            this.dispatchEvent(new Event("open"));
            this.flushQueue();
        });

        socket.addEventListener("message", event => {
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
            this.dispatchEvent(
                new CustomEvent("socketError", {
                    detail: {
                        message: "Помилка WebSocket-з'єднання."
                    }
                })
            );
        });

        socket.addEventListener("close", () => {
            if (this.socket !== socket) return;

            this.dispatchEvent(new Event("close"));

            if (!this.closedManually) {
                this.scheduleReconnect();
            }
        });
    }

    processMessage(data) {
        if (typeof data === "string") {
            try {
                const message = JSON.parse(data);

                this.dispatchEvent(
                    new CustomEvent("message", {
                        detail: message
                    })
                );
            } catch {
                this.dispatchEvent(
                    new CustomEvent("socketError", {
                        detail: {
                            message: "Некоректне JSON-повідомлення від сервера."
                        }
                    })
                );
            }

            return;
        }

        if (data instanceof ArrayBuffer) {
            this.dispatchEvent(
                new CustomEvent("binaryMessage", {
                    detail: data
                })
            );

            return;
        }

        this.dispatchEvent(
            new CustomEvent("socketError", {
                detail: {
                    message: "Отримано непідтримуваний формат повідомлення."
                }
            })
        );
    }

    send(message) {
        const data =
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
            this.dispatchEvent(
                new CustomEvent("socketError", {
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

    scheduleSend(data, socket) {
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

            socket.send(data);
        });
    }

    flushQueue() {
        while (
            this.queue.length > 0 &&
            this.socket?.readyState === WebSocket.OPEN &&
            this.socket.bufferedAmount < 256 * 1024
        ) {
            const data = this.queue.shift();
            this.scheduleSend(data, this.socket);
        }
    }

    scheduleReconnect() {
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

    close() {
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
