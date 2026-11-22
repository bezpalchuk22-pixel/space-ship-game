
export interface LobbyRoom {
    readonly id: string | number;
    readonly name: string;
    readonly players: number;
    readonly maxPlayers: number;
}

interface RoomsResponse {
    readonly rooms: LobbyRoom[];
}

interface LobbyErrorDetail {
    readonly message: string;
}

interface RoomsUpdatedDetail {
    readonly rooms: LobbyRoom[];
}

interface JoinDetail {
    readonly playerName: string;
    readonly room: LobbyRoom;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isLobbyRoom(value: unknown): value is LobbyRoom {
    if (!isRecord(value)) {
        return false;
    }

    return (
        (typeof value.id === "string" || typeof value.id === "number") &&
        typeof value.name === "string" &&
        typeof value.players === "number" &&
        typeof value.maxPlayers === "number"
    );
}

function isRoomsResponse(value: unknown): value is RoomsResponse {
    return (
        isRecord(value) &&
        Array.isArray(value.rooms) &&
        value.rooms.every(isLobbyRoom)
    );
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
    return (
        error instanceof Error &&
        error.name === "AbortError"
    );
}

export interface LobbyOptions {
    readonly roomsUrl?: string;
    readonly refreshInterval?: number;
}

export class Lobby extends EventTarget {
    readonly roomsUrl: string;
    readonly refreshInterval: number;

    rooms: LobbyRoom[] = [];
    visible = false;

    private timer: ReturnType<typeof setInterval> | null = null;
    private controller: AbortController | null = null;
    private requestController: AbortController | null = null;

    constructor({
        roomsUrl = "/api/rooms",
        refreshInterval = 5000
    }: LobbyOptions = {}) {
        super();

        this.roomsUrl = roomsUrl;
        this.refreshInterval = refreshInterval;
    }

    async refreshRooms(): Promise<void> {
        if (!this.visible) {
            return;
        }

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

            const data: unknown = await response.json();

            if (!isRoomsResponse(data)) {
                throw new Error("Неправильний формат списку кімнат");
            }

            this.rooms = data.rooms;

            this.dispatchEvent(
                new CustomEvent<RoomsUpdatedDetail>("roomsUpdated", {
                    detail: { rooms: this.rooms }
                })
            );
        } catch (error: unknown) {
            if (!isAbortError(error)) {
                this.dispatchEvent(
                    new CustomEvent<LobbyErrorDetail>("roomsError", {
                        detail: {
                            message: getErrorMessage(error)
                        }
                    })
                );
            }
        } finally {
            if (this.requestController === controller) {
                this.requestController = null;
            }
        }
    }

    start(): void {
        if (this.visible) {
            return;
        }

        this.visible = true;
        this.controller = new AbortController();

        void this.refreshRooms();

        this.timer = setInterval(() => {
            void this.refreshRooms();
        }, this.refreshInterval);
    }

    join(playerName: string, roomId: string | number): void {
        const name = playerName.trim();

        if (!name) {
            this.dispatchEvent(
                new CustomEvent<LobbyErrorDetail>("lobbyError", {
                    detail: {
                        message: "Введіть ім'я гравця."
                    }
                })
            );

            return;
        }

        const room = this.rooms.find(
            item => String(item.id) === String(roomId)
        );

        if (!room) {
            this.dispatchEvent(
                new CustomEvent<LobbyErrorDetail>("lobbyError", {
                    detail: {
                        message: "Оберіть доступну кімнату."
                    }
                })
            );

            return;
        }

        this.stop();

        this.dispatchEvent(
            new CustomEvent<JoinDetail>("join", {
                detail: {
                    playerName: name,
                    room
                }
            })
        );
    }

    stop(): void {
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

    destroy(): void {
        this.stop();
    }
}
