
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
    }

    connect() {
        if (
            this.socket &&
            (this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        this.closedManually = false;

        const socket = new WebSocket(this.url);
        this.socket = socket;

        socket.addEventListener("open", () => {
            if (this.socket !== socket) return;

            this.retryAttempt = 0;
            this.dispatchEvent(new Event("open"));
            this.flushQueue();
        });

        socket.addEventListener("message", event => {
            if (this.socket !== socket) return;

            try {
                const message = JSON.parse(event.data);

                this.dispatchEvent(
                    new CustomEvent("message", {
                        detail: message
                    })
                );
            } catch {
                this.dispatchEvent(
                    new CustomEvent("socketError", {
                        detail: { message: "Сервер надіслав некоректні дані." }
                    })
                );
            }
        });

        socket.addEventListener("error", () => {
            this.dispatchEvent(
                new CustomEvent("socketError", {
                    detail: { message: "Помилка WebSocket-з'єднання." }
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

    send(message) {
        const data = JSON.stringify(message);

        if (this.socket?.readyState === WebSocket.OPEN) {
            if (this.socket.bufferedAmount < 256 * 1024) {
                this.socket.send(data);
                return true;
            }
        }

        if (this.queue.length >= this.maxQueueSize) {
            this.dispatchEvent(
                new CustomEvent("socketError", {
                    detail: { message: "Черга повідомлень переповнена." }
                })
            );

            return false;
        }

        this.queue.push(data);
        this.connect();

        return true;
    }

    flushQueue() {
        while (
            this.queue.length > 0 &&
            this.socket?.readyState === WebSocket.OPEN &&
            this.socket.bufferedAmount < 256 * 1024
        ) {
            this.socket.send(this.queue.shift());
        }
    }

    scheduleReconnect() {
        if (this.closedManually || this.reconnectTimer !== null) {
            return;
        }

        const delay = Math.min(1000 * 2 ** this.retryAttempt, 30000);
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
