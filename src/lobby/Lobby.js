
export class Lobby extends EventTarget {
    constructor({
        roomsUrl = "/api/rooms.json",
        refreshInterval = 5000
    } = {}) {
        super();

        this.roomsUrl = roomsUrl;
        this.refreshInterval = refreshInterval;
        this.rooms = [];
        this.visible = false;
        this.timer = null;
        this.controller = null;
        this.requestController = null;
    }

    async refreshRooms() {
        if (!this.visible) return;

        // Скасовуємо попередній запит, якщо він ще виконується.
        this.requestController?.abort();

        const controller = new AbortController();
        this.requestController = controller;

        try {
            const timeoutSignal = AbortSignal.timeout(4000);
            const signal = AbortSignal.any([
                controller.signal,
                timeoutSignal
            ]);

            const response = await fetch(this.roomsUrl, { signal });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!Array.isArray(data.rooms)) {
                throw new Error("Неправильний формат списку кімнат");
            }

            this.rooms = data.rooms;

            this.dispatchEvent(
                new CustomEvent("roomsUpdated", {
                    detail: { rooms: this.rooms }
                })
            );
        } catch (error) {
            if (error.name !== "AbortError") {
                this.dispatchEvent(
                    new CustomEvent("roomsError", {
                        detail: { message: error.message }
                    })
                );
            }
        } finally {
            if (this.requestController === controller) {
                this.requestController = null;
            }
        }
    }

    start() {
        if (this.visible) return;

        this.visible = true;
        this.controller = new AbortController();

        void this.refreshRooms();

        this.timer = setInterval(() => {
            void this.refreshRooms();
        }, this.refreshInterval);
    }

    join(playerName, roomId) {
        const name = playerName.trim();

        if (!name) {
            this.dispatchEvent(
                new CustomEvent("lobbyError", {
                    detail: { message: "Введіть ім'я гравця." }
                })
            );
            return;
        }

        const room = this.rooms.find(
            item => String(item.id) === String(roomId)
        );

        if (!room) {
            this.dispatchEvent(
                new CustomEvent("lobbyError", {
                    detail: { message: "Оберіть доступну кімнату." }
                })
            );
            return;
        }

        this.stop();

        this.dispatchEvent(
            new CustomEvent("join", {
                detail: {
                    playerName: name,
                    room
                }
            })
        );
    }

    stop() {
        this.visible = false;

        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.controller?.abort();
        this.controller = null;

        this.requestController?.abort();
        this.requestController = null;
    }

    destroy() {
        this.stop();
    }
}
