
import { Lobby } from "./Lobby.ts";
import type { LobbyRoom } from "./Lobby.ts";

interface RoomsUpdatedDetail {
    readonly rooms: LobbyRoom[];
}

interface LobbyErrorDetail {
    readonly message: string;
}

interface JoinDetail {
    readonly playerName: string;
    readonly room: LobbyRoom;
}

interface CreateRoomResponse {
    readonly room: LobbyRoom;
}

interface CreateRoomError {
    readonly error?: string;
}

function requiredElement<T extends Element>(
    element: T | null,
    selector: string
): T {
    if (!element) {
        throw new Error(`Не знайдено DOM-елемент: ${selector}`);
    }

    return element;
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

function isRoomsUpdatedDetail(value: unknown): value is RoomsUpdatedDetail {
    return (
        isRecord(value) &&
        Array.isArray(value.rooms) &&
        value.rooms.every(isLobbyRoom)
    );
}

function isLobbyErrorDetail(value: unknown): value is LobbyErrorDetail {
    return (
        isRecord(value) &&
        typeof value.message === "string"
    );
}

function isJoinDetail(value: unknown): value is JoinDetail {
    return (
        isRecord(value) &&
        typeof value.playerName === "string" &&
        isLobbyRoom(value.room)
    );
}

function isCreateRoomResponse(value: unknown): value is CreateRoomResponse {
    return (
        isRecord(value) &&
        isLobbyRoom(value.room)
    );
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function getEventDetail(event: Event): unknown {
    if (event instanceof CustomEvent) {
        return event.detail;
    }

    return undefined;
}

export class LobbyUI {
    readonly lobby: Lobby;
    readonly root: HTMLElement;
    readonly element: HTMLElement;

    private selectedRoomId: string | null = null;

    private readonly nameInput: HTMLInputElement;
    private readonly protocolSelect: HTMLSelectElement;
    private readonly roomsSelect: HTMLSelectElement;
    private readonly roomNameInput: HTMLInputElement;
    private readonly createButton: HTMLButtonElement;
    private readonly status: HTMLElement;
    private readonly joinButton: HTMLButtonElement;

    private readonly onRoomsUpdated: (event: Event) => void;
    private readonly onRoomsError: (event: Event) => void;
    private readonly onLobbyError: (event: Event) => void;
    private readonly onJoin: (event: Event) => void;
    private readonly onSelectionChange: () => void;
    private readonly onJoinClick: () => void;
    private readonly onCreateClick: () => Promise<void>;
    private readonly onNameInput: () => void;

    constructor(lobby: Lobby, root: HTMLElement = document.body) {
        this.lobby = lobby;
        this.root = root;

        this.element = document.createElement("section");
        this.element.className = "lobby";

        this.element.innerHTML = `
            <div class="lobby__panel">
                <h1>SPACE SHIP</h1>
                <p>Лобі перед початком гри</p>

                <label for="lobby-player-name">Ім'я гравця</label>
                <input
                    id="lobby-player-name"
                    type="text"
                    maxlength="24"
                    placeholder="Введіть ім'я"
                    autocomplete="nickname"
                />

                <label for="lobby-protocol">Мережевий протокол</label>
                <select id="lobby-protocol">
                    <option value="binary" selected>Binary</option>
                    <option value="json">JSON</option>
                </select>

                <label for="lobby-rooms">Оберіть кімнату</label>
                <select id="lobby-rooms">
                    <option value="">Завантаження кімнат...</option>
                </select>

                <label for="lobby-room-name">Назва нової кімнати</label>
                <input
                    id="lobby-room-name"
                    type="text"
                    maxlength="40"
                    placeholder="Наприклад, Кімната 2"
                />

                <button type="button" id="lobby-create">
                    Створити кімнату
                </button>

                <p class="lobby__status" role="status" aria-live="polite">
                    Завантаження списку кімнат...
                </p>

                <button type="button" id="lobby-join" disabled>
                    Приєднатися до гри
                </button>
            </div>
        `;

        this.nameInput = requiredElement(
            this.element.querySelector<HTMLInputElement>("#lobby-player-name"),
            "#lobby-player-name"
        );

        this.protocolSelect = requiredElement(
            this.element.querySelector<HTMLSelectElement>("#lobby-protocol"),
            "#lobby-protocol"
        );

        this.roomsSelect = requiredElement(
            this.element.querySelector<HTMLSelectElement>("#lobby-rooms"),
            "#lobby-rooms"
        );

        this.roomNameInput = requiredElement(
            this.element.querySelector<HTMLInputElement>("#lobby-room-name"),
            "#lobby-room-name"
        );

        this.createButton = requiredElement(
            this.element.querySelector<HTMLButtonElement>("#lobby-create"),
            "#lobby-create"
        );

        this.status = requiredElement(
            this.element.querySelector<HTMLElement>(".lobby__status"),
            ".lobby__status"
        );

        this.joinButton = requiredElement(
            this.element.querySelector<HTMLButtonElement>("#lobby-join"),
            "#lobby-join"
        );

        this.onRoomsUpdated = event => {
            const detail = getEventDetail(event);

            if (isRoomsUpdatedDetail(detail)) {
                this.renderRooms(detail.rooms);
            }
        };

        this.onRoomsError = event => {
            const detail = getEventDetail(event);

            if (!isLobbyErrorDetail(detail)) {
                return;
            }

            this.status.textContent =
                `Не вдалося завантажити кімнати: ${detail.message}`;

            this.addRetryOption();
        };

        this.onLobbyError = event => {
            const detail = getEventDetail(event);

            if (isLobbyErrorDetail(detail)) {
                this.status.textContent = detail.message;
            }
        };

        this.onJoin = event => {
            const detail = getEventDetail(event);

            if (!isJoinDetail(detail)) {
                return;
            }

            this.element.hidden = true;

            this.status.textContent =
                `Гравець ${detail.playerName} приєднався до кімнати ${detail.room.name}.`;
        };

        this.onSelectionChange = () => {
            this.selectedRoomId = this.roomsSelect.value;
            this.updateJoinButton();
        };

        this.onJoinClick = () => {
            this.lobby.join(
                this.nameInput.value,
                this.roomsSelect.value
            );
        };

        this.onCreateClick = async () => {
            const name = this.roomNameInput.value.trim();

            if (!name) {
                this.status.textContent = "Введіть назву кімнати.";
                this.roomNameInput.focus();
                return;
            }

            this.createButton.disabled = true;

            try {
                const response = await fetch(this.lobby.roomsUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ name })
                });

                const data: unknown = await response.json();

                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}`;

                    if (
                        isRecord(data) &&
                        typeof data.error === "string"
                    ) {
                        errorMessage = data.error;
                    }

                    throw new Error(errorMessage);
                }

                if (!isCreateRoomResponse(data)) {
                    throw new Error(
                        "Сервер повернув некоректні дані кімнати."
                    );
                }

                this.roomNameInput.value = "";

                await this.lobby.refreshRooms();

                const createdRoomId = String(data.room.id);

                const roomExists = this.lobby.rooms.some(
                    room => String(room.id) === createdRoomId
                );

                if (roomExists) {
                    this.roomsSelect.value = createdRoomId;
                    this.selectedRoomId = createdRoomId;
                }

                this.updateJoinButton();

                this.status.textContent =
                    `Кімнату «${data.room.name}» створено.`;
            } catch (error: unknown) {
                this.status.textContent =
                    `Не вдалося створити кімнату: ${getErrorMessage(error)}`;
            } finally {
                this.createButton.disabled = false;
            }
        };

        this.onNameInput = () => {
            this.updateJoinButton();
        };

        this.lobby.addEventListener("roomsUpdated", this.onRoomsUpdated);
        this.lobby.addEventListener("roomsError", this.onRoomsError);
        this.lobby.addEventListener("lobbyError", this.onLobbyError);
        this.lobby.addEventListener("join", this.onJoin);

        this.roomsSelect.addEventListener("change", this.onSelectionChange);
        this.nameInput.addEventListener("input", this.onNameInput);
        this.joinButton.addEventListener("click", this.onJoinClick);
        this.createButton.addEventListener("click", this.onCreateClick);

        this.root.appendChild(this.element);
    }

    renderRooms(rooms: readonly LobbyRoom[]): void {
        const previousValue = this.roomsSelect.value;

        this.roomsSelect.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = rooms.length
            ? "Оберіть кімнату"
            : "Кімнат поки немає";

        this.roomsSelect.appendChild(placeholder);

        for (const room of rooms) {
            const option = document.createElement("option");

            option.value = String(room.id);

            option.textContent =
                `${room.name} — ${room.players}/${room.maxPlayers} гравців`;

            this.roomsSelect.appendChild(option);
        }

        const stillExists = rooms.some(
            room => String(room.id) === previousValue
        );

        this.roomsSelect.value = stillExists ? previousValue : "";
        this.selectedRoomId = this.roomsSelect.value;

        this.status.textContent = `Доступно кімнат: ${rooms.length}`;

        this.updateJoinButton();
    }

    private addRetryOption(): void {
        this.roomsSelect.replaceChildren();

        const option = document.createElement("option");

        option.value = "";
        option.textContent = "Список кімнат недоступний";

        this.roomsSelect.appendChild(option);
        this.joinButton.disabled = true;
    }

    private updateJoinButton(): void {
        this.joinButton.disabled =
            !this.nameInput.value.trim() ||
            !this.roomsSelect.value;
    }

    show(): void {
        this.element.hidden = false;
        this.lobby.start();
    }

    hide(): void {
        this.element.hidden = true;
        this.lobby.stop();
    }

    destroy(): void {
        this.lobby.removeEventListener("roomsUpdated", this.onRoomsUpdated);
        this.lobby.removeEventListener("roomsError", this.onRoomsError);
        this.lobby.removeEventListener("lobbyError", this.onLobbyError);
        this.lobby.removeEventListener("join", this.onJoin);

        this.roomsSelect.removeEventListener("change", this.onSelectionChange);
        this.nameInput.removeEventListener("input", this.onNameInput);
        this.joinButton.removeEventListener("click", this.onJoinClick);
        this.createButton.removeEventListener("click", this.onCreateClick);

        this.element.remove();
    }
}
